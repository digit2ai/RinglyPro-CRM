'use strict';

/**
 * Lawn Co-Pilot — customer portal API
 * Every query is scoped by req.customer.tenant_id AND req.customer.id.
 */

const express = require('express');
const { Op } = require('sequelize');
const crypto = require('crypto');
const router = express.Router();

const brain = require('../mcp/brain');
const {
  Customer, Property, PropertyGeometry, Subscription, Appointment,
  ServiceRecord, ServicePhoto, Invoice, InvoiceLineItem, Payment,
  PaymentMethod, Ticket, Message, Crew
} = require('../models');
const acct = require('../services/accounting');
const { toDateStr } = require('../services/scheduling');

router.use((req, res, next) => {
  if (!req.customer) return res.status(401).json({ success: false, error: 'Not signed in' });
  next();
});

function scope(req, extra = {}) {
  return { tenant_id: req.customer.tenant_id, customer_id: req.customer.id, ...extra };
}
function ctxOf(req) {
  return {
    tenant_id: req.customer.tenant_id, channel: 'portal',
    customer_id: req.customer.id, actor: `customer:${req.customer.id}`
  };
}

// ── Gate-code encryption (never plaintext at rest) ─────────────────────────
function key() {
  const secret = process.env.LAWNCOPILOT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';
  return crypto.createHash('sha256').update(secret).digest();
}
function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv.toString('hex'), c.getAuthTag().toString('hex'), enc.toString('hex')].join(':');
}
function decrypt(blob) {
  if (!blob) return null;
  try {
    const [iv, tag, data] = String(blob).split(':');
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'hex'));
    d.setAuthTag(Buffer.from(tag, 'hex'));
    return Buffer.concat([d.update(Buffer.from(data, 'hex')), d.final()]).toString('utf8');
  } catch (e) { return null; }
}

// ── Dashboard ──────────────────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  const t = req.customer.tenant_id;
  const c = await Customer.findOne({ where: { id: req.customer.id, tenant_id: t }, raw: true });
  if (!c) return res.status(404).json({ success: false, error: 'Account not found' });

  const today = toDateStr(new Date());
  const prop = await Property.findOne({ where: scope(req), raw: true });
  const sub = await Subscription.findOne({ where: scope(req, { status: { [Op.in]: ['active', 'paused'] } }), raw: true });
  const next = await Appointment.findOne({
    where: scope(req, { status: { [Op.in]: ['scheduled', 'en_route'] }, service_date: { [Op.gte]: today } }),
    order: [['service_date', 'ASC']], raw: true
  });
  const last = await ServiceRecord.findOne({ where: scope(req), order: [['service_date', 'DESC']], raw: true });
  const unread = await Message.count({ where: scope(req, { direction: 'outbound', read_at: null }) });
  const openInvoices = await Invoice.count({ where: scope(req, { status: { [Op.in]: ['open', 'failed'] } }) });

  let crew = null;
  if (next && next.crew_id) crew = await Crew.findOne({ where: { id: next.crew_id, tenant_id: t }, raw: true });

  res.json({
    success: true,
    customer: { name: c.name, email: c.email, phone: c.phone, status: c.status },
    property: prop ? { address: prop.address, serviceable_sqft: prop.approved_sqft || prop.serviceable_sqft, is_estimate: prop.is_estimate } : null,
    plan: sub ? { frequency: sub.frequency, status: sub.status, price: acct.money(sub.price_cents), next_service_date: sub.next_service_date } : null,
    next_service: next ? {
      id: next.id, date: next.service_date,
      window: `${next.window_start} - ${next.window_end}`,
      status: next.status, crew: crew ? crew.name : null
    } : null,
    last_service: last ? { date: last.service_date, status: last.completion_status } : null,
    balance: { cents: c.balance_cents, display: acct.money(c.balance_cents), open_invoices: openInvoices },
    autopay_enabled: c.autopay_enabled,
    unread_messages: unread
  });
});

