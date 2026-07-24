'use strict';

/**
 * Seed a FULL, self-consistent lawn maintenance company so the owner can test
 * the whole ecosystem end to end from one login.
 *
 * Company : "Lawn Co-Pilot" (slug lawn-co-pilot)   ·   Plan: Crew   ·   2 crews
 * Owner   : mstagg@digit2ai.com  (password = LAWNCOPILOT_DEMO_OWNER_PASSWORD
 *                                 or the platform password, default lawncopilot@2026)
 *
 * What it lays down, all cross-referenced the way the live app would produce it:
 *   2 crews · 6 staff (leads + crew + office) · certifications (one expiring)
 *   8 customers · 8 properties · 8 subscriptions (weekly/biweekly/monthly)
 *   ~3 weeks of completed visits + service records + today's route + upcoming
 *   invoices (paid / open / one failed card) + payments + one autopay
 *   quotes (accepted + one needs-review) + open leads across sources
 *   time entries feeding a DRAFT pay run (never filed — no provider)
 *   job costs + expenses + two sequenced routes with real saved-minutes
 *   reviews + a referral + support tickets + call logs
 *   a Receptionist phone number on file so the phone layer shows as routing
 *
 * IDEMPOTENT: if the company already has customers it does nothing. Re-running
 * never duplicates. Safe to run against production.
 *
 * Run:  node verticals/lawncopilot/scripts/seed-demo-company.js
 */

require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');

const M = require(path.join(__dirname, '..', 'src', 'models'));
const { provisionTenant } = require(path.join(__dirname, '..', 'src', 'services', 'provision'));

const SLUG = process.env.LAWNCOPILOT_DEMO_COMPANY_SLUG || 'lawn-co-pilot';
const OWNER_EMAIL = 'mstagg@digit2ai.com';
const OWNER_PW = process.env.LAWNCOPILOT_DEMO_OWNER_PASSWORD
  || process.env.LAWNCOPILOT_PLATFORM_PASSWORD || 'lawncopilot@2026';

