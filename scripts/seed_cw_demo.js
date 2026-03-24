#!/usr/bin/env node
/**
 * CW Carriers Demo Data Seed Script
 * Inserts 50 carriers, 8 shippers, 1000 loads, 30 rate benchmarks,
 * 50 compliance records, and 40 quotes into the PostgreSQL database.
 *
 * Run: /opt/homebrew/bin/node scripts/seed_cw_demo.js
 */

require('dotenv').config();
const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const TENANT = 'demo';

// ── Helpers ──────────────────────────────────────────────────────────
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randFloat(min, max, dec = 2) { return parseFloat((Math.random() * (max - min) + min).toFixed(dec)); }
function pad(n, len) { return String(n).padStart(len, '0'); }
function randPhone() { return `+1${randInt(200,999)}${randInt(200,999)}${randInt(1000,9999)}`; }
function randDate(startStr, endStr) {
  const s = new Date(startStr).getTime(), e = new Date(endStr).getTime();
  return new Date(s + Math.random() * (e - s));
}
function fmtDate(d) { return d.toISOString().split('T')[0]; }

// ── Static Data ──────────────────────────────────────────────────────
const CARRIER_NAMES = [
  'Swift Transport LLC','Eagle Freight Inc','Patriot Trucking Corp','Sunbelt Carriers LLC',
  'Mountain West Transport','Pacific Coast Logistics','Volunteer Express Inc','Buckeye Freight Systems',
  'Keystone Carriers Inc','Evergreen Transport LLC','Palmetto Freight LLC','Dixie Line Trucking',
  'Great Lakes Express','Lone Star Freight','Blue Ridge Transport','Peach State Carriers',
  'Tri-State Hauling Inc','Heartland Trucking Co','Southern Cross Freight','Cardinal Logistics LLC',
  'Coastal Freight Lines','Appalachian Transport','Thunder Road Express','Wolverine Freight Inc',
  'Prairie Wind Trucking','Gulf Coast Carriers','Magnolia Transport LLC','Northstar Logistics',
  'Redline Freight Corp','Tidewater Trucking','Seminole Express','Panhandle Freight LLC',
  'Smoky Mountain Haulers','Iron Horse Transport','Copperhead Carriers','Delta Route Express',
  'Allegheny Freight Co','Sunshine State Hauling','Carolina Freight Corp','Empire State Trucking',
  'Cypress Creek Freight','Badger Freight Inc','Razorback Logistics','Hoosier Express LLC',
  'Dogwood Transport Inc','Black Bear Trucking','Pinnacle Freight LLC','Okefenokee Carriers',
  'Shenandoah Freight','Northland Express'
];

const EQUIPMENT_OPTIONS = [
  '{reefer,dry_van}','{dry_van}','{flatbed,dry_van}','{reefer}',
  '{reefer,dry_van,flatbed}','{flatbed}','{dry_van,flatbed}'
];

const CARRIER_STATES = ['FL','GA','MI','OH','VA','NC','NJ','PA','TN','SC','IL','IN','AL'];
const CARRIER_CITIES = {
  FL: ['Tampa','Jacksonville','Orlando','Lakeland','Miami','Fort Myers'],
  GA: ['Atlanta','Savannah','Augusta','Macon'],
  MI: ['Grand Rapids','Detroit','Lansing','Kalamazoo'],
  OH: ['Cincinnati','Columbus','Cleveland','Dayton'],
  VA: ['Richmond','Norfolk','Virginia Beach','Roanoke'],
  NC: ['Charlotte','Raleigh','Greensboro','Durham'],
  NJ: ['Newark','Edison','Trenton','Cherry Hill'],
  PA: ['Philadelphia','Harrisburg','Pittsburgh','Allentown'],
  TN: ['Nashville','Memphis','Knoxville','Chattanooga'],
  SC: ['Charleston','Columbia','Greenville'],
  IL: ['Chicago','Springfield','Rockford'],
  IN: ['Indianapolis','Fort Wayne','Evansville'],
  AL: ['Birmingham','Mobile','Huntsville']
};

const CONTACT_FIRST = ['James','Maria','Robert','Linda','Michael','Patricia','David','Jennifer','Chris','Sarah',
  'Daniel','Jessica','Brian','Amanda','Kevin','Michelle','Jason','Ashley','Ryan','Nicole',
  'Mark','Stephanie','Andrew','Heather','Steve','Rebecca','Tom','Tiffany','Jeff','Lauren'];
const CONTACT_LAST = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez',
  'Anderson','Taylor','Thomas','Jackson','White','Harris','Martin','Thompson','Moore','Clark'];

