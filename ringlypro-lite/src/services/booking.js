'use strict';

/**
 * In-process booking backend (the "tools" the voice agent calls).
 * Unlike full RinglyPro's loopback-HTTP tools, these are direct function calls
 * against the isolated Lite DB. Every function is tenant-scoped by tenant_id.
 */
const { Op } = require('sequelize');
// NOTE: alias the LiteNumber model — importing it as `Number` shadows the
// global Number constructor and breaks `.split('-').map(Number)` date parsing.
const { sequelize, Tenant, Number: LiteNumber, Call, Message, AvailabilityRule, Appointment } = require('../models');
const { zonedToUtc, utcToZonedParts, hhmmToMinutes, displaySlot } = require('../utils/dates');
const { answeringAllowed } = require('./entitlement');
const ghlCalendar = require('./ghlCalendar');
const accounts = require('./ghlAccounts');

function last10(p) { return String(p || '').replace(/[^0-9]/g, '').slice(-10); }

// The shared demo line answers as tenant_id 0 (no DB row). Resolve it to a
// synthetic tenant so the booking/message tools work in the demo (Mon–Fri 9–17).
const DEMO_TENANT = {
  id: 0, is_demo: true,
  timezone: 'America/New_York', locale: 'en',
  business_name: process.env.LITE_DEMO_BUSINESS || 'RinglyPro Lite Demo',
  owner_phone: null
};
function isDemo(tenantId) { return Number(tenantId) === 0; }
async function resolveTenant(tenantId) { return isDemo(tenantId) ? DEMO_TENANT : Tenant.findByPk(tenantId); }
const DEMO_RULES = [1, 2, 3, 4, 5].map(wd => ({ weekday: wd, start: '09:00', end: '17:00', slot_minutes: 30 }));

// Pick `k` VARIED slots across the sorted candidate list (one per evenly-spaced
// segment, randomized within the segment) so Lina offers different days/times
// each call instead of a robotic 9:00 / 9:30 / 10:00. Returns them sorted.
function pickVaried(all, k) {
  if (all.length <= k) return all;
  const seg = all.length / k;
  const chosen = new Map();
  for (let i = 0; i < k; i++) {
    const lo = Math.floor(i * seg);
    const hi = Math.max(lo, Math.floor((i + 1) * seg) - 1);
    const idx = Math.min(all.length - 1, lo + Math.floor(Math.random() * (hi - lo + 1)));
    chosen.set(all[idx].starts_at, all[idx]);
  }
  return Array.from(chosen.values()).sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
}

/** Resolve tenant by the dialed Lite DID. */
async function getBusinessInfo({ did, tenantId }) {
  let tenant = null;
  if (tenantId) tenant = await Tenant.findByPk(tenantId);
  if (!tenant && did) {
    const num = await LiteNumber.findOne({ where: { did } });
    if (num) tenant = await Tenant.findByPk(num.tenant_id);
  }
  if (!tenant) {
    // Shared demo line: if this DID is the configured demo number, answer as a
    // synthetic demo tenant (no DB row, no per-tenant cost) so prospects can
    // hear Lina before adding a card. Requires the DID's voice webhook to point
    // at this Lite service.
    // Two dedicated demo lines, ONE language each (locale by which DID dialed).
    // Demo activity is written to a REAL demo tenant (LITE_DEMO_TENANT_ID) so it
    // shows in that account's dashboard; falls back to synthetic tenant 0.
    const DEMO_ES = process.env.LITE_DEMO_NUMBER || '+18132120813';
    const DEMO_EN = process.env.LITE_DEMO_NUMBER_EN || '+17627611589';
    const isEs = did && last10(did) === last10(DEMO_ES);
    const isEn = did && DEMO_EN && last10(did) === last10(DEMO_EN);
    if (isEs || isEn) {
      const locale = isEs ? 'es' : 'en';
      const demoTenantId = parseInt(process.env.LITE_DEMO_TENANT_ID || '7', 10);
      const dt = demoTenantId ? await Tenant.findByPk(demoTenantId) : null;
      if (dt) return {
        success: true, tenant_id: dt.id, is_demo: true,
        business_name: dt.business_name, owner_name: dt.owner_name,
        owner_phone: dt.owner_phone, transfer_number: dt.transfer_number,
        country: dt.country || 'US', locale, timezone: dt.timezone || 'America/New_York',
        suspended: false  // demo never suspends
      };
      // Fallback: synthetic demo tenant (no dashboard) if not configured.
      return {
        success: true, tenant_id: 0, is_demo: true,
        business_name: process.env.LITE_DEMO_BUSINESS || 'RinglyPro Lite',
        owner_name: null, owner_phone: null, transfer_number: null,
        country: 'US', locale, timezone: 'America/New_York', suspended: false
      };
    }
    return { success: false, error: 'tenant_not_found' };
  }
  return {
    success: true,
    tenant_id: tenant.id,
    business_name: tenant.business_name,
    owner_name: tenant.owner_name,
    owner_phone: tenant.owner_phone,
    transfer_number: tenant.transfer_number,
    country: tenant.country,
    locale: tenant.locale,
    timezone: tenant.timezone,
    // Suspend answering on failed payment OR expired trial with no card.
    suspended: !answeringAllowed(tenant)
  };
}