// ── Property ───────────────────────────────────────────────────────────────
router.get('/property', async (req, res) => {
  const prop = await Property.findOne({ where: scope(req), raw: true });
  if (!prop) return res.json({ success: true, property: null });
  const geo = await PropertyGeometry.findOne({ where: { tenant_id: req.customer.tenant_id, property_id: prop.id }, raw: true });
  const photos = await ServicePhoto.findAll({
    where: { tenant_id: req.customer.tenant_id, property_id: prop.id }, limit: 12,
    order: [['created_at', 'DESC']], raw: true
  });
  res.json({
    success: true,
    property: {
      ...prop,
      gate_code: decrypt(prop.gate_code_enc),
      gate_code_enc: undefined,
      effective_sqft: prop.approved_sqft || prop.serviceable_sqft
    },
    geometry: geo, photos
  });
});

router.patch('/property', async (req, res) => {
  const prop = await Property.findOne({ where: scope(req) });
  if (!prop) return res.status(404).json({ success: false, error: 'No property on file' });
  const { special_instructions, access_instructions, gate_code, hazards } = req.body || {};
  if (special_instructions !== undefined) prop.special_instructions = special_instructions;
  if (access_instructions !== undefined) prop.access_instructions = access_instructions;
  if (hazards !== undefined) prop.hazards = hazards;
  if (gate_code !== undefined) prop.gate_code_enc = gate_code ? encrypt(gate_code) : null;
  prop.updated_at = new Date();
  await prop.save();
  res.json({ success: true });
});

router.post('/property/dispute', async (req, res) => {
  const prop = await Property.findOne({ where: scope(req), raw: true });
  if (!prop) return res.status(404).json({ success: false, error: 'No property on file' });
  const r = await brain.callTool('estimator.flag_for_review', {
    property_id: prop.id, reason: req.body.reason || 'Customer believes the measurement is inaccurate.'
  }, ctxOf(req));
  res.json(r);
});

// ── Schedule ───────────────────────────────────────────────────────────────
router.get('/schedule', async (req, res) => {
  const t = req.customer.tenant_id;
  const appts = await Appointment.findAll({
    where: scope(req), order: [['service_date', 'DESC']], limit: 60, raw: true
  });
  const crews = await Crew.findAll({ where: { tenant_id: t }, raw: true });
  const byCrew = {}; crews.forEach(c => { byCrew[c.id] = c.name; });
  const today = toDateStr(new Date());
  res.json({
    success: true,
    upcoming: appts.filter(a => a.service_date >= today && !['cancelled', 'completed'].includes(a.status))
      .sort((a, b) => a.service_date.localeCompare(b.service_date))
      .map(a => ({ ...a, crew: byCrew[a.crew_id] || null })),
    past: appts.filter(a => a.service_date < today || ['cancelled', 'completed'].includes(a.status))
      .map(a => ({ ...a, crew: byCrew[a.crew_id] || null }))
  });
});

router.post('/schedule/:id/reschedule', async (req, res) => {
  const appt = await Appointment.findOne({ where: scope(req, { id: req.params.id }), raw: true });
  if (!appt) return res.status(404).json({ success: false, error: 'Visit not found' });
  const r = await brain.callTool('dispatcher.reschedule_appointment', {
    appointment_id: appt.id, service_date: req.body.service_date,
    window_start: req.body.window_start, window_end: req.body.window_end
  }, ctxOf(req));
  res.json(r);
});

router.post('/schedule/:id/skip', async (req, res) => {
  const appt = await Appointment.findOne({ where: scope(req, { id: req.params.id }), raw: true });
  if (!appt) return res.status(404).json({ success: false, error: 'Visit not found' });
  res.json(await brain.callTool('dispatcher.skip_visit', { appointment_id: appt.id }, ctxOf(req)));
});