// ── date helpers (local calendar dates, matching the app's toDateStr) ───────
function dstr(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
function daysFromNow(n) { return new Date(Date.now() + n * 86400000); }
function at(dateObj, hh, mm) {
  const x = new Date(dateObj); x.setHours(hh, mm || 0, 0, 0); return x;
}

const { enabledFor, defaultBrand } = require(path.join(__dirname, '..', 'src', 'services', 'provision'));

/**
 * Give mstagg's company the identity the owner asked for: named "Lawn Co-Pilot",
 * on the Multi Trucks plan so ALL eight AI employees are enabled (the Controller
 * and Payroll Officer included, so the whole ecosystem is testable), and locked
 * so the legacy-adoption migration stops renaming it on every boot.
 */
async function brandAsLawnCoPilot(tenant) {
  const oldSlug = tenant.slug;
  tenant.name = 'Lawn Co-Pilot';
  tenant.slug = SLUG;
  tenant.plan = 'multi_trucks';
  tenant.status = 'active';
  tenant.brand = { ...defaultBrand('Lawn Co-Pilot'), display_name: 'Lawn Co-Pilot' };
  tenant.settings = {
    ...(tenant.settings || {}),
    identity_locked: true,
    enabled_employees: enabledFor('multi_trucks')
  };
  await tenant.save();
  // Keep the old address working.
  if (oldSlug && oldSlug !== SLUG) {
    await M.TenantAlias.findOrCreate({ where: { slug: oldSlug }, defaults: { tenant_id: tenant.id, slug: oldSlug } });
  }
  await M.PlatformSubscription.update({ plan: 'multi_trucks' }, { where: { tenant_id: tenant.id } });
  try { require(path.join(__dirname, '..', 'src', 'tenancy')).cacheBust(); } catch (e) { /* not fatal */ }
}

async function ensureTenant() {
  let tenant = await M.Tenant.findOne({ where: { slug: SLUG } });
  if (tenant) { await brandAsLawnCoPilot(tenant); return { tenant, created: false }; }

  // If mstagg already owns a company (the adopted legacy tenant), reuse it —
  // the duplicate-owner-email guard forbids a second one — and rebrand it.
  const existingOwner = await M.User.findOne({ where: { email: OWNER_EMAIL }, raw: true });
  if (existingOwner) {
    tenant = await M.Tenant.findByPk(existingOwner.tenant_id);
    if (tenant) { await brandAsLawnCoPilot(tenant); return { tenant, created: false }; }
  }

  const r = await provisionTenant({
    company_name: 'Lawn Co-Pilot',
    slug: SLUG,
    owner_name: 'Manuel Stagg',
    owner_email: OWNER_EMAIL,
    owner_phone: '+13055551200',
    password: OWNER_PW,
    state: 'FL',
    counties: ['Orange', 'Seminole', 'Osceola'],
    crew_count: 2,
    plan: 'multi_trucks'
  });
  if (!r.success) throw new Error('provision failed: ' + r.error);
  tenant = await M.Tenant.findByPk(r.tenant_id);
  await brandAsLawnCoPilot(tenant);
  return { tenant, created: true };
}

async function main() {
  await M.sequelize.authenticate();

  const { tenant, created } = await ensureTenant();
  const tid = tenant.id;

  // Force the owner password so mstagg can definitely sign in to test.
  await M.User.update(
    { password_hash: await bcrypt.hash(OWNER_PW, 10), role: 'owner', status: 'active' },
    { where: { tenant_id: tid, email: OWNER_EMAIL } }
  );

  if (await M.Customer.count({ where: { tenant_id: tid } }) > 0) {
    console.log(`Company "${tenant.name}" (/${tenant.slug}) already populated — nothing to do.`);
    console.log(`Sign in: /lawncopilot/${tenant.slug}/admin  as ${OWNER_EMAIL}`);
    return;
  }

  // Give it a Receptionist number so the phone layer reads as routing.
  tenant.phone = tenant.phone || '+14075557890';
  tenant.owner_phone = tenant.owner_phone || '+13055551200';
  tenant.business_hours = tenant.business_hours || {
    mon: ['07:00', '18:00'], tue: ['07:00', '18:00'], wed: ['07:00', '18:00'],
    thu: ['07:00', '18:00'], fri: ['07:00', '18:00'], sat: ['08:00', '14:00'], sun: null
  };
  await tenant.save();

  // ── Crews ────────────────────────────────────────────────────────────────
  let crews = await M.Crew.findAll({ where: { tenant_id: tid }, order: [['id', 'ASC']], raw: true });
  if (crews.length < 2) {
    await M.Crew.destroy({ where: { tenant_id: tid } });
    crews = await M.Crew.bulkCreate([
      { tenant_id: tid, name: 'Crew A', lead_name: 'Luis Marin', phone: '+14075557001', capacity_per_day: 14, active: true },
      { tenant_id: tid, name: 'Crew B', lead_name: 'Tomas Perez', phone: '+14075557002', capacity_per_day: 12, active: true }
    ], { returning: true }).then(rows => rows.map(r => r.get({ plain: true })));
  }
  const [crewA, crewB] = crews;

  // ── Staff ─────────────────────────────────────────────────────────────────
  const cents = d => Math.round(d * 100);
  const staffDefs = [
    { name: 'Luis Marin', role: 'lead', crew_id: crewA.id, pay: 26, phone: '+14075557001', email: 'luis@lawncopilot-demo.com' },
    { name: 'Danny Rivera', role: 'crew', crew_id: crewA.id, pay: 19, phone: '+14075557011' },
    { name: 'Marcus Bell', role: 'crew', crew_id: crewA.id, pay: 18, phone: '+14075557012' },
    { name: 'Tomas Perez', role: 'lead', crew_id: crewB.id, pay: 27, phone: '+14075557002', email: 'tomas@lawncopilot-demo.com' },
    { name: 'Wes Karim', role: 'crew', crew_id: crewB.id, pay: 18, phone: '+14075557013' },
    { name: 'Paula Ortega', role: 'office', crew_id: null, pay: 22, phone: '+14075557020', email: 'paula@lawncopilot-demo.com', ot: false }
  ];
  const staff = await M.Employee.bulkCreate(staffDefs.map(s => ({
    tenant_id: tid, name: s.name, email: s.email || null, phone: s.phone,
    crew_id: s.crew_id, role: s.role, employment_type: 'w2', pay_type: 'hourly',
    pay_rate_cents: cents(s.pay), overtime_eligible: s.ot !== false,
    hire_date: dstr(daysFromNow(-420)), status: 'active'
  })), { returning: true }).then(r => r.map(x => x.get({ plain: true })));

  // Certifications — one expiring within 19 days to exercise the reminder.
  await M.Certification.bulkCreate([
    { tenant_id: tid, employee_id: staff[3].id, kind: 'pesticide', name: 'FL Commercial Pesticide Applicator',
      number: 'FL-PA-88231', issued_on: dstr(daysFromNow(-700)), expires_on: dstr(daysFromNow(19)) },
    { tenant_id: tid, employee_id: staff[0].id, kind: 'insurance', name: 'General Liability (COI)',
      number: 'GL-2026-4471', issued_on: dstr(daysFromNow(-200)), expires_on: dstr(daysFromNow(165)) },
    { tenant_id: tid, employee_id: staff[0].id, kind: 'cdl', name: 'CDL Class B',
      number: 'CDLB-77120', issued_on: dstr(daysFromNow(-900)), expires_on: dstr(daysFromNow(400)) }
  ]);
  for (const e of staff) {
    await M.Availability.create({ tenant_id: tid, employee_id: e.id, kind: 'working_hours',
      days: [1, 2, 3, 4, 5], start_time: '07:00', end_time: '16:00', status: 'approved' });
  }

  // ── Customers + properties + subscriptions ──────────────────────────────
  const custDefs = [
    { name: 'Dana Whitfield', addr: '1240 Palm Grove Drive', city: 'Orlando', county: 'Orange', zip: '32801', lat: 28.5421, lng: -81.3790, lot: 10400, house: 2280, hard: 1150, freq: 'biweekly', price: 59, autopay: true },
    { name: 'Miguel Alvarez', addr: '88 Riverbend Court', city: 'Winter Park', county: 'Orange', zip: '32789', lat: 28.5999, lng: -81.3392, lot: 8200, house: 2010, hard: 900, freq: 'weekly', price: 45, autopay: true },
    { name: 'Tunde Okafor', addr: '3117 Cypress Lane', city: 'Orlando', county: 'Orange', zip: '32806', lat: 28.5100, lng: -81.3620, lot: 13800, house: 2600, hard: 1400, freq: 'biweekly', price: 72, autopay: false },
    { name: 'Sarah Bell', addr: '629 Willow Bend', city: 'Maitland', county: 'Orange', zip: '32751', lat: 28.6278, lng: -81.3630, lot: 9100, house: 2200, hard: 1000, freq: 'weekly', price: 49, autopay: false },
    { name: 'Robert Nguyen', addr: '204 Kestrel Way', city: 'Lake Mary', county: 'Seminole', zip: '32746', lat: 28.7589, lng: -81.3178, lot: 12200, house: 2500, hard: 1200, freq: 'biweekly', price: 63, autopay: true },
    { name: 'Priya Iyer', addr: '55 Marsh Hen Trail', city: 'Sanford', county: 'Seminole', zip: '32771', lat: 28.8000, lng: -81.2730, lot: 7600, house: 1950, hard: 850, freq: 'monthly', price: 68, autopay: false },
    { name: 'Karen Marsh', addr: '900 Live Oak Circle', city: 'Kissimmee', county: 'Osceola', zip: '34741', lat: 28.2919, lng: -81.4076, lot: 16400, house: 2900, hard: 1650, freq: 'biweekly', price: 88, autopay: false },
    { name: 'James Reyes', addr: '17 Heron Point', city: 'Oviedo', county: 'Seminole', zip: '32765', lat: 28.6700, lng: -81.2080, lot: 8800, house: 2100, hard: 950, freq: 'weekly', price: 52, autopay: true }
  ];

  const hash = await bcrypt.hash('demo@2026', 10);
  const customers = [], properties = [], subs = [];
  for (const c of custDefs) {
    const serviceable = c.lot - c.house - c.hard;
    const cust = await M.Customer.create({
      tenant_id: tid, name: c.name,
      email: c.name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
      phone: '+1407555' + String(3000 + customers.length).padStart(4, '0'),
      password_hash: hash, status: 'active', balance_cents: 0,
      autopay_enabled: c.autopay, consent: { marketing: c.autopay, transactional: true }
    });
    const prop = await M.Property.create({
      tenant_id: tid, customer_id: cust.id,
      address_raw: `${c.addr}, ${c.city}, FL ${c.zip}`, address: `${c.addr}, ${c.city}, FL ${c.zip}`,
      city: c.city, county: c.county, state: 'FL', zip: c.zip, lat: c.lat, lng: c.lng,
      property_type: 'residential', lot_sqft: c.lot, building_footprint_sqft: c.house,
      excluded_sqft: c.hard, serviceable_sqft: serviceable, approved_sqft: serviceable,
      confidence: 'medium', is_estimate: true, needs_review: false
    });
    const sub = await M.Subscription.create({
      tenant_id: tid, customer_id: cust.id, property_id: prop.id,
      frequency: c.freq, price_cents: cents(c.price), status: 'active',
      next_service_date: dstr(daysFromNow(c.freq === 'weekly' ? 5 : c.freq === 'biweekly' ? 9 : 20))
    });
    customers.push(cust.get({ plain: true }));
    properties.push(prop.get({ plain: true }));
    subs.push(sub.get({ plain: true }));
  }

  // ── History: ~3 weeks of completed visits, records, invoices, payments ────
  let invSeq = 1;
  const invNo = () => 'LC-2026-' + String(invSeq++).padStart(5, '0');
  const OVERHEAD = 400;                       // per-job overhead cents
  const LABOR_MIN_PER_1000 = 6;               // rough minutes/1000 sqft

  for (const [ci, cust] of customers.entries()) {
    const prop = properties[ci];
    const sub = subs[ci];
    const crew = ci % 2 === 0 ? crewA : crewB;
    const price = sub.price_cents;

    // Two past completed visits per customer.
    for (const back of [16, 4]) {
      const day = daysFromNow(-back);
      const appt = await M.Appointment.create({
        tenant_id: tid, customer_id: cust.id, property_id: prop.id, subscription_id: sub.id,
        crew_id: crew.id, service_date: dstr(day), window_start: '08:00', window_end: '12:00',
        status: 'completed', service_type: 'mowing', price_cents: price
      });
      const laborMin = Math.round((prop.serviceable_sqft / 1000) * LABOR_MIN_PER_1000) + 12;
      const rec = await M.ServiceRecord.create({
        tenant_id: tid, appointment_id: appt.id, customer_id: cust.id, property_id: prop.id,
        crew_id: crew.id, service_date: dstr(day), completed_at: at(day, 10, 30),
        service_type: 'mowing', area_serviced_sqft: prop.serviceable_sqft,
        completion_status: 'completed', weather: 'Clear', charges_cents: price,
        technician_notes: 'Mowed, edged, trimmed and blew off. Gates latched.'
      });

      // Invoice: most paid; Priya's most recent card failed; Sarah's is open.
      let status = 'paid', paid = price, paidAt = at(daysFromNow(-back + 1), 9, 0), method = 'card';
      if (cust.name === 'Priya Iyer' && back === 4) { status = 'failed'; paid = 0; paidAt = null; }
      if (cust.name === 'Sarah Bell' && back === 4) { status = 'open'; paid = 0; paidAt = null; }

      const inv = await M.Invoice.create({
        tenant_id: tid, customer_id: cust.id, service_record_id: rec.id, number: invNo(),
        status, subtotal_cents: price, tax_cents: 0, total_cents: price,
        amount_paid_cents: paid, issued_at: at(day, 12, 0),
        due_at: at(daysFromNow(-back + 14), 12, 0), paid_at: paidAt,
        dunning_stage: status === 'failed' ? 1 : 0
      });
      await M.InvoiceLineItem.create({
        tenant_id: tid, invoice_id: inv.id, label: `Lawn service ${dstr(day)}`,
        detail: `${prop.serviceable_sqft.toLocaleString()} sq ft, ${sub.frequency}`,
        amount_cents: price, sort_order: 10
      });
      if (status === 'paid') {
        await M.Payment.create({
          tenant_id: tid, customer_id: cust.id, invoice_id: inv.id, amount_cents: price,
          status: 'succeeded', method, processed_at: paidAt
        });
      } else if (status === 'failed') {
        await M.Payment.create({
          tenant_id: tid, customer_id: cust.id, invoice_id: inv.id, amount_cents: price,
          status: 'failed', method: 'card', failure_reason: 'card_declined', processed_at: at(day, 12, 5)
        });
        await M.Customer.update({ balance_cents: price }, { where: { id: cust.id } });
      } else {
        await M.Customer.update({ balance_cents: price }, { where: { id: cust.id } });
      }

      // Job cost — real margin, one customer deliberately underwater (Karen: big lot, low price).
      const laborCents = Math.round((laborMin / 60) * (crew.id === crewA.id ? staff[1].pay_rate_cents : staff[4].pay_rate_cents));
      const driveMin = 8 + (ci * 2) % 12;
      const driveCents = Math.round((driveMin / 60) * 1800);
      const material = 150;
      const totalCost = laborCents + driveCents + material + OVERHEAD;
      await M.JobCost.create({
        tenant_id: tid, appointment_id: appt.id, service_record_id: rec.id, customer_id: cust.id,
        crew_id: crew.id, labor_minutes: laborMin, labor_cents: laborCents,
        drive_minutes: driveMin, drive_cents: driveCents, material_cents: material,
        overhead_cents: OVERHEAD, total_cost_cents: totalCost, revenue_cents: price,
        margin_cents: price - totalCost, margin_pct: +(((price - totalCost) / price) * 100).toFixed(1)
      });

      // Time entries for the crew on this job (feeds the draft pay run).
      const crewStaff = staff.filter(s => s.crew_id === crew.id);
      for (const emp of crewStaff) {
        await M.TimeEntry.create({
          tenant_id: tid, employee_id: emp.id, appointment_id: appt.id, crew_id: crew.id,
          work_date: dstr(day), clock_in: at(day, 7, 45), clock_out: at(day, 16, 5),
          break_minutes: 30, minutes: 8 * 60 + 20 - 30,
          status: back <= 7 ? 'submitted' : 'approved',
          approved_by: back <= 7 ? null : staff[5].id, approved_at: back <= 7 ? null : at(day, 17, 0)
        });
      }

      if (status === 'paid' && back === 16) {
        await M.Review.create({
          tenant_id: tid, customer_id: cust.id, service_record_id: rec.id, platform: 'google',
          status: ci < 4 ? 'left' : 'requested', rating: ci < 4 ? 5 : null,
          text: ci < 4 ? 'On time, great job, yard looks perfect.' : null,
          author: ci < 4 ? cust.name : null, requested_at: at(daysFromNow(-back + 1), 18, 0)
        });
      }
    }
  }

  // ── Autopay enrollment for the autopay customers ────────────────────────
  for (const cust of customers.filter(c => c.autopay_enabled)) {
    const pm = await M.PaymentMethod.create({
      tenant_id: tid, customer_id: cust.id, brand: 'visa', last4: '4242',
      exp_month: 8, exp_year: 2029, type: 'card', is_default: true
    });
    await M.AutopayEnrollment.create({
      tenant_id: tid, customer_id: cust.id, payment_method_id: pm.id, status: 'active',
      terms_accepted_at: daysFromNow(-30), next_charge_at: daysFromNow(9)
    });
  }

  // ── Today's route + upcoming appointments (a full working day) ──────────
  const today = new Date();
  const todaysCrewA = [customers[0], customers[2], customers[4]];   // Crew A
  const todaysCrewB = [customers[1], customers[3]];                 // Crew B
  async function makeDay(list, crew, startHour) {
    const stops = [];
    for (const [i, cust] of list.entries()) {
      const ci = customers.findIndex(c => c.id === cust.id);
      const prop = properties[ci], sub = subs[ci];
      const appt = await M.Appointment.create({
        tenant_id: tid, customer_id: cust.id, property_id: prop.id, subscription_id: sub.id,
        crew_id: crew.id, service_date: dstr(today),
        window_start: String(startHour + i).padStart(2, '0') + ':00',
        window_end: String(startHour + i + 1).padStart(2, '0') + ':30',
        route_order: i + 1, status: i === 0 ? 'completed' : i === 1 ? 'en_route' : 'scheduled',
        service_type: 'mowing', price_cents: sub.price_cents
      });
      stops.push({ appointment_id: appt.id, address: prop.address, lat: prop.lat, lng: prop.lng, seq: i + 1 });
    }
    const drive = 18 + list.length * 6;
    await M.Route.create({
      tenant_id: tid, crew_id: crew.id, service_date: dstr(today), stops,
      stop_count: stops.length, drive_minutes: drive, drive_miles: +(drive / 2.4).toFixed(1),
      baseline_drive_minutes: drive + 34, saved_minutes: 34,
      method: 'nearest_neighbor', distance_source: 'haversine'
    });
  }
  await makeDay(todaysCrewA, crewA, 8);
  await makeDay(todaysCrewB, crewB, 8);

  // Upcoming scheduled visits (next few days) from subscriptions.
  for (const [ci, sub] of subs.entries()) {
    const cust = customers[ci], prop = properties[ci];
    const crew = ci % 2 === 0 ? crewA : crewB;
    await M.Appointment.create({
      tenant_id: tid, customer_id: cust.id, property_id: prop.id, subscription_id: sub.id,
      crew_id: crew.id, service_date: sub.next_service_date, window_start: '08:00', window_end: '12:00',
      status: 'scheduled', service_type: 'mowing', price_cents: sub.price_cents
    });
  }

  // ── Quotes: one accepted (became a customer), one needs-review ──────────
  const acceptedQuote = await M.Quote.create({
    tenant_id: tid, customer_id: customers[0].id, property_id: properties[0].id,
    token: 'demo_q_' + Math.abs(hashCode('accepted' + tid)).toString(36),
    frequency: 'biweekly', serviceable_sqft: properties[0].serviceable_sqft,
    subtotal_cents: 5900, total_cents: 5900, status: 'accepted', is_estimate: true,
    confidence: 'medium', options: { weekly: 4900, biweekly: 5900, monthly: 8900 },
    expires_at: daysFromNow(20)
  });
  await M.QuoteLineItem.create({ tenant_id: tid, quote_id: acceptedQuote.id, kind: 'base',
    label: 'Biweekly mowing', detail: '6,970 sq ft', amount_cents: 5900, sort_order: 10 });

  const reviewLead = await M.Lead.create({
    tenant_id: tid, name: 'Karen Marsh', phone: '+14075553007', email: 'karen.marsh@example.com',
    address: '900 Live Oak Circle, Kissimmee, FL 34741', source: 'web_orb', stage: 'quoted'
  });
  await M.Quote.create({
    tenant_id: tid, lead_id: reviewLead.id, property_id: properties[6].id,
    token: 'demo_q_' + Math.abs(hashCode('needsreview' + tid)).toString(36),
    frequency: 'biweekly', serviceable_sqft: 12900, subtotal_cents: 8800, total_cents: 8800,
    status: 'needs_review', is_estimate: true, confidence: 'low',
    options: { weekly: 7200, biweekly: 8800, monthly: 13200 }, expires_at: daysFromNow(25)
  });

  // ── Open leads across sources ────────────────────────────────────────────
  await M.Lead.bulkCreate([
    { tenant_id: tid, name: 'Greg Sullivan', phone: '+14075553301', email: 'greg.s@example.com',
      address: '412 Magnolia St, Orlando, FL 32803', source: 'web_orb', stage: 'new' },
    { tenant_id: tid, name: 'Ana Ruiz', phone: '+14075553302', email: 'ana.ruiz@example.com',
      address: '77 Sabal Palm Dr, Sanford, FL 32771', source: 'phone', stage: 'measured' },
    { tenant_id: tid, name: 'David Cohen', phone: '+14075553303', email: 'dcohen@example.com',
      address: '3300 Lakeview Ave, Maitland, FL 32751', source: 'qr', stage: 'quoted' }
  ]);

  // ── Draft pay run from approved time (NEVER filed — no provider) ─────────
  const periodStart = dstr(daysFromNow(-14)), periodEnd = dstr(daysFromNow(-1));
  const approved = await M.TimeEntry.findAll({
    where: { tenant_id: tid, status: 'approved' }, raw: true
  });
  const byEmp = {};
  for (const te of approved) {
    byEmp[te.employee_id] = (byEmp[te.employee_id] || 0) + (te.minutes || 0);
  }
  let gross = 0;
  const payRun = await M.PayRun.create({
    tenant_id: tid, period_start: periodStart, period_end: periodEnd, pay_date: dstr(daysFromNow(3)),
    status: 'draft', filed: false, provider: null,
    notes: 'Draft only. No payroll provider is connected, so nothing has been filed or remitted.'
  });
  for (const emp of staff) {
    const mins = byEmp[emp.id] || 0;
    if (!mins) continue;
    const reg = Math.min(mins, 80 * 60);
    const ot = Math.max(0, mins - 80 * 60);
    const regC = Math.round((reg / 60) * emp.pay_rate_cents);
    const otC = Math.round((ot / 60) * emp.pay_rate_cents * 1.5);
    gross += regC + otC;
    await M.PayItem.create({
      tenant_id: tid, pay_run_id: payRun.id, employee_id: emp.id,
      regular_minutes: reg, overtime_minutes: ot, regular_cents: regC, overtime_cents: otC,
      gross_cents: regC + otC, net_cents: regC + otC
    });
  }
  await payRun.update({ gross_cents: gross, net_cents: gross });

  // ── Expenses (feed Controller margin) ───────────────────────────────────
  await M.Expense.bulkCreate([
    { tenant_id: tid, spent_on: dstr(daysFromNow(-6)), vendor: 'RaceTrac', category: 'fuel', amount_cents: 8400, crew_id: crewA.id },
    { tenant_id: tid, spent_on: dstr(daysFromNow(-5)), vendor: 'RaceTrac', category: 'fuel', amount_cents: 7100, crew_id: crewB.id },
    { tenant_id: tid, spent_on: dstr(daysFromNow(-12)), vendor: 'Site One', category: 'materials', amount_cents: 21500 },
    { tenant_id: tid, spent_on: dstr(daysFromNow(-9)), vendor: 'Home Depot', category: 'repairs', amount_cents: 6300, crew_id: crewA.id }
  ]);

  // ── Referral + tickets + messages + a couple of call logs ───────────────
  await M.Referral.create({
    tenant_id: tid, code: 'DANA-REF', referrer_customer_id: customers[0].id,
    referee_customer_id: customers[7].id, reward_cents: 2500, status: 'converted', converted_at: daysFromNow(-8)
  });
  await M.Ticket.bulkCreate([
    { tenant_id: tid, customer_id: customers[0].id, property_id: properties[0].id, type: 'service_request',
      subject: 'Hedges before the 4th', body: 'Can you trim the hedges before the holiday weekend?',
      status: 'open', priority: 'normal', source: 'phone' },
    { tenant_id: tid, customer_id: customers[5].id, property_id: properties[5].id, type: 'billing',
      subject: 'Refund for rained-out visit', body: 'Crew did not attend on the 18th due to rain.',
      status: 'in_progress', priority: 'high', source: 'portal' }
  ]);
  await M.Message.bulkCreate([
    { tenant_id: tid, customer_id: customers[1].id, direction: 'inbound', author: customers[1].name,
      body: 'Please skip next week, we are traveling.', read_at: null },
    { tenant_id: tid, customer_id: customers[3].id, direction: 'inbound', author: customers[3].name,
      body: 'Gate code changed to 4417.', read_at: daysFromNow(-1) }
  ]);
  await M.CallLog.bulkCreate([
    { tenant_id: tid, call_sid: 'CA_demo_1', from_number: '+14075553301', to_number: tenant.phone,
      customer_id: null, outcome: 'completed', duration_seconds: 142 },
    { tenant_id: tid, call_sid: 'CA_demo_2', from_number: customers[0].phone, to_number: tenant.phone,
      customer_id: customers[0].id, outcome: 'completed', duration_seconds: 96 }
  ]);

  const counts = {};
  for (const [name, model] of [
    ['crews', M.Crew], ['staff', M.Employee], ['customers', M.Customer], ['properties', M.Property],
    ['subscriptions', M.Subscription], ['appointments', M.Appointment], ['service_records', M.ServiceRecord],
    ['invoices', M.Invoice], ['payments', M.Payment], ['quotes', M.Quote], ['leads', M.Lead],
    ['time_entries', M.TimeEntry], ['pay_runs', M.PayRun], ['job_costs', M.JobCost],
    ['routes', M.Route], ['reviews', M.Review], ['tickets', M.Ticket], ['expenses', M.Expense]
  ]) counts[name] = await model.count({ where: { tenant_id: tid } });

  console.log(`\n${created ? 'CREATED' : 'POPULATED'} company "${tenant.name}"  (/lawncopilot/${tenant.slug})`);
  console.log('Owner login:', OWNER_EMAIL, '  password:', OWNER_PW);
  console.log('Admin:  https://aiagent.ringlypro.com/lawncopilot/' + tenant.slug + '/admin');
  console.log('        https://lawncopilot.com/' + tenant.slug + '/admin');
  console.log('Public: https://lawncopilot.com/' + tenant.slug);
  console.log('\nSeeded:', JSON.stringify(counts, null, 0));
}

function hashCode(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return h; }

main().then(() => process.exit(0)).catch(e => { console.error('SEED FAILED:', e); process.exit(1); });