const SHIPPER_DATA = [
  { name: 'PepsiCo Beverages', contact: 'Derek Williams', city: 'Tampa', state: 'FL', rel: 95, vol: 98, pay: 92, growth: 88, churn: 'low', avg_pay_days: 28, loads_ltm: 4560 },
  { name: 'Spartan Nash', contact: 'Karen Mitchell', city: 'Grand Rapids', state: 'MI', rel: 88, vol: 82, pay: 85, growth: 75, churn: 'low', avg_pay_days: 32, loads_ltm: 1800 },
  { name: 'Performance Food Group', contact: 'Tony Alvarez', city: 'Richmond', state: 'VA', rel: 85, vol: 78, pay: 88, growth: 80, churn: 'low', avg_pay_days: 30, loads_ltm: 1440 },
  { name: 'Coca-Cola Bottling', contact: 'Sandra Lee', city: 'Atlanta', state: 'GA', rel: 90, vol: 75, pay: 94, growth: 72, churn: 'low', avg_pay_days: 25, loads_ltm: 1320 },
  { name: 'Boise Paper', contact: 'Rick Hansen', city: 'Boise', state: 'ID', rel: 72, vol: 60, pay: 78, growth: 55, churn: 'medium', avg_pay_days: 40, loads_ltm: 480 },
  { name: 'Target Stores', contact: 'Julie Park', city: 'Jacksonville', state: 'FL', rel: 80, vol: 70, pay: 86, growth: 65, churn: 'medium', avg_pay_days: 35, loads_ltm: 840 },
  { name: 'Kroger Distribution', contact: 'Phil Burton', city: 'Cincinnati', state: 'OH', rel: 78, vol: 65, pay: 82, growth: 60, churn: 'medium', avg_pay_days: 38, loads_ltm: 960 },
  { name: 'FedEx Ground', contact: 'Amy Chen', city: 'Charlotte', state: 'NC', rel: 82, vol: 72, pay: 90, growth: 70, churn: 'low', avg_pay_days: 22, loads_ltm: 600 }
];

// Load count distribution per shipper
const SHIPPER_LOAD_COUNTS = {
  'PepsiCo Beverages': 380,
  'Spartan Nash': 150,
  'Performance Food Group': 120,
  'Coca-Cola Bottling': 110,
  'Kroger Distribution': 80,
  'Target Stores': 70,
  'FedEx Ground': 50,
  'Boise Paper': 40
};

