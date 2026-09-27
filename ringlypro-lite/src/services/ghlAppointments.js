'use strict';

/**
 * PULL BOOKINGS BACK OUT OF THE HIGHLEVEL CALENDAR.
 *
 * The evidence this exists for: on 2026-09-27 a real caller was forwarded to
 * the Voice AI agent, which booked Monday 9:00. The appointment appeared in
 * HighLevel's calendar and the message reached the Lite dashboard — and the
 * Calendar tab stayed empty. Nothing was broken: the call-log poller
 * deliberately refuses to create an appointment, because a call log carries no
 * slot and a row built from one would be a FABRICATED time in a customer's
 * calendar. The booking is real and lives in the calendar; this reads it.
 *
 * This is the other half of the mirror. `services/callMirror.js` handles the
 * call, the message and the transcript; the slot only exists here.
 *
 * THE WINDOW IS MILLISECONDS. Measured against the live sub-account
 * 2026-09-27: `GET /calendars/events` with `startTime`/`endTime` in ms returns
 * the booking under Version 2021-04-15, v3 and the date-stamped default alike,
 * while the SAME request with ISO timestamps returns `{events:[]}` — a clean
 * 200 that is indistinguishable from an empty calendar. That is the identical
 * trap the call-log window had, and it is the worst way for a read to fail.
 * `calendarId` is required; there is no whole-location read (422).
 *
 * THE TENANT COMES FROM THE CALENDAR, NEVER FROM THE PAYLOAD. Every tenant has
 * their own `ghl_calendar_id` inside one shared sub-account, so the calendar a
 * row was read from IS its owner — a stronger mapping than the call log had,
 * which has no dialled number at all.
 *
 * IT NEVER PUSHES. Rows are written `origin:'ai'`, which is the single thing
 * standing between a two-way sync and an echo loop: `services/ghlCalendar.js`
 * only ever pushes `origin:'ringlypro'`.
 */
const ghl = require('../telephony/ghl');
const accounts = require('./ghlAccounts');
const tollFraud = require('../security/tollFraud');
const { Op } = require('sequelize');
const { Tenant, Appointment } = require('../models');

const VERSION = () => String(process.env.LITE_GHL_CALENDAR_READ_VERSION || '2021-04-15').trim();
const BACK_DAYS = () => Math.max(1, parseInt(process.env.LITE_GHL_APPT_BACK_DAYS || '2', 10) || 2);
const AHEAD_DAYS = () => Math.max(1, parseInt(process.env.LITE_GHL_APPT_AHEAD_DAYS || '60', 10) || 60);

const stats = { runs: 0, fetched: 0, stored: 0, updated: 0, skipped: 0,
  last_at: null, last_error: null };

/** Statuses that mean the slot is NOT held. */
function isCancelled(ev) {
  const s = String(ev.appointmentStatus || ev.appoinmentStatus || '').toLowerCase();
  return !!ev.deleted || s === 'cancelled' || s === 'canceled' || s === 'noshow' || s === 'no-show';
}

/**
 * The contact behind an event, for a name and a callback number.
 * BEST EFFORT BY DESIGN: an appointment with no name is still an appointment,
 * and losing the booking because a second request failed would be worse than
 * showing the time with a blank name.
 */
