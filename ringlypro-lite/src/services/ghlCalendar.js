'use strict';

/**
 * The OUTBOUND half of the calendar: a booking made in RinglyPro is written
 * into that tenant's HighLevel calendar.
 *
 * THE BUG THIS EXISTS TO FIX. Until now the calendar was one-way. HighLevel's
 * Voice AI booked, the post-call mirror (routes/webhooks-ghl.js) copied that
 * into `lite_appointments`, and nothing ever went the other way — so a booking
 * taken on the public booking page was INVISIBLE to HighLevel and the Voice AI
 * would offer that slot to the next caller. The landing page says "no
 * double-booking"; before this file that was only true while the AI was the
 * only writer.
 *
 * ECHO SUPPRESSION IS THE PART THAT WILL BITE, so it is stated first. With a
 * mirror inbound and a push outbound, an appointment the AI just booked is
 * mirrored into our table and then pushed straight back to HighLevel as a
 * duplicate of itself. `lite_appointments.origin` records which side a row was
 * born on and **only `origin='ringlypro'` is ever pushed** (`pushable()`).
 * The mirror writes `origin='ai'`; a row from before this column existed is
 * NULL, which is not 'ringlypro', so history can never be replayed into a
 * customer's calendar either.
 *
 * A FAILED PUSH IS NOT A SUCCESSFUL BOOKING. Booked here and free there is the
 * exact double-book this work removes, so the caller (services/booking.js)
 * deletes the local row and tells the visitor to pick another time. Nothing in
 * this file writes a "sort of booked" state.
 *
 * ENDPOINTS, read from HighLevel's own docs on 2026-09-25:
 *   POST   /contacts/upsert                        → { contact: { id } }
 *   POST   /calendars/events/appointments          → { id }   (contactId REQUIRED)
 *   PUT    /calendars/events/appointments/:eventId → set appointmentStatus
 * All three are documented under `Version: v3`, while every HighLevel call
 * this service already makes uses `2021-07-28`. Both are tried, in that order
 * — see callVersioned().
 */
const ghl = require('../telephony/ghl');

const stats = {
  pushed: 0, cancelled: 0, skipped: 0, failed: 0, unconfirmed: 0, retried: 0, version_fallbacks: 0,
  cancel_rejected_foreign: 0, last_error: null, last_at: null,
};

function primaryVersion() { return String(process.env.LITE_GHL_CALENDAR_VERSION || 'v3').trim(); }
function fallbackVersion() { return String(process.env.LITE_GHL_API_VERSION || '2021-07-28').trim(); }

/**
 * Which Version header actually worked, remembered for this process.
 *
 * THE FIRST VERSION OF THIS FELL BACK ONLY WHEN THE ERROR TEXT SAID "version",
 * which is a promise about HighLevel's wording. A sub-account that does not
 * honour `v3` answers `404 Cannot POST /calendars/events/appointments` or a
 * bare `400 Bad Request` — neither contains the word — so the fallback would
 * never have fired, and because a booking that cannot be pushed is deleted,
 * EVERY booking for EVERY HighLevel tenant would have failed with 503. Any 4xx
 * from the primary version is now enough to try the other one.
 */
