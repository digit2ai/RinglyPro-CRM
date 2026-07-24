'use strict';

/**
 * Lawn Co-Pilot — admin portal API
 * Role-gated. Every mutating action writes lc_audit_log.
 */

const express = require('express');
const { Op } = require('sequelize');
const router = express.Router();

const brain = require('../mcp/brain');
const {
  Lead, Customer, Property, PropertyGeometry, Measurement, MeasurementOverride,
  PricingRule, ServicePlan, AddonService, Quote, QuoteLineItem, Subscription,
  Appointment, ServiceRecord, ServicePhoto, Crew, Invoice, Payment,
  Ticket, Message, CallLog, AuditLog, AgentApproval
} = require('../models');
const acct = require('../services/accounting');
const { priceProperty } = require('../services/pricing');
const { toDateStr } = require('../services/scheduling');

const ROLES = {
  owner: 5, admin: 4, dispatcher: 3, csr: 2, tech: 1
};
function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.staff) return res.status(401).json({ success: false, error: 'Not signed in' });
    if (!allowed.includes(req.staff.role)) {
      return res.status(403).json({ success: false, error: `Requires one of: ${allowed.join(', ')}` });
    }
    next();
  };
}

router.use((req, res, next) => {
  if (!req.staff) return res.status(401).json({ success: false, error: 'Not signed in' });
  next();
});

function T(req) { return req.staff.tenant_id; }
function ctxOf(req) {
  return { tenant_id: T(req), channel: 'admin', role: req.staff.role, actor: `user:${req.staff.id}`, user_id: req.staff.id };
}
async function audit(req, action, entity, entity_id, oldV, newV, reason) {
  try {
    await AuditLog.create({
      tenant_id: T(req), user_id: req.staff.id, actor: req.staff.email,
      action, entity, entity_id, old_value: oldV, new_value: newV, reason
    });
  } catch (e) { /* auditing never breaks the action */ }
}

// ── Leads ──────────────────────────────────────────────────────────────────
router.get('/leads', async (req, res) => {
  const where = { tenant_id: T(req) };
  if (req.query.stage) where.stage = req.query.stage;
  const leads = await Lead.findAll({ where, order: [['created_at', 'DESC']], limit: 200, raw: true });
  const quotes = leads.filter(l => l.quote_id).length
    ? await Quote.findAll({ where: { tenant_id: T(req), id: leads.map(l => l.quote_id).filter(Boolean) }, raw: true })
    : [];
  const byQ = {}; quotes.forEach(q => { byQ[q.id] = q; });
  const stages = ['new', 'measured', 'quoted', 'accepted', 'lost'];
  const counts = {};
  stages.forEach(s => { counts[s] = leads.filter(l => l.stage === s).length; });
  res.json({
    success: true, counts,
    leads: leads.map(l => ({
      ...l,
      quote_value: byQ[l.quote_id] ? acct.money(byQ[l.quote_id].total_cents) : null,
      quote_token: byQ[l.quote_id] ? byQ[l.quote_id].token : null
    }))
  });
});

router.patch('/leads/:id', async (req, res) => {
  const lead = await Lead.findOne({ where: { id: req.params.id, tenant_id: T(req) } });
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  const old = lead.stage;
  if (req.body.stage) lead.stage = req.body.stage;
  lead.updated_at = new Date();
  await lead.save();
  await audit(req, 'lead.stage_change', 'lead', lead.id, { stage: old }, { stage: lead.stage });
  res.json({ success: true, lead: lead.toJSON() });
});