async function contactOf(creds, contactId) {
  if (!contactId) return {};
  try {
    const d = await ghl.call('GET', `/contacts/${encodeURIComponent(contactId)}`, { creds, version: VERSION() });
    const c = (d && (d.contact || d)) || {};
    const name = c.name || [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || null;
    // A callback number is a real number or it is null — never free text. This
    // value is rendered in the owner's dashboard and reaches a tel: href.
    const chk = c.phone ? tollFraud.checkDestination(c.phone, { defaultCountry: 'US' }) : null;
    return { name: name ? String(name).slice(0, 120) : null, phone: chk && chk.ok ? chk.e164 : null };
  } catch (e) {
    console.warn('[lite:ghl-appts] contact unreadable:', e.message);
    return {};
  }
}

/** Read the events on ONE tenant's calendar. Read-only. */
async function fetchEvents(tenant, creds, { backDays, aheadDays } = {}) {
  const now = Date.now();
  const from = now - (backDays || BACK_DAYS()) * 86400000;
  const to = now + (aheadDays || AHEAD_DAYS()) * 86400000;
  const d = await ghl.call('GET', '/calendars/events', {
    creds, version: VERSION(),
    // Strings of MILLISECONDS. See the file note: ISO silently returns nothing.
    query: { locationId: ghl.locationId(creds), calendarId: tenant.ghl_calendar_id,
      startTime: String(from), endTime: String(to) },
  });
  const arr = (d && (d.events || d.appointments)) || (Array.isArray(d) ? d : []);
  return Array.isArray(arr) ? arr : [];
}

/**
 * Mirror one tenant's calendar into `lite_appointments`.
 * Idempotent on HighLevel's own event id, so a re-poll — and a webhook that
 * arrives for the same booking — converge on ONE row.
 */
async function importForTenant(tenant, { creds, dryRun = false, backDays, aheadDays } = {}) {
  if (!tenant || !tenant.ghl_calendar_id) return { ok: false, reason: 'no_calendar' };
  const c = creds || await accounts.credsFor(tenant);
  if (!c || !ghl.configured(c)) return { ok: false, reason: 'no_credentials' };

  let events;
  try { events = await fetchEvents(tenant, c, { backDays, aheadDays }); }
  catch (e) {
    stats.last_error = String(e.message || e).slice(0, 200);
    return { ok: false, reason: 'fetch_failed', status: e.status || null, detail: stats.last_error };
  }
  stats.fetched += events.length;

  const results = [];
  for (const ev of events) {
    const eid = ev.id ? String(ev.id).slice(0, 200) : null;
    if (!eid) { results.push({ reason: 'no_event_id' }); continue; }

    // THE CALENDAR IS THE OWNER. An event that came back on someone else's
    // calendar id is not this tenant's, whatever the request asked for.
    if (ev.calendarId && String(ev.calendarId) !== String(tenant.ghl_calendar_id)) {
      results.push({ event: eid, stored: false, reason: 'foreign_calendar' }); continue;
    }

    const starts = new Date(ev.startTime);
    const ends = ev.endTime && !isNaN(new Date(ev.endTime).getTime())
      ? new Date(ev.endTime) : new Date(starts.getTime() + 30 * 60000);
    if (isNaN(starts.getTime())) { results.push({ event: eid, stored: false, reason: 'bad_start' }); continue; }

    const existing = await Appointment.findOne({ where: { tenant_id: tenant.id, ghl_event_id: eid } });
    const cancelled = isCancelled(ev);

    if (existing) {
      // A MIRROR REFLECTS A CANCELLATION TOO. Without this the Lite calendar
      // keeps showing a slot the owner has already freed in HighLevel, and the
      // agent stops offering a time that is genuinely open.
      if (cancelled && existing.status !== 'cancelled') {
        if (!dryRun) await existing.update({ status: 'cancelled' });
        stats.updated++;
        results.push({ event: eid, stored: false, reason: 'cancelled_upstream', appointment_id: existing.id });
      } else {
        stats.skipped++;
        results.push({ event: eid, stored: false, reason: 'already_mirrored', appointment_id: existing.id });
      }
      continue;
    }

    if (cancelled) { stats.skipped++; results.push({ event: eid, stored: false, reason: 'cancelled' }); continue; }

    if (dryRun) { results.push({ event: eid, would_store: true, starts_at: starts.toISOString() }); continue; }

    const who = await contactOf(c, ev.contactId);
    try {
      const row = await Appointment.create({
        tenant_id: tenant.id,
        caller_name: who.name || (ev.title ? String(ev.title).slice(0, 120) : null),
        callback_number: who.phone || null,
        starts_at: starts, ends_at: ends,
        status: 'confirmed',
        // origin:'ai' IS THE ECHO GUARD — born in HighLevel, never pushed back.
        origin: 'ai',
        ghl_event_id: eid,
      });
      stats.stored++;
      results.push({ event: eid, stored: true, appointment_id: row.id, starts_at: starts.toISOString() });
    } catch (e) {
      // The partial unique index on (tenant_id, starts_at) can refuse a slot
      // RinglyPro already holds under a different event id. That is the guard
      // working; it is reported, not swallowed into a silent miss.
      stats.last_error = String(e.message || e).slice(0, 200);
      results.push({ event: eid, stored: false, reason: 'insert_refused', detail: stats.last_error });
    }
  }
  return { ok: true, fetched: events.length, results };
}

/** Every tenant that has a HighLevel calendar. */
async function importAll({ dryRun = false } = {}) {
  stats.runs++; stats.last_at = new Date().toISOString();
  const tenants = await Tenant.findAll({ where: { ghl_calendar_id: { [Op.ne]: null } }, order: [['id', 'ASC']] });
  const out = [];
  for (const t of tenants) {
    try { out.push({ tenant: t.id, ...(await importForTenant(t, { dryRun })) }); }
    catch (e) { out.push({ tenant: t.id, ok: false, error: String(e.message || e).slice(0, 200) }); }
  }
  return { ok: true, tenants: out.length, results: out };
}

/** Production only unless forced, like the call-log poller it rides beside. */
let timer = null;
function start() {
  const flag = String(process.env.LITE_GHL_APPT_POLL || '').toLowerCase();
  if (flag === 'off') { console.log('[lite:ghl-appts] poller off by env'); return null; }
  if (flag !== 'on' && process.env.NODE_ENV !== 'production') return null;
  if (!ghl.configured()) { console.log('[lite:ghl-appts] no HighLevel credentials; poller not started'); return null; }
  const everySec = Math.max(60, parseInt(process.env.LITE_GHL_APPT_POLL_SEC || '180', 10) || 180);
  const tick = async () => {
    try {
      const r = await importAll({});
      const n = (r.results || []).reduce((a, x) => a + ((x.results || []).filter((y) => y.stored).length), 0);
      if (n) console.log(`[lite:ghl-appts] mirrored ${n} appointment(s)`);
    } catch (e) { console.warn('[lite:ghl-appts] tick failed:', e.message); }
  };
  timer = setInterval(tick, everySec * 1000);
  if (timer.unref) timer.unref();
  setTimeout(tick, 20000).unref?.();
  console.log(`[lite:ghl-appts] poller on, every ${everySec}s`);
  return timer;
}
function stop() { if (timer) clearInterval(timer); timer = null; }

module.exports = { fetchEvents, importForTenant, importAll, isCancelled, start, stop, stats };
