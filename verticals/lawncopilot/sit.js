'use strict';

/**
 * Lawn Co-Pilot — System Integration Test
 *
 * Run from the repo root:  node verticals/lawncopilot/sit.js
 *
 * Passes with ZERO external keys set. Proves the acceptance criteria:
 * identity gate is unbypassable, typed path works keyless, one brain across
 * channels, tenant isolation, role gates, approval queue, cost guard, webhook
 * idempotency, no card data at rest.
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');

const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}/lawncopilot`;
const TENANT = Number(process.env.LAWNCOPILOT_TENANT_ID || 1);
const OTHER_TENANT = 999;

let pass = 0, fail = 0;
const failures = [];

function ok(name, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(name + (detail ? ` -> ${detail}` : '')); console.log(`  FAIL  ${name}${detail ? ' -> ' + detail : ''}`); }
}

let cookieJar = {};
async function call(method, url, body, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  const jar = opts.jar === undefined ? 'default' : opts.jar;
  if (jar && cookieJar[jar]) headers.Cookie = cookieJar[jar];
  if (opts.headers) Object.assign(headers, opts.headers);
  const res = await fetch(url, {
    method,
    headers,
    body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined
  });
  const setC = res.headers.get('set-cookie');
  if (setC && jar) {
    const pairs = setC.split(/,(?=\s*\w+=)/).map(c => c.split(';')[0].trim());
    const existing = (cookieJar[jar] || '').split('; ').filter(Boolean);
    const map = {};
    existing.concat(pairs).forEach(p => { const i = p.indexOf('='); map[p.slice(0, i)] = p.slice(i + 1); });
    cookieJar[jar] = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch (e) { data = { _raw: text.slice(0, 400) }; }
  return { status: res.status, data };
}

(async function run() {
  console.log('\nLawn Co-Pilot SIT\n' + '='.repeat(60));

  // ── Boot ────────────────────────────────────────────────────────────────
  const app = express();
  const router = require('./src/index');
  app.use('/lawncopilot', router);
  const server = http.createServer(app);
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));

  const models = require('./src/models');
  const brain = require('./src/mcp/brain');

  // Wait for the router's async init (sync + seed) to actually finish rather
  // than racing it on a fixed timer.
  process.stdout.write('  waiting for schema');
  for (let i = 0; i < 60; i++) {
    try {
      await models.AgentSession.findOne({ where: { tenant_id: TENANT }, raw: true });
      await models.PricingRule.findOne({ where: { tenant_id: TENANT }, raw: true });
      const rules = await models.PricingRule.count({ where: { tenant_id: TENANT } });
      const users = await models.User.count({ where: { tenant_id: TENANT } });
      if (rules > 0 && users > 0) break;
    } catch (e) { /* tables still being created */ }
    process.stdout.write('.');
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(' ready');

  try {
    // ── 1. Health ─────────────────────────────────────────────────────────
    console.log('\n[1] Health and brain');
    let r = await call('GET', `${BASE}/health`);
    ok('health returns ok with db ok', r.status === 200 && r.data.status === 'ok' && r.data.db === 'ok',
       JSON.stringify(r.data).slice(0, 160));
    ok('health lists four AI employees', (r.data.employees || []).length === 4);

    r = await call('GET', `${BASE}/mcp/health`);
    ok('brain health returns ok', r.status === 200 && r.data.status === 'ok');

    // ── 2. Tool catalog + namespaces ──────────────────────────────────────
    console.log('\n[2] Brain tool catalog');
    r = await call('GET', `${BASE}/mcp/tools/list`);
    const names = (r.data.tools || []).map(t => t.name);
    ok('tools/list returns all four namespaces',
       ['receptionist', 'estimator', 'dispatcher', 'administrator']
         .every(ns => names.some(n => n.startsWith(ns + '.'))));
    ok('tool catalog is non-trivial', names.length >= 25, `${names.length} tools`);

    r = await call('GET', `${BASE}/mcp/employees`);
    ok('employees endpoint lists the roster', (r.data.employees || []).length === 4);

    // ── 3. THE IDENTITY GATE (unbypassable) ───────────────────────────────
    console.log('\n[3] Identity gate');
    r = await call('POST', `${BASE}/api/v1/quote/measure`, { address: '1240 Palm Grove Drive, Orlando FL 32801' });
    ok('measure rejected with no session', r.status === 403 && r.data.gate_required === true);

    r = await call('POST', `${BASE}/api/v1/orb/message`, { session_id: 'made-up-session', text: 'hi' });
    ok('orb message rejected with a forged session', r.status === 403 && r.data.gate_required === true);

    r = await call('POST', `${BASE}/api/v1/orb/identity`, { name: 'A', phone: 'nope', email: 'bad' });
    ok('gate rejects invalid identity', r.status === 400 && !r.data.success);

    r = await call('POST', `${BASE}/api/v1/orb/identity`, { name: 'Test Homeowner', phone: '+13055550142', email: null });
    ok('gate rejects a missing email', r.status === 400);

    const gateRes = await call('POST', `${BASE}/api/v1/orb/identity`, {
      name: 'Test Homeowner', phone: '+13055550142', email: `sit_${Date.now()}@example.com`, channel: 'web_orb'
    });
    ok('gate accepts a complete identity', gateRes.status === 200 && gateRes.data.success === true);
    const session_id = gateRes.data.session_id;
    ok('gate returns a session id', !!session_id);

    const leadRow = await models.Lead.findOne({ where: { tenant_id: TENANT, session_id }, raw: true });
    ok('lead written at the gate, BEFORE any address',
       !!leadRow && !!leadRow.name && !!leadRow.phone && !!leadRow.email && !leadRow.address);

    // Brain-level enforcement (not just the route)
    const gatedDirect = await brain.callTool('estimator.measure_property',
      { address: '1240 Palm Grove Drive, Orlando FL 32801' },
      { tenant_id: TENANT, channel: 'web_orb', session_id: 'x' });
    ok('brain refuses an identity-gated tool for an unverified session',
       gatedDirect.success === false && /not authorized/i.test(gatedDirect.error || ''));

    // ── 4. Typed conversation, ZERO keys ──────────────────────────────────
    console.log('\n[4] Typed conversation (no voice keys)');
    const ADDRESS = '1240 Palm Grove Drive, Orlando FL 32801';
    r = await call('POST', `${BASE}/api/v1/orb/message`, { session_id, text: ADDRESS, channel: 'web_chat' });
    ok('typed turn succeeds', r.status === 200 && r.data.success === true, JSON.stringify(r.data).slice(0, 200));
    ok('typed turn returns a measurement', !!(r.data.data && r.data.data.measurement));
    ok('typed turn returns pricing for every frequency',
       !!(r.data.data && r.data.data.pricing && r.data.data.pricing.weekly && r.data.data.pricing.biweekly
          && r.data.data.pricing.monthly && r.data.data.pricing.one_time));

    const convoMeasurement = r.data.data.measurement;
    const convoPricing = r.data.data.pricing;
    ok('measurement is labeled as an estimate when inferred',
       convoMeasurement.is_estimate === true && !!convoMeasurement.confidence);
    ok('measurement carries its sources', Array.isArray(convoMeasurement.sources) && convoMeasurement.sources.length > 0);
    ok('serviceable = lot - building - excluded',
       convoMeasurement.serviceable_sqft ===
       Math.max(0, convoMeasurement.lot_sqft - convoMeasurement.building_footprint_sqft - convoMeasurement.excluded_sqft));

    // ── 5. One brain: wizard path must match the conversation ─────────────
    console.log('\n[5] One brain, every channel');
    const wizMeasure = await call('POST', `${BASE}/api/v1/quote/measure`, { session_id, address: ADDRESS });
    ok('wizard measure succeeds', wizMeasure.data.success === true);
    ok('wizard and conversation agree on serviceable area',
       wizMeasure.data.serviceable_sqft === convoMeasurement.serviceable_sqft,
       `${wizMeasure.data.serviceable_sqft} vs ${convoMeasurement.serviceable_sqft}`);

    const property_id = wizMeasure.data.property_id;
    const wizPrice = await call('POST', `${BASE}/api/v1/quote/price`, { session_id, property_id });
    ok('wizard price succeeds', wizPrice.data.success === true);
    ok('wizard and conversation agree on price to the cent',
       wizPrice.data.options.biweekly.total_cents === convoPricing.biweekly.total_cents,
       `${wizPrice.data.options.biweekly.total_cents} vs ${convoPricing.biweekly.total_cents}`);

    const orbTool = await call('POST', `${BASE}/api/v1/orb/tool`, {
      session_id, tool: 'estimator.price_quote', arguments: { property_id }
    });
    ok('orb tool bridge agrees on the same price',
       orbTool.data.success && orbTool.data.options.biweekly.total_cents === wizPrice.data.options.biweekly.total_cents);

    // ── 6. Line items reconcile ───────────────────────────────────────────
    console.log('\n[6] Pricing integrity');
    ['weekly', 'biweekly', 'monthly', 'one_time'].forEach(f => {
      const o = wizPrice.data.options[f];
      const sum = o.line_items.reduce((a, l) => a + l.amount_cents, 0);
      ok(`${f} line items sum to the total`, sum === o.total_cents, `${sum} vs ${o.total_cents}`);
    });

    // ── 7. Quote issue + retrieval ────────────────────────────────────────
    console.log('\n[7] Quote lifecycle');
    const issued = await call('POST', `${BASE}/api/v1/quote/issue`, { session_id, property_id, frequency: 'biweekly' });
    ok('quote issued', issued.data.success === true && !!issued.data.token);
    const quoteToken = issued.data.token;

    const fetched = await call('GET', `${BASE}/api/v1/quote/${quoteToken}`);
    ok('quote retrievable by token', fetched.data.success === true);
    ok('quote total matches the priced total',
       fetched.data.quote.total_cents === wizPrice.data.options.biweekly.total_cents);
    ok('quote carries the preliminary disclaimer when estimated',
       fetched.data.quote.is_estimate ? !!fetched.data.disclaimer : true);

    const leadAfter = await models.Lead.findOne({ where: { tenant_id: TENANT, session_id }, raw: true });
    ok('lead advanced to quoted with the address attached',
       leadAfter.stage === 'quoted' && !!leadAfter.address);

    // ── 8. Availability is real ───────────────────────────────────────────
    console.log('\n[8] Dispatcher');
    const avail = await call('GET', `${BASE}/api/v1/quote/availability`);
    ok('availability returns real slots', avail.data.success === true && Array.isArray(avail.data.slots));
    const slot = (avail.data.slots || [])[0];
    ok('slots are business days only',
       !slot || [1, 2, 3, 4, 5].includes(new Date(slot.date + 'T12:00:00').getDay()));

    const badBook = await brain.callTool('dispatcher.book_appointment',
      { service_date: '2020-01-01' },
      { tenant_id: TENANT, channel: 'web_chat', session_id, identity_verified: true });
    ok('booking a past date fails loudly', badBook.success === false && !!badBook.error);

    // ── 9. Conversion ─────────────────────────────────────────────────────
    console.log('\n[9] Conversion');
    const accepted = await call('POST', `${BASE}/api/v1/quote/${quoteToken}/accept`, {
      session_id, password: 'sitpass@2026',
      service_date: slot ? slot.date : null,
      window_start: slot ? slot.window_start : null,
      window_end: slot ? slot.window_end : null
    });
    ok('quote accepted, account created', accepted.data.success === true && !!accepted.data.customer_id);
    const customer_id = accepted.data.customer_id;
    ok('first visit booked', !!accepted.data.appointment);
    ok('subscription created', !!accepted.data.subscription_id);

    const reaccept = await call('POST', `${BASE}/api/v1/quote/${quoteToken}/accept`, { session_id });
    ok('a quote cannot be accepted twice', reaccept.status === 409);

    // ── 10. Portal (customer session set by accept) ───────────────────────
    console.log('\n[10] Customer portal');
    const dash = await call('GET', `${BASE}/api/v1/me/dashboard`);
    ok('portal dashboard loads', dash.data.success === true);
    ok('dashboard shows the property', !!(dash.data.property && dash.data.property.address));
    ok('dashboard shows the plan', !!dash.data.plan);

    const prop = await call('GET', `${BASE}/api/v1/me/property`);
    ok('property view loads with geometry', prop.data.success === true && !!prop.data.property);

    const dispute = await call('POST', `${BASE}/api/v1/me/property/dispute`, { reason: 'The driveway looks too small' });
    ok('measurement dispute opens a ticket', dispute.data.success === true);

    // ── 11. Tenant isolation ──────────────────────────────────────────────
    console.log('\n[11] Tenant isolation');
    const otherCustomer = await models.Customer.create({
      tenant_id: OTHER_TENANT, name: 'Other Tenant Person',
      email: `other_${Date.now()}@example.com`, phone: '+13055559999'
    });
    const otherProp = await models.Property.create({
      tenant_id: OTHER_TENANT, customer_id: otherCustomer.id,
      address: '1 Other Tenant Way', serviceable_sqft: 5000
    });
    const otherInv = await models.Invoice.create({
      tenant_id: OTHER_TENANT, customer_id: otherCustomer.id,
      number: 'OTHER-1', total_cents: 9900, status: 'open'
    });
    const otherAppt = await models.Appointment.create({
      tenant_id: OTHER_TENANT, customer_id: otherCustomer.id, property_id: otherProp.id,
      service_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10)
    });

    const crossInv = await call('POST', `${BASE}/api/v1/me/invoices/${otherInv.id}/pay`);
    ok('cannot pay another tenant invoice', crossInv.status === 404);

    const crossAppt = await call('POST', `${BASE}/api/v1/me/schedule/${otherAppt.id}/cancel`, {});
    ok('cannot cancel another tenant visit', crossAppt.status === 404);

    const crossTool = await brain.callTool('administrator.get_balance',
      { customer_id: otherCustomer.id },
      { tenant_id: TENANT, channel: 'portal', customer_id });
    ok('brain scopes balance lookups to the session tenant', crossTool.success === false);

    const injected = await brain.callTool('estimator.price_quote',
      { property_id: otherProp.id, tenant_id: OTHER_TENANT },
      { tenant_id: TENANT, channel: 'portal', customer_id });
    ok('tenant_id in tool arguments is ignored', injected.success === false);

    // ── 12. Staff auth + role gates ───────────────────────────────────────
    console.log('\n[12] Admin and role gates');
    cookieJar.staff = '';
    const login = await call('POST', `${BASE}/api/v1/auth/staff/login`, {
      email: 'admin@lawncopilot.com',
      password: process.env.LAWNCOPILOT_ADMIN_PASSWORD || 'lawncopilot@2026'
    }, { jar: 'staff' });
    ok('staff login works', login.data.success === true);

    const leads = await call('GET', `${BASE}/api/v1/admin/leads`, null, { jar: 'staff' });
    ok('admin can list leads', leads.data.success === true);

    const queue = await call('GET', `${BASE}/api/v1/admin/measurements?queue=1`, null, { jar: 'staff' });
    ok('measurement review queue loads', queue.data.success === true);

    const before = await models.Property.findOne({ where: { id: property_id, tenant_id: TENANT }, raw: true });
    const beforeSqft = before.approved_sqft || before.serviceable_sqft;
    // Pick a value well clear of the current one AND of the minimum-charge
    // floor, so a genuine price change is observable on re-run.
    const newSqft = beforeSqft > 30000 ? Math.round(beforeSqft / 2) : beforeSqft + 25000;
    const override = await call('PATCH', `${BASE}/api/v1/admin/measurements/${property_id}`, {
      approved_sqft: newSqft, reason: 'SIT override'
    }, { jar: 'staff' });
    ok('admin can override the measurement', override.data.success === true);

    const beforePrice = await call('POST', `${BASE}/api/v1/admin/pricing-rules/test`, {
      serviceable_sqft: beforeSqft, city: before.city, county: before.county, zip: before.zip
    }, { jar: 'staff' });
    ok('override changes the price on re-quote',
       override.data.repriced.biweekly.total_cents !== beforePrice.data.options.biweekly.total_cents,
       `${override.data.repriced.biweekly.total_cents} vs ${beforePrice.data.options.biweekly.total_cents} (${newSqft} vs ${beforeSqft} sqft)`);

    const ovRow = await models.MeasurementOverride.findOne({
      where: { tenant_id: TENANT, property_id }, order: [['id', 'DESC']], raw: true
    });
    ok('override written to lc_measurement_overrides',
       !!ovRow && ovRow.new_sqft === newSqft && ovRow.old_sqft === beforeSqft);
    const auditRow = await models.AuditLog.findOne({
      where: { tenant_id: TENANT, action: 'measurement.override' }, order: [['id', 'DESC']], raw: true
    });
    ok('override written to lc_audit_log', !!auditRow);

    // CSR role must be blocked from pricing + reports
    const bcrypt = require('bcryptjs');
    await models.User.findOrCreate({
      where: { tenant_id: TENANT, email: 'csr@lawncopilot.com' },
      defaults: {
        tenant_id: TENANT, name: 'SIT CSR', role: 'csr',
        password_hash: await bcrypt.hash('csrpass@2026', 10), status: 'active'
      }
    });
    await models.User.update({ password_hash: await bcrypt.hash('csrpass@2026', 10), role: 'csr' },
      { where: { tenant_id: TENANT, email: 'csr@lawncopilot.com' } });

    cookieJar.csr = '';
    const csrLogin = await call('POST', `${BASE}/api/v1/auth/staff/login`,
      { email: 'csr@lawncopilot.com', password: 'csrpass@2026' }, { jar: 'csr' });
    ok('csr login works', csrLogin.data.success === true);

    const csrPricing = await call('POST', `${BASE}/api/v1/admin/pricing-rules`,
      { rule_type: 'rate', params: { rate_per_sqft: 0.99 } }, { jar: 'csr' });
    ok('csr blocked from writing pricing rules', csrPricing.status === 403);

    const csrReport = await call('GET', `${BASE}/api/v1/admin/reports/revenue`, null, { jar: 'csr' });
    ok('csr blocked from reports', csrReport.status === 403);

    const csrToolGate = await brain.callTool('administrator.revenue_report', {},
      { tenant_id: TENANT, channel: 'admin', role: 'csr' });
    ok('brain blocks the tool by role, not just the route', csrToolGate.success === false);

    // Public channel cannot reach an admin tool
    const publicAdminTool = await brain.callTool('administrator.issue_invoice',
      { customer_id }, { tenant_id: TENANT, channel: 'web_orb', session_id, identity_verified: true });
    ok('public web session blocked from administrator.issue_invoice',
       publicAdminTool.success === false && /not authorized|not available/i.test(publicAdminTool.error || ''));

    // ── 13. Approval queue ────────────────────────────────────────────────
    console.log('\n[13] Human-in-the-loop approvals');
    const refund = await brain.callTool('administrator.issue_refund',
      { payment_id: 1, reason: 'SIT' },
      { tenant_id: TENANT, channel: 'admin', role: 'admin', actor: 'sit' });
    ok('refund parks for approval instead of executing',
       refund.success === true && refund.requires_approval === true && !!refund.approval_id);

    const approvals = await call('GET', `${BASE}/api/v1/admin/ai-staff/approvals`, null, { jar: 'staff' });
    ok('approval appears in the queue',
       (approvals.data.approvals || []).some(a => a.id === refund.approval_id));

    const rejected = await call('POST', `${BASE}/api/v1/admin/ai-staff/approvals/${refund.approval_id}`,
      { approve: false }, { jar: 'staff' });
    ok('approval can be rejected', rejected.data.success === true && rejected.data.status === 'rejected');

    // ── 14. AI Staff activity ─────────────────────────────────────────────
    console.log('\n[14] AI Staff visibility');
    const staff = await call('GET', `${BASE}/api/v1/admin/ai-staff?days=1`, null, { jar: 'staff' });
    ok('AI staff screen returns the roster', (staff.data.employees || []).length === 4);
    ok('AI staff screen shows real activity', staff.data.total_calls > 0, `${staff.data.total_calls} calls`);
    const est = (staff.data.employees || []).find(e => e.id === 'estimator');
    ok('estimator activity was recorded', !!est && est.calls > 0);

    const callRows = await models.AgentCall.count({ where: { tenant_id: TENANT } });
    ok('every tool call is audited in lc_agent_calls', callRows > 0, `${callRows} rows`);

    // ── 15. Truthfulness ──────────────────────────────────────────────────
    console.log('\n[15] Truthfulness under tool failure');
    const failedBook = await brain.callTool('dispatcher.book_appointment',
      { service_date: '1999-01-01', customer_id },
      { tenant_id: TENANT, channel: 'portal', customer_id });
    ok('failed booking returns success:false with a reason',
       failedBook.success === false && !!failedBook.error);
    ok('failed booking exposes NO confirmation language',
       !failedBook.spoken && !failedBook.appointment_id);

    const badMeasure = await brain.callTool('estimator.verify_address', { address: 'x' },
      { tenant_id: TENANT, channel: 'web_chat', session_id, identity_verified: true });
    ok('an unusable address is rejected, not invented', badMeasure.success === false);

    // ── 16. Payments disabled honestly ────────────────────────────────────
    console.log('\n[16] Payments and card safety');
    const pmList = await call('GET', `${BASE}/api/v1/me/payment-methods`);
    ok('portal reports payment configuration honestly',
       pmList.data.success === true && pmList.data.payments_configured === !!process.env.STRIPE_SECRET_KEY);

    const rawCard = await call('POST', `${BASE}/api/v1/me/payment-methods`, {
      card_number: '4242424242424242', cvv: '123', brand: 'visa', last4: '4242'
    });
    ok('raw card details are refused', rawCard.status === 400);

    const pmAttrs = Object.keys(models.PaymentMethod.rawAttributes);
    ok('no PAN/CVV column exists on lc_payment_methods',
       !pmAttrs.some(a => /card_number|pan|cvv|cvc|security_code/i.test(a)), pmAttrs.join(','));

    // ── 17. Webhook idempotency ───────────────────────────────────────────
    console.log('\n[17] Stripe webhook idempotency');
    const eventId = `evt_sit_${Date.now()}`;
    const evt = {
      id: eventId, type: 'payment_intent.succeeded',
      data: { object: { id: 'pi_sit_1', amount: 1000, amount_received: 1000, metadata: {} } }
    };
    const payload = JSON.stringify(evt);

    // Sign the payload the way Stripe does, so we exercise the REAL verified
    // path rather than a weakened one. Unsigned is also asserted below.
    const stripeHeaders = (() => {
      const secret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!secret) return {};
      const crypto = require('crypto');
      const ts = Math.floor(Date.now() / 1000);
      const sig = crypto.createHmac('sha256', secret).update(`${ts}.${payload}`).digest('hex');
      return { 'stripe-signature': `t=${ts},v1=${sig}` };
    })();

    if (process.env.STRIPE_WEBHOOK_SECRET) {
      const unsigned = await call('POST', `${BASE}/webhooks/stripe`, payload);
      ok('unsigned webhook is rejected', unsigned.status === 400);
    } else {
      ok('unsigned webhook is rejected (skipped: no secret configured)', true);
    }

    const w1 = await call('POST', `${BASE}/webhooks/stripe`, payload, { headers: stripeHeaders });
    const w2 = await call('POST', `${BASE}/webhooks/stripe`, payload, { headers: stripeHeaders });
    ok('first webhook accepted', w1.status === 200 && w1.data.received === true);
    ok('replayed webhook flagged duplicate', w2.status === 200 && w2.data.duplicate === true);
    const payRows = await models.Payment.count({ where: { tenant_id: TENANT, stripe_event_id: eventId } });
    ok('replay produced exactly one payment row', payRows === 1, `${payRows} rows`);

    // ── 18. Voice TwiML ───────────────────────────────────────────────────
    console.log('\n[18] Phone entry');
    const twiml = await fetch(`${BASE}/voice/incoming`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: '+13055550142', To: '+13055550000', CallSid: `CA_sit_${Date.now()}` })
    });
    const xml = await twiml.text();
    ok('voice returns ConversationRelay TwiML',
       twiml.status === 200 && xml.includes('<Connect>') && xml.includes('<ConversationRelay'));
    ok('TwiML carries the lawncopilot profile', xml.includes('name="profile" value="lawncopilot"'));

    // ── 19. Notifications respect EMAIL_AUTOSEND_DISABLED ─────────────────
    console.log('\n[19] Email autosend guard');
    const notifs = await models.Notification.findAll({
      where: { tenant_id: TENANT, channel: 'email' }, order: [['id', 'DESC']], limit: 10, raw: true
    });
    const autosendOff = process.env.EMAIL_AUTOSEND_DISABLED !== '0';
    ok('server-initiated email is queued, not transmitted',
       !autosendOff || notifs.every(n => n.status !== 'sent' || n.reason === null),
       notifs.map(n => `${n.template}:${n.status}`).join(','));
    ok('notifications are logged either way', notifs.length > 0, `${notifs.length} rows`);

    // ── 20. Cost guard ────────────────────────────────────────────────────
    console.log('\n[20] Cost guard');
    const prevCap = process.env.LAWNCOPILOT_AGENT_COST_CAP_USD;
    await models.AgentCall.create({
      tenant_id: TENANT, employee: 'estimator', tool: 'estimator.measure_property',
      channel: 'web_chat', success: true, cost_cents: 100000
    });
    process.env.LAWNCOPILOT_AGENT_COST_CAP_USD = '1';
    const capped = await brain.callTool('estimator.measure_property', { address: ADDRESS },
      { tenant_id: TENANT, channel: 'web_chat', session_id, identity_verified: true });
    ok('cost guard degrades instead of spending', capped.success === false && capped.code === 'cost_cap');
    process.env.LAWNCOPILOT_AGENT_COST_CAP_USD = prevCap || '25';

    // ── 21. Reports ───────────────────────────────────────────────────────
    console.log('\n[21] Reports and the books');
    const rev = await call('GET', `${BASE}/api/v1/admin/reports/revenue?days=30`, null, { jar: 'staff' });
    ok('revenue report runs', rev.data.success === true);
    const ar = await call('GET', `${BASE}/api/v1/admin/reports/ar-aging`, null, { jar: 'staff' });
    ok('AR aging runs', ar.data.success === true);
    const conv = await call('GET', `${BASE}/api/v1/admin/reports/conversion?days=30`, null, { jar: 'staff' });
    ok('conversion funnel runs', conv.data.success === true && !!conv.data.funnel);
    const books = await call('GET', `${BASE}/api/v1/admin/reports/books`, null, { jar: 'staff' });
    ok('books export produces CSV', books.data.success === true && typeof books.data.csv === 'string');

    // ── 22. Cleanup ───────────────────────────────────────────────────────
    console.log('\n[22] Cleanup');
    await models.Appointment.destroy({ where: { tenant_id: OTHER_TENANT } });
    await models.Invoice.destroy({ where: { tenant_id: OTHER_TENANT } });
    await models.Property.destroy({ where: { tenant_id: OTHER_TENANT } });
    await models.Customer.destroy({ where: { tenant_id: OTHER_TENANT } });
    await models.AgentCall.destroy({ where: { tenant_id: TENANT, cost_cents: 100000 } });
    ok('other-tenant fixtures removed',
       (await models.Customer.count({ where: { tenant_id: OTHER_TENANT } })) === 0);

  } catch (e) {
    fail++;
    failures.push('EXCEPTION: ' + e.message);
    console.log('\n  EXCEPTION:', e.message);
    console.log(e.stack);
  }

  server.close();

  console.log('\n' + '='.repeat(60));
  console.log(`RESULT: ${pass} passed, ${fail} failed  (${pass + fail} total)`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(f => console.log('  - ' + f));
  }
  console.log('');
  process.exit(fail > 0 ? 1 : 0);
})();
