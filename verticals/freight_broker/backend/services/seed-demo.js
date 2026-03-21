/**
 * FreightMind AI — Demo Data Seeder
 * Populates realistic freight/trucking demo data for a given tenant.
 * Uses the CW Carriers DB connection (all lg_* tables live there).
 */

const sequelize = require('../../cw_carriers/backend/services/db.cw');

async function seedDemoData(tenant_id = 'logistics') {
  const counts = {};

  // ── Helper: today offset ──────────────────────────────────────────────
  function dateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 0. Clear previous demo data (reverse dependency order)
  // ══════════════════════════════════════════════════════════════════════
  const tables = [
    'lg_compliance', 'lg_dispatches', 'lg_quotes', 'lg_rate_benchmarks',
    'lg_loads', 'lg_shippers', 'lg_drivers', 'lg_trucks', 'lg_carriers'
  ];
  for (const t of tables) {
    await sequelize.query(`DELETE FROM ${t} WHERE tenant_id = $1`, { bind: [tenant_id] });
  }

  // ══════════════════════════════════════════════════════════════════════
  // 1. CARRIERS (10)
  // ══════════════════════════════════════════════════════════════════════
  const carriers = [
    { carrier_name: 'Swift Transport LLC', mc_number: 'MC-123456', dot_number: '1234567', contact_name: 'Mike Johnson', phone: '555-0101', email: 'dispatch@swifttransport.com', equipment_types: '{dry_van,reefer}', home_city: 'Atlanta', home_state: 'GA', reliability_score: 85, operating_status: 'active' },
    { carrier_name: 'Eagle Freight Services', mc_number: 'MC-234567', dot_number: '2345678', contact_name: 'Sarah Williams', phone: '555-0102', email: 'ops@eaglefreight.com', equipment_types: '{dry_van}', home_city: 'Dallas', home_state: 'TX', reliability_score: 92, operating_status: 'active' },
    { carrier_name: 'Patriot Trucking Inc', mc_number: 'MC-345678', dot_number: '3456789', contact_name: 'Tom Davis', phone: '555-0103', email: 'dispatch@patriottrucking.com', equipment_types: '{dry_van,flatbed}', home_city: 'Chicago', home_state: 'IL', reliability_score: 78, operating_status: 'active' },
    { carrier_name: 'Sunbelt Carriers', mc_number: 'MC-456789', dot_number: '4567890', contact_name: 'Lisa Chen', phone: '555-0104', email: 'ops@sunbeltcarriers.com', equipment_types: '{reefer}', home_city: 'Miami', home_state: 'FL', reliability_score: 88, operating_status: 'active' },
    { carrier_name: 'Mountain West Logistics', mc_number: 'MC-567890', dot_number: '5678901', contact_name: 'James Rodriguez', phone: '555-0105', email: 'dispatch@mwlogistics.com', equipment_types: '{dry_van,flatbed}', home_city: 'Denver', home_state: 'CO', reliability_score: 81, operating_status: 'active' },
    { carrier_name: 'Pacific Coast Haulers', mc_number: 'MC-678901', dot_number: '6789012', contact_name: 'Kevin Park', phone: '555-0106', email: 'dispatch@paccoast.com', equipment_types: '{dry_van,reefer}', home_city: 'Los Angeles', home_state: 'CA', reliability_score: 90, operating_status: 'active' },
    { carrier_name: 'Volunteer Express', mc_number: 'MC-789012', dot_number: '7890123', contact_name: 'Amy Carter', phone: '555-0107', email: 'ops@volunteerexpress.com', equipment_types: '{dry_van}', home_city: 'Nashville', home_state: 'TN', reliability_score: 83, operating_status: 'active' },
    { carrier_name: 'Buckeye Freight Lines', mc_number: 'MC-890123', dot_number: '8901234', contact_name: 'Dan Miller', phone: '555-0108', email: 'dispatch@buckeyefreight.com', equipment_types: '{dry_van,flatbed}', home_city: 'Columbus', home_state: 'OH', reliability_score: 76, operating_status: 'active' },
    { carrier_name: 'Keystone Carriers Inc', mc_number: 'MC-901234', dot_number: '9012345', contact_name: 'Rachel Adams', phone: '555-0109', email: 'ops@keystonecarriers.com', equipment_types: '{reefer,dry_van}', home_city: 'Philadelphia', home_state: 'PA', reliability_score: 87, operating_status: 'active' },
    { carrier_name: 'Evergreen Transport NW', mc_number: 'MC-012345', dot_number: '0123456', contact_name: 'Brian Nguyen', phone: '555-0110', email: 'dispatch@evergreentransport.com', equipment_types: '{dry_van,reefer,flatbed}', home_city: 'Seattle', home_state: 'WA', reliability_score: 91, operating_status: 'active' },
  ];

  for (const c of carriers) {
    await sequelize.query(`
      INSERT INTO lg_carriers (tenant_id, carrier_name, mc_number, dot_number, contact_name, phone, email, equipment_types, home_city, home_state, reliability_score, operating_status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, c.carrier_name, c.mc_number, c.dot_number, c.contact_name, c.phone, c.email, c.equipment_types, c.home_city, c.home_state, c.reliability_score, c.operating_status] });
  }
  counts.carriers = carriers.length;

  // Fetch carrier IDs for FK references
  const [carrierRows] = await sequelize.query(`SELECT id, carrier_name FROM lg_carriers WHERE tenant_id = $1 ORDER BY id`, { bind: [tenant_id] });
  const carrierIds = carrierRows.map(r => r.id);

  // ══════════════════════════════════════════════════════════════════════
  // 2. TRUCKS (20 — 2 per carrier)
  // ══════════════════════════════════════════════════════════════════════
  const makes = ['Freightliner', 'Kenworth', 'Peterbilt', 'Volvo', 'International'];
  const truckCities = [
    { city: 'Atlanta', state: 'GA', lat: 33.7490, lng: -84.3880 },
    { city: 'Dallas', state: 'TX', lat: 32.7767, lng: -96.7970 },
    { city: 'Chicago', state: 'IL', lat: 41.8781, lng: -87.6298 },
    { city: 'Miami', state: 'FL', lat: 25.7617, lng: -80.1918 },
    { city: 'Denver', state: 'CO', lat: 39.7392, lng: -104.9903 },
    { city: 'Los Angeles', state: 'CA', lat: 34.0522, lng: -118.2437 },
    { city: 'Nashville', state: 'TN', lat: 36.1627, lng: -86.7816 },
    { city: 'Columbus', state: 'OH', lat: 39.9612, lng: -82.9988 },
    { city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652 },
    { city: 'Seattle', state: 'WA', lat: 47.6062, lng: -122.3321 },
  ];
  const eqTypes = ['dry_van', 'dry_van', 'dry_van', 'reefer', 'reefer', 'flatbed'];
  const truckStatuses = [
    'available','available','available','available','available','available','available',
    'available','available','available','available','available','available','available',
    'in_transit','in_transit','in_transit','in_transit',
    'maintenance','maintenance'
  ];

  for (let i = 0; i < 20; i++) {
    const carrierIdx = Math.floor(i / 2);
    const loc = truckCities[carrierIdx];
    const truckNum = `T-${1001 + i}`;
    const make = makes[i % makes.length];
    const year = 2019 + (i % 6);
    const eq = eqTypes[i % eqTypes.length];
    const status = truckStatuses[i];
    const odometer = 150000 + Math.floor(Math.random() * 300000);

    await sequelize.query(`
      INSERT INTO lg_trucks (tenant_id, truck_number, carrier_id, make, year, equipment_type, status, current_lat, current_lng, current_city, current_state, odometer)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, truckNum, carrierIds[carrierIdx], make, year, eq, status, loc.lat, loc.lng, loc.city, loc.state, odometer] });
  }
  counts.trucks = 20;

  // Fetch truck IDs
  const [truckRows] = await sequelize.query(`SELECT id, truck_number, carrier_id FROM lg_trucks WHERE tenant_id = $1 ORDER BY id`, { bind: [tenant_id] });
  const truckIds = truckRows.map(r => r.id);

  // ══════════════════════════════════════════════════════════════════════
  // 3. DRIVERS (15)
  // ══════════════════════════════════════════════════════════════════════
  const driverData = [
    { name: 'Carlos Mendez',     phone: '555-2001', email: 'cmendez@email.com',     cdl_class: 'A', endorsements: '{H,N,T}', status: 'available',  hos_drive: 11.0, hos_duty: 14.0, city: 'Atlanta',      state: 'GA', lat: 33.7490, lng: -84.3880, lanes: '[{"from":"GA","to":"NC"},{"from":"GA","to":"FL"}]' },
    { name: 'Derek Thompson',    phone: '555-2002', email: 'dthompson@email.com',   cdl_class: 'A', endorsements: '{N}',     status: 'available',  hos_drive: 9.5,  hos_duty: 12.0, city: 'Atlanta',      state: 'GA', lat: 33.7490, lng: -84.3880, lanes: '[{"from":"GA","to":"SC"}]' },
    { name: 'Maria Santos',      phone: '555-2003', email: 'msantos@email.com',     cdl_class: 'A', endorsements: '{H,N}',   status: 'driving',    hos_drive: 5.0,  hos_duty: 8.0,  city: 'Dallas',       state: 'TX', lat: 32.7767, lng: -96.7970, lanes: '[{"from":"TX","to":"OK"},{"from":"TX","to":"LA"}]' },
    { name: 'Robert King',       phone: '555-2004', email: 'rking@email.com',       cdl_class: 'A', endorsements: '{}',      status: 'available',  hos_drive: 10.0, hos_duty: 13.5, city: 'Dallas',       state: 'TX', lat: 32.7767, lng: -96.7970, lanes: '[{"from":"TX","to":"AR"}]' },
    { name: 'James Wilson',      phone: '555-2005', email: 'jwilson@email.com',     cdl_class: 'A', endorsements: '{N,T}',   status: 'available',  hos_drive: 8.0,  hos_duty: 11.0, city: 'Chicago',      state: 'IL', lat: 41.8781, lng: -87.6298, lanes: '[{"from":"IL","to":"MI"},{"from":"IL","to":"IN"}]' },
    { name: 'Andre Jackson',     phone: '555-2006', email: 'ajackson@email.com',    cdl_class: 'A', endorsements: '{H}',     status: 'resting',    hos_drive: 3.0,  hos_duty: 5.0,  city: 'Chicago',      state: 'IL', lat: 41.8781, lng: -87.6298, lanes: '[{"from":"IL","to":"WI"}]' },
    { name: 'Patricia Gonzalez', phone: '555-2007', email: 'pgonzalez@email.com',   cdl_class: 'A', endorsements: '{N}',     status: 'available',  hos_drive: 11.0, hos_duty: 14.0, city: 'Miami',        state: 'FL', lat: 25.7617, lng: -80.1918, lanes: '[{"from":"FL","to":"GA"},{"from":"FL","to":"AL"}]' },
    { name: 'Steve Patel',       phone: '555-2008', email: 'spatel@email.com',      cdl_class: 'A', endorsements: '{H,N,T}', status: 'available',  hos_drive: 7.5,  hos_duty: 10.0, city: 'Denver',       state: 'CO', lat: 39.7392, lng: -104.9903, lanes: '[{"from":"CO","to":"UT"},{"from":"CO","to":"NM"}]' },
    { name: 'William Brown',     phone: '555-2009', email: 'wbrown@email.com',      cdl_class: 'A', endorsements: '{}',      status: 'driving',    hos_drive: 4.5,  hos_duty: 7.0,  city: 'Los Angeles',  state: 'CA', lat: 34.0522, lng: -118.2437, lanes: '[{"from":"CA","to":"AZ"},{"from":"CA","to":"NV"}]' },
    { name: 'Linda Martinez',    phone: '555-2010', email: 'lmartinez@email.com',   cdl_class: 'A', endorsements: '{N}',     status: 'available',  hos_drive: 10.5, hos_duty: 13.0, city: 'Los Angeles',  state: 'CA', lat: 34.0522, lng: -118.2437, lanes: '[{"from":"CA","to":"OR"}]' },
    { name: 'Frank Harper',      phone: '555-2011', email: 'fharper@email.com',     cdl_class: 'A', endorsements: '{H,N}',   status: 'available',  hos_drive: 11.0, hos_duty: 14.0, city: 'Nashville',    state: 'TN', lat: 36.1627, lng: -86.7816, lanes: '[{"from":"TN","to":"KY"},{"from":"TN","to":"AL"}]' },
    { name: 'Diana Cooper',      phone: '555-2012', email: 'dcooper@email.com',     cdl_class: 'A', endorsements: '{}',      status: 'resting',    hos_drive: 3.5,  hos_duty: 6.0,  city: 'Columbus',     state: 'OH', lat: 39.9612, lng: -82.9988, lanes: '[{"from":"OH","to":"PA"},{"from":"OH","to":"WV"}]' },
    { name: 'Tony Russo',        phone: '555-2013', email: 'trusso@email.com',      cdl_class: 'A', endorsements: '{N,T}',   status: 'available',  hos_drive: 9.0,  hos_duty: 12.5, city: 'Philadelphia', state: 'PA', lat: 39.9526, lng: -75.1652, lanes: '[{"from":"PA","to":"NJ"},{"from":"PA","to":"NY"}]' },
    { name: 'Michael Chang',     phone: '555-2014', email: 'mchang@email.com',      cdl_class: 'A', endorsements: '{H}',     status: 'driving',    hos_drive: 6.0,  hos_duty: 9.0,  city: 'Seattle',      state: 'WA', lat: 47.6062, lng: -122.3321, lanes: '[{"from":"WA","to":"OR"},{"from":"WA","to":"ID"}]' },
    { name: 'Jessica Taylor',    phone: '555-2015', email: 'jtaylor@email.com',     cdl_class: 'A', endorsements: '{N}',     status: 'available',  hos_drive: 10.0, hos_duty: 13.0, city: 'Seattle',      state: 'WA', lat: 47.6062, lng: -122.3321, lanes: '[{"from":"WA","to":"MT"}]' },
  ];

  for (let i = 0; i < driverData.length; i++) {
    const d = driverData[i];
    const carrierIdx = Math.min(Math.floor(i / 1.5), carrierIds.length - 1);
    const truckIdx = Math.min(i, truckIds.length - 1);
    await sequelize.query(`
      INSERT INTO lg_drivers (tenant_id, driver_name, phone, email, cdl_class, endorsements, carrier_id, truck_id, status, hos_drive_remaining, hos_duty_remaining, current_lat, current_lng, current_city, current_state, preferred_lanes, home_city, home_state)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,$18)
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, d.name, d.phone, d.email, d.cdl_class, d.endorsements, carrierIds[carrierIdx], truckIds[truckIdx], d.status, d.hos_drive, d.hos_duty, d.lat, d.lng, d.city, d.state, d.lanes, d.city, d.state] });
  }
  counts.drivers = driverData.length;

  // Fetch driver IDs
  const [driverRows] = await sequelize.query(`SELECT id, driver_name FROM lg_drivers WHERE tenant_id = $1 ORDER BY id`, { bind: [tenant_id] });
  const driverIds = driverRows.map(r => r.id);

  // ══════════════════════════════════════════════════════════════════════
  // 4. SHIPPERS (8)
  // ══════════════════════════════════════════════════════════════════════
  const shippers = [
    { name: 'Walmart Distribution',  contact: 'Jennifer Blake',   phone: '555-3001', email: 'logistics@walmart.com',       city: 'Bentonville',  state: 'AR', rel: 92, vol: 95, pay: 88, growth: 60, churn: 'low',      avg_pay: 22, loads: 480 },
    { name: 'Amazon Fulfillment',    contact: 'David Chen',       phone: '555-3002', email: 'transport@amazon.com',         city: 'Seattle',      state: 'WA', rel: 85, vol: 98, pay: 95, growth: 90, churn: 'low',      avg_pay: 18, loads: 500 },
    { name: 'Home Depot Supply',     contact: 'Mark Stevens',     phone: '555-3003', email: 'freight@homedepot.com',        city: 'Atlanta',      state: 'GA', rel: 78, vol: 80, pay: 82, growth: 55, churn: 'medium',   avg_pay: 30, loads: 320 },
    { name: 'Procter & Gamble',      contact: 'Susan Wright',     phone: '555-3004', email: 'shipping@pg.com',              city: 'Cincinnati',   state: 'OH', rel: 90, vol: 75, pay: 90, growth: 45, churn: 'low',      avg_pay: 25, loads: 250 },
    { name: 'Coca-Cola Bottling',    contact: 'Robert Garcia',    phone: '555-3005', email: 'logistics@coca-cola.com',      city: 'Atlanta',      state: 'GA', rel: 88, vol: 70, pay: 85, growth: 40, churn: 'low',      avg_pay: 28, loads: 200 },
    { name: 'Target Stores',         contact: 'Karen Mitchell',   phone: '555-3006', email: 'transportation@target.com',    city: 'Minneapolis',  state: 'MN', rel: 72, vol: 85, pay: 78, growth: 65, churn: 'medium',   avg_pay: 32, loads: 350 },
    { name: 'Kroger Distribution',   contact: 'Paul Anderson',    phone: '555-3007', email: 'freight@kroger.com',           city: 'Cincinnati',   state: 'OH', rel: 65, vol: 60, pay: 70, growth: 35, churn: 'high',     avg_pay: 38, loads: 150 },
    { name: 'FedEx Ground',          contact: 'Nancy Lee',        phone: '555-3008', email: 'linehaul@fedex.com',           city: 'Memphis',      state: 'TN', rel: 40, vol: 45, pay: 55, growth: 25, churn: 'critical', avg_pay: 45, loads: 50  },
  ];

  for (const s of shippers) {
    await sequelize.query(`
      INSERT INTO lg_shippers (tenant_id, shipper_name, contact_name, phone, email, city, state, relationship_score, volume_score, payment_score, growth_score, churn_risk, avg_payment_days, total_loads_ltm)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, s.name, s.contact, s.phone, s.email, s.city, s.state, s.rel, s.vol, s.pay, s.growth, s.churn, s.avg_pay, s.loads] });
  }
  counts.shippers = shippers.length;

  // Fetch shipper IDs
  const [shipperRows] = await sequelize.query(`SELECT id, shipper_name FROM lg_shippers WHERE tenant_id = $1 ORDER BY id`, { bind: [tenant_id] });
  const shipperIds = shipperRows.map(r => r.id);

  // ══════════════════════════════════════════════════════════════════════
  // 5. LOADS (30)
  // ══════════════════════════════════════════════════════════════════════
  const lanes = [
    { oc: 'Atlanta',      os: 'GA', dc: 'Charlotte',     ds: 'NC', miles: 245,  eq: 'dry_van' },
    { oc: 'Dallas',       os: 'TX', dc: 'Houston',       ds: 'TX', miles: 240,  eq: 'dry_van' },
    { oc: 'Chicago',      os: 'IL', dc: 'Detroit',       ds: 'MI', miles: 280,  eq: 'dry_van' },
    { oc: 'Miami',        os: 'FL', dc: 'Jacksonville',  ds: 'FL', miles: 350,  eq: 'reefer' },
    { oc: 'Denver',       os: 'CO', dc: 'Salt Lake City', ds: 'UT', miles: 525, eq: 'dry_van' },
    { oc: 'Los Angeles',  os: 'CA', dc: 'Phoenix',       ds: 'AZ', miles: 370,  eq: 'dry_van' },
    { oc: 'Nashville',    os: 'TN', dc: 'Memphis',       ds: 'TN', miles: 210,  eq: 'flatbed' },
    { oc: 'Columbus',     os: 'OH', dc: 'Pittsburgh',    ds: 'PA', miles: 185,  eq: 'dry_van' },
    { oc: 'Philadelphia', os: 'PA', dc: 'New York',      ds: 'NY', miles: 95,   eq: 'reefer' },
    { oc: 'Seattle',      os: 'WA', dc: 'Portland',      ds: 'OR', miles: 175,  eq: 'dry_van' },
    { oc: 'Atlanta',      os: 'GA', dc: 'Miami',         ds: 'FL', miles: 660,  eq: 'reefer' },
    { oc: 'Chicago',      os: 'IL', dc: 'St. Louis',     ds: 'MO', miles: 300,  eq: 'dry_van' },
    { oc: 'Dallas',       os: 'TX', dc: 'Atlanta',       ds: 'GA', miles: 780,  eq: 'dry_van' },
    { oc: 'Los Angeles',  os: 'CA', dc: 'Las Vegas',     ds: 'NV', miles: 270,  eq: 'flatbed' },
    { oc: 'Denver',       os: 'CO', dc: 'Kansas City',   ds: 'MO', miles: 600,  eq: 'dry_van' },
    { oc: 'Atlanta',      os: 'GA', dc: 'Savannah',      ds: 'GA', miles: 250,  eq: 'dry_van' },
    { oc: 'Houston',      os: 'TX', dc: 'San Antonio',   ds: 'TX', miles: 200,  eq: 'reefer' },
    { oc: 'Chicago',      os: 'IL', dc: 'Indianapolis',  ds: 'IN', miles: 180,  eq: 'dry_van' },
    { oc: 'Miami',        os: 'FL', dc: 'Tampa',         ds: 'FL', miles: 280,  eq: 'dry_van' },
    { oc: 'Seattle',      os: 'WA', dc: 'Boise',         ds: 'ID', miles: 500,  eq: 'dry_van' },
    { oc: 'Nashville',    os: 'TN', dc: 'Louisville',    ds: 'KY', miles: 175,  eq: 'dry_van' },
    { oc: 'Philadelphia', os: 'PA', dc: 'Baltimore',     ds: 'MD', miles: 100,  eq: 'dry_van' },
    { oc: 'Columbus',     os: 'OH', dc: 'Cincinnati',    ds: 'OH', miles: 110,  eq: 'flatbed' },
    { oc: 'Dallas',       os: 'TX', dc: 'Oklahoma City', ds: 'OK', miles: 205,  eq: 'dry_van' },
    { oc: 'Los Angeles',  os: 'CA', dc: 'San Francisco', ds: 'CA', miles: 380,  eq: 'reefer' },
    { oc: 'Atlanta',      os: 'GA', dc: 'Birmingham',    ds: 'AL', miles: 150,  eq: 'dry_van' },
    { oc: 'Chicago',      os: 'IL', dc: 'Milwaukee',     ds: 'WI', miles: 92,   eq: 'dry_van' },
    { oc: 'Denver',       os: 'CO', dc: 'Albuquerque',   ds: 'NM', miles: 450,  eq: 'dry_van' },
    { oc: 'Miami',        os: 'FL', dc: 'Atlanta',       ds: 'GA', miles: 660,  eq: 'dry_van' },
    { oc: 'Seattle',      os: 'WA', dc: 'Spokane',       ds: 'WA', miles: 280,  eq: 'flatbed' },
  ];

  // status distribution: 10 open, 8 covered, 5 dispatched, 4 in_transit, 3 delivered
  const loadStatuses = [
    'open','open','open','open','open','open','open','open','open','open',
    'covered','covered','covered','covered','covered','covered','covered','covered',
    'dispatched','dispatched','dispatched','dispatched','dispatched',
    'in_transit','in_transit','in_transit','in_transit',
    'delivered','delivered','delivered'
  ];

  for (let i = 0; i < 30; i++) {
    const lane = lanes[i];
    const status = loadStatuses[i];
    const dayOffset = Math.floor(-3 + (i / 30) * 10); // -3 to +7
    const pickupDate = dateOffset(dayOffset);
    const deliveryDate = dateOffset(dayOffset + Math.ceil(lane.miles / 500) + 1);
    const buyRate = 800 + Math.floor(lane.miles * (1.8 + Math.random() * 1.2));
    const marginMult = 1.12 + Math.random() * 0.13;
    const sellRate = Math.round(buyRate * marginMult);
    const rpm = (sellRate / lane.miles).toFixed(2);
    const margin = sellRate - buyRate;
    const marginPct = ((margin / sellRate) * 100).toFixed(2);
    const loadRef = `FM-${String(10001 + i)}`;
    const weight = 20000 + Math.floor(Math.random() * 25000);
    const shipperIdx = i % shipperIds.length;
    // Assign carrier for covered/dispatched/in_transit/delivered
    const assignedCarrier = (status !== 'open') ? carrierIds[i % carrierIds.length] : null;

    await sequelize.query(`
      INSERT INTO lg_loads (tenant_id, load_ref, shipper_name, origin_city, origin_state, destination_city, destination_state, pickup_date, delivery_date, equipment_type, weight_lbs, miles, buy_rate, sell_rate, margin, margin_pct, rate_per_mile, assigned_carrier_id, status, customer_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, loadRef, shippers[shipperIdx].name, lane.oc, lane.os, lane.dc, lane.ds, pickupDate, deliveryDate, lane.eq, weight, lane.miles, buyRate, sellRate, margin, marginPct, rpm, assignedCarrier, status, shipperIds[shipperIdx]] });
  }
  counts.loads = 30;

  // Fetch load IDs
  const [loadRows] = await sequelize.query(`SELECT id, load_ref, status FROM lg_loads WHERE tenant_id = $1 ORDER BY id`, { bind: [tenant_id] });
  const loadIds = loadRows.map(r => r.id);

  // ══════════════════════════════════════════════════════════════════════
  // 6. QUOTES (20)
  // ══════════════════════════════════════════════════════════════════════
  const quoteOutcomes = [
    'won','won','won','won','won','won','won','won',
    'lost','lost','lost','lost','lost','lost',
    'pending','pending','pending','pending',
    'expired','expired'
  ];

  for (let i = 0; i < 20; i++) {
    const lane = lanes[i % lanes.length];
    const outcome = quoteOutcomes[i];
    const marketRate = 800 + Math.floor(lane.miles * 2.2);
    const quotedRate = marketRate + Math.floor((Math.random() - 0.3) * 200);
    const quotedRpm = (quotedRate / lane.miles).toFixed(2);
    let winningRate = null;
    let deltaFromWinner = null;
    let lossReason = null;
    const autoQuoted = Math.random() < 0.3;

    if (outcome === 'won') {
      winningRate = quotedRate;
    } else if (outcome === 'lost') {
      const delta = -(50 + Math.floor(Math.random() * 150));
      deltaFromWinner = delta;
      winningRate = quotedRate + delta;
      lossReason = ['price','relationship','service_level','capacity'][i % 4];
    }

    const shipperIdx = i % shipperIds.length;
    const laneStr = `${lane.oc}, ${lane.os} → ${lane.dc}, ${lane.ds}`;

    await sequelize.query(`
      INSERT INTO lg_quotes (tenant_id, shipper_id, lane, origin_city, origin_state, destination_city, destination_state, equipment_type, quoted_rate, quoted_rpm, market_rate_at_quote, outcome, winning_rate, delta_from_winner, loss_reason, auto_quoted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, shipperIds[shipperIdx], laneStr, lane.oc, lane.os, lane.dc, lane.ds, lane.eq, quotedRate, quotedRpm, marketRate, outcome, winningRate, deltaFromWinner, lossReason, autoQuoted] });
  }
  counts.quotes = 20;

  // ══════════════════════════════════════════════════════════════════════
  // 7. RATE BENCHMARKS (15 lanes)
  // ══════════════════════════════════════════════════════════════════════
  const benchmarkLanes = [
    { oc: 'Atlanta',      os: 'GA', dc: 'Charlotte',      ds: 'NC', avg: 850,  min: 680,  max: 1050 },
    { oc: 'Dallas',       os: 'TX', dc: 'Houston',        ds: 'TX', avg: 820,  min: 650,  max: 980  },
    { oc: 'Chicago',      os: 'IL', dc: 'Detroit',        ds: 'MI', avg: 900,  min: 720,  max: 1100 },
    { oc: 'Miami',        os: 'FL', dc: 'Jacksonville',   ds: 'FL', avg: 1100, min: 880,  max: 1350 },
    { oc: 'Denver',       os: 'CO', dc: 'Salt Lake City', ds: 'UT', avg: 1500, min: 1200, max: 1850 },
    { oc: 'Los Angeles',  os: 'CA', dc: 'Phoenix',        ds: 'AZ', avg: 1200, min: 950,  max: 1500 },
    { oc: 'New York',     os: 'NY', dc: 'Philadelphia',   ds: 'PA', avg: 500,  min: 380,  max: 650  },
    { oc: 'Atlanta',      os: 'GA', dc: 'Miami',          ds: 'FL', avg: 1800, min: 1450, max: 2200 },
    { oc: 'Chicago',      os: 'IL', dc: 'St. Louis',      ds: 'MO', avg: 950,  min: 760,  max: 1180 },
    { oc: 'Dallas',       os: 'TX', dc: 'Atlanta',        ds: 'GA', avg: 2200, min: 1800, max: 2700 },
    { oc: 'Seattle',      os: 'WA', dc: 'Portland',       ds: 'OR', avg: 680,  min: 520,  max: 850  },
    { oc: 'Nashville',    os: 'TN', dc: 'Memphis',        ds: 'TN', avg: 750,  min: 580,  max: 920  },
    { oc: 'Columbus',     os: 'OH', dc: 'Pittsburgh',     ds: 'PA', avg: 700,  min: 540,  max: 880  },
    { oc: 'Los Angeles',  os: 'CA', dc: 'Las Vegas',      ds: 'NV', avg: 900,  min: 700,  max: 1100 },
    { oc: 'Denver',       os: 'CO', dc: 'Kansas City',    ds: 'MO', avg: 1650, min: 1320, max: 2000 },
  ];

  for (const b of benchmarkLanes) {
    const rpmAvg = (b.avg / 300).toFixed(2); // rough avg
    const rpmP25 = (b.min / 300).toFixed(2);
    const rpmP75 = (b.max / 300).toFixed(2);
    await sequelize.query(`
      INSERT INTO lg_rate_benchmarks (tenant_id, origin_city, origin_state, destination_city, destination_state, equipment_type, avg_rate, min_rate, max_rate, rate_per_mile_avg, rate_per_mile_p25, rate_per_mile_p75, rate_date, sample_size, confidence, benchmark_source)
      VALUES ($1,$2,$3,$4,$5,'dry_van',$6,$7,$8,$9,$10,$11,CURRENT_DATE,$12,'high','internal')
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, b.oc, b.os, b.dc, b.ds, b.avg, b.min, b.max, rpmAvg, rpmP25, rpmP75, 30 + Math.floor(Math.random() * 70)] });
  }
  counts.rate_benchmarks = benchmarkLanes.length;

  // ══════════════════════════════════════════════════════════════════════
  // 8. DISPATCHES (7 — for dispatched + in_transit loads)
  // ══════════════════════════════════════════════════════════════════════
  const dispatchLoads = loadRows.filter(r => ['dispatched', 'in_transit'].includes(r.status));
  let dispatchCount = 0;
  for (let i = 0; i < Math.min(7, dispatchLoads.length); i++) {
    const load = dispatchLoads[i];
    const driverIdx = i % driverIds.length;
    const truckIdx = i % truckIds.length;
    const status = load.status === 'in_transit' ? 'in_transit' : 'assigned';
    await sequelize.query(`
      INSERT INTO lg_dispatches (tenant_id, load_id, driver_id, truck_id, status, route_miles, deadhead_miles)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, load.id, driverIds[driverIdx], truckIds[truckIdx], status, lanes[i % lanes.length].miles, 15 + Math.floor(Math.random() * 80)] });
    dispatchCount++;
  }
  counts.dispatches = dispatchCount;

  // ══════════════════════════════════════════════════════════════════════
  // 9. COMPLIANCE RECORDS (10)
  // ══════════════════════════════════════════════════════════════════════
  const complianceRecords = [
    { entity_type: 'carrier', entity_idx: 0, type: 'general_liability_insurance', status: 'current',       eff: dateOffset(-180), exp: dateOffset(185) },
    { entity_type: 'carrier', entity_idx: 1, type: 'cargo_insurance',             status: 'current',       eff: dateOffset(-90),  exp: dateOffset(275) },
    { entity_type: 'carrier', entity_idx: 2, type: 'auto_liability_insurance',    status: 'expiring_soon', eff: dateOffset(-350), exp: dateOffset(15)  },
    { entity_type: 'driver',  entity_idx: 0, type: 'cdl_license',                 status: 'current',       eff: dateOffset(-400), exp: dateOffset(330) },
    { entity_type: 'driver',  entity_idx: 1, type: 'medical_certificate',         status: 'current',       eff: dateOffset(-200), exp: dateOffset(165) },
    { entity_type: 'driver',  entity_idx: 2, type: 'cdl_license',                 status: 'expiring_soon', eff: dateOffset(-700), exp: dateOffset(25)  },
    { entity_type: 'driver',  entity_idx: 3, type: 'drug_test',                   status: 'current',       eff: dateOffset(-60),  exp: dateOffset(305) },
    { entity_type: 'truck',   entity_idx: 0, type: 'annual_inspection',           status: 'current',       eff: dateOffset(-120), exp: dateOffset(245) },
    { entity_type: 'truck',   entity_idx: 1, type: 'registration',                status: 'expiring_soon', eff: dateOffset(-340), exp: dateOffset(20)  },
    { entity_type: 'truck',   entity_idx: 2, type: 'annual_inspection',           status: 'expired',       eff: dateOffset(-400), exp: dateOffset(-5)  },
  ];

  for (const c of complianceRecords) {
    let entityId;
    if (c.entity_type === 'carrier') entityId = carrierIds[c.entity_idx];
    else if (c.entity_type === 'driver') entityId = driverIds[c.entity_idx];
    else entityId = truckIds[c.entity_idx];

    await sequelize.query(`
      INSERT INTO lg_compliance (tenant_id, entity_type, entity_id, compliance_type, status, effective_date, expiry_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING
    `, { bind: [tenant_id, c.entity_type, entityId, c.type, c.status, c.eff, c.exp] });
  }
  counts.compliance = complianceRecords.length;

  return {
    message: `Demo data seeded successfully for tenant "${tenant_id}"`,
    counts
  };
}

module.exports = { seedDemoData };
