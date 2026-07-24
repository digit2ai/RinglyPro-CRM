'use strict';

/**
 * Six months of cross-referenced demo data for a company, so every admin
 * screen has something real to show:
 *
 *   Today          — today's route + KPIs (jobs, collected, outstanding, AI)
 *   Dispatch       — routes and appointments across the calendar
 *   Leads          — leads across every source and stage, plus quotes
 *   Measure        — measured properties, some flagged for review
 *   AI Staff       — 6 months of agent activity for all eight employees + a
 *                    pending approval queue
 *   Plan & billing — company on a paid plan
 *   Get on Google  — reads the company record, always populated
 *
 * Target company: OrbUp (LAWNCOPILOT_DEMO_SLUG_TARGET, default 'orbup').
 * Upgrades it to Multi Trucks so ALL eight AI employees are enabled and
 * testable.
 *
 * IDEMPOTENT: bails if the company already has customers. To reseed, purge
 * first (scripts/purge-test-data.js) or drop the tenant's rows.
 *
 * Run: node verticals/lawncopilot/scripts/seed-orbup-demo.js
 */

require('dotenv').config();
const path = require('path');
const bcrypt = require('bcryptjs');
const M = require(path.join(__dirname, '..', 'src', 'models'));
const { enabledFor, defaultBrand } = require(path.join(__dirname, '..', 'src', 'services', 'provision'));

const SLUG = process.env.LAWNCOPILOT_DEMO_SLUG_TARGET || 'orbup';

// ── deterministic helpers (no Math.random, so reruns are identical) ─────────
function dstr(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
const days = n => new Date(Date.now() + n * 86400000);
function at(d, h, m) { const x = new Date(d); x.setHours(h, m || 0, 0, 0); return x; }
function seed(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; } return Math.abs(h); }
const cents = d => Math.round(d * 100);

