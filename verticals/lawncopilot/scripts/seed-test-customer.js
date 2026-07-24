'use strict';

/**
 * Give the owner a CUSTOMER account on their own company so the client-facing
 * portal can be tested end to end from a real login.
 *
 *   URL      https://lawncopilot.com/<slug>/login
 *   Email    mstagg@digit2ai.com        (LAWNCOPILOT_TEST_CUSTOMER_EMAIL)
 *   Password Palindrome@7               (LAWNCOPILOT_TEST_CUSTOMER_PASSWORD)
 *
 * An empty portal tests nothing, so this lays down a complete customer story:
 * a measured property, an active plan, past visits with service records and
 * photos-worth of notes, paid + open invoices, a card on file with autopay, an
 * upcoming visit, and a message thread. Every portal screen has content.
 *
 * IDEMPOTENT — re-running updates the password and leaves the history alone.
 *
 * Run: node verticals/lawncopilot/scripts/seed-test-customer.js
 */

require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const M = require(path.join(__dirname, '..', 'src', 'models'));

const SLUG = process.env.LAWNCOPILOT_TEST_CUSTOMER_SLUG || 'lawn-co-pilot';
const EMAIL = (process.env.LAWNCOPILOT_TEST_CUSTOMER_EMAIL || 'mstagg@digit2ai.com').toLowerCase();
const PASSWORD = process.env.LAWNCOPILOT_TEST_CUSTOMER_PASSWORD || 'Palindrome@7';