let resolvedVersion = null;
function versionsToTry() {
  const out = [];
  for (const v of [resolvedVersion, primaryVersion(), fallbackVersion()]) {
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}
function rememberVersion(v) { resolvedVersion = v; }
/** Tests only. */
function _forgetVersion() { resolvedVersion = null; }

/**
 * WHY SLOT VALIDATION IS OFF BY DEFAULT. `ignoreFreeSlotValidation:false` makes
 * HighLevel refuse a slot its own calendar considers unavailable, which sounds
 * like exactly the second opinion we want. But the calendar this service
 * creates (provisioning.ensureCalendar) sets no open hours, so HighLevel's idea
 * of "available" does not mirror the tenant's `lite_availability_rules` and it
 * would refuse bookings our own calendar has already approved. The conflict
 * authority is therefore the partial unique index
 * uq_lite_appts_slot(tenant_id, starts_at) in our own database, which holds
 * BOTH sides because the mirror writes HighLevel's bookings back into it.
 *
 * THE GAP THAT LEAVES, NAMED RATHER THAN HIDDEN: while the post-call webhook is
 * not delivering, our table does not know about HighLevel-side bookings, so a
 * genuine clash would be pushed rather than refused. Set
 * LITE_GHL_APPT_VALIDATE_SLOT=1 once the tenant's HighLevel calendar carries
 * the same open hours, and HighLevel becomes a real second check.
 */
function validateSlot() { return String(process.env.LITE_GHL_APPT_VALIDATE_SLOT || '0') === '1'; }

/** A tenant is on the two-way path only once it actually has a HighLevel calendar. */
function enabledFor(tenant) {
  return !!(tenant && tenant.ghl_calendar_id && tenant.ghl_location_id);
}

/** ONLY a row born in RinglyPro may be pushed. This is the echo guard. */
function pushable(appt) {
  return !!appt && appt.origin === 'ringlypro';
}

/**
 * A budget for the WHOLE push, not per request.
 *
 * Two 20 s HighLevel calls with a retry each is 80 seconds of silence inside a
 * live phone turn — the caller hangs up long before it returns — and it sits
 * right at Cloudflare's ~100 s ceiling on the public booking request, where the
 * browser gives up while the row is still being rolled back. One deadline is
 * threaded through every call and the remaining time is what each one gets.
 */
function budgetMs() { return Math.max(2000, parseInt(process.env.LITE_GHL_PUSH_BUDGET_MS || '8000', 10) || 8000); }
function deadline() {
  const end = Date.now() + budgetMs();
  return { left: () => end - Date.now(), spent: () => Date.now() >= end };
}

function transient(e) {
  const s = e && e.status;
  // status 0 is OUR OWN "no token configured" (telephony/ghl.js). Retrying a
  // configuration error buys a second guaranteed failure and an 800 ms sleep.
  if (s === 0) return false;
  return !s || s === 408 || s === 429 || s >= 500;
}
/**
 * Does this 4xx look like a rejected Version header rather than a rejected
 * request? Auth, permission, payment, conflict, timeout and rate limiting are
 * all about the request itself — retrying them under a different Version is
 * pointless and, for a create, actively harmful.
 */
function versionRejected(e) {
  const s = e && e.status;
  if (!(s >= 400 && s < 500)) return false;
  return ![401, 402, 403, 408, 409, 429].includes(s);
}

/**
 * One call.
 *
 * `idempotent` decides whether a transient failure may be retried, and it is
 * the load-bearing argument. `/contacts/upsert` is an upsert by definition, so
 * sending it twice is free. `POST /calendars/events/appointments` CREATES, and
 * a socket timeout says nothing about whether HighLevel processed it — retrying
 * that is how a customer's calendar gets two identical events for one visitor,
 * and with `ignoreFreeSlotValidation` on nothing at their end refuses the
 * second. So the create is never retried; it reports an ambiguous outcome and
 * a human sees it.
 */
async function callVersioned(method, path, opts = {}, { idempotent = false, clock = null } = {}) {
  const attempt = (version) => ghl.call(method, path, {
    ...opts, version, timeoutMs: clock ? clock.left() : undefined,
  }).then((out) => { rememberVersion(version); return out; });
  const versions = versionsToTry();
  let last = null;
  for (let i = 0; i < versions.length; i++) {
    try { return await attempt(versions[i]); }
    catch (e) {
      last = e;
      // A 4xx that is not about auth or conflict is what a rejected Version
      // header looks like, whatever the message says. Try the next one — and
      // clear the remembered winner, because a cached version that has started
      // failing must not pin every later call to it.
      if (versionRejected(e) && i < versions.length - 1) {
        stats.version_fallbacks++;
        if (resolvedVersion === versions[i]) resolvedVersion = null;
        continue;
      }
      break;
    }
  }
  if (idempotent && transient(last) && !(clock && clock.spent())) {
    stats.retried++;
    await new Promise((r) => setTimeout(r, 800));
    return attempt(resolvedVersion || versions[0]);
  }
  throw last;
}

/** HighLevel requires a contactId on an appointment, so the caller becomes one. */
async function upsertContact({ creds, name, phone, email, clock }) {
  const first = String(name || '').trim().split(/\s+/)[0] || null;
  const last = String(name || '').trim().split(/\s+/).slice(1).join(' ') || null;
  const out = await callVersioned('POST', '/contacts/upsert', {
    creds,
    body: {
      locationId: creds.locationId,
      ...(first ? { firstName: first } : {}),
      ...(last ? { lastName: last } : {}),
      ...(name ? { name: String(name).slice(0, 160) } : {}),
      ...(phone ? { phone: String(phone) } : {}),
      ...(email ? { email: String(email) } : {}),
      source: 'RinglyPro',
    },
  }, { idempotent: true, clock });   // an upsert is safe to repeat; a create is not
  const id = out && (out.contact ? out.contact.id : out.id);
  if (!id) { const e = new Error('HighLevel did not return a contact id'); e.code = 'NO_CONTACT_ID'; throw e; }
  return String(id);
}

/**
 * Push one RinglyPro-born appointment into the tenant's HighLevel calendar.
 * Resolves `{ eventId }`. Throws on every path that did not reach HighLevel —
 * the caller must treat a throw as "this booking did not happen".
 */
async function pushAppointment({ tenant, creds, appt, email }) {
  if (!pushable(appt)) { stats.skipped++; return { pushed: false, reason: 'not_ringlypro_origin' }; }
  if (!enabledFor(tenant)) { stats.skipped++; return { pushed: false, reason: 'tenant_not_on_highlevel' }; }
  if (!creds || !creds.token) { const e = new Error('no HighLevel credentials for this tenant'); e.code = 'NO_CREDS'; throw e; }

  // HighLevel REQUIRES a contactId, and a contact needs a phone or an email to
  // be. A caller who withholds their number would otherwise have a booking the
  // business can perfectly well honour thrown away because HighLevel wants a
  // contact record. Book it here, push nothing, and say so.
  if (!appt.callback_number && !email) {
    stats.skipped++;
    return { pushed: false, reason: 'no_contact_identifier' };
  }

  stats.last_at = new Date().toISOString();
  const clock = deadline();
  try {
    const contactId = await upsertContact({
      creds, name: appt.caller_name, phone: appt.callback_number, email, clock,
    });
    const made = await callVersioned('POST', '/calendars/events/appointments', {
      creds,
      body: {
        calendarId: tenant.ghl_calendar_id,
        locationId: creds.locationId,
        contactId,
        startTime: new Date(appt.starts_at).toISOString(),
        endTime: new Date(appt.ends_at).toISOString(),
        title: `${appt.caller_name || 'Appointment'} — booked on ${tenant.business_name || 'RinglyPro'}`,
        appointmentStatus: 'confirmed',
        ignoreFreeSlotValidation: !validateSlot(),
        toNotify: false,
      },
    }, { clock }).catch((e) => { e.stage = 'create'; throw e; });   // see the catch below
    const eventId = made && (made.id || made.eventId
      || (made.event && made.event.id) || (made.appointment && made.appointment.id)
      || (made.data && (made.data.id || (made.data.event && made.data.event.id))));
    if (!eventId) {
      // The event probably EXISTS and we cannot name it. That is ambiguous, not
      // a failure: deleting the local row here would leave an uncancellable
      // ghost in the customer's calendar with nothing on our side pointing at it.
      const e = new Error('HighLevel accepted the appointment but did not return an id');
      e.code = 'NO_EVENT_ID'; e.ambiguous = true; throw e;
    }
    stats.pushed++;
    return { pushed: true, eventId: String(eventId), contactId };
  } catch (e) {
    // AMBIGUOUS = the create may have landed. A network drop, a timeout or a
    // 5xx on a non-idempotent POST tells us nothing about HighLevel's state,
    // and the caller must NOT treat it as "nothing happened".
    if (e.stage === 'create' && transient(e)) e.ambiguous = true;
    if (e.ambiguous) { stats.unconfirmed++; } else { stats.failed++; }
    stats.last_error = `${e.status || ''} ${String(e.message || e)}`.trim().slice(0, 200);
    throw e;
  }
}

/**
 * Cancel the HighLevel side of a RinglyPro cancellation.
 *
 * WHY THIS IS NOT OPTIONAL: leaving the event in place keeps the slot blocked
 * in HighLevel, so the Voice AI stops offering a time the client has actually
 * freed — the mirror image of the bug this module fixes, and the one that
 * quietly costs the client bookings.
 *
 * `appointmentStatus: 'cancelled'` rather than DELETE, so the client keeps the
 * record in their own HighLevel calendar. It is best-effort by design: a
 * cancellation must never fail because HighLevel is down, so the failure is
 * counted and reported, never thrown at the person cancelling.
 */
async function cancelAppointment({ tenant, creds, appt }) {
  if (!appt || !appt.ghl_event_id) { stats.skipped++; return { cancelled: false, reason: 'no_highlevel_event' }; }
  if (!enabledFor(tenant) || !creds || !creds.token) { stats.skipped++; return { cancelled: false, reason: 'tenant_not_on_highlevel' }; }
  try {
    // THE EVENT ID CAME FROM A WEBHOOK BODY, SO IT IS NOT OURS UNTIL PROVEN.
    // The mirror stores `appointment.id` from a delivery authenticated by ONE
    // shared secret, and the cancel is scoped only by the bearer token — which,
    // in the shipped single-shared-sub-account mode, is the SAME token for
    // every tenant. Without this read, a forged delivery naming another
    // client's event id would let this tenant cancel that client's real
    // appointment. Read it, and refuse anything not on this tenant's calendar.
    const cclock = deadline();
    const got = await callVersioned('GET', `/calendars/events/appointments/${encodeURIComponent(appt.ghl_event_id)}`,
      { creds }, { idempotent: true, clock: cclock });
    const ev = (got && (got.appointment || got.event || got.data || got)) || {};
    const onCal = String(ev.calendarId || ev.calendar_id || '');
    if (onCal && onCal !== String(tenant.ghl_calendar_id)) {
      stats.cancel_rejected_foreign++;
      console.error('[lite:ghl-calendar] REFUSED to cancel an event on another calendar — appt', appt.id);
      return { cancelled: false, error: 'not_this_calendar' };
    }
  } catch (e) {
    // A read that fails is not permission to write. Say so and stop.
    stats.failed++;
    console.error('[lite:ghl-calendar] could not confirm the event belongs to this calendar:', e.message);
    return { cancelled: false, error: 'ownership_unverified' };
  }
  try {
    await callVersioned('PUT', `/calendars/events/appointments/${encodeURIComponent(appt.ghl_event_id)}`, {
      creds, body: { appointmentStatus: 'cancelled' },
    }, { idempotent: true, clock: deadline() });   // setting a status twice is harmless
    stats.cancelled++;
    return { cancelled: true };
  } catch (e) {
    stats.failed++;
    stats.last_error = `cancel: ${e.status || ''} ${String(e.message || e)}`.trim().slice(0, 200);
    console.error('[lite:ghl-calendar] the HighLevel side was NOT cancelled:', e.message);
    return { cancelled: false, error: String(e.message || e).slice(0, 200) };
  }
}

module.exports = {
  pushAppointment, cancelAppointment, enabledFor, pushable,
  stats, primaryVersion, fallbackVersion, validateSlot, budgetMs, _forgetVersion,
};