// Lane pools by origin state
const LANES = {
  FL: [
    { oc: 'Tampa', os: 'FL', dc: 'Atlanta', ds: 'GA', mi: [420,480] },
    { oc: 'Jacksonville', os: 'FL', dc: 'Charlotte', ds: 'NC', mi: [500,570] },
    { oc: 'Orlando', os: 'FL', dc: 'Richmond', ds: 'VA', mi: [750,830] },
    { oc: 'Lakeland', os: 'FL', dc: 'Nashville', ds: 'TN', mi: [650,720] },
    { oc: 'Miami', os: 'FL', dc: 'Newark', ds: 'NJ', mi: [1250,1320] },
    { oc: 'Fort Myers', os: 'FL', dc: 'Philadelphia', ds: 'PA', mi: [1100,1200] },
    { oc: 'Tampa', os: 'FL', dc: 'Cincinnati', ds: 'OH', mi: [900,980] },
    { oc: 'Jacksonville', os: 'FL', dc: 'Detroit', ds: 'MI', mi: [950,1050] },
    { oc: 'Orlando', os: 'FL', dc: 'Chicago', ds: 'IL', mi: [1050,1150] },
    { oc: 'Tampa', os: 'FL', dc: 'Columbia', ds: 'SC', mi: [450,520] },
    { oc: 'Jacksonville', os: 'FL', dc: 'Savannah', ds: 'GA', mi: [130,170] },
    { oc: 'Lakeland', os: 'FL', dc: 'Raleigh', ds: 'NC', mi: [620,700] },
    { oc: 'Miami', os: 'FL', dc: 'Columbus', ds: 'OH', mi: [1050,1140] },
    { oc: 'Tampa', os: 'FL', dc: 'Norfolk', ds: 'VA', mi: [800,880] },
    { oc: 'Orlando', os: 'FL', dc: 'Greenville', ds: 'SC', mi: [450,530] },
    { oc: 'Fort Myers', os: 'FL', dc: 'Harrisburg', ds: 'PA', mi: [1050,1130] },
    { oc: 'Tampa', os: 'FL', dc: 'Jacksonville', ds: 'FL', mi: [55,85] },
    { oc: 'Jacksonville', os: 'FL', dc: 'Tampa', ds: 'FL', mi: [55,85] },
  ],
  GA: [
    { oc: 'Atlanta', os: 'GA', dc: 'Charlotte', ds: 'NC', mi: [240,280] },
    { oc: 'Savannah', os: 'GA', dc: 'Jacksonville', ds: 'FL', mi: [130,170] },
    { oc: 'Augusta', os: 'GA', dc: 'Columbia', ds: 'SC', mi: [65,90] },
    { oc: 'Atlanta', os: 'GA', dc: 'Nashville', ds: 'TN', mi: [240,280] },
    { oc: 'Atlanta', os: 'GA', dc: 'Richmond', ds: 'VA', mi: [530,600] },
    { oc: 'Atlanta', os: 'GA', dc: 'Cincinnati', ds: 'OH', mi: [450,520] },
    { oc: 'Savannah', os: 'GA', dc: 'Raleigh', ds: 'NC', mi: [380,430] },
    { oc: 'Atlanta', os: 'GA', dc: 'Tampa', ds: 'FL', mi: [420,480] },
  ],
  MI: [
    { oc: 'Grand Rapids', os: 'MI', dc: 'Columbus', ds: 'OH', mi: [300,350] },
    { oc: 'Detroit', os: 'MI', dc: 'Chicago', ds: 'IL', mi: [280,320] },
    { oc: 'Lansing', os: 'MI', dc: 'Indianapolis', ds: 'IN', mi: [280,330] },
    { oc: 'Grand Rapids', os: 'MI', dc: 'Pittsburgh', ds: 'PA', mi: [450,520] },
    { oc: 'Detroit', os: 'MI', dc: 'Cleveland', ds: 'OH', mi: [160,200] },
  ],
  VA: [
    { oc: 'Richmond', os: 'VA', dc: 'Charlotte', ds: 'NC', mi: [300,350] },
    { oc: 'Norfolk', os: 'VA', dc: 'Raleigh', ds: 'NC', mi: [160,200] },
    { oc: 'Richmond', os: 'VA', dc: 'Philadelphia', ds: 'PA', mi: [280,330] },
    { oc: 'Richmond', os: 'VA', dc: 'Tampa', ds: 'FL', mi: [750,830] },
  ],
  NC: [
    { oc: 'Charlotte', os: 'NC', dc: 'Columbia', ds: 'SC', mi: [85,110] },
    { oc: 'Raleigh', os: 'NC', dc: 'Richmond', ds: 'VA', mi: [160,200] },
    { oc: 'Greensboro', os: 'NC', dc: 'Atlanta', ds: 'GA', mi: [320,380] },
    { oc: 'Charlotte', os: 'NC', dc: 'Jacksonville', ds: 'FL', mi: [500,570] },
  ],
  OH: [
    { oc: 'Cincinnati', os: 'OH', dc: 'Detroit', ds: 'MI', mi: [250,300] },
    { oc: 'Columbus', os: 'OH', dc: 'Pittsburgh', ds: 'PA', mi: [180,220] },
    { oc: 'Cleveland', os: 'OH', dc: 'Chicago', ds: 'IL', mi: [330,380] },
    { oc: 'Cincinnati', os: 'OH', dc: 'Indianapolis', ds: 'IN', mi: [100,130] },
  ],
  NJ: [
    { oc: 'Newark', os: 'NJ', dc: 'Richmond', ds: 'VA', mi: [300,350] },
    { oc: 'Edison', os: 'NJ', dc: 'Philadelphia', ds: 'PA', mi: [55,80] },
    { oc: 'Newark', os: 'NJ', dc: 'Harrisburg', ds: 'PA', mi: [170,210] },
  ],
  PA: [
    { oc: 'Philadelphia', os: 'PA', dc: 'Columbus', ds: 'OH', mi: [450,520] },
    { oc: 'Harrisburg', os: 'PA', dc: 'Pittsburgh', ds: 'PA', mi: [190,230] },
    { oc: 'Pittsburgh', os: 'PA', dc: 'Cleveland', ds: 'OH', mi: [130,160] },
  ],
  ID: [
    { oc: 'Boise', os: 'ID', dc: 'Chicago', ds: 'IL', mi: [1600,1700] },
    { oc: 'Boise', os: 'ID', dc: 'Dallas', ds: 'TX', mi: [1500,1600] },
    { oc: 'Boise', os: 'ID', dc: 'Sacramento', ds: 'CA', mi: [480,550] },
    { oc: 'Idaho Falls', os: 'ID', dc: 'Columbus', ds: 'OH', mi: [1550,1650] },
    { oc: 'Boise', os: 'ID', dc: 'Cincinnati', ds: 'OH', mi: [1600,1700] },
  ]
};

// Commodities per shipper
const SHIPPER_COMMODITIES = {
  'PepsiCo Beverages': ['Beverages','Snack Foods','Sports Drinks','Bottled Water'],
  'Spartan Nash': ['Grocery Products','Frozen Foods','Dairy Products','Fresh Produce','Bakery Items'],
  'Performance Food Group': ['Restaurant Supplies','Frozen Foods','Fresh Produce','Dairy Products'],
  'Coca-Cola Bottling': ['Beverages','Syrup Concentrate','Bottled Water','Sports Drinks'],
  'Boise Paper': ['Paper Products','Cardboard Rolls','Packaging Materials'],
  'Target Stores': ['General Merchandise','Seasonal Products','Household Goods'],
  'Kroger Distribution': ['Grocery Products','Frozen Foods','Dairy Products','Fresh Produce','Bakery Items'],
  'FedEx Ground': ['E-Commerce Packages','Ground Parcels','Parcel Freight']
};

