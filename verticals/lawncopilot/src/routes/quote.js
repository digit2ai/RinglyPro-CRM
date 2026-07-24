'use strict';

/**
 * Lawn Co-Pilot — public quote endpoints (the wizard path)
 *
 * Same Brain tools as the orb. A visitor who never says a word gets the
 * identical measurement, the identical price, and the identical quote row.
 * The gate applies here too: no session_id with a verified identity, no quote.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const brain = require('../mcp/brain');
const {
  AgentSession, Quote, QuoteLineItem, Property, PropertyGeometry,
  Customer, Subscription, Lead, ServicePlan, AddonService
} = require('../models');
const { notify } = require('../services/notify');
const sched = require('../services/scheduling');

function T(req) {
  if (!req.tenant_id) throw new Error('quote route reached without a resolved tenant');
  return req.tenant_id;
}
const SECRET = () => process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';

async function gate(req, res, next) {
  const sid = (req.body && req.body.session_id) || req.query.session_id;
  if (!sid) {
    return res.status(403).json({ success: false, gate_required: true, error: 'Name, phone, and email are required before a quote.' });
  }
  const s = await AgentSession.findOne({ where: { tenant_id: T(req), session_id: sid } });
  if (!s || !s.identity_verified) {
    return res.status(403).json({ success: false, gate_required: true, error: 'Name, phone, and email are required before a quote.' });
  }
  req.orbSession = s;
  next();
}

function ctxOf(req) {
  const s = req.orbSession;
  return {
    tenant_id: T(req), channel: 'web_chat', session_id: s.session_id,
    customer_id: s.customer_id || null, identity_verified: true,
    actor: `lead:${(s.identity || {}).email || 'unknown'}`
  };
}

router.post('/address-verify', gate, async (req, res) => {
  const r = await brain.callTool('estimator.verify_address', { address: req.body.address }, ctxOf(req));
  res.json(r);
});

router.post('/measure', gate, async (req, res) => {
  const r = await brain.callTool('estimator.measure_property', { address: req.body.address }, ctxOf(req));
  res.json(r);
});

router.post('/price', gate, async (req, res) => {
  const r = await brain.callTool('estimator.price_quote', {
    property_id: req.body.property_id,
    serviceable_sqft: req.body.serviceable_sqft,
    flags: req.body.flags,
    addon_codes: req.body.addon_codes
  }, ctxOf(req));
  res.json(r);
});

router.post('/issue', gate, async (req, res) => {
  const r = await brain.callTool('estimator.issue_quote', {
    property_id: req.body.property_id,
    frequency: req.body.frequency,
    addon_codes: req.body.addon_codes,
    flags: req.body.flags
  }, ctxOf(req));
  res.json(r);
});

router.get('/plans', async (req, res) => {
  const tenant_id = T(req);
  const plans = await ServicePlan.findAll({ where: { tenant_id, active: true }, order: [['sort_order', 'ASC']], raw: true });
  const addons = await AddonService.findAll({ where: { tenant_id, active: true }, raw: true });
  res.json({ success: true, plans, addons });
});

router.get('/availability', async (req, res) => {
  const r = await sched.checkAvailability({ tenant_id: T(req), from: req.query.from, days: Number(req.query.days || 14) });
  res.json({ success: true, ...r });
});

/**
 * Retrieve a quote by its shareable token. This is what lets the orb, an SMS,
 * an email, and the phone Receptionist all hand a customer back into the exact
 * same quote.
 */
router.get('/:token', async (req, res) => {
  const tenant_id = T(req);
  const q = await Quote.findOne({ where: { tenant_id, token: req.params.token }, raw: true });
  if (!q) return res.status(404).json({ success: false, error: 'Quote not found' });

  const expired = q.expires_at && new Date(q.expires_at) < new Date();
  const lines = await QuoteLineItem.findAll({ where: { tenant_id, quote_id: q.id }, order: [['sort_order', 'ASC']], raw: true });
  const prop = await Property.findOne({ where: { tenant_id, id: q.property_id }, raw: true });
  const geo = await PropertyGeometry.findOne({ where: { tenant_id, property_id: q.property_id }, raw: true });

  res.json({
    success: true,
    expired,
    quote: {
      ...q,
      price_display: `$${(q.total_cents / 100).toFixed(2)}`,
      line_items: lines.map(l => ({
        label: l.label, detail: l.detail, kind: l.kind,
        amount: `${l.amount_cents < 0 ? '-' : ''}$${Math.abs(l.amount_cents / 100).toFixed(2)}`,
        amount_cents: l.amount_cents
      }))
    },
    property: prop,
    geometry: geo,
    disclaimer: q.is_estimate ? 'This price is preliminary and subject to final property verification.' : null,
    note: expired ? 'This quote has expired. Prices are re-checked before booking.' : null
  });
});