router.post('/schedule/:id/cancel', async (req, res) => {
  const appt = await Appointment.findOne({ where: scope(req, { id: req.params.id }), raw: true });
  if (!appt) return res.status(404).json({ success: false, error: 'Visit not found' });
  res.json(await brain.callTool('dispatcher.cancel_appointment', {
    appointment_id: appt.id, reason: req.body.reason
  }, ctxOf(req)));
});

router.post('/schedule/pause', async (req, res) => {
  res.json(await brain.callTool('dispatcher.pause_service', { until: req.body.until }, ctxOf(req)));
});

router.post('/schedule/resume', async (req, res) => {
  res.json(await brain.callTool('dispatcher.resume_service', {}, ctxOf(req)));
});

router.get('/availability', async (req, res) => {
  res.json(await brain.callTool('dispatcher.check_availability', { from: req.query.from, days: Number(req.query.days || 21) }, ctxOf(req)));
});

router.post('/service-request', async (req, res) => {
  res.json(await brain.callTool('receptionist.create_ticket', {
    type: 'service_request',
    subject: req.body.subject || 'Additional service requested',
    body: req.body.body
  }, ctxOf(req)));
});

// ── History ────────────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  const t = req.customer.tenant_id;
  const records = await ServiceRecord.findAll({ where: scope(req), order: [['service_date', 'DESC']], limit: 60, raw: true });
  const photos = records.length
    ? await ServicePhoto.findAll({ where: { tenant_id: t, service_record_id: records.map(r => r.id) }, raw: true })
    : [];
  const crews = await Crew.findAll({ where: { tenant_id: t }, raw: true });
  const byCrew = {}; crews.forEach(c => { byCrew[c.id] = c.name; });
  res.json({
    success: true,
    records: records.map(r => ({
      ...r,
      crew: byCrew[r.crew_id] || null,
      charges_display: acct.money(r.charges_cents),
      photos: photos.filter(p => p.service_record_id === r.id).map(p => ({ kind: p.kind, url: p.url, caption: p.caption }))
    }))
  });
});

// ── Billing ────────────────────────────────────────────────────────────────
router.get('/invoices', async (req, res) => {
  const t = req.customer.tenant_id;
  const invoices = await Invoice.findAll({ where: scope(req), order: [['issued_at', 'DESC']], limit: 60, raw: true });
  const lines = invoices.length
    ? await InvoiceLineItem.findAll({ where: { tenant_id: t, invoice_id: invoices.map(i => i.id) }, order: [['sort_order', 'ASC']], raw: true })
    : [];
  const payments = await Payment.findAll({ where: scope(req), order: [['created_at', 'DESC']], limit: 40, raw: true });
  res.json({
    success: true,
    invoices: invoices.map(i => ({
      ...i,
      total_display: acct.money(i.total_cents),
      paid_display: acct.money(i.amount_paid_cents),
      lines: lines.filter(l => l.invoice_id === i.id).map(l => ({ label: l.label, detail: l.detail, amount: acct.money(l.amount_cents) }))
    })),
    payments: payments.map(p => ({
      ...p, amount_display: acct.money(p.amount_cents)
    }))
  });
});

router.post('/invoices/:id/pay', async (req, res) => {
  const inv = await Invoice.findOne({ where: scope(req, { id: req.params.id }), raw: true });
  if (!inv) return res.status(404).json({ success: false, error: 'Invoice not found' });
  res.json(await brain.callTool('bookkeeper.take_payment', {
    invoice_id: inv.id, payment_method_id: req.body.payment_method_id
  }, ctxOf(req)));
});

router.get('/payment-methods', async (req, res) => {
  const pms = await PaymentMethod.findAll({ where: scope(req), raw: true });
  res.json({
    success: true,
    payments_configured: acct.stripeEnabled(),
    methods: pms.map(p => ({
      id: p.id, brand: p.brand, last4: p.last4,
      exp: `${String(p.exp_month || '').padStart(2, '0')}/${p.exp_year || ''}`,
      is_default: p.is_default, type: p.type
    }))
  });
});