// Shipper origin state weights
const SHIPPER_ORIGIN_WEIGHTS = {
  'PepsiCo Beverages':       { FL: 50, GA: 25, NC: 10, VA: 5, OH: 5, NJ: 3, PA: 2 },
  'Spartan Nash':            { MI: 50, OH: 20, FL: 10, GA: 10, PA: 10 },
  'Performance Food Group':  { VA: 35, NC: 25, FL: 15, GA: 15, PA: 10 },
  'Coca-Cola Bottling':      { GA: 45, FL: 30, NC: 10, VA: 10, OH: 5 },
  'Boise Paper':             { ID: 100 },
  'Target Stores':           { FL: 45, GA: 20, NJ: 15, PA: 10, OH: 10 },
  'Kroger Distribution':     { OH: 40, MI: 20, FL: 15, GA: 15, VA: 10 },
  'FedEx Ground':            { NC: 35, FL: 20, GA: 15, OH: 10, PA: 10, NJ: 10 }
};

// Status distribution
const STATUS_POOL = [];
for (let i = 0; i < 650; i++) STATUS_POOL.push('delivered');
for (let i = 0; i < 150; i++) STATUS_POOL.push('in_transit');
for (let i = 0; i < 80; i++)  STATUS_POOL.push('dispatched');
for (let i = 0; i < 60; i++)  STATUS_POOL.push('covered');
for (let i = 0; i < 40; i++)  STATUS_POOL.push('open');
for (let i = 0; i < 20; i++)  STATUS_POOL.push('cancelled');

function pickWeighted(weights) {
  const states = Object.keys(weights);
  const total = Object.values(weights).reduce((a,b) => a+b, 0);
  let r = Math.random() * total;
  for (const st of states) { r -= weights[st]; if (r <= 0) return st; }
  return states[states.length - 1];
}

