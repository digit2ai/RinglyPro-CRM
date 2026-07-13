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
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

// One-time: pull synthetic-demo (tenant 0) messages/appointments into the
// logged-in account so past demo activity becomes visible in the dashboard.
router.post('/import-demo', async (req, res) => {
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

router.post('/messages/:id/read', async (req, res) => {
  const m = await Message.findOne({ where: { id: req.params.id, tenant_id: req.tenantId } });
  if (!m) return res.status(404).json({ error: 'not_found' });
  m.read_at = new Date(); await m.save();
  res.json({ success: true });
});

router.post('/messages/read-all', async (req, res) => {
  await Message.update({ read_at: new Date() }, { where: { tenant_id: req.tenantId, read_at: null } });
  res.json({ success: true });
});

/* ── Appointments (calendar) ───────────────────────────────────────── */
router.get('/appointments', async (req, res) => {
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 86400000);
  const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 14 * 86400000);
  const rows = await Appointment.findAll({
    where: { tenant_id: req.tenantId, starts_at: { [Op.between]: [from, to] } },
    order: [['starts_at', 'ASC']]
  });
  res.json({ appointments: rows });
});

router.post('/appointments/:id/cancel', async (req, res) => {
  const a = await Appointment.findOne({ where: { id: req.params.id, tenant_id: req.tenantId } });
  if (!a) return res.status(404).json({ error: 'not_found' });
  a.status = 'cancelled'; await a.save();
  res.json({ success: true });
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
  for (const k of allow) if (k in (req.body || {})) tenant[k] = req.body[k];
  await tenant.save();
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