/** Returning-caller recognition: name + upcoming appts by callback number. */
async function identifyCaller({ tenantId, phone }) {
  const l10 = last10(phone);
  if (!l10) return { success: true, found: false };
  const appts = await Appointment.findAll({
    where: {
      tenant_id: tenantId,
      status: 'confirmed',
      starts_at: { [Op.gte]: new Date() }
    },
    order: [['starts_at', 'ASC']],
    limit: 20
  });
  const mine = appts.filter(a => last10(a.callback_number) === l10);
  const name = mine[0] && mine[0].caller_name;
  return {
    success: true,
    found: !!name,
    caller_name: name || null,
    upcoming: mine.map(a => ({ appointment_id: a.id, starts_at: a.starts_at }))
  };
}

/**
 * Compute open slots across the next `days_ahead` days from availability rules,
 * excluding past and already-booked slots. Returns up to `limit` nearest slots.
 */
async function checkAvailability({ tenantId, date, time, days_ahead = 7, limit = 3 }) {
  const tenant = await resolveTenant(tenantId);
  if (!tenant) return { success: false, error: 'tenant_not_found' };
  const tz = tenant.timezone || 'America/New_York';
  const rules = isDemo(tenantId)
    ? DEMO_RULES
    : await AvailabilityRule.findAll({ where: { tenant_id: tenantId, active: true } });
  if (!rules.length) return { success: true, slots: [], slot_count: 0, note: 'no_availability_rules' };

  const now = new Date();
  // `sync_unknown` is a slot we may have created in HighLevel and cannot prove
  // — it still blocks the partial unique index, so availability has to agree or
  // the picker offers a time the insert then refuses.
  const booked = await Appointment.findAll({
    where: { tenant_id: tenantId, status: { [Op.in]: ['confirmed', 'sync_unknown'] }, starts_at: { [Op.gte]: now } }
  });
  const bookedSet = new Set(booked.map(a => new Date(a.starts_at).getTime()));

  const startDay = 0;
  const endDay = date ? 1 : days_ahead;   // if a specific date requested, only that day
  const slots = [];

  for (let dOff = startDay; dOff <= endDay && slots.length < 80; dOff++) {
    // Determine the calendar date (in tenant tz) we are generating for.
    let y, mo, d;
    if (date) {
      [y, mo, d] = date.split('-').map(Number);
    } else {
      const probe = new Date(now.getTime() + dOff * 86400000);
      const p = utcToZonedParts(tz, probe);
      y = p.y; mo = p.mo; d = p.d;
    }
    // Weekday of that local date.
    const localNoon = zonedToUtc(tz, y, mo, d, 12, 0);
    const wd = utcToZonedParts(tz, localNoon).weekday;
    const dayRules = rules.filter(r => r.weekday === wd);
    for (const rule of dayRules) {
      const step = rule.slot_minutes || 30;
      for (let m = hhmmToMinutes(rule.start); m + step <= hhmmToMinutes(rule.end); m += step) {
        const h = Math.floor(m / 60), mi = m % 60;
        const startUtc = zonedToUtc(tz, y, mo, d, h, mi);
        if (startUtc.getTime() <= now.getTime() + 60000) continue;   // future only
        if (bookedSet.has(startUtc.getTime())) continue;
        slots.push({
          starts_at: startUtc.toISOString(),
          date: `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
          time: `${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`,
          slot_minutes: step,
          display: displaySlot(tz, startUtc, tenant.locale)
        });
        if (slots.length >= 80) break;
      }
    }
    if (date) break;
  }
  slots.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));

  // Caller asked for an EXACT time (e.g. "today at 3") → tell the agent whether
  // that precise slot is open, plus a reason if not. The agent uses this to
  // confirm-and-book, or to offer the alternatives below.
  let requested = null;
  if (time) {
    let ry, rmo, rd;
    if (date) { [ry, rmo, rd] = date.split('-').map(Number); }
    else { const p = utcToZonedParts(tz, now); ry = p.y; rmo = p.mo; rd = p.d; }
    const tp = String(time).split(':').map(Number);
    const rh = tp[0], rmi = tp[1] || 0;
    if (Number.isFinite(ry) && Number.isFinite(rh)) {
      const reqUtc = zonedToUtc(tz, ry, rmo, rd, rh, rmi);
      const wd = utcToZonedParts(tz, zonedToUtc(tz, ry, rmo, rd, 12, 0)).weekday;
      const reqMin = rh * 60 + rmi;
      const inWindow = rules.some(r => r.weekday === wd && reqMin >= hhmmToMinutes(r.start) && reqMin < hhmmToMinutes(r.end));
      const future = reqUtc.getTime() > now.getTime() + 60000;
      const taken = bookedSet.has(reqUtc.getTime());
      const open = inWindow && future && !taken;
      requested = {
        date: `${ry}-${String(rmo).padStart(2, '0')}-${String(rd).padStart(2, '0')}`,
        time: `${String(rh).padStart(2, '0')}:${String(rmi).padStart(2, '0')}`,
        open,
        reason: !inWindow ? 'outside_hours' : (!future ? 'in_past' : (taken ? 'already_booked' : 'open')),
        display: open ? displaySlot(tz, reqUtc, tenant.locale) : null
      };
    }
  }

  // Specific-date requests: offer the nearest times on that day in order.
  // Otherwise offer a VARIED spread so it doesn't sound robotic.
  const top = date ? slots.slice(0, Math.max(limit, 3)) : pickVaried(slots, limit);
  return { success: true, timezone: tz, requested, slot_count: top.length, slots: top };
}

/**
 * Atomic booking. Uses a transaction + the partial unique index
 * uq_lite_appts_slot(tenant_id, starts_at) WHERE status<>'cancelled' as the
 * final race guard, so two concurrent calls can never double-book one slot.
 */
// `origin` is deliberately NOT an argument. relayAgent spreads the MODEL's raw
// tool input into this call, so any field named here can be set by the model —
// and a model emitting origin:'ai' would book locally, push nothing, and
// silently reinstate the double-booking this whole change removes. Everything
// that reaches this function is a RinglyPro-side booking by definition; the
// mirror writes its own rows directly with origin:'ai'.
async function bookAppointment({ tenantId, caller_name, callback_number, date, time, starts_at, slot_minutes, call_id, email }) {
  const tenant = await resolveTenant(tenantId);
  if (!tenant) return { success: false, error: 'tenant_not_found' };
  const tz = tenant.timezone || 'America/New_York';

  let startUtc;
  if (starts_at) {
    startUtc = new Date(starts_at);
  } else if (date && time) {
    const [y, mo, d] = date.split('-').map(Number);
    const [h, mi] = time.split(':').map(Number);
    startUtc = zonedToUtc(tz, y, mo, d, h, mi);
  } else {
    return { success: false, error: 'missing_slot' };
  }
  if (isNaN(startUtc.getTime())) return { success: false, error: 'bad_slot' };
  if (startUtc.getTime() <= Date.now()) return { success: false, error: 'slot_in_past' };

  const step = slot_minutes || 30;
  const endUtc = new Date(startUtc.getTime() + step * 60000);

  try {
    const appt = await sequelize.transaction(async (tx) => {
      const clash = await Appointment.findOne({
        where: { tenant_id: tenantId, starts_at: startUtc, status: { [Op.in]: ['confirmed', 'sync_unknown'] } },
        transaction: tx,
        lock: tx.LOCK.UPDATE
      });
      if (clash) { const e = new Error('slot_taken'); e.code = 'SLOT_TAKEN'; throw e; }
      return Appointment.create({
        tenant_id: tenantId, call_id: call_id || null,
        caller_name: caller_name || null, callback_number: callback_number || null,
        starts_at: startUtc, ends_at: endUtc, status: 'confirmed',
        origin: 'ringlypro'
      }, { transaction: tx });
    });

    // ── The other calendar ────────────────────────────────────────────────
    // A booking taken here is invisible to the HighLevel Voice AI until it is
    // written into the tenant's HighLevel calendar, and an AI that cannot see
    // it will offer the slot to the next caller. Push OUTSIDE the transaction:
    // the row id is needed, and an HTTP round trip inside a transaction holds a
    // row lock open for seconds.
    const push = await pushToHighLevel(tenant, appt, email);

    if (push && push.unconfirmed) {
      // WE MAY HAVE CREATED IT AND CANNOT PROVE IT. Deleting the row here would
      // leave an event in the customer's calendar with nothing on our side
      // pointing at it, so it could never be cancelled — and with slot
      // validation off, every retry of the same time would add another. The row
      // is KEPT, marked, left blocking the slot, and surfaced to the owner; the
      // visitor is told it could not be confirmed rather than that it is booked.
      try { await appt.update({ status: 'sync_unknown' }); } catch (_) { /* reported below */ }
      console.error('[lite:booking] HighLevel outcome UNKNOWN for appt', appt.id, '-', push.detail);
      return { success: false, error: 'sync_unconfirmed' };
    }

    if (push && push.failed) {
      // A DEFINITE refusal: HighLevel answered and said no, so nothing exists
      // there. Booked here and free there is the double-book this work removes,
      // so the local row goes rather than being left in a half state.
      try { await appt.destroy(); }
      catch (e) { console.error('[lite:booking] SYNC FAILED AND THE LOCAL ROW SURVIVED — appt', appt.id, e.message); }
      console.error('[lite:booking] HighLevel refused the booking:', push.detail);
      // The reason stays in the log and in /internal/security. It reaches no
      // caller: on the relay path the return value is stringified into the
      // transcript and handed back to the model, which would read a HighLevel
      // error — or a decryption failure naming an env var — out loud.
      return { success: false, error: 'sync_failed' };
    }

    return {
      success: true, booked: true, appointment_id: appt.id,
      starts_at: startUtc.toISOString(),
      synced_to_calendar: !!(push && push.eventId),
      display: displaySlot(tz, startUtc, tenant.locale)
    };
  } catch (e) {
    // Unique-index violation from a concurrent booking also lands here.
    if (e.code === 'SLOT_TAKEN' || (e.name && e.name.includes('Unique'))) {
      return { success: false, error: 'slot_taken' };
    }
    console.error('[lite:booking] book error:', e.message);
    return { success: false, error: e.message };
  }
}

/**
 * Write a RinglyPro-born appointment into the tenant's HighLevel calendar.
 * Returns `{}` when the tenant is not on HighLevel (the Twilio path, and every
 * tenant mid-setup — they behave exactly as before), `{ eventId }` on success,
 * `{ failed:true, detail }` when HighLevel was reached and refused or could not
 * be reached at all.
 */
async function pushToHighLevel(tenant, appt, email) {
  if (!ghlCalendar.enabledFor(tenant)) return {};
  if (!ghlCalendar.pushable(appt)) return {};          // echo guard, checked twice on purpose
  let creds = null;
  try { creds = await accounts.credsFor(tenant); } catch (e) {
    return { failed: true, detail: `credentials unavailable: ${e.message}` };
  }
  if (!creds || !creds.token) return { failed: true, detail: 'no HighLevel credentials for this account' };
  // Defence in depth: the calendar id and the credentials must name the SAME
  // location. No current path can separate them (provisioning writes the
  // location and the token together, and the calendar only after), but a
  // hand-edited row falling through to the env fallback would post this
  // visitor's name and phone into the pilot sub-account before the calendar
  // call failed.
  if (String(creds.locationId) !== String(tenant.ghl_location_id)) {
    return { failed: true, detail: 'credentials do not match this account\'s location' };
  }

  let out = null;
  try {
    out = await ghlCalendar.pushAppointment({ tenant, creds, appt, email });
  } catch (e) {
    const detail = `${e.status || ''} ${String(e.message || e)}`.trim().slice(0, 200);
    return e.ambiguous ? { unconfirmed: true, detail } : { failed: true, detail };
  }
  if (!out || !out.eventId) return {};                  // skipped for a stated reason, not a failure

  // OUTSIDE the try above ON PURPOSE. A database hiccup writing the id is not
  // a push failure — the event exists — and treating it as one deleted the row
  // and orphaned that event.
  try { await appt.update({ ghl_event_id: out.eventId }); }
  catch (e) { console.error('[lite:booking] event', out.eventId, 'created but its id was not stored:', e.message); }
  return { eventId: out.eventId };
}

/**
 * Cancel both calendars. The local row is authoritative and is cancelled
 * first; the HighLevel side is best-effort and reports itself, because a
 * cancellation must never fail on the owner because HighLevel is down.
 */
async function cancelAppointment({ tenantId, appointmentId }) {
  const appt = await Appointment.findOne({ where: { id: appointmentId, tenant_id: tenantId } });
  if (!appt) return { success: false, error: 'not_found' };
  if (appt.status !== 'cancelled') { appt.status = 'cancelled'; await appt.save(); }
  const tenant = await Tenant.findByPk(tenantId);
  if (!tenant || !ghlCalendar.enabledFor(tenant) || !appt.ghl_event_id) return { success: true, remote: false };
  let creds = null;
  try { creds = await accounts.credsFor(tenant); } catch (_) { creds = null; }
  const out = await ghlCalendar.cancelAppointment({ tenant, creds, appt });
  const ok = !!(out && out.cancelled);
  // RECORDED ON THE ROW, not only in a counter. The local cancel stands either
  // way — an outage must never stop an owner cancelling — but if the other
  // calendar still holds the slot, that fact belongs somewhere an operator can
  // find it and act on, not behind an admin key as an aggregate.
  try { await appt.update({ ghl_cancel_failed_at: ok ? null : new Date() }); } catch (_) { /* logged below */ }
  if (!ok) console.error('[lite:booking] appt', appt.id, 'is cancelled here and NOT in the other calendar');
  // A CODE, never HighLevel's own words: this value is rendered in the
  // subscriber's dashboard, and the platform is not named on a customer surface.
  return { success: true, remote: ok, remote_status: ok ? null : 'not_confirmed_elsewhere' };
}

/** Message-taking path. */
async function takeMessage({ tenantId, call_id, caller_name, callback_number, body }) {
  const tenant = await resolveTenant(tenantId);
  if (!tenant) return { success: false, error: 'tenant_not_found' };
  const msg = await Message.create({
    tenant_id: tenantId, call_id: call_id || null,
    caller_name: caller_name || null, callback_number: callback_number || null,
    body: body || ''
  });
  return { success: true, saved: true, message_id: msg.id };
}

module.exports = { getBusinessInfo, identifyCaller, checkAvailability, bookAppointment, cancelAppointment, takeMessage, last10 };