// ── MAIN ─────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  try {
    await sequelize.authenticate();
    console.log('Connected to database.\n');

    // ── STEP 0: Ensure tables exist ──────────────────────────────────
    console.log('--- Step 0: Ensure tables exist ---');
    // Create lg_shippers if not present (the user wants this table)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS lg_shippers (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'demo',
        shipper_name VARCHAR(255) NOT NULL,
        contact_name VARCHAR(255),
        phone VARCHAR(50),
        email VARCHAR(255),
        city VARCHAR(255),
        state VARCHAR(10),
        relationship_score NUMERIC(5,2),
        volume_score NUMERIC(5,2),
        payment_score NUMERIC(5,2),
        growth_score NUMERIC(5,2),
        churn_risk VARCHAR(20) DEFAULT 'low',
        avg_payment_days INTEGER,
        total_loads_ltm INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS lg_compliance (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'demo',
        entity_type VARCHAR(30) DEFAULT 'carrier',
        entity_id INTEGER,
        compliance_type VARCHAR(100),
        status VARCHAR(30) DEFAULT 'active',
        effective_date DATE,
        expiry_date DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS lg_quotes (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'demo',
        shipper_id INTEGER,
        lane VARCHAR(255),
        origin_city VARCHAR(255),
        origin_state VARCHAR(10),
        destination_city VARCHAR(255),
        destination_state VARCHAR(10),
        equipment_type VARCHAR(50),
        quoted_rate NUMERIC(12,2),
        quoted_rpm NUMERIC(8,2),
        market_rate_at_quote NUMERIC(12,2),
        outcome VARCHAR(30) DEFAULT 'pending',
        winning_rate NUMERIC(12,2),
        delta_from_winner NUMERIC(12,2),
        loss_reason VARCHAR(255),
        auto_quoted BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    // Optional tables the user wants to clear — create stubs
    for (const tbl of ['lg_dispatches','lg_drivers','lg_trucks','lg_obd_findings','lg_obd_scans','lg_obd_ingestion_batches']) {
      await sequelize.query(`CREATE TABLE IF NOT EXISTS ${tbl} (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(50) NOT NULL DEFAULT 'demo',
        created_at TIMESTAMP DEFAULT NOW()
      );`).catch(() => {});
    }
    console.log('Tables ensured.\n');

    // ── STEP 1: Clear existing demo data ─────────────────────────────
    console.log('--- Step 1: Clear existing demo data ---');
    const clearTables = [
      'lg_obd_findings','lg_obd_scans','lg_obd_ingestion_batches',
      'lg_dispatches','lg_quotes','lg_rate_benchmarks','lg_compliance',
      'lg_loads','lg_shippers','lg_drivers','lg_trucks','lg_carriers'
    ];
    for (const tbl of clearTables) {
      try {
        const [, meta] = await sequelize.query(`DELETE FROM ${tbl} WHERE tenant_id = $1`, { bind: [TENANT] });
        console.log(`  ${tbl}: deleted ${meta?.rowCount ?? '?'} rows`);
      } catch (e) {
        console.log(`  ${tbl}: skipped (${e.message.slice(0,60)})`);
      }
    }
    console.log();

    // ── STEP 2: Insert 50 Carriers ───────────────────────────────────
    console.log('--- Step 2: Insert 50 Carriers ---');
    const carrierIds = [];
    const inactiveIndices = new Set([3, 17, 28, 36, 47]);      // 5 inactive/suspended
    const lowScoreIndices = new Set([5, 11, 19, 24, 31, 39, 43, 48]); // 8 low score

    for (let i = 0; i < 50; i++) {
      const name = CARRIER_NAMES[i];
      const mc = `MC-${randInt(100000, 999999)}`;
      const dot = `${randInt(1000000, 9999999)}`;
      const st = pick(CARRIER_STATES);
      const city = pick(CARRIER_CITIES[st] || ['Unknown']);
      const contactFirst = pick(CONTACT_FIRST);
      const contactLast = pick(CONTACT_LAST);
      const contact = `${contactFirst} ${contactLast}`;
      const email = `${contactFirst.toLowerCase()}.${contactLast.toLowerCase()}@${name.toLowerCase().replace(/[^a-z]/g,'').slice(0,12)}.com`;
      const phone = randPhone();
      const equip = pick(EQUIPMENT_OPTIONS);

      let opStatus = 'active';
      let score;
      if (inactiveIndices.has(i)) {
        opStatus = i % 2 === 0 ? 'inactive' : 'suspended';
        score = randFloat(40, 65);
      } else if (lowScoreIndices.has(i)) {
        score = randFloat(50, 69);
      } else {
        score = randFloat(75, 95);
      }

      const [[row]] = await sequelize.query(`
        INSERT INTO lg_carriers (tenant_id, carrier_name, mc_number, dot_number, operating_status,
          reliability_score, equipment_types, home_city, home_state, phone, email, contact_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7::text[],$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, { bind: [TENANT, name, mc, dot, opStatus, score, equip, city, st, phone, email, contact] });
      if (row) carrierIds.push(row.id);
    }
    console.log(`  Inserted ${carrierIds.length} carriers.\n`);

    // ── STEP 3: Insert 8 Shippers ────────────────────────────────────
    console.log('--- Step 3: Insert 8 Shippers ---');
    const shipperMap = {}; // name → id
    for (const s of SHIPPER_DATA) {
      const email = `${s.contact.split(' ')[0].toLowerCase()}@${s.name.toLowerCase().replace(/[^a-z]/g,'').slice(0,12)}.com`;
      const phone = randPhone();
      const [[row]] = await sequelize.query(`
        INSERT INTO lg_shippers (tenant_id, shipper_name, contact_name, phone, email, city, state,
          relationship_score, volume_score, payment_score, growth_score, churn_risk, avg_payment_days, total_loads_ltm)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT DO NOTHING
        RETURNING id
      `, { bind: [TENANT, s.name, s.contact, phone, email, s.city, s.state,
            s.rel, s.vol, s.pay, s.growth, s.churn, s.avg_pay_days, s.loads_ltm] });
      if (row) shipperMap[s.name] = row.id;
    }
    console.log(`  Inserted ${Object.keys(shipperMap).length} shippers.\n`);

    // ── STEP 4: Insert 1000 Loads ────────────────────────────────────
    console.log('--- Step 4: Insert 1000 Loads ---');

    // Pre-shuffle status pool
    for (let i = STATUS_POOL.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [STATUS_POOL[i], STATUS_POOL[j]] = [STATUS_POOL[j], STATUS_POOL[i]];
    }

    // Active carrier IDs (for assignment)
    const activeCarrierIds = [];
    const [carrierRows] = await sequelize.query(
      `SELECT id FROM lg_carriers WHERE tenant_id = $1 AND operating_status = 'active'`,
      { bind: [TENANT] }
    );
    for (const c of carrierRows) activeCarrierIds.push(c.id);

    // Build load list by shipper
    const loadQueue = [];
    for (const [shipperName, count] of Object.entries(SHIPPER_LOAD_COUNTS)) {
      for (let i = 0; i < count; i++) loadQueue.push(shipperName);
    }
    // Shuffle
    for (let i = loadQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [loadQueue[i], loadQueue[j]] = [loadQueue[j], loadQueue[i]];
    }

    // Special margin indices
    const negativeMarginIndices = new Set();
    while (negativeMarginIndices.size < 19) negativeMarginIndices.add(randInt(0, 999));
    const thinMarginIndices = new Set();
    while (thinMarginIndices.size < 30) {
      const idx = randInt(0, 999);
      if (!negativeMarginIndices.has(idx)) thinMarginIndices.add(idx);
    }

    // Track Boise Paper flatbed count for thin margin
    let boiseFlat = 0;

    let loadCount = 0;
    const BATCH = 50;
    for (let batch = 0; batch < 1000; batch += BATCH) {
      const values = [];
      const binds = [];
      let paramIdx = 1;

      for (let b = 0; b < BATCH && (batch + b) < 1000; b++) {
        const idx = batch + b;
        const shipperName = loadQueue[idx];
        const status = STATUS_POOL[idx];
        const loadRef = `CW-${60001 + idx}`;

        // Pick origin state weighted by shipper
        const originState = pickWeighted(SHIPPER_ORIGIN_WEIGHTS[shipperName]);
        const laneCandidates = LANES[originState];
        if (!laneCandidates || laneCandidates.length === 0) continue;
        const lane = pick(laneCandidates);

        // Equipment
        let equipType;
        if (shipperName === 'Boise Paper') {
          equipType = 'flatbed';
        } else {
          const r = Math.random();
          if (r < 0.70) equipType = 'reefer';
          else if (r < 0.90) equipType = 'dry_van';
          else equipType = 'flatbed';
        }

        const miles = randFloat(lane.mi[0], lane.mi[1], 1);

        // Rate per mile by equipment
        let rpmBase;
        if (equipType === 'reefer') rpmBase = randFloat(5.50, 7.00);
        else if (equipType === 'dry_van') rpmBase = randFloat(5.00, 6.00);
        else rpmBase = randFloat(4.50, 5.50);

        let sellRate = parseFloat((miles * rpmBase).toFixed(2));
        let buyRate, margin, marginPct;

        if (negativeMarginIndices.has(idx)) {
          // Negative margin — spot market spike
          const negPct = randFloat(5, 15);
          buyRate = parseFloat((sellRate * (1 + negPct / 100)).toFixed(2));
          margin = parseFloat((sellRate - buyRate).toFixed(2));
          marginPct = parseFloat(((margin / sellRate) * 100).toFixed(2));
        } else if (thinMarginIndices.has(idx)) {
          // Thin margin: 0-5%
          const thinPct = randFloat(0.5, 4.9);
          buyRate = parseFloat((sellRate * (1 - thinPct / 100)).toFixed(2));
          margin = parseFloat((sellRate - buyRate).toFixed(2));
          marginPct = parseFloat(thinPct.toFixed(2));
        } else if (shipperName === 'Boise Paper' && equipType === 'flatbed' && boiseFlat < 15) {
          // Boise Paper flatbed: consistently thin
          boiseFlat++;
          const thinPct = randFloat(0.5, 4.9);
          buyRate = parseFloat((sellRate * (1 - thinPct / 100)).toFixed(2));
          margin = parseFloat((sellRate - buyRate).toFixed(2));
          marginPct = parseFloat(thinPct.toFixed(2));
        } else {
          // Healthy margin: 12-19%
          const healthyPct = randFloat(12, 19);
          buyRate = parseFloat((sellRate * (1 - healthyPct / 100)).toFixed(2));
          margin = parseFloat((sellRate - buyRate).toFixed(2));
          marginPct = parseFloat(healthyPct.toFixed(2));
        }

        const rpm = parseFloat((sellRate / miles).toFixed(2));

        // Dates: March 1-24, 2026
        const pickupDate = fmtDate(randDate('2026-03-01', '2026-03-24'));
        const transitDays = miles > 800 ? randInt(2, 4) : (miles > 400 ? randInt(1, 3) : randInt(0, 1));
        const delivDate = fmtDate(new Date(new Date(pickupDate).getTime() + transitDays * 86400000));

        const weight = randInt(20000, 44000);
        const commodity = pick(SHIPPER_COMMODITIES[shipperName]);

        // Temperature for reefer
        let tempMin = null, tempMax = null;
        if (equipType === 'reefer') {
          const frozen = ['Frozen Foods'].includes(commodity) ||
            (shipperName === 'Kroger Distribution' && Math.random() < 0.3) ||
            (shipperName === 'Spartan Nash' && Math.random() < 0.25);
          if (frozen) { tempMin = -10; tempMax = 0; }
          else { tempMin = 34; tempMax = 40; }
        }

        // Carrier assignment — open/cancelled get null
        let carrierId = null;
        if (status !== 'open' && status !== 'cancelled' && activeCarrierIds.length > 0) {
          carrierId = pick(activeCarrierIds);
        }

        const placeholders = [];
        const rowBinds = [
          TENANT, loadRef, shipperName, lane.oc, lane.os, lane.dc, lane.ds,
          pickupDate, delivDate, equipType, weight, miles, sellRate, buyRate,
          margin, marginPct, rpm, status, commodity, tempMin, tempMax, carrierId
        ];
        for (let p = 0; p < rowBinds.length; p++) {
          placeholders.push(`$${paramIdx}`);
          binds.push(rowBinds[p]);
          paramIdx++;
        }
        values.push(`(${placeholders.join(',')})`);
      }

      if (values.length > 0) {
        await sequelize.query(`
          INSERT INTO lg_loads (tenant_id, load_ref, shipper_name, origin_city, origin_state,
            destination_city, destination_state, pickup_date, delivery_date, equipment_type,
            weight_lbs, miles, sell_rate, buy_rate, margin, margin_pct, rate_per_mile,
            status, commodity, temperature_min, temperature_max, assigned_carrier_id)
          VALUES ${values.join(',')}
          ON CONFLICT DO NOTHING
        `, { bind: binds });
        loadCount += values.length;
      }
    }
    console.log(`  Inserted ${loadCount} loads.\n`);

    // ── STEP 5: Insert 30 Rate Benchmarks ────────────────────────────
    console.log('--- Step 5: Insert 30 Rate Benchmarks ---');
    const benchmarkLanes = [
      ['FL','GA','reefer'],['FL','NC','reefer'],['FL','VA','reefer'],['FL','NJ','reefer'],
      ['FL','PA','reefer'],['FL','OH','reefer'],['FL','MI','reefer'],['FL','IL','reefer'],
      ['FL','TN','reefer'],['FL','SC','reefer'],
      ['GA','FL','reefer'],['GA','NC','reefer'],['GA','SC','dry_van'],['GA','VA','reefer'],
      ['GA','OH','dry_van'],
      ['MI','OH','reefer'],['MI','IL','dry_van'],['MI','PA','reefer'],['MI','IN','dry_van'],
      ['VA','NC','dry_van'],['VA','PA','reefer'],['VA','FL','reefer'],
      ['NC','SC','dry_van'],['NC','GA','dry_van'],
      ['OH','MI','reefer'],['OH','PA','dry_van'],['OH','IL','dry_van'],
      ['ID','IL','flatbed'],['ID','OH','flatbed'],['ID','TX','flatbed']
    ];
    let benchCount = 0;
    for (const [os, ds, equip] of benchmarkLanes) {
      let rpmAvg, rpmP25, rpmP75;
      if (equip === 'reefer') { rpmAvg = randFloat(5.80, 6.50); rpmP25 = rpmAvg - randFloat(0.30, 0.50); rpmP75 = rpmAvg + randFloat(0.30, 0.50); }
      else if (equip === 'dry_van') { rpmAvg = randFloat(5.10, 5.70); rpmP25 = rpmAvg - randFloat(0.25, 0.45); rpmP75 = rpmAvg + randFloat(0.25, 0.45); }
      else { rpmAvg = randFloat(4.60, 5.20); rpmP25 = rpmAvg - randFloat(0.20, 0.40); rpmP75 = rpmAvg + randFloat(0.20, 0.40); }

      const avgMiles = randFloat(300, 1200, 0);
      const avgRate = parseFloat((rpmAvg * avgMiles).toFixed(2));
      const minRate = parseFloat((rpmP25 * avgMiles).toFixed(2));
      const maxRate = parseFloat((rpmP75 * avgMiles).toFixed(2));
      const sample = randInt(25, 350);
      const conf = sample > 200 ? 'very_high' : (sample > 100 ? 'high' : (sample > 50 ? 'medium' : 'low'));
      const rateDate = '2026-03-15';

      await sequelize.query(`
        INSERT INTO lg_rate_benchmarks (tenant_id, origin_state, destination_state, equipment_type,
          avg_rate, min_rate, max_rate, rate_per_mile_avg, rate_per_mile_p25, rate_per_mile_p75,
          rate_date, sample_size, confidence, benchmark_source)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, os, ds, equip, avgRate, minRate, maxRate,
            parseFloat(rpmAvg.toFixed(2)), parseFloat(rpmP25.toFixed(2)), parseFloat(rpmP75.toFixed(2)),
            rateDate, sample, conf, 'dat'] });
      benchCount++;
    }
    console.log(`  Inserted ${benchCount} rate benchmarks.\n`);

    // ── STEP 6: Insert 50 Compliance Records ─────────────────────────
    console.log('--- Step 6: Insert 50 Compliance Records ---');
    const complianceTypes = [
      'General Liability Insurance','Auto Liability Insurance','Cargo Insurance',
      'Workers Compensation','Operating Authority','DOT Inspection','BOC-3 Filing'
    ];
    let compCount = 0;
    for (let i = 0; i < 50 && i < carrierIds.length; i++) {
      const cType = pick(complianceTypes);
      let effectiveDate, expiryDate, status;
      if (i < 8) {
        // Expired
        effectiveDate = '2025-01-15';
        expiryDate = fmtDate(randDate('2025-10-01', '2026-02-28'));
        status = 'expired';
      } else if (i < 13) {
        // Expiring within 30 days
        effectiveDate = '2025-04-01';
        expiryDate = fmtDate(randDate('2026-03-25', '2026-04-23'));
        status = 'expiring_soon';
      } else {
        // Valid
        effectiveDate = '2025-06-01';
        expiryDate = fmtDate(randDate('2026-06-01', '2027-12-31'));
        status = 'active';
      }

      await sequelize.query(`
        INSERT INTO lg_compliance (tenant_id, entity_type, entity_id, compliance_type, status,
          effective_date, expiry_date)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, 'carrier', carrierIds[i], cType, status, effectiveDate, expiryDate] });
      compCount++;
    }
    console.log(`  Inserted ${compCount} compliance records.\n`);

    // ── STEP 7: Insert 40 Quotes ─────────────────────────────────────
    console.log('--- Step 7: Insert 40 Quotes ---');
    const quoteOutcomes = [];
    for (let i = 0; i < 18; i++) quoteOutcomes.push('won');
    for (let i = 0; i < 10; i++) quoteOutcomes.push('lost');
    for (let i = 0; i < 8; i++) quoteOutcomes.push('pending');
    for (let i = 0; i < 4; i++) quoteOutcomes.push('expired');

    const lossReasons = ['Price too high','Carrier capacity unavailable','Transit time too long',
      'Competitor offered lower rate','Equipment mismatch','Customer went spot market'];

    const shipperNames = Object.keys(shipperMap);
    let quoteCount = 0;
    for (let i = 0; i < 40; i++) {
      const shipName = pick(shipperNames);
      const shipperId = shipperMap[shipName];
      const originState = pickWeighted(SHIPPER_ORIGIN_WEIGHTS[shipName]);
      const laneCandidates = LANES[originState];
      if (!laneCandidates) continue;
      const lane = pick(laneCandidates);
      const equip = pick(['reefer','dry_van','flatbed']);
      const laneStr = `${lane.oc}, ${lane.os} → ${lane.dc}, ${lane.ds}`;
      const miles = randFloat(lane.mi[0], lane.mi[1], 0);
      let rpmBase = equip === 'reefer' ? randFloat(5.50, 6.80) : (equip === 'dry_van' ? randFloat(5.00, 5.80) : randFloat(4.50, 5.30));
      const quotedRate = parseFloat((miles * rpmBase).toFixed(2));
      const quotedRpm = parseFloat(rpmBase.toFixed(2));
      const marketRate = parseFloat((quotedRate * randFloat(0.92, 1.08)).toFixed(2));

      const outcome = quoteOutcomes[i];
      let winningRate = null, delta = null, lossReason = null, autoQuoted = Math.random() < 0.4;
      if (outcome === 'won') {
        winningRate = quotedRate;
        delta = 0;
      } else if (outcome === 'lost') {
        winningRate = parseFloat((quotedRate * randFloat(0.88, 0.97)).toFixed(2));
        delta = parseFloat((quotedRate - winningRate).toFixed(2));
        lossReason = pick(lossReasons);
      }

      await sequelize.query(`
        INSERT INTO lg_quotes (tenant_id, shipper_id, lane, origin_city, origin_state,
          destination_city, destination_state, equipment_type, quoted_rate, quoted_rpm,
          market_rate_at_quote, outcome, winning_rate, delta_from_winner, loss_reason, auto_quoted)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT DO NOTHING
      `, { bind: [TENANT, shipperId, laneStr, lane.oc, lane.os, lane.dc, lane.ds, equip,
            quotedRate, quotedRpm, marketRate, outcome, winningRate, delta, lossReason, autoQuoted] });
      quoteCount++;
    }
    console.log(`  Inserted ${quoteCount} quotes.\n`);

    // ── Summary ──────────────────────────────────────────────────────
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log('========================================');
    console.log('  CW Carriers Demo Seed Complete');
    console.log('========================================');
    console.log(`  Carriers:     ${carrierIds.length}`);
    console.log(`  Shippers:     ${Object.keys(shipperMap).length}`);
    console.log(`  Loads:        ${loadCount}`);
    console.log(`  Benchmarks:   ${benchCount}`);
    console.log(`  Compliance:   ${compCount}`);
    console.log(`  Quotes:       ${quoteCount}`);
    console.log(`  Runtime:      ${elapsed}s`);
    console.log('========================================');

  } catch (err) {
    console.error('FATAL:', err);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();
