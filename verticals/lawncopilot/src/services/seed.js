'use strict';

/**
 * Lawn Co-Pilot — opt-in demo seed (LAWNCOPILOT_SEED_DEMO=1)
 * Default unset = clean tenant. Never re-seeds on restart.
 */

const bcrypt = require('bcryptjs');
const {
  Customer, Property, Subscription, Appointment, ServiceRecord,
  Invoice, InvoiceLineItem, Lead
} = require('../models');

async function seedDemo(tenant_id) {
  const existing = await Customer.count({ where: { tenant_id } });
  if (existing > 0) return { seeded: false, summary: 'tenant already has customers' };

  const hash = await bcrypt.hash('demo@2026', 10);
  const customer = await Customer.create({
    tenant_id, name: 'Dana Whitfield', email: 'demo@lawncopilot.com',
    phone: '+13055550142', password_hash: hash, status: 'active',
    balance_cents: 0, autopay_enabled: false
  });

  const prop = await Property.create({
    tenant_id, customer_id: customer.id,
    address: '1240 Palm Grove Drive, Orlando, FL 32801',
    city: 'Orlando', county: 'Orange', state: 'FL', zip: '32801',
    lat: 28.5421, lng: -81.3790,
    lot_sqft: 10400, building_footprint_sqft: 2280, excluded_sqft: 1150,
    serviceable_sqft: 6970, approved_sqft: 6970,
    confidence: 'medium', is_estimate: true, needs_review: false
  });

  const sub = await Subscription.create({
    tenant_id, customer_id: customer.id, property_id: prop.id,
    frequency: 'biweekly', price_cents: 5900, status: 'active',
    next_service_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10)
  });

  const past = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
  const appt = await Appointment.create({
    tenant_id, customer_id: customer.id, property_id: prop.id, subscription_id: sub.id,
    service_date: past, window_start: '08:00', window_end: '12:00',
    status: 'completed', service_type: 'mowing', price_cents: 5900
  });
  const rec = await ServiceRecord.create({
    tenant_id, appointment_id: appt.id, customer_id: customer.id, property_id: prop.id,
    service_date: past, completed_at: new Date(Date.now() - 4 * 86400000),
    service_type: 'mowing', area_serviced_sqft: 6970, completion_status: 'completed',
    technician_notes: 'Front bed edged. Gate was unlocked, no issues.',
    weather: 'Clear', charges_cents: 5900
  });

  const upcoming = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
  await Appointment.create({
    tenant_id, customer_id: customer.id, property_id: prop.id, subscription_id: sub.id,
    service_date: upcoming, window_start: '08:00', window_end: '12:00',
    status: 'scheduled', service_type: 'mowing', price_cents: 5900
  });

  const inv = await Invoice.create({
    tenant_id, customer_id: customer.id, service_record_id: rec.id,
    number: 'LC-2026-00001', status: 'paid',
    subtotal_cents: 5900, tax_cents: 0, total_cents: 5900, amount_paid_cents: 5900,
    issued_at: new Date(Date.now() - 4 * 86400000), paid_at: new Date(Date.now() - 3 * 86400000)
  });
  await InvoiceLineItem.create({
    tenant_id, invoice_id: inv.id, label: `Lawn service ${past}`,
    detail: '6,970 sq ft, every two weeks', amount_cents: 5900, sort_order: 10
  });

  await Lead.create({
    tenant_id, name: 'Marcus Bell', phone: '+14075550188', email: 'marcus@example.com',
    address: '88 Riverbend Court, Winter Park, FL 32789',
    source: 'web_orb', stage: 'quoted'
  });

  return { seeded: true, summary: '1 customer, 1 property, 2 visits, 1 paid invoice, 1 open lead' };
}

module.exports = { seedDemo };