/**
 * Accept a quote -> create the account, the subscription, the first visit, and
 * hand back a portal session. This is the conversion moment.
 */
router.post('/:token/accept', gate, async (req, res) => {
  const tenant_id = T(req);
  const { password, service_date, window_start, window_end, autopay } = req.body || {};
  const session = req.orbSession;
  const identity = session.identity || {};

  const q = await Quote.findOne({ where: { tenant_id, token: req.params.token } });
  if (!q) return res.status(404).json({ success: false, error: 'Quote not found' });
  if (q.expires_at && new Date(q.expires_at) < new Date()) {
    return res.status(410).json({ success: false, error: 'This quote has expired. Re-price the property before accepting.' });
  }
  if (q.status === 'accepted') return res.status(409).json({ success: false, error: 'This quote was already accepted' });

  const prop = await Property.findOne({ where: { tenant_id, id: q.property_id } });
  if (!prop) return res.status(400).json({ success: false, error: 'Quote has no property' });

  // Account.
  let customer = await Customer.findOne({ where: { tenant_id, email: identity.email } });
  if (!customer) {
    customer = await Customer.create({
      tenant_id, name: identity.name, email: identity.email, phone: identity.phone,
      password_hash: password ? await bcrypt.hash(password, 10) : null,
      status: 'active',
      referral_code: (identity.name || 'LC').split(' ')[0].toUpperCase().slice(0, 6) + Math.floor(Math.random() * 900 + 100),
      consent: { sms_transactional: true, sms_marketing: false, email_marketing: false }
    });
  } else if (password && !customer.password_hash) {
    customer.password_hash = await bcrypt.hash(password, 10);
    await customer.save();
  }

  prop.customer_id = customer.id;
  await prop.save();

  // Subscription.
  const sub = await Subscription.create({
    tenant_id, customer_id: customer.id, property_id: prop.id,
    frequency: q.frequency, price_cents: q.total_cents,
    status: 'active',
    next_service_date: service_date || null
  });

  // First visit — real availability only.
  let appointment = null;
  if (service_date) {
    const booked = await brain.callTool('dispatcher.book_appointment', {
      customer_id: customer.id, property_id: prop.id, subscription_id: sub.id,
      service_date, window_start, window_end, price_cents: q.total_cents
    }, { ...ctxOf(req), customer_id: customer.id });
    if (!booked.success) {
      return res.status(409).json({ success: false, error: booked.error, account_created: true, customer_id: customer.id });
    }
    appointment = booked;
    sub.next_service_date = sched.nextServiceDate(q.frequency, service_date);
    await sub.save();
  }

  q.status = 'accepted';
  q.customer_id = customer.id;
  await q.save();

  if (session.lead_id) {
    await Lead.update(
      { stage: 'accepted', customer_id: customer.id, updated_at: new Date() },
      { where: { id: session.lead_id, tenant_id } }
    );
  }
  session.customer_id = customer.id;
  session.outcome = 'converted';
  await session.save();

  const base = process.env.LAWNCOPILOT_BASE_URL || 'https://aiagent.ringlypro.com';
  await notify({
    tenant_id, customer_id: customer.id, channel: 'email', template: 'account_registration',
    vars: { name: customer.name, portal_url: `${base}/lawncopilot/portal` }
  });

  const token = jwt.sign(
    { id: customer.id, tenant_id, email: customer.email, kind: 'customer' },
    SECRET(), { expiresIn: '30d' }
  );
  res.cookie('lawncopilot_token', token, {
    httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000, path: '/'
  });

  res.json({
    success: true,
    customer_id: customer.id,
    subscription_id: sub.id,
    appointment: appointment ? { id: appointment.appointment_id, service_date: appointment.service_date, window: appointment.window } : null,
    autopay_requested: !!autopay,
    portal_url: '/lawncopilot/portal',
    next_step: autopay ? 'add_payment_method' : 'done'
  });
});

module.exports = router;