async function main() {
  await M.sequelize.authenticate();
  const tenant = await M.Tenant.findOne({ where: { slug: SLUG } });
  if (!tenant) throw new Error(`No company at /${SLUG}. Sign up first.`);
  const tid = tenant.id;

  if (await M.Customer.count({ where: { tenant_id: tid } }) > 0) {
    console.log(`"${tenant.name}" (/${SLUG}) already has data — nothing to do.`);
    return;
  }

  // Upgrade so every AI employee is enabled and testable.
  tenant.plan = 'multi_trucks';
  tenant.status = 'active';
  tenant.phone = tenant.phone || '+14075550100';
  tenant.owner_phone = tenant.owner_phone || '+14075550101';
  tenant.counties = (tenant.counties && tenant.counties.length) ? tenant.counties : ['Orange', 'Seminole', 'Osceola'];
  tenant.business_hours = tenant.business_hours || {
    mon: ['07:00', '18:00'], tue: ['07:00', '18:00'], wed: ['07:00', '18:00'],
    thu: ['07:00', '18:00'], fri: ['07:00', '18:00'], sat: ['08:00', '14:00'], sun: null
  };
  tenant.settings = { ...(tenant.settings || {}), enabled_employees: enabledFor('multi_trucks') };
  if (!tenant.brand || !tenant.brand.display_name) tenant.brand = defaultBrand(tenant.name);
  await tenant.save();
  await M.PlatformSubscription.update({ plan: 'multi_trucks', status: 'active' }, { where: { tenant_id: tid } });

  // ── Crews ─────────────────────────────────────────────────────────────────
  let crews = await M.Crew.findAll({ where: { tenant_id: tid }, order: [['id', 'ASC']], raw: true });
  const wantCrews = [
    { name: 'Crew A', lead_name: 'Luis Marin', phone: '+14075550111', capacity_per_day: 14 },
    { name: 'Crew B', lead_name: 'Tomas Perez', phone: '+14075550112', capacity_per_day: 12 },
    { name: 'Crew C', lead_name: 'Andre Cole', phone: '+14075550113', capacity_per_day: 10 }
  ];
  if (crews.length < 3) {
    await M.Crew.destroy({ where: { tenant_id: tid } });
    crews = await M.Crew.bulkCreate(wantCrews.map(c => ({ tenant_id: tid, active: true, ...c })), { returning: true })
      .then(r => r.map(x => x.get({ plain: true })));
  }

  // ── Staff + certs + availability ───────────────────────────────────────────
  const staffDefs = [
    { name: 'Luis Marin', role: 'lead', crew: 0, pay: 27, email: 'luis@orbup-demo.com' },
    { name: 'Danny Rivera', role: 'crew', crew: 0, pay: 19 },
    { name: 'Marcus Bell', role: 'crew', crew: 0, pay: 18 },
    { name: 'Tomas Perez', role: 'lead', crew: 1, pay: 27, email: 'tomas@orbup-demo.com' },
    { name: 'Wes Karim', role: 'crew', crew: 1, pay: 18 },
    { name: 'Andre Cole', role: 'lead', crew: 2, pay: 26, email: 'andre@orbup-demo.com' },
    { name: 'Jamal Ford', role: 'crew', crew: 2, pay: 18 },
    { name: 'Paula Ortega', role: 'office', crew: null, pay: 23, email: 'paula@orbup-demo.com', ot: false }
  ];
  const staff = await M.Employee.bulkCreate(staffDefs.map((s, i) => ({
    tenant_id: tid, name: s.name, email: s.email || null,
    phone: '+140755502' + String(10 + i).padStart(2, '0'),
    crew_id: s.crew === null ? null : crews[s.crew].id,
    role: s.role, employment_type: 'w2', pay_type: 'hourly',
    pay_rate_cents: cents(s.pay), overtime_eligible: s.ot !== false,
    hire_date: dstr(days(-400 - i * 20)), status: 'active'
  })), { returning: true }).then(r => r.map(x => x.get({ plain: true })));

  await M.Certification.bulkCreate([
    { tenant_id: tid, employee_id: staff[0].id, kind: 'pesticide', name: 'FL Commercial Pesticide Applicator', number: 'FL-PA-70921', issued_on: dstr(days(-680)), expires_on: dstr(days(21)) },
    { tenant_id: tid, employee_id: staff[3].id, kind: 'pesticide', name: 'FL Commercial Pesticide Applicator', number: 'FL-PA-70922', issued_on: dstr(days(-500)), expires_on: dstr(days(210)) },
    { tenant_id: tid, employee_id: staff[0].id, kind: 'cdl', name: 'CDL Class B', number: 'CDLB-4471', issued_on: dstr(days(-900)), expires_on: dstr(days(430)) },
    { tenant_id: tid, employee_id: staff[5].id, kind: 'insurance', name: 'General Liability (COI)', number: 'GL-2026-88', issued_on: dstr(days(-200)), expires_on: dstr(days(160)) }
  ]);
  for (const e of staff) {
    await M.Availability.create({ tenant_id: tid, employee_id: e.id, kind: 'working_hours', days: [1, 2, 3, 4, 5], start_time: '07:00', end_time: '16:00', status: 'approved' });
  }

  // ── Customers + properties (varied sizes; two flagged for review) ──────────
  const CUST = [
    ['Dana Whitfield', '1240 Palm Grove Dr', 'Orlando', 'Orange', '32806', 28.510, -81.362, 11800, 2450, 1290, 'biweekly'],
    ['Miguel Alvarez', '88 Riverbend Ct', 'Winter Park', 'Orange', '32789', 28.599, -81.339, 8200, 2010, 900, 'weekly'],
    ['Tunde Okafor', '3117 Cypress Ln', 'Orlando', 'Orange', '32806', 28.505, -81.360, 15800, 2900, 1600, 'biweekly'],
    ['Sarah Bell', '629 Willow Bend', 'Maitland', 'Orange', '32751', 28.627, -81.363, 9100, 2200, 1000, 'weekly'],
    ['Robert Nguyen', '204 Kestrel Way', 'Lake Mary', 'Seminole', '32746', 28.758, -81.317, 12200, 2500, 1200, 'biweekly'],
    ['Priya Iyer', '55 Marsh Hen Trail', 'Sanford', 'Seminole', '32771', 28.800, -81.273, 7600, 1950, 850, 'monthly'],
    ['Karen Marsh', '900 Live Oak Cir', 'Kissimmee', 'Osceola', '34741', 28.291, -81.407, 16400, 2900, 1650, 'biweekly'],
    ['James Reyes', '17 Heron Point', 'Oviedo', 'Seminole', '32765', 28.670, -81.208, 8800, 2100, 950, 'weekly'],
    ['Grace Kim', '442 Magnolia St', 'Orlando', 'Orange', '32803', 28.556, -81.360, 6400, 1800, 780, 'biweekly'],
    ['Victor Hughes', '1201 Bayshore Dr', 'Windermere', 'Orange', '34786', 28.495, -81.535, 13900, 2700, 1400, 'biweekly'],
    ['Nina Patel', '77 Sabal Palm Dr', 'Sanford', 'Seminole', '32771', 28.803, -81.270, 3600, 1500, 520, 'monthly'],
    ['Owen Brooks', '3300 Lakeview Ave', 'Maitland', 'Orange', '32751', 28.625, -81.360, 21000, 3200, 1900, 'weekly'],
    ['Lena Fischer', '58 Cardinal Ct', 'Oviedo', 'Seminole', '32765', 28.672, -81.210, 9700, 2150, 1050, 'biweekly'],
    ['Carlos Mendez', '812 Egret Way', 'Kissimmee', 'Osceola', '34744', 28.302, -81.390, 5200, 1700, 640, 'monthly']
  ];
  const FREQ_PRICE = { weekly: null, biweekly: null, monthly: null };
  const hash = await bcrypt.hash('demo@2026', 10);
  const customers = [], properties = [], subs = [];
  for (let i = 0; i < CUST.length; i++) {
    const [name, addr, city, county, zip, lat, lng, lot, house, hard, freq] = CUST[i];
    const serviceable = lot - house - hard;
    const price = Math.max(4000, Math.round(serviceable * 0.0065) * 100 / 100 * 100); // cents, min $40, biweekly-ish
    const priceC = Math.max(4000, Math.round(serviceable * 0.65)); // ~$0.0065/sqft in cents
    const flagged = i === 6 || i === 11; // two need review
    const cust = await M.Customer.create({
      tenant_id: tid, name,
      email: name.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
      phone: '+140755530' + String(10 + i).padStart(2, '0'),
      password_hash: hash, status: 'active', balance_cents: 0,
      autopay_enabled: i % 3 !== 0,
      consent: { marketing: i % 2 === 0, transactional: true }
    });
    const prop = await M.Property.create({
      tenant_id: tid, customer_id: cust.id,
      address_raw: `${addr}, ${city}, FL ${zip}`, address: `${addr}, ${city}, FL ${zip}`,
      city, county, state: 'FL', zip, lat, lng, property_type: 'residential',
      lot_sqft: lot, building_footprint_sqft: house, excluded_sqft: hard,
      serviceable_sqft: serviceable, approved_sqft: flagged ? null : serviceable,
      confidence: flagged ? 'low' : (i % 2 ? 'medium' : 'high'),
      is_estimate: flagged, needs_review: flagged
    });
    const sub = await M.Subscription.create({
      tenant_id: tid, customer_id: cust.id, property_id: prop.id,
      frequency: freq, price_cents: priceC, status: i === 10 ? 'paused' : 'active',
      next_service_date: dstr(days(freq === 'weekly' ? 3 + (i % 5) : freq === 'biweekly' ? 6 + (i % 8) : 15 + (i % 10)))
    });
    customers.push(cust.get({ plain: true }));
    properties.push({ ...prop.get({ plain: true }), price_cents: priceC, freq });
    subs.push(sub.get({ plain: true }));
  }

  // ── 6 months of visits, records, invoices, payments, job costs ────────────
  let invSeq = 1;
  const invNo = () => 'LC-2026-' + String(invSeq++).padStart(5, '0');
  const FREQ_DAYS = { weekly: 7, biweekly: 14, monthly: 30 };
  const OVERHEAD = 400;
  let totalVisits = 0;

  for (let ci = 0; ci < customers.length; ci++) {
    const cust = customers[ci], prop = properties[ci], sub = subs[ci];
    if (sub.status === 'paused') continue;
    const crew = crews[ci % crews.length];
    const step = FREQ_DAYS[prop.freq];
    const price = prop.price_cents;
    // Walk back ~183 days.
    for (let back = 5; back <= 183; back += step) {
      const day = days(-back);
      totalVisits++;
      const appt = await M.Appointment.create({
        tenant_id: tid, customer_id: cust.id, property_id: prop.id, subscription_id: sub.id,
        crew_id: crew.id, service_date: dstr(day), window_start: '08:00', window_end: '12:00',
        status: 'completed', service_type: 'mowing', price_cents: price
      });
      const laborMin = Math.round((prop.serviceable_sqft / 1000) * 6) + 12;
      const rec = await M.ServiceRecord.create({
        tenant_id: tid, appointment_id: appt.id, customer_id: cust.id, property_id: prop.id,
        crew_id: crew.id, service_date: dstr(day), completed_at: at(day, 10, 30),
        service_type: 'mowing', area_serviced_sqft: prop.serviceable_sqft,
        completion_status: 'completed', weather: 'Clear', charges_cents: price,
        technician_notes: 'Mowed, edged, trimmed and blew off.'
      });

      // Status: most paid; the most recent for a couple of customers is open/failed.
      let status = 'paid', paid = price, method = 'card', paidAt = at(days(-back + 1), 9, 0);
      if (back <= step && ci === 5) { status = 'failed'; paid = 0; paidAt = null; }
      else if (back <= step && (ci === 3 || ci === 8)) { status = 'open'; paid = 0; paidAt = null; }

      const inv = await M.Invoice.create({
        tenant_id: tid, customer_id: cust.id, service_record_id: rec.id, number: invNo(),
        status, subtotal_cents: price, tax_cents: 0, total_cents: price, amount_paid_cents: paid,
        issued_at: at(day, 12, 0), due_at: at(days(-back + 14), 12, 0), paid_at: paidAt,
        dunning_stage: status === 'failed' ? 1 : 0
      });
      await M.InvoiceLineItem.create({
        tenant_id: tid, invoice_id: inv.id, label: `Lawn service ${dstr(day)}`,
        detail: `${prop.serviceable_sqft.toLocaleString()} sq ft, ${prop.freq}`, amount_cents: price, sort_order: 10
      });
      if (status === 'paid') {
        await M.Payment.create({ tenant_id: tid, customer_id: cust.id, invoice_id: inv.id, amount_cents: price, status: 'succeeded', method, processed_at: paidAt });
      } else {
        await M.Payment.create({ tenant_id: tid, customer_id: cust.id, invoice_id: inv.id, amount_cents: price, status: status === 'failed' ? 'failed' : 'pending', method: 'card', failure_reason: status === 'failed' ? 'card_declined' : null, processed_at: at(day, 12, 5) });
        await M.Customer.update({ balance_cents: price }, { where: { id: cust.id } });
      }

      // Job cost — Karen (ci 6) deliberately thin margin; big lots cost more drive.
      const laborCents = Math.round((laborMin / 60) * cents(19));
      const driveMin = 8 + ((ci * 3) % 16);
      const driveCents = Math.round((driveMin / 60) * 1800);
      const material = 120 + (ci % 4) * 30;
      const totalCost = laborCents + driveCents + material + OVERHEAD;
      await M.JobCost.create({
        tenant_id: tid, appointment_id: appt.id, service_record_id: rec.id, customer_id: cust.id, crew_id: crew.id,
        labor_minutes: laborMin, labor_cents: laborCents, drive_minutes: driveMin, drive_cents: driveCents,
        material_cents: material, overhead_cents: OVERHEAD, total_cost_cents: totalCost,
        revenue_cents: price, margin_cents: price - totalCost,
        margin_pct: +(((price - totalCost) / price) * 100).toFixed(1)
      });

      // Reviews on a slice of visits.
      if (back <= step * 3 && ci < 8) {
        await M.Review.create({
          tenant_id: tid, customer_id: cust.id, service_record_id: rec.id, platform: 'google',
          status: ci < 5 ? 'left' : 'requested', rating: ci < 5 ? 5 : null,
          text: ci < 5 ? 'On time, yard looks great.' : null, author: ci < 5 ? cust.name : null,
          requested_at: at(days(-back + 1), 18, 0)
        });
      }
    }
  }

  // Autopay + card on file for enrolled customers.
  for (const cust of customers.filter(c => c.autopay_enabled)) {
    const pm = await M.PaymentMethod.create({ tenant_id: tid, customer_id: cust.id, brand: 'visa', last4: '4242', exp_month: 9, exp_year: 2029, type: 'card', is_default: true });
    await M.AutopayEnrollment.create({ tenant_id: tid, customer_id: cust.id, payment_method_id: pm.id, status: 'active', terms_accepted_at: days(-120), next_charge_at: days(7) });
  }

  // ── Time entries for the last 3 pay periods -> a draft pay run ────────────
  for (let back = 1; back <= 42; back++) {
    const day = days(-back);
    if ([0, 6].includes(day.getDay())) continue;
    for (const e of staff.filter(s => s.crew_id)) {
      await M.TimeEntry.create({
        tenant_id: tid, employee_id: e.id, crew_id: e.crew_id, work_date: dstr(day),
        clock_in: at(day, 7, 45), clock_out: at(day, 16, 5), break_minutes: 30, minutes: 8 * 60 + 20 - 30,
        status: back <= 14 ? 'submitted' : 'approved',
        approved_by: back <= 14 ? null : staff[7].id, approved_at: back <= 14 ? null : at(day, 17, 0)
      });
    }
  }
  const approved = await M.TimeEntry.findAll({ where: { tenant_id: tid, status: 'approved' }, raw: true });
  const mins = {}; approved.forEach(te => { mins[te.employee_id] = (mins[te.employee_id] || 0) + (te.minutes || 0); });
  const payRun = await M.PayRun.create({
    tenant_id: tid, period_start: dstr(days(-14)), period_end: dstr(days(-1)), pay_date: dstr(days(3)),
    status: 'draft', filed: false, provider: null,
    notes: 'Draft only. No payroll provider connected — nothing filed or remitted.'
  });
  let gross = 0;
  for (const e of staff) {
    const m = mins[e.id] || 0; if (!m) continue;
    const reg = Math.min(m, 80 * 60), ot = Math.max(0, m - 80 * 60);
    const regC = Math.round((reg / 60) * e.pay_rate_cents), otC = Math.round((ot / 60) * e.pay_rate_cents * 1.5);
    gross += regC + otC;
    await M.PayItem.create({ tenant_id: tid, pay_run_id: payRun.id, employee_id: e.id, regular_minutes: reg, overtime_minutes: ot, regular_cents: regC, overtime_cents: otC, gross_cents: regC + otC, net_cents: regC + otC });
  }
  await payRun.update({ gross_cents: gross, net_cents: gross });

  // ── Expenses over 6 months (Controller) ──────────────────────────────────
  const vendors = [['RaceTrac', 'fuel'], ['Site One', 'materials'], ['Home Depot', 'repairs'], ['State Farm', 'insurance']];
  const exp = [];
  for (let back = 4; back <= 180; back += 6) {
    const v = vendors[seed('e' + back) % vendors.length];
    exp.push({ tenant_id: tid, spent_on: dstr(days(-back)), vendor: v[0], category: v[1], amount_cents: 5000 + (seed('a' + back) % 18000), crew_id: crews[seed('c' + back) % crews.length].id });
  }
  await M.Expense.bulkCreate(exp);

  // ── Leads across sources & stages (6 months) ──────────────────────────────
  const SOURCES = ['web_orb', 'phone', 'qr', 'web_form', 'google'];
  const STAGES = ['new', 'measured', 'quoted', 'accepted', 'lost'];
  const leadNames = ['Greg Sullivan', 'Ana Ruiz', 'David Cohen', 'Mia Torres', 'Sam Walsh', 'Rosa Diaz', 'Kevin Tran', 'Beth Owens', 'Omar Nasser', 'Lily Chen', 'Frank Boone', 'Zoe Park', 'Hector Ruiz', 'Ivy Long', 'Neil Ross', 'Tara Voss', 'Cody Fair', 'Dana Poole'];
  const leadRows = leadNames.map((nm, i) => ({
    tenant_id: tid, name: nm, phone: '+140755540' + String(10 + i).padStart(2, '0'),
    email: nm.toLowerCase().replace(/[^a-z]+/g, '.') + '@example.com',
    address: `${100 + i * 7} Sample Rd, Orlando, FL 3280${i % 9}`,
    source: SOURCES[i % SOURCES.length], stage: STAGES[i % STAGES.length],
    created_at: days(-(5 + i * 9))
  }));
  await M.Lead.bulkCreate(leadRows);

  // ── Quotes (accepted, needs_review, expired) ──────────────────────────────
  for (let i = 0; i < 8; i++) {
    const prop = properties[i];
    const status = i < 3 ? 'accepted' : i < 5 ? 'needs_review' : i < 7 ? 'issued' : 'expired';
    const q = await M.Quote.create({
      tenant_id: tid, customer_id: i < 5 ? customers[i].id : null, property_id: prop.id,
      token: 'orb_q_' + seed('q' + i + tid).toString(36),
      frequency: prop.freq, serviceable_sqft: prop.serviceable_sqft,
      subtotal_cents: prop.price_cents, total_cents: prop.price_cents,
      status, is_estimate: status === 'needs_review', confidence: status === 'needs_review' ? 'low' : 'medium',
      options: { weekly: Math.round(prop.price_cents * 0.85), biweekly: prop.price_cents, monthly: Math.round(prop.price_cents * 1.5) },
      expires_at: status === 'expired' ? days(-10) : days(20), created_at: days(-(3 + i * 6))
    });
    await M.QuoteLineItem.create({ tenant_id: tid, quote_id: q.id, kind: 'base', label: 'Lawn service', detail: `${prop.serviceable_sqft.toLocaleString()} sq ft`, amount_cents: prop.price_cents, sort_order: 10 });
  }

  // ── Routes: today + several recent days (Dispatch) ────────────────────────
  async function makeRoute(dayOffset, crew, custIdxs, statuses) {
    const day = days(dayOffset);
    const stops = [];
    for (let k = 0; k < custIdxs.length; k++) {
      const ci = custIdxs[k], prop = properties[ci], sub = subs[ci], cust = customers[ci];
      const appt = await M.Appointment.create({
        tenant_id: tid, customer_id: cust.id, property_id: prop.id, subscription_id: sub.id,
        crew_id: crew.id, service_date: dstr(day),
        window_start: String(8 + k).padStart(2, '0') + ':00', window_end: String(9 + k).padStart(2, '0') + ':30',
        route_order: k + 1, status: statuses[k] || 'scheduled', service_type: 'mowing', price_cents: prop.price_cents
      });
      stops.push({ appointment_id: appt.id, address: prop.address, lat: prop.lat, lng: prop.lng, seq: k + 1 });
    }
    const drive = 18 + custIdxs.length * 6;
    await M.Route.create({
      tenant_id: tid, crew_id: crew.id, service_date: dstr(day), stops, stop_count: stops.length,
      drive_minutes: drive, drive_miles: +(drive / 2.4).toFixed(1),
      baseline_drive_minutes: drive + 34, saved_minutes: 34, method: 'nearest_neighbor', distance_source: 'haversine',
      created_at: at(day, 6, 30)
    });
  }
  // Today
  await makeRoute(0, crews[0], [0, 2, 4], ['completed', 'en_route', 'scheduled']);
  await makeRoute(0, crews[1], [1, 7], ['completed', 'scheduled']);
  await makeRoute(0, crews[2], [9, 12], ['scheduled', 'scheduled']);
  // A few recent days
  for (let d = 1; d <= 5; d++) {
    await makeRoute(-d, crews[d % 3], [(d * 2) % customers.length, (d * 2 + 1) % customers.length, (d * 3) % customers.length], ['completed', 'completed', 'completed']);
  }
  // Upcoming from subscriptions
  for (let ci = 0; ci < subs.length; ci++) {
    if (subs[ci].status === 'paused') continue;
    const prop = properties[ci];
    await M.Appointment.create({
      tenant_id: tid, customer_id: customers[ci].id, property_id: prop.id, subscription_id: subs[ci].id,
      crew_id: crews[ci % 3].id, service_date: subs[ci].next_service_date, window_start: '08:00', window_end: '12:00',
      status: 'scheduled', service_type: 'mowing', price_cents: prop.price_cents
    });
  }

  // ── AI staff activity: 6 months across all eight employees ────────────────
  const EMP_TOOLS = {
    receptionist: ['identify_caller', 'answer_faq', 'capture_lead', 'take_message', 'send_payment_link'],
    estimator: ['verify_address', 'measure_property', 'price_quote', 'issue_quote', 'explain_price'],
    dispatcher: ['check_availability', 'book_appointment', 'sequence_route', 'assign_crew', 'notify_on_the_way'],
    bookkeeper: ['issue_invoice', 'take_payment', 'retry_failed_payment', 'ar_aging', 'run_dunning'],
    crew: ['clock_in', 'clock_out', 'timesheet', 'expiring_certifications', 'job_checklist'],
    payroll: ['preview_pay_run', 'compute_pay_run', 'overtime_report', 'payroll_calendar'],
    marketer: ['request_review', 'referral_link', 'lead_source_report', 'sync_google_profile', 'generate_qr'],
    controller: ['job_costing', 'underpriced_jobs', 'route_waste', 'unbilled_work', 'savings_summary']
  };
  const CHAN = { receptionist: 'phone', estimator: 'web_orb', dispatcher: 'admin', bookkeeper: 'system', crew: 'admin', payroll: 'admin', marketer: 'system', controller: 'admin' };
  const agentRows = [];
  // Weight the everyday employees heavier than the back-office ones.
  const WEIGHT = { receptionist: 6, estimator: 5, dispatcher: 4, bookkeeper: 4, crew: 3, marketer: 2, payroll: 1, controller: 1 };
  for (let back = 1; back <= 183; back++) {
    const day = days(-back);
    for (const emp of Object.keys(EMP_TOOLS)) {
      const n = WEIGHT[emp];
      const count = (seed(emp + back) % (n + 1)); // 0..n per day
      for (let k = 0; k < count; k++) {
        const tools = EMP_TOOLS[emp];
        const tool = tools[seed(emp + back + k) % tools.length];
        const fail = (seed('f' + emp + back + k) % 25) === 0; // ~4% failures
        agentRows.push({
          tenant_id: tid, session_id: 'sess_' + back + '_' + k, employee: emp, tool,
          channel: CHAN[emp], actor: CHAN[emp] === 'phone' ? 'caller:+1407xxxxxxx' : 'system',
          success: !fail, error: fail ? 'downstream_timeout' : null,
          latency_ms: 300 + (seed('l' + emp + back + k) % 1800),
          cost_cents: (seed('c' + emp + back + k) % 3),
          created_at: at(day, 8 + (k % 10), (seed('m' + back + k) % 59))
        });
      }
    }
  }
  // Insert in chunks to keep the statement size sane.
  for (let i = 0; i < agentRows.length; i += 500) {
    await M.AgentCall.bulkCreate(agentRows.slice(i, i + 500));
  }

  // ── Pending approval queue (AI Staff screen) ──────────────────────────────
  await M.AgentApproval.bulkCreate([
    { tenant_id: tid, session_id: 'appr_1', employee: 'bookkeeper', tool: 'issue_refund', arguments: { customer: 'Priya Iyer', amount_cents: subs[5] ? properties[5].price_cents : 4500 }, reason: 'Rained out, crew did not attend', status: 'pending' },
    { tenant_id: tid, session_id: 'appr_2', employee: 'controller', tool: 'price_recommendations', arguments: { customer: 'Karen Marsh', from_cents: properties[6].price_cents, to_cents: properties[6].price_cents + 1500 }, reason: 'Underpriced vs. cost for 6 months', status: 'pending' },
    { tenant_id: tid, session_id: 'appr_3', employee: 'dispatcher', tool: 'reschedule_appointment', arguments: { reason: 'Customer requested a different day' }, reason: 'Customer requested a different day', status: 'pending' }
  ]);

  // ── Tickets + messages + referral + call logs ─────────────────────────────
  await M.Ticket.bulkCreate([
    { tenant_id: tid, customer_id: customers[0].id, property_id: properties[0].id, type: 'service_request', subject: 'Add mulch to front beds', body: 'Quote adding mulch to the two front beds before month end.', status: 'open', priority: 'normal', source: 'portal' },
    { tenant_id: tid, customer_id: customers[6].id, property_id: properties[6].id, type: 'billing', subject: 'Refund for rained-out visit', body: 'Crew did not attend due to rain.', status: 'in_progress', priority: 'high', source: 'phone' },
    { tenant_id: tid, customer_id: customers[2].id, property_id: properties[2].id, type: 'support', subject: 'Gate code changed', body: 'New gate code is 5521.', status: 'resolved', priority: 'normal', source: 'portal' }
  ]);
  await M.Message.bulkCreate([
    { tenant_id: tid, customer_id: customers[1].id, direction: 'inbound', author: customers[1].name, body: 'Please skip next week, traveling.', read_at: null },
    { tenant_id: tid, customer_id: customers[4].id, direction: 'inbound', author: customers[4].name, body: 'Can you come earlier on Friday?', read_at: days(-1) }
  ]);
  await M.Referral.create({ tenant_id: tid, code: 'DANA-REF', referrer_customer_id: customers[0].id, referee_customer_id: customers[13].id, reward_cents: 2500, status: 'converted', converted_at: days(-20) });
  await M.CallLog.bulkCreate([
    { tenant_id: tid, call_sid: 'CA_orb_1', from_number: '+14075554010', to_number: tenant.phone, outcome: 'completed', duration_seconds: 132, created_at: days(-1) },
    { tenant_id: tid, call_sid: 'CA_orb_2', from_number: customers[0].phone, to_number: tenant.phone, customer_id: customers[0].id, outcome: 'completed', duration_seconds: 96, created_at: days(-2) }
  ]);

  // ── Report ────────────────────────────────────────────────────────────────
  const counts = {};
  for (const [k, model] of [
    ['crews', M.Crew], ['staff', M.Employee], ['customers', M.Customer], ['properties', M.Property],
    ['subscriptions', M.Subscription], ['appointments', M.Appointment], ['service_records', M.ServiceRecord],
    ['invoices', M.Invoice], ['payments', M.Payment], ['quotes', M.Quote], ['leads', M.Lead],
    ['time_entries', M.TimeEntry], ['pay_runs', M.PayRun], ['job_costs', M.JobCost], ['routes', M.Route],
    ['reviews', M.Review], ['tickets', M.Ticket], ['expenses', M.Expense],
    ['agent_calls', M.AgentCall], ['pending_approvals', M.AgentApproval]
  ]) counts[k] = await model.count({ where: { tenant_id: tid } });

  console.log(`\nSeeded 6 months of data for "${tenant.name}" (/${SLUG}), plan multi_trucks (all 8 employees).`);
  console.log('  Admin:  https://lawncopilot.com/' + SLUG + '/admin');
  console.log('  Counts:', JSON.stringify(counts));
}

main().then(() => process.exit(0)).catch(e => { console.error('SEED FAILED:', e.message); console.error(e.stack); process.exit(1); });
