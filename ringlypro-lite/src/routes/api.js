'use strict';

/**
 * Dashboard REST API (all tenant-scoped via req.tenantId from the JWT).
 * Messages, Calendar (appointments), Settings (business + availability rules).
 */
const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { Tenant, Message, Appointment, AvailabilityRule, Call, Transcript } = require('../models');
const booking = require('../services/booking');
const tollFraud = require('../security/tollFraud');

router.use(requireAuth);

/* ── Booking diagnostics (owner-scoped) ────────────────────────────── */
router.get('/debug/booking', async (req, res) => {
  try {
    const tenant = await Tenant.findByPk(req.tenantId);
    const rules = await AvailabilityRule.findAll({ where: { tenant_id: req.tenantId }, order: [['weekday', 'ASC'], ['start', 'ASC']] });
    const availability = await booking.checkAvailability({ tenantId: req.tenantId, days_ahead: 14, limit: 5 });
    const lastCall = await Call.findOne({ where: { tenant_id: req.tenantId }, order: [['started_at', 'DESC']] });
    let transcript = [];
    if (lastCall && lastCall.call_sid) {
      transcript = await Transcript.findAll({ where: { call_sid: lastCall.call_sid }, order: [['id', 'ASC']] });
    }
    res.json({
      tenant_id: req.tenantId,
      timezone: tenant && tenant.timezone,
      locale: tenant && tenant.locale,
      now: new Date().toISOString(),
      rules_count: rules.length,
      rules,
      availability,
      last_call: lastCall,
      transcript: transcript.map(t => ({ role: t.role, tool: t.tool_name, text: t.text }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// One-time: pull synthetic-demo (tenant 0) messages/appointments into the
// logged-in account so past demo activity becomes visible in the dashboard.
router.post('/import-demo', async (req, res) => {
  // SECURITY: this moves every demo-line caller's messages, appointments and
  // call records (names and phone numbers of real people) into the caller's
  // account. Signup is open, so without this check ANY new account could take
  // them. Only the configured demo tenant may import; anyone else gets 404.
  const demoTenantId = parseInt(process.env.LITE_DEMO_TENANT_ID || '7', 10);
  if (!demoTenantId || req.tenantId !== demoTenantId) return res.status(404).json({ error: 'not_found' });
  try {
    const m = await Message.update({ tenant_id: req.tenantId }, { where: { tenant_id: 0 } });
    const a = await Appointment.update({ tenant_id: req.tenantId }, { where: { tenant_id: 0 } });
    const c = await Call.update({ tenant_id: req.tenantId }, { where: { tenant_id: 0 } });
    res.json({ success: true, imported: { messages: m[0], appointments: a[0], calls: c[0] } });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ── Messages ──────────────────────────────────────────────────────── */
router.get('/messages', async (req, res) => {
  const rows = await Message.findAll({
    where: { tenant_id: req.tenantId },
    order: [['created_at', 'DESC']], limit: 200
  });
  const unread = rows.filter(m => !m.read_at).length;
  res.json({ unread, messages: rows });
});

// EVERY `:id` IS PARSED BEFORE IT REACHES POSTGRES — see the cancel route: a
// non-integer goes into an integer column, the driver throws, and an
// unhandled rejection used to take the whole service down. The appointments
// route was fixed first; these three are the same shape and were missed.
function idParam(req) {
  const n = Number.parseInt(req.params.id, 10);
  return Number.isInteger(n) && n > 0 ? n : null;
}

router.post('/messages/:id/read', async (req, res) => {
  const id = idParam(req);
  if (!id) return res.status(404).json({ error: 'not_found' });
  const m = await Message.findOne({ where: { id, tenant_id: req.tenantId } });
  if (!m) return res.status(404).json({ error: 'not_found' });
  m.read_at = new Date(); await m.save();
  res.json({ success: true });
});

router.post('/messages/read-all', async (req, res) => {
  await Message.update({ read_at: new Date() }, { where: { tenant_id: req.tenantId, read_at: null } });
  res.json({ success: true });
});

// Delete a message (swipe-left to delete).
router.delete('/messages/:id', async (req, res) => {
  const id = idParam(req);
  if (!id) return res.status(404).json({ error: 'not_found' });
  const n = await Message.destroy({ where: { id, tenant_id: req.tenantId } });
  if (!n) return res.status(404).json({ error: 'not_found' });
  res.json({ success: true });
});

/* ── Appointments (calendar) ───────────────────────────────────────── */
router.get('/appointments', async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 86400000);
  const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 14 * 86400000);
  // FIELDS ARE NAMED, not whole rows. `ghl_event_id` and `origin` are plumbing:
  // the platform underneath is not named on a customer surface, and returning
  // the model wholesale means every column added later ships to the browser by
  // default. `synced` is the useful part of it, as a boolean.
  const rows = await Appointment.findAll({
    attributes: ['id', 'call_id', 'caller_name', 'callback_number', 'reason', 'starts_at', 'ends_at', 'status', 'created_at', 'ghl_event_id', 'ghl_cancel_failed_at'],
    where: { tenant_id: req.tenantId, starts_at: { [Op.between]: [from, to] } },
    order: [['starts_at', 'ASC']]
  });
  res.json({
    appointments: rows.map((r) => {
      const o = r.get({ plain: true });
      const synced = !!o.ghl_event_id;
      const cancel_incomplete = !!o.ghl_cancel_failed_at;
      delete o.ghl_event_id; delete o.ghl_cancel_failed_at;
      return { ...o, synced, cancel_incomplete };
    })
  });
});

/**
 * BOOK BY HAND, AND IT SYNCS LIKE ANY OTHER BOOKING.
 *
 * The owner had no way to add an appointment themselves — every row arrived
 * from a caller. This goes through `booking.bookAppointment`, the SAME path
 * the relay agent and the public page use, so it inherits the slot lock, the
 * push to HighLevel and, critically, the THREE-OUTCOME handling: a definite
 * refusal deletes the local row (booked here and free there is the
 * double-book), while an ambiguous one KEEPS it as `sync_unknown` because the
 * event may exist in HighLevel with nothing on our side pointing at it.
 *
 * A manual booking is `origin:'ringlypro'` and therefore IS pushed. Reusing
 * the service rather than inserting a row here is the whole point: a second
 * insert path would have to re-implement all of that and would get it wrong.
 */
router.post('/appointments', express.json({ limit: '8kb' }), async (req, res) => {
  const b = req.body || {};
  const name = String(b.caller_name || '').trim().slice(0, 120);
  if (!name) return res.status(400).json({ error: 'name_required' });

  // A callback number is optional here — the owner may be booking someone
  // whose number they already have elsewhere — but if given it must be a real
  // number, because it is rendered into a tel: href on this same screen.
  let phone = null;
  if (b.callback_number && String(b.callback_number).trim()) {
    const tenant = await Tenant.findByPk(req.tenantId);
    const chk = tollFraud.checkDestination(String(b.callback_number), {
      defaultCountry: (tenant && tenant.country) || 'US' });
    if (!chk.ok) return res.status(400).json({ error: 'bad_number', detail: chk.reason || null });
    phone = chk.e164;
  }

  try {
    const r = await booking.bookAppointment({
      tenantId: req.tenantId,
      caller_name: name,
      callback_number: phone,
      reason: b.reason,
      date: b.date, time: b.time, starts_at: b.starts_at,
    });
    if (!r.success) {
      // sync_unconfirmed is NOT a failure the owner should read as "nothing
      // happened" — the slot is held and flagged. Say which it was.
      const code = r.error === 'slot_taken' ? 409
        : (r.error === 'sync_failed' || r.error === 'sync_unconfirmed') ? 503 : 400;
      return res.status(code).json({ error: r.error });
    }
    return res.status(201).json({ ok: true, id: r.appointment_id, starts_at: r.starts_at,
      synced: r.synced_to_calendar !== false });
  } catch (e) {
    console.error('[lite:api] manual booking failed:', e.message);
    return res.status(500).json({ error: 'book_failed' });
  }
});

// Cancelling here also cancels it in the tenant's HighLevel calendar, or the
// slot stays blocked there and the Voice AI stops offering a time the owner
// has actually freed — the mirror image of the double-booking bug, and the one
// that quietly costs them bookings. The HighLevel leg is best-effort and
// reported (`remote`), never a reason to refuse the owner's cancellation.
router.post('/appointments/:id/cancel', async (req, res) => {
  // `:id` IS PARSED BEFORE IT REACHES POSTGRES. `/appointments/abc/cancel` sent
  // 'abc' into an integer column, Postgres threw, the handler's promise
  // rejected, and with no Express error middleware and no unhandledRejection
  // handler in this service that TAKES THE WHOLE PROCESS DOWN on modern Node —
  // one unauthenticated-shaped URL from a signed-in tenant restarts Lite for
  // every tenant.
  const id = idParam(req);
  if (!id) return res.status(404).json({ error: 'not_found' });
  try {
    const out = await booking.cancelAppointment({ tenantId: req.tenantId, appointmentId: id });
    if (!out.success) return res.status(404).json({ error: out.error || 'not_found' });
    res.json(out);
  } catch (e) {
    console.error('[lite:api] cancel failed:', e.message);
    res.status(500).json({ error: 'cancel_failed' });
  }
});

/* ── Settings: business ────────────────────────────────────────────── */
router.get('/settings', async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  const rules = await AvailabilityRule.findAll({ where: { tenant_id: req.tenantId }, order: [['weekday', 'ASC'], ['start', 'ASC']] });
  res.json({ tenant, availability_rules: rules });
});

router.patch('/settings', async (req, res) => {
  const tenant = await Tenant.findByPk(req.tenantId);
  if (!tenant) return res.status(404).json({ error: 'not_found' });
  const allow = ['business_name', 'owner_name', 'owner_phone', 'owner_email', 'locale', 'timezone', 'greeting', 'transfer_number'];
  // The two phone fields are numbers WE will dial and text, so they are checked
  // against the toll-fraud allow-list here (a clear error for the owner) as well
  // as at send time in the provider (the guarantee). Empty clears the field.
  for (const f of ['owner_phone', 'transfer_number']) {
    if (!(f in (req.body || {}))) continue;
    const v = req.body[f];
    if (v == null || String(v).trim() === '') { req.body[f] = null; continue; }
    const chk = tollFraud.checkDestination(v, { defaultCountry: tenant.country });
    if (!chk.ok) return res.status(400).json({ error: 'phone_not_allowed', field: f, reason: chk.reason,
      message: 'Only US and Colombian phone numbers can receive calls and texts from RinglyPro Lite.' });
    req.body[f] = chk.e164;
  }
  const transferChanged = ('transfer_number' in (req.body || {}) && req.body.transfer_number !== tenant.transfer_number)
    || ('owner_phone' in (req.body || {}) && req.body.owner_phone !== tenant.owner_phone);
  for (const k of allow) if (k in (req.body || {})) tenant[k] = req.body[k];
  await tenant.save();

  // A NEW TRANSFER NUMBER MUST REACH THE DEPLOYED AGENT. Storing it and leaving
  // the agent dialling the old one means calls keep going to a line the owner
  // no longer controls — a departed employee, or a recycled number now
  // belonging to a stranger. Fire and forget: the save has already succeeded,
  // and a HighLevel hiccup must not fail the owner's settings change.
  if (transferChanged && tenant.ghl_agent_id) {
    require('../services/provisioning').syncTransfer(tenant)
      .catch((e) => console.error('[lite:ghl] transfer action not synced:', e.message));
  }
  res.json({ success: true, tenant });
});

/* ── Settings: availability rules ──────────────────────────────────── */
router.put('/availability', async (req, res) => {
  // Replace the whole weekly template atomically.
  const rules = Array.isArray(req.body && req.body.rules) ? req.body.rules : [];
  const tenant = await Tenant.findByPk(req.tenantId);
  await AvailabilityRule.destroy({ where: { tenant_id: req.tenantId } });
  const created = [];
  for (const r of rules) {
    if (r.weekday == null || !r.start || !r.end) continue;
    created.push(await AvailabilityRule.create({
      tenant_id: req.tenantId,
      weekday: Number(r.weekday),
      start: r.start, end: r.end,
      slot_minutes: Number(r.slot_minutes) || 30,
      timezone: r.timezone || tenant.timezone,
      active: r.active !== false
    }));
  }
  res.json({ success: true, availability_rules: created });
});

/* ── Call log (analytics-lite) ─────────────────────────────────────── */
router.get('/calls', async (req, res) => {
  const rows = await Call.findAll({ where: { tenant_id: req.tenantId }, order: [['started_at', 'DESC']], limit: 100 });
  res.json({ calls: rows });
});

module.exports = router;
