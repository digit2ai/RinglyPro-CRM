#!/usr/bin/env node
/**
 * $55M ARR Freight Broker Demo Seed
 * Inserts realistic data across 14 tables for a $55M/year brokerage.
 * Revenue: $55M, Operating cost ~$46.75M (85%), Gross margin ~$8.25M (15%)
 *
 * Run: /opt/homebrew/bin/node scripts/seed_55m_demo.js
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const TENANT = 'logistics';

// ── Helpers ──────────────────────────────────────────────────────────
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pickN(arr, n) { const s = [...arr]; for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s.slice(0, n); }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max, dec = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(dec)); }
function randPhone() { return `+1${randInt(200,999)}${randInt(200,999)}${randInt(1000,9999)}`; }
function randDate(s, e) { const st = new Date(s).getTime(), en = new Date(e).getTime(); return new Date(st + Math.random() * (en - st)); }
function fmtDate(d) { return d.toISOString().split('T')[0]; }
function fmtTs(d) { return d.toISOString().replace('T', ' ').replace('Z', ''); }
function pad(n, len) { return String(n).padStart(len, '0'); }

// ── Static Data ──────────────────────────────────────────────────────
const CARRIER_NAMES = [
  'Swift Transport LLC','Eagle Freight Inc','Patriot Trucking Corp','Sunbelt Carriers LLC',
  'Mountain West Transport','Pacific Coast Logistics','Volunteer Express Inc','Buckeye Freight Systems',
  'Keystone Carriers Inc','Evergreen Transport LLC','Palmetto Freight LLC','Dixie Line Trucking',
  'Great Lakes Express','Lone Star Freight','Blue Ridge Transport','Peach State Carriers',
  'Tri-State Hauling Inc','Heartland Trucking Co','Southern Cross Freight','Cardinal Logistics LLC',
  'Coastal Freight Lines','Appalachian Transport','Thunder Road Express','Wolverine Freight Inc',
  'Prairie Wind Trucking','Gulf Coast Carriers','Magnolia Transport LLC','Northstar Logistics',
  'Redline Freight Corp','Tidewater Trucking',
  'Seminole Express','Panhandle Freight LLC','Smoky Mountain Haulers','Iron Horse Transport',
  'Copperhead Carriers','Delta Route Express','Allegheny Freight Co','Sunshine State Hauling',
  'Carolina Freight Corp','Empire State Trucking','Cypress Creek Freight','Badger Freight Inc',
  'Razorback Logistics','Hoosier Express LLC','Dogwood Transport Inc','Black Bear Trucking',
  'Pinnacle Freight LLC','Okefenokee Carriers','Shenandoah Freight','Northland Express'
];

const CONTACT_FIRST = ['James','Maria','Robert','Patricia','Michael','Jennifer','David','Linda','William','Sarah',
  'Thomas','Jessica','John','Karen','Daniel','Nancy','Kevin','Lisa','Mark','Michelle','Brian','Angela','Steven','Amy',
  'Jason','Stephanie','Chris','Rebecca','Dennis','Nicole'];
const CONTACT_LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez',
  'Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson'];

const STATES = ['FL','GA','MI','VA','NC','OH','NJ','PA','ID'];
const CITIES_BY_STATE = {
  FL: ['Miami','Jacksonville','Tampa','Orlando','Fort Lauderdale','Lakeland','Ocala','Pensacola','Tallahassee','Port St. Lucie'],
  GA: ['Atlanta','Savannah','Augusta','Macon','Columbus','Athens','Albany','Valdosta','Dalton','Marietta'],
  MI: ['Detroit','Grand Rapids','Lansing','Kalamazoo','Flint','Saginaw','Ann Arbor','Traverse City','Battle Creek','Muskegon'],
  VA: ['Richmond','Norfolk','Virginia Beach','Roanoke','Lynchburg','Chesapeake','Alexandria','Fredericksburg','Charlottesville','Danville'],
  NC: ['Charlotte','Raleigh','Greensboro','Durham','Winston-Salem','Fayetteville','Wilmington','Asheville','High Point','Greenville'],
  OH: ['Columbus','Cleveland','Cincinnati','Toledo','Akron','Dayton','Youngstown','Canton','Mansfield','Lima'],
  NJ: ['Newark','Jersey City','Elizabeth','Edison','Trenton','Camden','Clifton','Paterson','Woodbridge','Toms River'],
  PA: ['Philadelphia','Pittsburgh','Allentown','Harrisburg','Scranton','Lancaster','York','Reading','Erie','Bethlehem'],
  ID: ['Boise','Nampa','Meridian','Idaho Falls','Pocatello','Twin Falls','Caldwell','Lewiston','Coeur d\'Alene','Moscow']
};

const COMMODITIES = ['Refrigerated Produce','Frozen Seafood','Dairy Products','Beverages','Packaged Foods',
  'Snack Products','Frozen Meals','Paper Products','Building Materials','Automotive Parts',
  'Electronics','Machinery','Lumber','Steel Coils','Chemicals','Pharmaceuticals',
  'Fresh Meat','Bottled Water','Canned Goods','Pet Food','Household Goods','Office Supplies'];

const TRUCK_MAKES = { Freightliner: 15, Kenworth: 10, Peterbilt: 8, Volvo: 4, International: 3 };
const TRUCK_MODELS = {
  Freightliner: ['Cascadia','Columbia','Century'],
  Kenworth: ['T680','W900','T880'],
  Peterbilt: ['579','389','567'],
  Volvo: ['VNL','VNR','VHD'],
  International: ['LT','RH','HV']
};

const DRIVER_NAMES = [
  'Carlos Mendez','Travis Walker','Danny Brooks','Ray Patterson','Miguel Santos',
  'Bobby Fisher','Terrence Hayes','Frank Morrison','Eddie Nguyen','Jerome Coleman',
  'Pete Ramirez','Tony Sullivan','Hector Diaz','Wayne Rogers','Daryl Washington',
  'Kenny Phillips','Jose Rivera','Luke Bennett','Marcus Green','Sam Torres',
  'Rick Palmer','Chad Hudson','Victor Reyes','Nate Campbell','Oscar Vargas',
  'Derek Hart','Gene Foster','Rudy Gutierrez','Manny Flores','Brett Mason'
];

const SHIPPER_LIST = [
  { name: 'PepsiCo', loads: 420, contact: 'Sarah Mitchell', email: 'smitchell@pepsico.com', terms: 'net_30' },
  { name: 'Spartan Nash', loads: 168, contact: 'David Park', email: 'dpark@spartannash.com', terms: 'net_30' },
  { name: 'Performance Food Group', loads: 144, contact: 'Rachel Torres', email: 'rtorres@pfgc.com', terms: 'net_45' },
  { name: 'Coca-Cola', loads: 120, contact: 'Mark Reynolds', email: 'mreynolds@cocacola.com', terms: 'net_30' },
  { name: 'Kroger', loads: 96, contact: 'Jennifer Adams', email: 'jadams@kroger.com', terms: 'net_45' },
  { name: 'Target', loads: 84, contact: 'Chris Nguyen', email: 'cnguyen@target.com', terms: 'net_30' },
  { name: 'FedEx Ground', loads: 60, contact: 'Brian Walsh', email: 'bwalsh@fedex.com', terms: 'net_15' },
  { name: 'Boise Paper', loads: 48, contact: 'Amy Stewart', email: 'astewart@boisepaper.com', terms: 'net_60' },
  { name: 'Sysco', loads: 36, contact: 'Tom Henderson', email: 'thenderson@sysco.com', terms: 'net_30' },
  { name: 'Publix', loads: 24, contact: 'Lisa Morales', email: 'lmorales@publix.com', terms: 'net_30' }
];

function pickCity() {
  const st = pick(STATES);
  return { city: pick(CITIES_BY_STATE[st]), state: st };
}

// ══════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════
async function main() {
  console.log('Connecting to database...');
  await sequelize.authenticate();
  console.log('Connected. Starting $55M demo seed...\n');

  // ── 0. CREATE TABLES IF MISSING ──
  console.log('Step 0: Ensuring all tables exist...');
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lg_carriers (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      carrier_name VARCHAR(255) NOT NULL, mc_number VARCHAR(20), dot_number VARCHAR(20),
      contact_name VARCHAR(255), phone VARCHAR(50), email VARCHAR(255),
      equipment_types TEXT[] DEFAULT '{}', service_lanes JSONB DEFAULT '[]', service_regions TEXT[] DEFAULT '{}',
      home_city VARCHAR(255), home_state VARCHAR(10), home_zip VARCHAR(20),
      total_loads_completed INTEGER DEFAULT 0, total_loads_offered INTEGER DEFAULT 0,
      acceptance_rate NUMERIC(5,2) DEFAULT 0, on_time_delivery_pct NUMERIC(5,2) DEFAULT 0,
      avg_rate_per_mile NUMERIC(8,2), preferred_min_rate NUMERIC(8,2),
      safety_rating VARCHAR(50), insurance_expiry DATE,
      operating_status VARCHAR(50) DEFAULT 'active', reliability_score NUMERIC(5,2) DEFAULT 50,
      last_load_date DATE, notes TEXT,
      source VARCHAR(30) DEFAULT 'manual', upload_batch_id INTEGER,
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_customers (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      customer_name VARCHAR(255) NOT NULL, contact_name VARCHAR(255), phone VARCHAR(50), email VARCHAR(255),
      billing_address TEXT, payment_terms VARCHAR(50) DEFAULT 'net_30',
      credit_limit NUMERIC(12,2), total_loads INTEGER DEFAULT 0, total_revenue NUMERIC(14,2) DEFAULT 0,
      avg_margin_pct NUMERIC(5,2), top_lanes JSONB DEFAULT '[]', default_equipment VARCHAR(50),
      service_level VARCHAR(30) DEFAULT 'standard', penalty_exposure NUMERIC(12,2) DEFAULT 0,
      notes TEXT, source VARCHAR(30) DEFAULT 'manual', upload_batch_id INTEGER,
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_loads (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      load_ref VARCHAR(50) UNIQUE, external_ref VARCHAR(100), customer_id INTEGER,
      shipper_name VARCHAR(255), origin_city VARCHAR(255), origin_state VARCHAR(10),
      origin_zip VARCHAR(20), origin_full VARCHAR(500),
      destination_city VARCHAR(255), destination_state VARCHAR(10), destination_zip VARCHAR(20), destination_full VARCHAR(500),
      pickup_date DATE, pickup_window_start TIMESTAMP, pickup_window_end TIMESTAMP,
      delivery_date DATE, delivery_window_start TIMESTAMP, delivery_window_end TIMESTAMP,
      equipment_type VARCHAR(50) DEFAULT 'dry_van', trailer_type VARCHAR(50),
      weight_lbs NUMERIC(10,2), pieces INTEGER, commodity VARCHAR(255), miles NUMERIC(8,1),
      buy_rate NUMERIC(12,2), sell_rate NUMERIC(12,2), margin NUMERIC(12,2), margin_pct NUMERIC(5,2),
      rate_per_mile NUMERIC(8,2), assigned_carrier_id INTEGER, assigned_driver VARCHAR(255),
      dispatcher_id INTEGER,
      status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open','quoted','covered','dispatched','in_transit','delivered','invoiced','paid','cancelled')),
      priority VARCHAR(20) DEFAULT 'normal', temperature_min NUMERIC(5,1), temperature_max NUMERIC(5,1),
      hazmat BOOLEAN DEFAULT false, hazmat_class VARCHAR(20), special_instructions TEXT,
      source VARCHAR(30) DEFAULT 'manual', upload_batch_id INTEGER, tags JSONB DEFAULT '[]',
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_rate_benchmarks (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      origin_state VARCHAR(10), origin_city VARCHAR(255), destination_state VARCHAR(10), destination_city VARCHAR(255),
      equipment_type VARCHAR(50) DEFAULT 'dry_van', mileage_band VARCHAR(20),
      benchmark_source VARCHAR(50) DEFAULT 'internal',
      rate_date DATE, avg_rate NUMERIC(12,2), min_rate NUMERIC(12,2), max_rate NUMERIC(12,2),
      rate_per_mile_avg NUMERIC(8,2), rate_per_mile_p25 NUMERIC(8,2), rate_per_mile_p75 NUMERIC(8,2),
      sample_size INTEGER DEFAULT 0, confidence VARCHAR(20) DEFAULT 'medium',
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_drivers (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      driver_name VARCHAR(255) NOT NULL, phone VARCHAR(50), email VARCHAR(255),
      cdl_number VARCHAR(50), cdl_state VARCHAR(10), cdl_expiry DATE, cdl_class VARCHAR(5) DEFAULT 'A',
      endorsements TEXT[] DEFAULT '{}', carrier_id INTEGER, truck_id INTEGER,
      home_city VARCHAR(255), home_state VARCHAR(10),
      status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','assigned','driving','resting','off_duty','inactive')),
      hos_drive_remaining NUMERIC(4,1) DEFAULT 11.0, hos_duty_remaining NUMERIC(4,1) DEFAULT 14.0,
      hos_cycle_remaining NUMERIC(5,1) DEFAULT 70.0, hos_last_update TIMESTAMP,
      current_lat NUMERIC(10,7), current_lng NUMERIC(10,7), current_city VARCHAR(255), current_state VARCHAR(10),
      preferred_lanes JSONB DEFAULT '[]',
      drug_test_last DATE, drug_test_next DATE,
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_trucks (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      truck_number VARCHAR(50) NOT NULL, carrier_id INTEGER, vin VARCHAR(20),
      make VARCHAR(50), model VARCHAR(50), year INTEGER,
      equipment_type VARCHAR(50) DEFAULT 'dry_van',
      status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','assigned','in_transit','maintenance','out_of_service')),
      current_lat NUMERIC(10,7), current_lng NUMERIC(10,7), current_city VARCHAR(255), current_state VARCHAR(10),
      last_position_update TIMESTAMP, odometer INTEGER, next_pm_due_miles INTEGER, next_inspection_date DATE,
      insurance_expiry DATE, registration_expiry DATE,
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_compliance (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      entity_type VARCHAR(20) NOT NULL CHECK (entity_type IN ('driver','truck','carrier')),
      entity_id INTEGER NOT NULL,
      compliance_type VARCHAR(50) NOT NULL,
      status VARCHAR(20) DEFAULT 'current' CHECK (status IN ('current','expiring_soon','expired','pending','waived')),
      effective_date DATE, expiry_date DATE, document_url TEXT, notes TEXT,
      alert_sent BOOLEAN DEFAULT false, metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_dispatches (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      load_id INTEGER, driver_id INTEGER, truck_id INTEGER,
      dispatched_at TIMESTAMP DEFAULT NOW(), pickup_eta TIMESTAMP, delivery_eta TIMESTAMP,
      actual_pickup TIMESTAMP, actual_delivery TIMESTAMP,
      status VARCHAR(20) DEFAULT 'assigned' CHECK (status IN ('assigned','en_route_pickup','at_pickup','loaded','in_transit','at_delivery','delivered','cancelled')),
      route_miles NUMERIC(8,1), deadhead_miles NUMERIC(8,1),
      detention_minutes INTEGER DEFAULT 0, detention_charges NUMERIC(10,2) DEFAULT 0,
      notes TEXT, metadata JSONB DEFAULT '{}',
      created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_quotes (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      load_id INTEGER, shipper_id INTEGER, rfp_id INTEGER, lane VARCHAR(255),
      origin_city VARCHAR(255), origin_state VARCHAR(10), destination_city VARCHAR(255), destination_state VARCHAR(10),
      equipment_type VARCHAR(50) DEFAULT 'dry_van',
      quoted_rate NUMERIC(12,2), quoted_rpm NUMERIC(8,2), market_rate_at_quote NUMERIC(12,2),
      margin_target_pct NUMERIC(5,2),
      source VARCHAR(30) DEFAULT 'spot',
      outcome VARCHAR(20) CHECK (outcome IN ('pending','won','lost','expired','withdrawn')),
      winning_rate NUMERIC(12,2), delta_from_winner NUMERIC(12,2), loss_reason VARCHAR(100),
      responded_at TIMESTAMP, decided_at TIMESTAMP, auto_quoted BOOLEAN DEFAULT false,
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS lg_tracking_events (
      id SERIAL PRIMARY KEY, tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
      truck_id INTEGER, driver_id INTEGER, load_id INTEGER,
      event_type VARCHAR(30) NOT NULL CHECK (event_type IN ('position','geofence_enter','geofence_exit','speed_alert','idle_alert','hos_warning','departure','arrival','delay','weather')),
      lat NUMERIC(10,7), lng NUMERIC(10,7), city VARCHAR(255), state VARCHAR(10),
      speed_mph NUMERIC(5,1), heading NUMERIC(5,1), notes TEXT,
      metadata JSONB DEFAULT '{}', created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cw_contacts (
      id SERIAL PRIMARY KEY, hubspot_id VARCHAR(64) UNIQUE,
      contact_type VARCHAR(20) NOT NULL CHECK (contact_type IN ('shipper','carrier','driver','prospect')),
      company_name VARCHAR(255), full_name VARCHAR(255), email VARCHAR(255), phone VARCHAR(32),
      freight_types TEXT[], lanes TEXT[], volume_estimate VARCHAR(64),
      hubspot_synced_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cw_loads (
      id SERIAL PRIMARY KEY, hubspot_deal_id VARCHAR(64) UNIQUE,
      load_ref VARCHAR(64), origin VARCHAR(255), destination VARCHAR(255),
      freight_type VARCHAR(32), weight_lbs INTEGER, pickup_date DATE, delivery_date DATE,
      rate_usd NUMERIC(10,2), status VARCHAR(32) DEFAULT 'open',
      shipper_id INTEGER, carrier_id INTEGER, broker_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cw_call_logs (
      id SERIAL PRIMARY KEY, call_sid VARCHAR(64) UNIQUE,
      direction VARCHAR(8), call_type VARCHAR(32),
      contact_id INTEGER, load_id INTEGER,
      from_number VARCHAR(32), to_number VARCHAR(32),
      duration_sec INTEGER, transcript TEXT, ai_summary TEXT, outcome VARCHAR(32),
      hubspot_logged BOOLEAN DEFAULT FALSE, escalated_to VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cw_hubspot_sync (
      id SERIAL PRIMARY KEY, object_type VARCHAR(32), object_id VARCHAR(64),
      action VARCHAR(16), payload JSONB, status VARCHAR(16) DEFAULT 'pending',
      error_msg TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  // Add extension columns if missing
  await sequelize.query(`
    DO $$ BEGIN ALTER TABLE cw_loads ADD COLUMN shipper_rate NUMERIC(10,2); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE cw_loads ADD COLUMN commodity VARCHAR(255); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE cw_loads ADD COLUMN equipment_type VARCHAR(64); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE cw_contacts ADD COLUMN mc_number VARCHAR(32); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE cw_contacts ADD COLUMN dot_number VARCHAR(32); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE cw_contacts ADD COLUMN title VARCHAR(128); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE cw_contacts ADD COLUMN insurance_expiry DATE; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    DO $$ BEGIN ALTER TABLE cw_contacts ADD COLUMN safety_rating VARCHAR(16); EXCEPTION WHEN duplicate_column THEN NULL; END $$;
  `);
  console.log('  Tables ensured.\n');

  // ── 1. CLEAR OLD DATA ──
  console.log('Step 1: Clearing existing data...');
  const clearTables = [
    'cw_hubspot_sync','cw_call_logs','cw_contacts',
    'lg_tracking_events','lg_quotes','lg_dispatches','lg_compliance',
    'lg_trucks','lg_drivers','lg_rate_benchmarks',
    'cw_loads','lg_loads','lg_customers','lg_carriers'
  ];
  for (const t of clearTables) {
    try {
      await sequelize.query(`DELETE FROM ${t} WHERE true`);
    } catch (e) {
      console.log(`  (skip clear ${t}: ${e.message.slice(0,60)})`);
    }
  }
  console.log('  Cleared.\n');

  // ══════════════════════════════════════════════════════════════════
  // TABLE 1: lg_carriers — 50 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_carriers (50)...');
  const carrierIds = [];
  for (let i = 0; i < 50; i++) {
    const loc = pickCity();
    let opStatus = 'active';
    let relScore;
    if (i < 5) { opStatus = 'suspended'; relScore = randFloat(40, 65); }
    else if (i < 13) { relScore = randFloat(50, 69); }
    else { relScore = randFloat(75, 95); }
    const eqArr = i % 3 === 0 ? '{reefer,dry_van}' : i % 3 === 1 ? '{reefer}' : '{dry_van,flatbed}';
    const fn = pick(CONTACT_FIRST), ln = pick(CONTACT_LAST);
    const [row] = await sequelize.query(`
      INSERT INTO lg_carriers (tenant_id, carrier_name, mc_number, dot_number, operating_status,
        reliability_score, equipment_types, home_city, home_state, phone, email, contact_name)
      VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11,$12)
      ON CONFLICT DO NOTHING RETURNING id`,
      { bind: [TENANT, CARRIER_NAMES[i], `MC${700000+i}`, `${2000000+i}`, opStatus,
        relScore, eqArr, loc.city, loc.state, randPhone(),
        `${fn.toLowerCase()}.${ln.toLowerCase()}@${CARRIER_NAMES[i].toLowerCase().replace(/[\s,.']+/g,'')}\.com`,
        `${fn} ${ln}`],
        type: QueryTypes.SELECT });
    if (row) carrierIds.push(row.id);
  }
  console.log(`  Inserted ${carrierIds.length} carriers.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 10: lg_customers — 10 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_customers (10)...');
  const customerIds = {};
  for (const s of SHIPPER_LIST) {
    const [row] = await sequelize.query(`
      INSERT INTO lg_customers (tenant_id, customer_name, contact_name, phone, email, payment_terms)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT DO NOTHING RETURNING id`,
      { bind: [TENANT, s.name, s.contact, randPhone(), s.email, s.terms], type: QueryTypes.SELECT });
    if (row) customerIds[s.name] = row.id;
  }
  console.log(`  Inserted ${Object.keys(customerIds).length} customers.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 2: lg_loads — 1200 rows + TABLE 11: cw_loads bridge
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_loads (1200) + cw_loads bridge...');

  // Build the full list of loads with margin design
  const loadRows = [];
  const totalTarget = 55000000;
  let loadIdx = 0;

  // Margin buckets: 22 negative, 35 thin 1-5%, 180 below-target 5-12%, rest 12-19%
  const marginBuckets = [];
  for (let i = 0; i < 22; i++) marginBuckets.push({ type: 'negative', marginPct: randFloat(-18, -5) });
  for (let i = 0; i < 35; i++) marginBuckets.push({ type: 'thin', marginPct: randFloat(1, 5) });
  for (let i = 0; i < 180; i++) marginBuckets.push({ type: 'below', marginPct: randFloat(5, 12) });
  for (let i = 0; i < 963; i++) marginBuckets.push({ type: 'healthy', marginPct: randFloat(12, 19) });
  // Shuffle margins
  for (let i = marginBuckets.length - 1; i > 0; i--) { const j = randInt(0, i); [marginBuckets[i], marginBuckets[j]] = [marginBuckets[j], marginBuckets[i]]; }

  // Equipment distribution: 70% reefer, 20% dry_van, 10% flatbed
  function pickEquipment() { const r = Math.random(); return r < 0.7 ? 'reefer' : r < 0.9 ? 'dry_van' : 'flatbed'; }

  // Status distribution: delivered 850, in_transit 120, dispatched 90, covered 60, open 50, cancelled 30
  const statusPool = [];
  for (let i = 0; i < 850; i++) statusPool.push('delivered');
  for (let i = 0; i < 120; i++) statusPool.push('in_transit');
  for (let i = 0; i < 90; i++) statusPool.push('dispatched');
  for (let i = 0; i < 60; i++) statusPool.push('covered');
  for (let i = 0; i < 50; i++) statusPool.push('open');
  for (let i = 0; i < 30; i++) statusPool.push('cancelled');
  for (let i = statusPool.length - 1; i > 0; i--) { const j = randInt(0, i); [statusPool[i], statusPool[j]] = [statusPool[j], statusPool[i]]; }

  // Build loads per shipper
  for (const shipper of SHIPPER_LIST) {
    const shipperRevPortion = totalTarget * (shipper.loads / 1200);
    const avgSellRate = shipperRevPortion / shipper.loads;

    for (let li = 0; li < shipper.loads; li++) {
      const mb = marginBuckets[loadIdx];
      const origin = pickCity();
      const dest = pickCity();
      const equip = pickEquipment();
      const miles = randFloat(200, 1800, 0);
      // sell_rate varies around avg for the shipper
      const sellRate = Math.round(avgSellRate * randFloat(0.75, 1.30) * 100) / 100;
      const marginPct = mb.marginPct;
      const buyRate = Math.round(sellRate * (1 - marginPct / 100) * 100) / 100;
      const margin = Math.round((sellRate - buyRate) * 100) / 100;
      const rpm = miles > 0 ? Math.round(sellRate / miles * 100) / 100 : 0;
      const status = statusPool[loadIdx];
      const pickupDate = randDate('2025-03-01', '2026-03-20');
      const delivDays = Math.ceil(miles / 500) + randInt(0, 2);
      const deliveryDate = new Date(pickupDate.getTime() + delivDays * 86400000);
      const loadRef = `CW-${70001 + loadIdx}`;
      const commodity = pick(COMMODITIES);
      const weight = randInt(15000, 44000);

      loadRows.push({
        loadRef, shipperName: shipper.name, customerId: customerIds[shipper.name],
        originCity: origin.city, originState: origin.state,
        destCity: dest.city, destState: dest.state,
        pickupDate: fmtDate(pickupDate), deliveryDate: fmtDate(deliveryDate),
        equip, weight, miles, sellRate, buyRate, margin, marginPct, rpm, status, commodity
      });
      loadIdx++;
    }
  }

  // Insert in batches of 50
  const loadIds = [];
  for (let b = 0; b < loadRows.length; b += 50) {
    const batch = loadRows.slice(b, b + 50);
    const values = [];
    const binds = [];
    let pi = 1;
    for (const l of batch) {
      const ps = [];
      for (const v of [TENANT, l.loadRef, l.customerId, l.shipperName, l.originCity, l.originState,
        l.destCity, l.destState, l.pickupDate, l.deliveryDate, l.equip, l.weight, l.miles,
        l.sellRate, l.buyRate, l.margin, l.marginPct, l.rpm, l.status, l.commodity]) {
        ps.push(`$${pi++}`);
        binds.push(v);
      }
      values.push(`(${ps.join(',')})`);
    }
    const rows = await sequelize.query(`
      INSERT INTO lg_loads (tenant_id, load_ref, customer_id, shipper_name, origin_city, origin_state,
        destination_city, destination_state, pickup_date, delivery_date, equipment_type, weight_lbs, miles,
        sell_rate, buy_rate, margin, margin_pct, rate_per_mile, status, commodity)
      VALUES ${values.join(',')}
      ON CONFLICT (load_ref) DO NOTHING RETURNING id, load_ref`,
      { bind: binds, type: QueryTypes.SELECT });
    for (const r of rows) loadIds.push(r);
  }
  console.log(`  Inserted ${loadIds.length} loads.`);

  // Build a loadRef -> id map
  const loadRefMap = {};
  for (const r of loadIds) loadRefMap[r.load_ref] = r.id;

  // Insert cw_loads bridge
  let cwLoadCount = 0;
  for (let b = 0; b < loadRows.length; b += 50) {
    const batch = loadRows.slice(b, b + 50);
    const values = [];
    const binds = [];
    let pi = 1;
    for (const l of batch) {
      const ps = [];
      const cwStatus = l.status === 'dispatched' ? 'covered' : (l.status === 'open' || l.status === 'covered' || l.status === 'in_transit' || l.status === 'delivered' || l.status === 'cancelled') ? l.status : 'covered';
      for (const v of [l.loadRef, `${l.originCity}, ${l.originState}`, `${l.destCity}, ${l.destState}`,
        l.equip, l.weight, l.pickupDate, l.deliveryDate, l.buyRate, l.sellRate, cwStatus, l.equip, l.commodity]) {
        ps.push(`$${pi++}`);
        binds.push(v);
      }
      values.push(`(${ps.join(',')})`);
    }
    const rows = await sequelize.query(`
      INSERT INTO cw_loads (load_ref, origin, destination, freight_type, weight_lbs, pickup_date, delivery_date,
        rate_usd, shipper_rate, status, equipment_type, commodity)
      VALUES ${values.join(',')}
      ON CONFLICT DO NOTHING RETURNING id`,
      { bind: binds, type: QueryTypes.SELECT });
    cwLoadCount += rows.length;
  }
  console.log(`  Inserted ${cwLoadCount} cw_loads.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 3: lg_rate_benchmarks — 40 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_rate_benchmarks (40)...');
  const lanes = [];
  const equipTypes = ['reefer','dry_van','flatbed'];
  const rateRanges = { reefer: [2.40,3.00], dry_van: [1.90,2.50], flatbed: [2.10,2.70] };
  // Generate 40 unique lane combos
  const usedLanes = new Set();
  while (lanes.length < 40) {
    const os = pick(STATES), ds = pick(STATES);
    const eq = pick(equipTypes);
    const key = `${os}-${ds}-${eq}`;
    if (usedLanes.has(key) || os === ds) continue;
    usedLanes.add(key);
    const [lo, hi] = rateRanges[eq];
    const avg = randFloat(lo, hi);
    const p25 = Math.max(lo, parseFloat((avg - randFloat(0.10, 0.25)).toFixed(2)));
    const p75 = Math.min(hi + 0.20, parseFloat((avg + randFloat(0.10, 0.25)).toFixed(2)));
    const miles = randInt(300, 1400);
    const avgRate = Math.round(avg * miles * 100) / 100;
    lanes.push({ os, ds, eq, avgRate, avg, p25, p75, miles, samples: randInt(30, 200),
      conf: pick(['medium','high','very_high']), rateDate: fmtDate(randDate('2026-02-01','2026-03-20')) });
  }
  for (const l of lanes) {
    await sequelize.query(`
      INSERT INTO lg_rate_benchmarks (tenant_id, origin_state, destination_state, equipment_type,
        avg_rate, rate_per_mile_avg, rate_per_mile_p25, rate_per_mile_p75, sample_size, confidence, rate_date, benchmark_source)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT DO NOTHING`,
      { bind: [TENANT, l.os, l.ds, l.eq, l.avgRate, l.avg, l.p25, l.p75, l.samples, l.conf, l.rateDate, 'dat'], type: QueryTypes.INSERT });
  }
  console.log(`  Inserted ${lanes.length} benchmarks.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 4: lg_drivers — 30 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_drivers (30)...');
  const driverIds = [];
  // Statuses: available 12, driving 8, off_duty 5, resting 3, inactive 2
  const driverStatuses = [];
  for (let i = 0; i < 12; i++) driverStatuses.push('available');
  for (let i = 0; i < 8; i++) driverStatuses.push('driving');
  for (let i = 0; i < 5; i++) driverStatuses.push('off_duty');
  for (let i = 0; i < 3; i++) driverStatuses.push('resting');
  for (let i = 0; i < 2; i++) driverStatuses.push('inactive');

  for (let i = 0; i < 30; i++) {
    const loc = pickCity();
    const st = pick(STATES);
    // CDL expiry: 3 within 60 days, rest far future
    let cdlExpiry;
    if (i < 3) cdlExpiry = fmtDate(randDate('2026-03-25', '2026-05-20'));
    else cdlExpiry = fmtDate(randDate('2027-01-01', '2029-12-31'));

    // Medical card: 4 expired (before 2026-03-24)
    let medicalExpiry;
    if (i >= 3 && i < 7) medicalExpiry = fmtDate(randDate('2025-08-01', '2026-03-23'));
    else medicalExpiry = fmtDate(randDate('2026-06-01', '2027-12-31'));

    // 0 HazMat endorsements (gap!)
    const endorsements = pick(['{tanker}', '{doubles_triples}', '{tanker,doubles_triples}', '{}', '{}']);

    // HOS: 5 with drive remaining < 3 hours
    let hosDrive, hosDuty, hosCycle;
    if (i < 5) { hosDrive = randFloat(0.5, 2.9, 1); hosDuty = randFloat(1.0, 5.0, 1); hosCycle = randFloat(10, 30, 1); }
    else { hosDrive = randFloat(5, 11, 1); hosDuty = randFloat(7, 14, 1); hosCycle = randFloat(40, 70, 1); }

    const drugTest = fmtDate(randDate('2025-09-01', '2026-03-15'));
    const hireDate = fmtDate(randDate('2018-01-01', '2025-06-01'));

    const [row] = await sequelize.query(`
      INSERT INTO lg_drivers (tenant_id, driver_name, cdl_class, cdl_state, cdl_expiry, endorsements,
        drug_test_last, home_city, home_state, status,
        hos_drive_remaining, hos_duty_remaining, hos_cycle_remaining, phone)
      VALUES ($1,$2,$3,$4,$5,$6::text[],$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT DO NOTHING RETURNING id`,
      { bind: [TENANT, DRIVER_NAMES[i], 'A', st, cdlExpiry, endorsements,
        drugTest, loc.city, loc.state, driverStatuses[i],
        hosDrive, hosDuty, hosCycle, randPhone()],
        type: QueryTypes.SELECT });
    if (row) driverIds.push(row.id);
  }
  console.log(`  Inserted ${driverIds.length} drivers.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 5: lg_trucks — 40 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_trucks (40)...');
  const truckIds = [];
  // status: 12 out_of_service/maintenance, 28 available/assigned/in_transit
  const truckStatusPool = [];
  for (let i = 0; i < 6; i++) truckStatusPool.push('out_of_service');
  for (let i = 0; i < 6; i++) truckStatusPool.push('maintenance');
  for (let i = 0; i < 12; i++) truckStatusPool.push('available');
  for (let i = 0; i < 8; i++) truckStatusPool.push('assigned');
  for (let i = 0; i < 8; i++) truckStatusPool.push('in_transit');

  // Build make list
  const makeList = [];
  for (const [make, count] of Object.entries(TRUCK_MAKES)) for (let i = 0; i < count; i++) makeList.push(make);

  for (let i = 0; i < 40; i++) {
    const loc = pickCity();
    const make = makeList[i];
    const model = pick(TRUCK_MODELS[make]);
    const year = randInt(2018, 2025);
    const equip = i < 25 ? 'reefer' : i < 35 ? 'dry_van' : 'flatbed';
    const mileage = randInt(80000, 650000);
    // 8 with overdue PM (next_pm_due before March 2026)
    let nextPmDate;
    if (i < 8) nextPmDate = fmtDate(randDate('2025-10-01', '2026-03-01'));
    else nextPmDate = fmtDate(randDate('2026-04-01', '2026-09-30'));

    const lastInspection = fmtDate(randDate('2025-06-01', '2026-03-01'));
    const unitNum = `T-${1001 + i}`;
    const vin = `1FU${pad(randInt(100000,999999),6)}${pad(randInt(1000,9999),4)}${randInt(10,99)}`;

    const [row] = await sequelize.query(`
      INSERT INTO lg_trucks (tenant_id, truck_number, vin, make, model, year, equipment_type, status,
        current_city, current_state, odometer, next_inspection_date, next_pm_due_miles,
        metadata)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT DO NOTHING RETURNING id`,
      { bind: [TENANT, unitNum, vin, make, model, year, equip, truckStatusPool[i],
        loc.city, loc.state, mileage, nextPmDate, mileage + randInt(10000, 25000),
        JSON.stringify({ fuel_type: 'diesel', eld_provider: pick(['KeepTruckin','Samsara','Omnitracs','ELD Rider']),
          license_plate: `${pick(STATES)}-${randInt(100,999)}${String.fromCharCode(65+randInt(0,25))}${String.fromCharCode(65+randInt(0,25))}${randInt(10,99)}` })],
        type: QueryTypes.SELECT });
    if (row) truckIds.push(row.id);
  }
  console.log(`  Inserted ${truckIds.length} trucks.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 6: lg_compliance — 60 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_compliance (60)...');
  const compTypes = ['auto_liability_insurance','cargo_insurance','operating_authority','dot_inspection'];
  const compEntities = ['driver','truck','carrier'];
  let compCount = 0;

  // 12 expired, 8 expiring_soon, 40 current
  const compStatuses = [];
  for (let i = 0; i < 12; i++) compStatuses.push('expired');
  for (let i = 0; i < 8; i++) compStatuses.push('expiring_soon');
  for (let i = 0; i < 40; i++) compStatuses.push('current');

  for (let i = 0; i < 60; i++) {
    const entType = compEntities[i % 3];
    let entId;
    if (entType === 'driver') entId = driverIds[i % driverIds.length];
    else if (entType === 'truck') entId = truckIds[i % truckIds.length];
    else entId = carrierIds[i % carrierIds.length];

    const compType = compTypes[i % compTypes.length];
    const compStatus = compStatuses[i];
    let effDate, expDate;
    if (compStatus === 'expired') {
      effDate = fmtDate(randDate('2024-06-01', '2025-03-01'));
      expDate = fmtDate(randDate('2025-06-01', '2026-03-23'));
    } else if (compStatus === 'expiring_soon') {
      effDate = fmtDate(randDate('2025-04-01', '2025-10-01'));
      expDate = fmtDate(randDate('2026-03-25', '2026-05-07'));
    } else {
      effDate = fmtDate(randDate('2025-06-01', '2026-01-01'));
      expDate = fmtDate(randDate('2026-08-01', '2027-06-01'));
    }

    await sequelize.query(`
      INSERT INTO lg_compliance (tenant_id, entity_type, entity_id, compliance_type, status, effective_date, expiry_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING`,
      { bind: [TENANT, entType, entId, compType, compStatus, effDate, expDate], type: QueryTypes.INSERT });
    compCount++;
  }
  console.log(`  Inserted ${compCount} compliance records.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 7: lg_dispatches — 200 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_dispatches (200)...');
  // status: completed->delivered 140, in_progress->in_transit 30, assigned 20, cancelled 10
  const dispStatuses = [];
  for (let i = 0; i < 140; i++) dispStatuses.push('delivered');
  for (let i = 0; i < 30; i++) dispStatuses.push('in_transit');
  for (let i = 0; i < 20; i++) dispStatuses.push('assigned');
  for (let i = 0; i < 10; i++) dispStatuses.push('cancelled');

  const loadIdList = loadIds.map(r => r.id);
  let dispCount = 0;
  for (let i = 0; i < 200; i++) {
    const loadId = loadIdList[i % loadIdList.length];
    const carrierId = carrierIds[i % carrierIds.length];
    const driverId = driverIds[i % driverIds.length];
    const truckId = truckIds[i % truckIds.length];
    const dispDate = randDate('2025-03-01', '2026-03-20');
    const pickupEta = new Date(dispDate.getTime() + randInt(1,3) * 86400000);
    const delivEta = new Date(pickupEta.getTime() + randInt(1,5) * 86400000);

    await sequelize.query(`
      INSERT INTO lg_dispatches (tenant_id, load_id, driver_id, truck_id, dispatched_at, pickup_eta, delivery_eta, status, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT DO NOTHING`,
      { bind: [TENANT, loadId, driverId, truckId, fmtTs(dispDate), fmtTs(pickupEta), fmtTs(delivEta),
        dispStatuses[i], `Dispatch for load ${loadId}`], type: QueryTypes.INSERT });
    dispCount++;
  }
  console.log(`  Inserted ${dispCount} dispatches.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 8: lg_quotes — 80 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_quotes (80)...');
  // outcome: won 35, lost 25, pending 12, expired 8
  const quoteOutcomes = [];
  for (let i = 0; i < 35; i++) quoteOutcomes.push('won');
  for (let i = 0; i < 25; i++) quoteOutcomes.push('lost');
  for (let i = 0; i < 12; i++) quoteOutcomes.push('pending');
  for (let i = 0; i < 8; i++) quoteOutcomes.push('expired');
  // loss reasons: price 12, capacity 5, competitor 5, no_response 3
  const lossReasons = [];
  for (let i = 0; i < 12; i++) lossReasons.push('price');
  for (let i = 0; i < 5; i++) lossReasons.push('capacity');
  for (let i = 0; i < 5; i++) lossReasons.push('competitor');
  for (let i = 0; i < 3; i++) lossReasons.push('no_response');

  let quoteCount = 0;
  let lossIdx = 0;
  const custIdList = Object.values(customerIds);
  for (let i = 0; i < 80; i++) {
    const origin = pickCity();
    const dest = pickCity();
    const equip = pickEquipment();
    const miles = randInt(250, 1500);
    const rpm = randFloat(2.0, 3.2);
    const quotedRate = Math.round(rpm * miles * 100) / 100;
    const marketRate = Math.round(quotedRate * randFloat(0.90, 1.10) * 100) / 100;
    const outcome = quoteOutcomes[i];
    let winRate = null, delta = null, lossReason = null;
    if (outcome === 'lost') {
      winRate = Math.round(quotedRate * randFloat(0.85, 0.98) * 100) / 100;
      delta = Math.round((quotedRate - winRate) * 100) / 100;
      lossReason = lossReasons[lossIdx % lossReasons.length];
      lossIdx++;
    } else if (outcome === 'won') {
      winRate = quotedRate;
      delta = 0;
    }
    const autoQuoted = Math.random() < 0.3;

    await sequelize.query(`
      INSERT INTO lg_quotes (tenant_id, shipper_id, origin_city, origin_state, destination_city, destination_state,
        equipment_type, quoted_rate, quoted_rpm, market_rate_at_quote, outcome, winning_rate, delta_from_winner, loss_reason, auto_quoted)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT DO NOTHING`,
      { bind: [TENANT, custIdList[i % custIdList.length], origin.city, origin.state, dest.city, dest.state,
        equip, quotedRate, rpm, marketRate, outcome, winRate, delta, lossReason, autoQuoted],
        type: QueryTypes.INSERT });
    quoteCount++;
  }
  console.log(`  Inserted ${quoteCount} quotes.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 9: lg_tracking_events — 300 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting lg_tracking_events (300)...');
  // event_type mapping to DB enum: position, geofence_enter, geofence_exit, departure, arrival, delay, weather
  // We'll map the requested types to valid DB enum values
  const trackingEventTypes = [
    'arrival',      // pickup_arrived -> arrival
    'departure',    // pickup_departed -> departure
    'position',     // in_transit -> position
    'position',     // check_call -> position
    'delay',        // delay -> delay
    'weather',      // exception -> weather (closest match for temp excursions)
    'arrival',      // delivery_arrived -> arrival
    'geofence_enter' // delivery_completed -> geofence_enter
  ];

  let trackCount = 0;
  // 15 delay, 5 weather (exception/temp), 8 with "No tracking update" notes
  for (let i = 0; i < 300; i++) {
    const loc = pickCity();
    let evType, notes = null, speed = randFloat(45, 72, 1);
    if (i < 15) {
      evType = 'delay';
      notes = pick(['Driver stuck at shipper dock — 3h wait', 'Weather delay I-95 — ice storm', 'Mechanical issue, ETA pushed 4h',
        'Construction on I-75 — 2h delay', 'Accident ahead on I-10, rerouting', 'Flat tire — waiting for road service',
        'Port congestion — 5h delay at receiving', 'Load not ready at pickup, 2.5h wait']);
    } else if (i < 20) {
      evType = 'weather';
      notes = pick(['Temperature excursion: 42°F (max 36°F) — reefer malfunction',
        'Temp spike to 45°F, driver notified, unit reset', 'Temperature alarm: 50°F in reefer unit, cargo at risk',
        'Reefer door left open — temp rose to 48°F for 20 min', 'Ambient temp excursion logged by ELD']);
      speed = 0;
    } else if (i < 28) {
      evType = 'position';
      notes = 'No tracking update for 7+ hours';
      speed = 0;
    } else {
      evType = pick(['position','departure','arrival','geofence_enter','geofence_exit']);
    }

    const lat = randFloat(25.0, 47.0, 7);
    const lng = randFloat(-87.0, -74.0, 7);
    const ts = randDate('2025-06-01', '2026-03-22');

    await sequelize.query(`
      INSERT INTO lg_tracking_events (tenant_id, truck_id, driver_id, load_id, event_type, lat, lng, city, state,
        speed_mph, notes, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT DO NOTHING`,
      { bind: [TENANT, truckIds[i % truckIds.length], driverIds[i % driverIds.length],
        loadIdList[i % loadIdList.length], evType, lat, lng, loc.city, loc.state,
        speed, notes, fmtTs(ts)],
        type: QueryTypes.INSERT });
    trackCount++;
  }
  console.log(`  Inserted ${trackCount} tracking events.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 12: cw_contacts — 80 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting cw_contacts (80)...');
  const cwContactIds = [];
  let hsCount = 0;
  // 50 carrier, 20 shipper, 10 prospect
  for (let i = 0; i < 80; i++) {
    let contactType, company, fn, ln;
    fn = pick(CONTACT_FIRST);
    ln = pick(CONTACT_LAST);
    if (i < 50) {
      contactType = 'carrier';
      company = CARRIER_NAMES[i % CARRIER_NAMES.length];
    } else if (i < 70) {
      contactType = 'shipper';
      company = SHIPPER_LIST[(i - 50) % SHIPPER_LIST.length].name;
    } else {
      contactType = 'prospect';
      company = pick(['Alliance Logistics','Metro Freight Co','Apex Transport','Cascade Shipping','Summit Carriers',
        'Phoenix Distribution','Harbor Freight Lines','Ridgeline Transport','Cornerstone Logistics','Frontier Hauling']);
    }

    // 60 of 80 get hubspot_id
    const hsId = hsCount < 60 ? `hs_${10000 + i}` : null;
    if (hsId) hsCount++;

    const [row] = await sequelize.query(`
      INSERT INTO cw_contacts (hubspot_id, contact_type, company_name, full_name, email, phone)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (hubspot_id) DO NOTHING RETURNING id`,
      { bind: [hsId, contactType, company, `${fn} ${ln}`,
        `${fn.toLowerCase()}.${ln.toLowerCase()}@${company.toLowerCase().replace(/[\s,.']+/g,'')}\.com`,
        randPhone()],
        type: QueryTypes.SELECT });
    if (row) cwContactIds.push(row.id);
  }
  console.log(`  Inserted ${cwContactIds.length} cw_contacts.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 13: cw_call_logs — 150 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting cw_call_logs (150)...');
  // direction: outbound 100, inbound 50
  // outcome: answered 90, no_answer 40, voicemail 15, busy 5
  const callOutcomes = [];
  for (let i = 0; i < 90; i++) callOutcomes.push('answered');
  for (let i = 0; i < 40; i++) callOutcomes.push('no_answer');
  for (let i = 0; i < 15; i++) callOutcomes.push('voicemail');
  for (let i = 0; i < 5; i++) callOutcomes.push('busy');
  for (let i = callOutcomes.length - 1; i > 0; i--) { const j = randInt(0, i); [callOutcomes[i], callOutcomes[j]] = [callOutcomes[j], callOutcomes[i]]; }

  let callCount = 0;
  for (let i = 0; i < 150; i++) {
    const direction = i < 100 ? 'outbound' : 'inbound';
    const outcome = callOutcomes[i];
    const duration = outcome === 'answered' ? randInt(30, 300) : 0;
    const contactId = cwContactIds[i % cwContactIds.length];
    const createdAt = randDate('2026-02-22', '2026-03-24');
    const callSid = `CA${pad(randInt(100000000,999999999),9)}${pad(i,4)}`;
    const notes = outcome === 'answered'
      ? pick(['Discussed rate for FL-GA lane','Confirmed pickup window','Updated ETA for delivery',
        'Negotiated rate down $200','Driver check-in — on schedule','Shipper requesting additional pickup',
        'Rate confirmation sent after call','Carrier capacity discussion — available next week',
        'Load tender accepted verbally','Invoice discrepancy resolved'])
      : null;

    await sequelize.query(`
      INSERT INTO cw_call_logs (call_sid, direction, contact_id, duration_sec, outcome, ai_summary, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (call_sid) DO NOTHING`,
      { bind: [callSid, direction, contactId, duration, outcome, notes, fmtTs(createdAt)],
        type: QueryTypes.INSERT });
    callCount++;
  }
  console.log(`  Inserted ${callCount} call logs.\n`);

  // ══════════════════════════════════════════════════════════════════
  // TABLE 14: cw_hubspot_sync — 200 rows
  // ══════════════════════════════════════════════════════════════════
  console.log('Inserting cw_hubspot_sync (200)...');
  // entity_type: contact 150, deal 50
  // status: success 170, error 20, pending 10
  const syncStatuses = [];
  for (let i = 0; i < 170; i++) syncStatuses.push('success');
  for (let i = 0; i < 20; i++) syncStatuses.push('error');
  for (let i = 0; i < 10; i++) syncStatuses.push('pending');
  for (let i = syncStatuses.length - 1; i > 0; i--) { const j = randInt(0, i); [syncStatuses[i], syncStatuses[j]] = [syncStatuses[j], syncStatuses[i]]; }

  let syncCount = 0;
  for (let i = 0; i < 200; i++) {
    const objType = i < 150 ? 'contact' : 'deal';
    const objId = `hs_${20000 + i}`;
    const action = pick(['create','update','sync']);
    const status = syncStatuses[i];
    const errMsg = status === 'error' ? pick(['Rate limit exceeded','Invalid email format','Duplicate contact','API timeout','Missing required field']) : null;
    const createdAt = randDate('2026-03-17', '2026-03-24');

    await sequelize.query(`
      INSERT INTO cw_hubspot_sync (object_type, object_id, action, payload, status, error_msg, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT DO NOTHING`,
      { bind: [objType, objId, action, JSON.stringify({ source: 'seed_55m' }), status, errMsg, fmtTs(createdAt)],
        type: QueryTypes.INSERT });
    syncCount++;
  }
  console.log(`  Inserted ${syncCount} hubspot sync records.\n`);

  // ══════════════════════════════════════════════════════════════════
  // FINAL COUNTS
  // ══════════════════════════════════════════════════════════════════
  console.log('═══════════════════════════════════════════════════════');
  console.log('  FINAL ROW COUNTS');
  console.log('═══════════════════════════════════════════════════════');
  const tables = [
    'lg_carriers','lg_customers','lg_loads','lg_rate_benchmarks',
    'lg_drivers','lg_trucks','lg_compliance','lg_dispatches',
    'lg_quotes','lg_tracking_events',
    'cw_loads','cw_contacts','cw_call_logs','cw_hubspot_sync'
  ];
  for (const t of tables) {
    try {
      const [row] = await sequelize.query(`SELECT COUNT(*) as cnt FROM ${t}`, { type: QueryTypes.SELECT });
      console.log(`  ${t.padEnd(25)} ${row.cnt}`);
    } catch (e) {
      console.log(`  ${t.padEnd(25)} ERROR: ${e.message.slice(0,50)}`);
    }
  }

  // Revenue check
  const [rev] = await sequelize.query(`SELECT SUM(sell_rate) as total_revenue, SUM(margin) as total_margin, AVG(margin_pct) as avg_margin FROM lg_loads WHERE tenant_id = $1`, { bind: [TENANT], type: QueryTypes.SELECT });
  console.log('\n  REVENUE CHECK:');
  console.log(`  Total Revenue:  $${Number(rev.total_revenue).toLocaleString()}`);
  console.log(`  Total Margin:   $${Number(rev.total_margin).toLocaleString()}`);
  console.log(`  Avg Margin %:   ${Number(rev.avg_margin).toFixed(2)}%`);

  console.log('\n$55M demo seed complete.');
  await sequelize.close();
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