// ── Customers ──────────────────────────────────────────────────────────────
router.get('/customers', async (req, res) => {
  const where = { tenant_id: T(req) };
  if (req.query.q) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${req.query.q}%` } },
      { email: { [Op.iLike]: `%${req.query.q}%` } },
      { phone: { [Op.iLike]: `%${req.query.q}%` } }
    ];
  }
  const customers = await Customer.findAll({ where, order: [['created_at', 'DESC']], limit: 200, raw: true });
  res.json({
    success: true,
    customers: customers.map(c => ({
      id: c.id, name: c.name, email: c.email, phone: c.phone, status: c.status,
      balance: acct.money(c.balance_cents), balance_cents: c.balance_cents,
      autopay_enabled: c.autopay_enabled, created_at: c.created_at
    }))
  });
});

router.get('/customers/:id', async (req, res) => {
  const t = T(req);
  const c = await Customer.findOne({ where: { id: req.params.id, tenant_id: t }, raw: true });
  if (!c) return res.status(404).json({ success: false, error: 'Customer not found' });
  const props = await Property.findAll({ where: { tenant_id: t, customer_id: c.id }, raw: true });
  const subs = await Subscription.findAll({ where: { tenant_id: t, customer_id: c.id }, raw: true });
  const appts = await Appointment.findAll({ where: { tenant_id: t, customer_id: c.id }, order: [['service_date', 'DESC']], limit: 30, raw: true });
  const invoices = await Invoice.findAll({ where: { tenant_id: t, customer_id: c.id }, order: [['issued_at', 'DESC']], limit: 30, raw: true });
  res.json({ success: true, customer: c, properties: props, subscriptions: subs, appointments: appts, invoices });
});

// ── Measurement review queue ───────────────────────────────────────────────
router.get('/measurements', async (req, res) => {
  const t = T(req);
  const where = { tenant_id: t };
  if (req.query.queue === '1') {
    where[Op.or] = [{ needs_review: true }, { confidence: { [Op.ne]: 'high' } }];
  }
  const props = await Property.findAll({ where, order: [['updated_at', 'DESC']], limit: 100, raw: true });
  const geos = props.length
    ? await PropertyGeometry.findAll({ where: { tenant_id: t, property_id: props.map(p => p.id) }, raw: true })
    : [];
  const byProp = {}; geos.forEach(g => { byProp[g.property_id] = g; });
  res.json({
    success: true,
    properties: props.map(p => ({
      ...p,
      effective_sqft: p.approved_sqft || p.serviceable_sqft,
      geometry: byProp[p.id] || null
    }))
  });
});

/**
 * The override. Changes the price on re-quote and is always audited.
 */
router.patch('/measurements/:propertyId', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  const t = T(req);
  const prop = await Property.findOne({ where: { id: req.params.propertyId, tenant_id: t } });
  if (!prop) return res.status(404).json({ success: false, error: 'Property not found' });

  const { approved_sqft, reason, approve } = req.body || {};
  const old = prop.approved_sqft || prop.serviceable_sqft;

  if (approved_sqft !== undefined && approved_sqft !== null) {
    const n = Math.max(0, Math.round(Number(approved_sqft)));
    if (!Number.isFinite(n)) return res.status(400).json({ success: false, error: 'approved_sqft must be a number' });

    const measurement = await Measurement.findOne({
      where: { tenant_id: t, property_id: prop.id }, order: [['created_at', 'DESC']], raw: true
    });
    await MeasurementOverride.create({
      tenant_id: t, property_id: prop.id,
      measurement_id: measurement ? measurement.id : null,
      user_id: req.staff.id, old_sqft: old, new_sqft: n,
      reason: reason || 'Admin override'
    });
    prop.approved_sqft = n;
    prop.is_estimate = false;
    prop.confidence = 'high';
    await audit(req, 'measurement.override', 'property', prop.id, { sqft: old }, { sqft: n }, reason);
  }

  if (approve) {
    prop.needs_review = false;
    prop.approved_by = req.staff.id;
    prop.approved_at = new Date();
    if (!prop.approved_sqft) prop.approved_sqft = prop.serviceable_sqft;
    await audit(req, 'measurement.approve', 'property', prop.id, null, { approved_sqft: prop.approved_sqft }, reason);
  }

  prop.updated_at = new Date();
  await prop.save();

  const repriced = await priceProperty({
    tenant_id: t, serviceable_sqft: prop.approved_sqft || prop.serviceable_sqft,
    city: prop.city, county: prop.county, state: prop.state, zip: prop.zip
  });
  res.json({ success: true, property: prop.toJSON(), repriced: repriced.options });
});

// ── Quotes ─────────────────────────────────────────────────────────────────
router.get('/quotes', async (req, res) => {
  const where = { tenant_id: T(req) };
  if (req.query.status) where.status = req.query.status;
  const quotes = await Quote.findAll({ where, order: [['created_at', 'DESC']], limit: 100, raw: true });
  res.json({ success: true, quotes: quotes.map(q => ({ ...q, total_display: acct.money(q.total_cents) })) });
});

router.post('/quotes/:id/approve', requireRole('owner', 'admin'), async (req, res) => {
  const q = await Quote.findOne({ where: { id: req.params.id, tenant_id: T(req) } });
  if (!q) return res.status(404).json({ success: false, error: 'Quote not found' });
  const old = q.status;
  q.status = 'approved';
  await q.save();
  await audit(req, 'quote.approve', 'quote', q.id, { status: old }, { status: 'approved' });
  res.json({ success: true, quote: q.toJSON() });
});

router.post('/quotes/:id/modify', requireRole('owner', 'admin'), async (req, res) => {
  const t = T(req);
  const q = await Quote.findOne({ where: { id: req.params.id, tenant_id: t } });
  if (!q) return res.status(404).json({ success: false, error: 'Quote not found' });
  const { total_cents, reason } = req.body || {};
  if (total_cents === undefined) return res.status(400).json({ success: false, error: 'total_cents required' });
  const old = q.total_cents;
  const delta = Math.round(total_cents) - old;
  q.total_cents = Math.round(total_cents);
  await q.save();
  await QuoteLineItem.create({
    tenant_id: t, quote_id: q.id, kind: 'adjustment',
    label: 'Manual adjustment', detail: reason || `Adjusted by ${req.staff.email}`,
    amount_cents: delta, sort_order: 99
  });
  await audit(req, 'quote.modify', 'quote', q.id, { total_cents: old }, { total_cents: q.total_cents }, reason);
  res.json({ success: true, quote: q.toJSON() });
});

// ── Pricing ────────────────────────────────────────────────────────────────
router.get('/pricing-rules', requireRole('owner', 'admin'), async (req, res) => {
  const rules = await PricingRule.findAll({ where: { tenant_id: T(req) }, order: [['rule_type', 'ASC'], ['priority', 'DESC']], raw: true });
  res.json({ success: true, rules });
});

router.post('/pricing-rules', requireRole('owner', 'admin'), async (req, res) => {
  const r = await PricingRule.create({ tenant_id: T(req), ...req.body });
  await audit(req, 'pricing_rule.create', 'pricing_rule', r.id, null, req.body);
  res.json({ success: true, rule: r.toJSON() });
});

router.patch('/pricing-rules/:id', requireRole('owner', 'admin'), async (req, res) => {
  const r = await PricingRule.findOne({ where: { id: req.params.id, tenant_id: T(req) } });
  if (!r) return res.status(404).json({ success: false, error: 'Rule not found' });
  const old = r.toJSON();
  ['name', 'scope', 'params', 'priority', 'active', 'active_from', 'active_to'].forEach(k => {
    if (req.body[k] !== undefined) r[k] = req.body[k];
  });
  await r.save();
  await audit(req, 'pricing_rule.update', 'pricing_rule', r.id, old, r.toJSON());
  res.json({ success: true, rule: r.toJSON() });
});

router.delete('/pricing-rules/:id', requireRole('owner', 'admin'), async (req, res) => {
  const r = await PricingRule.findOne({ where: { id: req.params.id, tenant_id: T(req) } });
  if (!r) return res.status(404).json({ success: false, error: 'Rule not found' });
  const old = r.toJSON();
  await r.destroy();
  await audit(req, 'pricing_rule.delete', 'pricing_rule', old.id, old, null);
  res.json({ success: true });
});

/**
 * Test an address against the current rules BEFORE saving a change.
 */
router.post('/pricing-rules/test', requireRole('owner', 'admin'), async (req, res) => {
  const { serviceable_sqft, city, county, zip, state } = req.body || {};
  if (!serviceable_sqft) return res.status(400).json({ success: false, error: 'serviceable_sqft required' });
  const priced = await priceProperty({
    tenant_id: T(req), serviceable_sqft, city, county, zip, state: state || 'FL'
  });
  res.json({ success: true, ...priced });
});

router.get('/service-plans', async (req, res) => {
  const t = T(req);
  res.json({
    success: true,
    plans: await ServicePlan.findAll({ where: { tenant_id: t }, order: [['sort_order', 'ASC']], raw: true }),
    addons: await AddonService.findAll({ where: { tenant_id: t }, raw: true })
  });
});

// ── Schedule / dispatch ────────────────────────────────────────────────────
router.get('/schedule', async (req, res) => {
  const t = T(req);
  const from = req.query.from || toDateStr(new Date());
  const to = req.query.to || toDateStr(new Date(Date.now() + 14 * 86400000));
  const appts = await Appointment.findAll({
    where: { tenant_id: t, service_date: { [Op.between]: [from, to] } },
    order: [['service_date', 'ASC'], ['route_order', 'ASC']], raw: true
  });
  const customers = await Customer.findAll({ where: { tenant_id: t }, raw: true });
  const props = await Property.findAll({ where: { tenant_id: t }, raw: true });
  const crews = await Crew.findAll({ where: { tenant_id: t }, raw: true });
  const cById = {}; customers.forEach(c => { cById[c.id] = c; });
  const pById = {}; props.forEach(p => { pById[p.id] = p; });
  const crById = {}; crews.forEach(c => { crById[c.id] = c; });
  res.json({
    success: true, crews,
    appointments: appts.map(a => ({
      ...a,
      customer_name: (cById[a.customer_id] || {}).name || null,
      address: (pById[a.property_id] || {}).address || null,
      crew_name: (crById[a.crew_id] || {}).name || null,
      price_display: a.price_cents ? acct.money(a.price_cents) : null
    }))
  });
});

router.post('/schedule/:id/assign-crew', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  res.json(await brain.callTool('dispatcher.assign_crew', {
    appointment_id: Number(req.params.id), crew_id: req.body.crew_id
  }, ctxOf(req)));
});

router.post('/schedule/sequence', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  res.json(await brain.callTool('dispatcher.sequence_route', {
    service_date: req.body.service_date, crew_id: req.body.crew_id
  }, ctxOf(req)));
});

router.post('/schedule/weather-hold', requireRole('owner', 'admin', 'dispatcher'), async (req, res) => {
  res.json(await brain.callTool('dispatcher.weather_hold', {
    service_date: req.body.service_date, reason: req.body.reason
  }, ctxOf(req)));
});

router.post('/schedule/:id/status', requireRole('owner', 'admin', 'dispatcher', 'tech'), async (req, res) => {
  const t = T(req);
  const a = await Appointment.findOne({ where: { id: req.params.id, tenant_id: t } });
  if (!a) return res.status(404).json({ success: false, error: 'Visit not found' });
  const old = a.status;
  const { status, technician_notes, area_serviced_sqft, weather, charges_cents } = req.body || {};
  a.status = status || a.status;
  a.updated_at = new Date();
  await a.save();

  let invoice = null;
  if (status === 'completed') {
    const prop = await Property.findOne({ where: { id: a.property_id, tenant_id: t }, raw: true });
    const rec = await ServiceRecord.create({
      tenant_id: t, appointment_id: a.id, customer_id: a.customer_id, property_id: a.property_id,
      crew_id: a.crew_id, service_date: a.service_date, completed_at: new Date(),
      service_type: a.service_type,
      area_serviced_sqft: area_serviced_sqft || (prop ? (prop.approved_sqft || prop.serviceable_sqft) : null),
      completion_status: 'completed', technician_notes: technician_notes || null,
      weather: weather || null, charges_cents: charges_cents || a.price_cents || 0
    });
    // The Administrator bills on delivery.
    const inv = await brain.callTool('bookkeeper.issue_invoice', {
      customer_id: a.customer_id, service_record_id: rec.id,
      lines: [{ label: `Lawn service ${a.service_date}`, amount_cents: charges_cents || a.price_cents || 0 }]
    }, ctxOf(req));
    invoice = inv.invoice || null;
  }
  await audit(req, 'appointment.status', 'appointment', a.id, { status: old }, { status: a.status });
  res.json({ success: true, appointment: a.toJSON(), invoice });
});

router.post('/service-records/:id/photos', requireRole('owner', 'admin', 'dispatcher', 'tech'), async (req, res) => {
  const t = T(req);
  const rec = await ServiceRecord.findOne({ where: { id: req.params.id, tenant_id: t }, raw: true });
  if (!rec) return res.status(404).json({ success: false, error: 'Service record not found' });
  const { url, kind, caption } = req.body || {};
  if (!url) return res.status(400).json({ success: false, error: 'url required' });
  const p = await ServicePhoto.create({
    tenant_id: t, service_record_id: rec.id, property_id: rec.property_id,
    kind: kind || 'after', url, caption: caption || null
  });
  res.json({ success: true, photo_id: p.id });
});

router.get('/crews', async (req, res) => {
  res.json({ success: true, crews: await Crew.findAll({ where: { tenant_id: T(req) }, raw: true }) });
});

router.post('/crews', requireRole('owner', 'admin'), async (req, res) => {
  const c = await Crew.create({ tenant_id: T(req), ...req.body });
  res.json({ success: true, crew: c.toJSON() });
});

// ── Billing ────────────────────────────────────────────────────────────────
router.get('/invoices', requireRole('owner', 'admin', 'csr'), async (req, res) => {
  const t = T(req);
  const where = { tenant_id: t };
  if (req.query.status) where.status = req.query.status;
  const invoices = await Invoice.findAll({ where, order: [['issued_at', 'DESC']], limit: 200, raw: true });
  const customers = await Customer.findAll({ where: { tenant_id: t }, raw: true });
  const byId = {}; customers.forEach(c => { byId[c.id] = c; });
  res.json({
    success: true,
    invoices: invoices.map(i => ({
      ...i, total_display: acct.money(i.total_cents),
      customer_name: (byId[i.customer_id] || {}).name || null
    }))
  });
});

router.get('/payments', requireRole('owner', 'admin'), async (req, res) => {
  const payments = await Payment.findAll({ where: { tenant_id: T(req) }, order: [['created_at', 'DESC']], limit: 200, raw: true });
  res.json({ success: true, payments: payments.map(p => ({ ...p, amount_display: acct.money(p.amount_cents) })) });
});

router.post('/dunning/run', requireRole('owner', 'admin'), async (req, res) => {
  res.json(await brain.callTool('bookkeeper.run_dunning', {}, ctxOf(req)));
});

// ── Tickets and messages ───────────────────────────────────────────────────
router.get('/tickets', async (req, res) => {
  const where = { tenant_id: T(req) };
  if (req.query.status) where.status = req.query.status;
  const tickets = await Ticket.findAll({ where, order: [['created_at', 'DESC']], limit: 200, raw: true });
  res.json({ success: true, tickets });
});

router.patch('/tickets/:id', async (req, res) => {
  const t = await Ticket.findOne({ where: { id: req.params.id, tenant_id: T(req) } });
  if (!t) return res.status(404).json({ success: false, error: 'Ticket not found' });
  const old = t.status;
  ['status', 'priority', 'assigned_to'].forEach(k => { if (req.body[k] !== undefined) t[k] = req.body[k]; });
  t.updated_at = new Date();
  await t.save();
  if (req.body.reply) {
    await Message.create({
      tenant_id: T(req), customer_id: t.customer_id, ticket_id: t.id,
      direction: 'outbound', author: req.staff.name || req.staff.email, body: req.body.reply
    });
  }
  await audit(req, 'ticket.update', 'ticket', t.id, { status: old }, { status: t.status });
  res.json({ success: true, ticket: t.toJSON() });
});

// ── AI Staff (the visible proof of the AI office) ──────────────────────────
router.get('/ai-staff', async (req, res) => {
  const days = Number(req.query.days || 1);
  const activity = await brain.staffActivity({ tenant_id: T(req), days });
  res.json({ success: true, ...activity, roster: brain.listEmployees() });
});

router.patch('/ai-staff/:id', requireRole('owner', 'admin'), async (req, res) => {
  const emp = brain.getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });
  if (req.body.enabled !== undefined) {
    emp.enabled = !!req.body.enabled;
    await audit(req, 'ai_staff.toggle', 'employee', null, null, { id: emp.id, enabled: emp.enabled });
  }
  res.json({ success: true, employee: { id: emp.id, name: emp.name, enabled: emp.enabled !== false } });
});

router.get('/ai-staff/approvals', async (req, res) => {
  const approvals = await AgentApproval.findAll({
    where: { tenant_id: T(req), status: req.query.status || 'pending' },
    order: [['created_at', 'DESC']], limit: 100, raw: true
  });
  res.json({ success: true, approvals });
});

router.post('/ai-staff/approvals/:id', requireRole('owner', 'admin'), async (req, res) => {
  const r = await brain.executeApproval({
    tenant_id: T(req), approval_id: Number(req.params.id),
    user_id: req.staff.id, approve: req.body.approve !== false
  });
  await audit(req, 'ai_staff.approval', 'approval', Number(req.params.id), null, { approve: req.body.approve !== false });
  res.json(r);
});

router.get('/calls', async (req, res) => {
  const calls = await CallLog.findAll({ where: { tenant_id: T(req) }, order: [['created_at', 'DESC']], limit: 100, raw: true });
  res.json({ success: true, calls });
});

// ── Reports ────────────────────────────────────────────────────────────────
router.get('/reports/:kind', requireRole('owner', 'admin'), async (req, res) => {
  const t = T(req);
  const days = Number(req.query.days || 30);
  const kind = req.params.kind;
  const ctx = ctxOf(req);

  if (kind === 'revenue') return res.json(await brain.callTool('bookkeeper.revenue_report', { days }, ctx));
  if (kind === 'ar-aging') return res.json(await brain.callTool('bookkeeper.ar_aging', {}, ctx));
  if (kind === 'books') {
    const r = await brain.callTool('bookkeeper.export_books', { days: Number(req.query.days || 365) }, ctx);
    if (req.query.format === 'csv' && r.success) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="lawncopilot-books-${new Date().toISOString().slice(0, 10)}.csv"`);
      return res.send(r.csv);
    }
    return res.json(r);
  }
  if (kind === 'conversion') {
    const since = new Date(Date.now() - days * 86400000);
    const leads = await Lead.findAll({ where: { tenant_id: t, created_at: { [Op.gte]: since } }, raw: true });
    const stages = ['new', 'measured', 'quoted', 'accepted', 'lost'];
    const funnel = {};
    stages.forEach(s => { funnel[s] = leads.filter(l => l.stage === s).length; });
    const accepted = funnel.accepted || 0;
    return res.json({
      success: true, period_days: days, total_leads: leads.length, funnel,
      conversion_rate: leads.length ? Number((accepted / leads.length).toFixed(3)) : 0
    });
  }
  if (kind === 'overrides') {
    const total = await Measurement.count({ where: { tenant_id: t } });
    const overrides = await MeasurementOverride.count({ where: { tenant_id: t } });
    return res.json({
      success: true, measurements: total, overrides,
      override_rate: total ? Number((overrides / total).toFixed(3)) : 0
    });
  }
  if (kind === 'jobs') {
    const since = new Date(Date.now() - days * 86400000);
    const recs = await ServiceRecord.findAll({ where: { tenant_id: t, completed_at: { [Op.gte]: since } }, raw: true });
    const crews = await Crew.findAll({ where: { tenant_id: t }, raw: true });
    const byCrew = {};
    crews.forEach(c => { byCrew[c.name] = recs.filter(r => r.crew_id === c.id).length; });
    return res.json({ success: true, period_days: days, jobs_completed: recs.length, by_crew: byCrew });
  }
  res.status(404).json({ success: false, error: `Unknown report: ${kind}` });
});

router.get('/audit', requireRole('owner', 'admin'), async (req, res) => {
  const rows = await AuditLog.findAll({ where: { tenant_id: T(req) }, order: [['created_at', 'DESC']], limit: 200, raw: true });
  res.json({ success: true, audit: rows });
});

module.exports = router;