router.post('/payment-methods', async (req, res) => {
  const { stripe_payment_method_id, brand, last4, exp_month, exp_year, make_default } = req.body || {};
  if (!stripe_payment_method_id) {
    return res.status(400).json({ success: false, error: 'A Stripe payment method id is required. Card details never touch our servers.' });
  }
  const t = req.customer.tenant_id;
  if (make_default) await PaymentMethod.update({ is_default: false }, { where: scope(req) });
  const pm = await PaymentMethod.create({
    tenant_id: t, customer_id: req.customer.id,
    stripe_payment_method_id, brand, last4, exp_month, exp_year,
    is_default: !!make_default
  });
  res.json({ success: true, payment_method_id: pm.id });
});

router.delete('/payment-methods/:id', async (req, res) => {
  const pm = await PaymentMethod.findOne({ where: scope(req, { id: req.params.id }) });
  if (!pm) return res.status(404).json({ success: false, error: 'Payment method not found' });
  const { AutopayEnrollment } = require('../models');
  const inUse = await AutopayEnrollment.count({ where: scope(req, { payment_method_id: pm.id, status: 'active' }) });
  if (inUse) return res.status(409).json({ success: false, error: 'This card is used for automatic payment. Add another one first or turn autopay off.' });
  await pm.destroy();
  res.json({ success: true });
});

router.post('/autopay/enroll', async (req, res) => {
  res.json(await brain.callTool('bookkeeper.enroll_autopay', { payment_method_id: req.body.payment_method_id }, ctxOf(req)));
});

router.post('/autopay/disable', async (req, res) => {
  res.json(await brain.callTool('bookkeeper.disable_autopay', {}, ctxOf(req)));
});

router.get('/balance', async (req, res) => {
  res.json(await brain.callTool('bookkeeper.get_balance', { customer_id: req.customer.id }, ctxOf(req)));
});

// ── Messages ───────────────────────────────────────────────────────────────
router.get('/messages', async (req, res) => {
  const msgs = await Message.findAll({ where: scope(req), order: [['created_at', 'DESC']], limit: 100, raw: true });
  const tickets = await Ticket.findAll({ where: scope(req), order: [['created_at', 'DESC']], limit: 30, raw: true });
  await Message.update({ read_at: new Date() }, { where: scope(req, { direction: 'outbound', read_at: null }) });
  res.json({ success: true, messages: msgs.reverse(), tickets });
});

router.post('/messages', async (req, res) => {
  const body = String((req.body && req.body.body) || '').trim();
  if (!body) return res.status(400).json({ success: false, error: 'Message body is required' });
  const r = await brain.callTool('receptionist.take_message', {
    name: req.customer.email, message: body
  }, ctxOf(req));
  await Message.create({
    tenant_id: req.customer.tenant_id, customer_id: req.customer.id,
    direction: 'inbound', author: 'You', body
  });
  res.json({ success: true, ticket_id: r.ticket_id });
});

// ── The resident assistant (the orb, inside the app) ───────────────────────
router.post('/assistant', async (req, res) => {
  const text = String((req.body && req.body.text) || '').slice(0, 1000);
  const ctx = ctxOf(req);
  // An authenticated customer is already identified — the assistant knows them.
  const faq = await brain.callTool('receptionist.answer_faq', { question: text }, ctx);
  if (/balance|owe|invoice|bill|pay/i.test(text)) {
    const b = await brain.callTool('bookkeeper.get_balance', { customer_id: req.customer.id }, ctx);
    if (b.success) return res.json({ success: true, reply: b.spoken });
  }
  if (/next|when|schedule|visit|come/i.test(text)) {
    const s = await brain.callTool('receptionist.get_service_status', { customer_id: req.customer.id }, ctx);
    if (s.success) return res.json({ success: true, reply: s.spoken });
  }
  res.json({ success: true, reply: faq.answer });
});

module.exports = router;