function dstr(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
const days = n => new Date(Date.now() + n * 86400000);
function at(d, h, m) { const x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; }

async function main() {
  await M.sequelize.authenticate();

  const tenant = await M.Tenant.findOne({ where: { slug: SLUG } });
  if (!tenant) throw new Error(`No company at /${SLUG}`);
  const tid = tenant.id;

  const hash = await bcrypt.hash(PASSWORD, 10);

  // ── The customer ────────────────────────────────────────────────────────
  let cust = await M.Customer.findOne({ where: { tenant_id: tid, email: EMAIL } });
  const isNew = !cust;
  if (cust) {
    cust.password_hash = hash;
    cust.status = 'active';
    await cust.save();
    console.log(`Existing customer updated: ${EMAIL} on /${SLUG}`);
  } else {
    cust = await M.Customer.create({
      tenant_id: tid, name: 'Manuel Stagg', email: EMAIL, phone: '+13055551200',
      password_hash: hash, status: 'active', balance_cents: 0, autopay_enabled: true,
      consent: { marketing: true, transactional: true },
      notes: 'Owner test account for the customer portal.'
    });
    console.log(`Customer created: ${EMAIL} on /${SLUG}`);
  }

  // Only build the history once.
  const already = await M.Property.count({ where: { tenant_id: tid, customer_id: cust.id } });
  if (already > 0) {
    console.log('Portal history already present — password refreshed, nothing else changed.');
    return report(tenant, cust);
  }

  // ── Their property (measured) ───────────────────────────────────────────
  const lot = 11800, house = 2450, hard = 1290;
  const serviceable = lot - house - hard;                 // 8,060 sq ft
  const prop = await M.Property.create({
    tenant_id: tid, customer_id: cust.id,
    address_raw: '742 Windermere Oaks Drive, Windermere, FL 34786',
    address: '742 Windermere Oaks Drive, Windermere, FL 34786',
    city: 'Windermere', county: 'Orange', state: 'FL', zip: '34786',
    lat: 28.4956, lng: -81.5348,
    property_type: 'residential',
    lot_sqft: lot, building_footprint_sqft: house, excluded_sqft: hard,
    serviceable_sqft: serviceable, approved_sqft: serviceable,
    confidence: 'medium', is_estimate: true, needs_review: false,
    access_instructions: 'Side gate on the left. Please latch it — dog in the yard.',
    special_instructions: 'Do not trim the hedges along the lake side.'
  });

  const price = 6900; // $69 biweekly for ~8,060 sq ft
  const sub = await M.Subscription.create({
    tenant_id: tid, customer_id: cust.id, property_id: prop.id,
    frequency: 'biweekly', price_cents: price, status: 'active',
    next_service_date: dstr(days(6))
  });

  const crew = await M.Crew.findOne({ where: { tenant_id: tid }, order: [['id', 'ASC']], raw: true });
  const crewId = crew ? crew.id : null;

  // ── Three completed visits, invoiced ────────────────────────────────────
  let seq = 900;
  for (const back of [36, 22, 8]) {
    const day = days(-back);
    const appt = await M.Appointment.create({
      tenant_id: tid, customer_id: cust.id, property_id: prop.id, subscription_id: sub.id,
      crew_id: crewId, service_date: dstr(day), window_start: '09:00', window_end: '13:00',
      status: 'completed', service_type: 'mowing', price_cents: price
    });
    const rec = await M.ServiceRecord.create({
      tenant_id: tid, appointment_id: appt.id, customer_id: cust.id, property_id: prop.id,
      crew_id: crewId, service_date: dstr(day), completed_at: at(day, 11, 20),
      service_type: 'mowing', area_serviced_sqft: serviceable, completion_status: 'completed',
      weather: 'Clear', charges_cents: price,
      technician_notes: back === 8
        ? 'Mowed, edged and blew off. Gate latched. Left the lake-side hedges alone as requested.'
        : 'Mowed, edged, trimmed and blew off all hard surfaces.'
    });

    // The most recent one is still open so the portal shows a payable invoice.
    const open = back === 8;
    const inv = await M.Invoice.create({
      tenant_id: tid, customer_id: cust.id, service_record_id: rec.id,
      number: 'LC-2026-' + String(seq++).padStart(5, '0'),
      status: open ? 'open' : 'paid',
      subtotal_cents: price, tax_cents: 0, total_cents: price,
      amount_paid_cents: open ? 0 : price,
      issued_at: at(day, 13, 0), due_at: at(days(-back + 14), 12, 0),
      paid_at: open ? null : at(days(-back + 1), 9, 15)
    });
    await M.InvoiceLineItem.create({
      tenant_id: tid, invoice_id: inv.id,
      label: `Lawn service ${dstr(day)}`,
      detail: `${serviceable.toLocaleString()} sq ft, every two weeks`,
      amount_cents: price, sort_order: 10
    });
    if (!open) {
      await M.Payment.create({
        tenant_id: tid, customer_id: cust.id, invoice_id: inv.id, amount_cents: price,
        status: 'succeeded', method: 'card', processed_at: at(days(-back + 1), 9, 15)
      });
    } else {
      await M.Customer.update({ balance_cents: price }, { where: { id: cust.id } });
    }
  }

  // ── Card on file + autopay ──────────────────────────────────────────────
  const pm = await M.PaymentMethod.create({
    tenant_id: tid, customer_id: cust.id, brand: 'visa', last4: '4242',
    exp_month: 11, exp_year: 2029, type: 'card', is_default: true
  });
  await M.AutopayEnrollment.create({
    tenant_id: tid, customer_id: cust.id, payment_method_id: pm.id, status: 'active',
    terms_accepted_at: days(-36), next_charge_at: days(6)
  });

  // ── The next visit ──────────────────────────────────────────────────────
  await M.Appointment.create({
    tenant_id: tid, customer_id: cust.id, property_id: prop.id, subscription_id: sub.id,
    crew_id: crewId, service_date: dstr(days(6)), window_start: '09:00', window_end: '13:00',
    status: 'scheduled', service_type: 'mowing', price_cents: price
  });

  // ── A message thread + an open request ──────────────────────────────────
  const ticket = await M.Ticket.create({
    tenant_id: tid, customer_id: cust.id, property_id: prop.id, type: 'service_request',
    subject: 'Add mulch to the front beds',
    body: 'Could you quote adding mulch to the two front beds before the end of the month?',
    status: 'open', priority: 'normal', source: 'portal'
  });
  await M.Message.bulkCreate([
    { tenant_id: tid, customer_id: cust.id, ticket_id: ticket.id, direction: 'inbound',
      author: 'Manuel Stagg', body: 'Could you quote adding mulch to the two front beds?', read_at: days(-2) },
    { tenant_id: tid, customer_id: cust.id, ticket_id: ticket.id, direction: 'outbound',
      author: 'The Receptionist', body: 'Happy to. I have asked the crew to measure the beds on the next visit and will send you a price the same day.', read_at: null }
  ]);

  return report(tenant, cust);
}

async function report(tenant, cust) {
  const tid = tenant.id;
  const counts = {};
  for (const [k, model, where] of [
    ['properties', M.Property, { customer_id: cust.id }],
    ['subscriptions', M.Subscription, { customer_id: cust.id }],
    ['appointments', M.Appointment, { customer_id: cust.id }],
    ['invoices', M.Invoice, { customer_id: cust.id }],
    ['payments', M.Payment, { customer_id: cust.id }],
    ['messages', M.Message, { customer_id: cust.id }]
  ]) counts[k] = await model.count({ where: { tenant_id: tid, ...where } });

  console.log(`\nClient (customer) portal login for "${tenant.name}"`);
  console.log(`  URL       https://lawncopilot.com/${tenant.slug}/login`);
  console.log(`  Email     ${EMAIL}`);
  console.log(`  Password  ${PASSWORD}`);
  console.log(`  Portal    https://lawncopilot.com/${tenant.slug}/portal`);
  console.log('  Data:', JSON.stringify(counts));
}

main().then(() => process.exit(0)).catch(e => { console.error('FAILED:', e.message); process.exit(1); });
