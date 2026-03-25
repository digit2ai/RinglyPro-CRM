#!/usr/bin/env node
// Generate 3 CSV files for CW Carriers USA with 980 days of data
// June 1, 2023 to March 24, 2026

const fs = require('fs');
const path = require('path');

// Seed-based PRNG (mulberry32)
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(42);

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return rand() * (max - min) + min;
}

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickWeighted(items, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function csvField(val) {
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Date range: June 1, 2023 to March 24, 2026
const startDate = new Date(2023, 5, 1); // June 1, 2023
const endDate = new Date(2026, 2, 24);   // March 24, 2026
const daySpan = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)); // ~980

function randomDate() {
  const offset = randInt(0, daySpan - 1);
  const d = new Date(startDate.getTime() + offset * 86400000);
  return d;
}

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ========== FILE 1: McLeod Loads ==========

const customers = [
  { name: 'PepsiCo', weight: 38 },
  { name: 'Spartan Nash', weight: 15 },
  { name: 'Performance Food Group', weight: 12 },
  { name: 'Coca-Cola', weight: 11 },
  { name: 'Kroger', weight: 8 },
  { name: 'Target', weight: 7 },
  { name: 'FedEx Ground', weight: 5 },
  { name: 'Boise Paper', weight: 4 },
];
const customerNames = customers.map(c => c.name);
const customerWeights = customers.map(c => c.weight);

const origins = {
  FL: ['Tampa', 'Jacksonville', 'Orlando', 'Lakeland', 'Miami'],
  GA: ['Atlanta', 'Savannah', 'Augusta'],
  MI: ['Grand Rapids', 'Detroit', 'Lansing'],
  VA: ['Richmond', 'Norfolk'],
  NC: ['Charlotte', 'Raleigh'],
  OH: ['Cincinnati', 'Columbus', 'Cleveland'],
  NJ: ['Newark', 'Edison'],
  PA: ['Philadelphia', 'Harrisburg', 'Pittsburgh'],
  ID: ['Boise', 'Idaho Falls'],
};

const originStates = ['FL', 'FL', 'FL', 'FL', 'GA', 'GA', 'MI', 'VA', 'NC', 'OH', 'NJ', 'PA', 'ID'];
const originWeights = [10, 10, 10, 10, 7, 7, 6, 5, 5, 8, 4, 3, 5]; // approximate % distribution
// FL total ~40, GA ~14 (we'll adjust), MI ~6, VA+NC ~10, OH ~8, NJ+PA ~7, ID ~5

const destCities = [
  { city: 'Atlanta', state: 'GA' },
  { city: 'Charlotte', state: 'NC' },
  { city: 'Nashville', state: 'TN' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Columbus', state: 'OH' },
  { city: 'Indianapolis', state: 'IN' },
  { city: 'Dallas', state: 'TX' },
  { city: 'Philadelphia', state: 'PA' },
  { city: 'Newark', state: 'NJ' },
  { city: 'Baltimore', state: 'MD' },
  { city: 'Richmond', state: 'VA' },
  { city: 'Miami', state: 'FL' },
  { city: 'Tampa', state: 'FL' },
  { city: 'Detroit', state: 'MI' },
  { city: 'St. Louis', state: 'MO' },
  { city: 'Memphis', state: 'TN' },
  { city: 'Louisville', state: 'KY' },
  { city: 'Pittsburgh', state: 'PA' },
  { city: 'Raleigh', state: 'NC' },
  { city: 'Greenville', state: 'SC' },
  { city: 'Savannah', state: 'GA' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Orlando', state: 'FL' },
  { city: 'Los Angeles', state: 'CA' },
  { city: 'Houston', state: 'TX' },
  { city: 'Denver', state: 'CO' },
];

const carrierNames = [
  'Swift Transport LLC', 'Eagle Freight Inc', 'Patriot Trucking Corp', 'Sunbelt Carriers LLC',
  'Mountain West Transport', 'Pacific Coast Logistics', 'Volunteer Express Inc', 'Buckeye Freight Systems',
  'Keystone Carriers Inc', 'Evergreen Transport LLC', 'Gulf Coast Carriers', 'Great Lakes Express',
  'Lone Star Freight', 'Blue Ridge Transport', 'Carolina Freight Corp', 'Heartland Trucking Co',
  'Cardinal Logistics LLC', 'Redline Freight Corp', 'Empire State Trucking', 'Tri-State Hauling Inc',
  'Copperhead Carriers', 'Seminole Express', 'Wolverine Freight Inc', 'Sunbelt Carriers LLC',
  'Northstar Logistics', 'Allegheny Freight Co', 'Badger Freight Inc', 'Hoosier Express LLC',
  'Pinnacle Freight LLC', 'Shenandoah Freight'
];

const carrierMCs = [
  'MC-284927', 'MC-391054', 'MC-502187', 'MC-618342', 'MC-729415', 'MC-834528', 'MC-145672',
  'MC-256783', 'MC-367894', 'MC-478905', 'MC-334561', 'MC-801238', 'MC-912349', 'MC-123450',
  'MC-667895', 'MC-456783', 'MC-678905', 'MC-667894', 'MC-778906', 'MC-345672', 'MC-223451',
  'MC-889016', 'MC-112349', 'MC-618342', 'MC-556783', 'MC-445673', 'MC-990128', 'MC-112351',
  'MC-445674', 'MC-667896'
];

const commodities = [
  'Beverages', 'Snack Foods', 'Sports Drinks', 'Grocery Products', 'Frozen Foods',
  'Dairy Products', 'Fresh Produce', 'Restaurant Supplies', 'Bottled Water', 'Paper Products',
  'Cardboard Rolls', 'Packaging Materials', 'General Merchandise', 'Seasonal Products',
  'E-Commerce Packages', 'Ground Parcels', 'Bakery Items'
];

const customerCommodities = {
  'PepsiCo': ['Beverages', 'Snack Foods', 'Sports Drinks', 'Bottled Water'],
  'Spartan Nash': ['Grocery Products', 'Frozen Foods', 'Dairy Products', 'Fresh Produce', 'Bakery Items'],
  'Performance Food Group': ['Restaurant Supplies', 'Frozen Foods', 'Fresh Produce', 'Dairy Products'],
  'Coca-Cola': ['Beverages', 'Bottled Water', 'Sports Drinks'],
  'Kroger': ['Grocery Products', 'Frozen Foods', 'Dairy Products', 'Fresh Produce', 'Bakery Items'],
  'Target': ['General Merchandise', 'Seasonal Products', 'Grocery Products'],
  'FedEx Ground': ['E-Commerce Packages', 'Ground Parcels', 'General Merchandise'],
  'Boise Paper': ['Paper Products', 'Cardboard Rolls', 'Packaging Materials'],
};

const TOTAL_LOADS = 3200;

function generateLoads() {
  const header = 'Movement ID,Customer,Origin City,Origin State,Dest City,Dest State,Ship Date,Del Date,Equipment,Weight,Miles,Customer Charge,Carrier Pay,Fuel Surcharge,Margin,Margin %,Status,Commodity,Carrier Name,Carrier MC';
  const rows = [header];

  // Pre-mark special margin loads
  const negativeMarginIndices = new Set();
  const lowMarginIndices = new Set();  // below 5%
  const boiseFlatbedLowIndices = new Set();

  while (negativeMarginIndices.size < 25) negativeMarginIndices.add(randInt(0, TOTAL_LOADS - 1));
  while (lowMarginIndices.size < 40) {
    const idx = randInt(0, TOTAL_LOADS - 1);
    if (!negativeMarginIndices.has(idx)) lowMarginIndices.add(idx);
  }
  // Boise Paper flatbed low margin indices tracked separately during generation

  let boiseFlatbedCount = 0;

  for (let i = 0; i < TOTAL_LOADS; i++) {
    const movementId = `CW-${60001 + i}`;

    let customer;
    // For Boise Paper loads from ID
    if (i < TOTAL_LOADS * 0.04 + 20) {
      // Force some Boise Paper early to ensure enough
    }
    customer = pickWeighted(customerNames, customerWeights);

    // Determine origin
    let originState, originCity;
    if (customer === 'Boise Paper') {
      originState = 'ID';
      originCity = pick(origins.ID);
    } else {
      // Weighted origin selection excluding ID
      const statesNoID = ['FL', 'GA', 'MI', 'VA', 'NC', 'OH', 'NJ', 'PA'];
      const weightsNoID = [40, 20, 10, 5, 5, 8, 4, 3];
      originState = pickWeighted(statesNoID, weightsNoID);
      originCity = pick(origins[originState]);
    }

    // Equipment
    let equipment;
    if (customer === 'Boise Paper') {
      equipment = 'Flatbed';
    } else if (customer === 'Target' || customer === 'FedEx Ground') {
      equipment = rand() < 0.7 ? 'Dry Van' : 'Reefer';
    } else {
      equipment = pickWeighted(['Reefer', 'Dry Van', 'Flatbed'], [70, 20, 10]);
    }

    // Destination (avoid same state as origin most of the time)
    let dest;
    let attempts = 0;
    do {
      dest = pick(destCities);
      attempts++;
    } while (dest.state === originState && attempts < 10);

    // Dates
    const shipDate = randomDate();
    const transitDays = randInt(1, 4);
    const delDate = new Date(shipDate.getTime() + transitDays * 86400000);

    // Miles
    const miles = randInt(55, 1700);

    // Weight (lbs)
    const weight = randInt(12000, 44000);

    // Rate per mile
    let rpmMin, rpmMax;
    if (equipment === 'Reefer') { rpmMin = 5.50; rpmMax = 7.00; }
    else if (equipment === 'Dry Van') { rpmMin = 4.50; rpmMax = 6.00; }
    else { rpmMin = 4.00; rpmMax = 5.50; }

    const rpm = randFloat(rpmMin, rpmMax);
    let customerCharge = Math.round(rpm * miles * 100) / 100;

    // Fuel surcharge: 8-15% of customer charge
    const fuelPct = randFloat(0.08, 0.15);
    const fuelSurcharge = Math.round(customerCharge * fuelPct * 100) / 100;

    // Margin logic
    let carrierPay, margin, marginPct;

    const isBoiseFlatbedLow = customer === 'Boise Paper' && equipment === 'Flatbed' && boiseFlatbedCount < 20;

    if (negativeMarginIndices.has(i)) {
      // Negative margin
      const overPct = randFloat(0.02, 0.08);
      carrierPay = Math.round(customerCharge * (1 + overPct) * 100) / 100;
    } else if (lowMarginIndices.has(i)) {
      // Below 5% margin
      const marginTarget = randFloat(0.005, 0.049);
      carrierPay = Math.round(customerCharge * (1 - marginTarget) * 100) / 100;
    } else if (isBoiseFlatbedLow) {
      // Boise Paper flatbed 0-5%
      const marginTarget = randFloat(0.001, 0.05);
      carrierPay = Math.round(customerCharge * (1 - marginTarget) * 100) / 100;
      boiseFlatbedCount++;
    } else {
      // Healthy 12-19%
      const marginTarget = randFloat(0.12, 0.19);
      carrierPay = Math.round(customerCharge * (1 - marginTarget) * 100) / 100;
    }

    margin = Math.round((customerCharge - carrierPay) * 100) / 100;
    marginPct = customerCharge > 0 ? Math.round((margin / customerCharge) * 10000) / 100 : 0;

    // Commodity
    const custComms = customerCommodities[customer] || commodities;
    const commodity = pick(custComms);

    // Carrier
    const carrierIdx = randInt(0, carrierNames.length - 1);

    const row = [
      movementId,
      csvField(customer),
      csvField(originCity),
      originState,
      csvField(dest.city),
      dest.state,
      fmtDate(shipDate),
      fmtDate(delDate),
      equipment,
      weight,
      miles,
      customerCharge.toFixed(2),
      carrierPay.toFixed(2),
      fuelSurcharge.toFixed(2),
      margin.toFixed(2),
      marginPct.toFixed(2),
      'delivered',
      csvField(commodity),
      csvField(carrierNames[carrierIdx]),
      carrierMCs[carrierIdx]
    ].join(',');

    rows.push(row);
  }

  return rows.join('\n');
}

// ========== FILE 2: Carrier Assure ==========

function generateCarrierAssure() {
  const header = 'Carrier Name,MC Number,DOT Number,SCAC,Authority Status,Insurance Status,Auto Liability,Cargo Insurance,General Liability,Safety Rating,CSA Score,Out of Service Rate,Power Units,Drivers,Equipment Types,Home State,Payment Terms,Reliability Score,Risk Score,Last Verified,Insurance Expiry,Contract Status';

  // 50 carriers
  const allCarriers = [
    // Original 30 from loads
    ...carrierNames.map((name, i) => ({ name, mc: carrierMCs[i] })),
    // 20 additional
    { name: 'Dixie Freight LLC', mc: 'MC-551234' },
    { name: 'Magnolia Transport', mc: 'MC-662345' },
    { name: 'Appalachian Haulers Inc', mc: 'MC-773456' },
    { name: 'Chesapeake Freight Co', mc: 'MC-884567' },
    { name: 'Palmetto Express LLC', mc: 'MC-995678' },
    { name: 'Ozark Trucking Corp', mc: 'MC-106789' },
    { name: 'Prairie Land Freight', mc: 'MC-217890' },
    { name: 'Tidewater Carriers Inc', mc: 'MC-328901' },
    { name: 'Iron Horse Transport', mc: 'MC-439012' },
    { name: 'Delta Freight Systems', mc: 'MC-540123' },
    { name: 'Cascade Logistics LLC', mc: 'MC-651234' },
    { name: 'Frontier Freight Inc', mc: 'MC-762345' },
    { name: 'Old Dominion Express', mc: 'MC-873456' },
    { name: 'Razorback Hauling Co', mc: 'MC-984567' },
    { name: 'Granite State Transport', mc: 'MC-195678' },
    { name: 'Bayou Freight LLC', mc: 'MC-206789' },
    { name: 'Catawba Carriers Inc', mc: 'MC-317890' },
    { name: 'Dogwood Transport Co', mc: 'MC-428901' },
    { name: 'Flint River Freight', mc: 'MC-539012' },
    { name: 'High Plains Trucking', mc: 'MC-640123' },
  ];

  const states = ['FL', 'GA', 'MI', 'OH', 'VA', 'NC', 'NJ', 'PA', 'ID', 'TN', 'IL', 'IN', 'TX', 'AL', 'SC', 'KY', 'MO', 'WI', 'MD', 'CT'];
  const equipTypes = ['Reefer', 'Dry Van', 'Flatbed', 'Reefer/Dry Van', 'Dry Van/Flatbed', 'Reefer/Dry Van/Flatbed'];
  const scacPrefixes = ['SWFT', 'EAGL', 'PATR', 'SNBT', 'MTWT', 'PCCL', 'VLTR', 'BCKY', 'KYST', 'EGRN',
    'GLFC', 'GRLK', 'LNST', 'BLRG', 'CRLN', 'HRTL', 'CRDL', 'RDLN', 'EMPS', 'TRST',
    'CPHR', 'SMLE', 'WLVR', 'SNBC', 'NRST', 'ALGH', 'BDGR', 'HOSR', 'PNCL', 'SHND',
    'DXFR', 'MGNT', 'APLH', 'CHSK', 'PLMT', 'OZRK', 'PRLD', 'TDWT', 'IRNH', 'DLTF',
    'CSCD', 'FRNT', 'OLDM', 'RZBK', 'GRST', 'BYOU', 'CTWB', 'DGWD', 'FLRV', 'HPLT'];

  // Indices for special flags (0-indexed among 50 carriers)
  const lapsedInsurance = [3, 12, 27, 38, 45];     // 5 lapsed
  const expiredInsurance = [7, 19, 33, 42];          // 4 expired
  const expiringWithin30 = [1, 22, 48];              // 3 expiring soon
  const conditionalAuth = [15, 36];                   // 2 conditional
  const lowReliability = [5, 11, 18, 24, 30, 35, 41, 47]; // 8 below 70
  const highCSA = [9, 16, 28, 39, 44];              // 5 above 75

  const rows = [header];

  for (let i = 0; i < allCarriers.length; i++) {
    const c = allCarriers[i];
    const dotNum = randInt(1000000, 3999999);
    const scac = scacPrefixes[i] || 'XXXX';

    // Authority
    let authStatus = 'Active';
    if (conditionalAuth.includes(i)) authStatus = 'Conditional';

    // Insurance
    let insStatus = 'Active';
    let insExpiry;
    const baseExpiry = new Date(2026, 2, 24); // March 24, 2026

    if (lapsedInsurance.includes(i)) {
      insStatus = 'Lapsed';
      insExpiry = new Date(baseExpiry.getTime() - randInt(60, 180) * 86400000);
    } else if (expiredInsurance.includes(i)) {
      insStatus = 'Expired';
      insExpiry = new Date(baseExpiry.getTime() - randInt(30, 120) * 86400000);
    } else if (expiringWithin30.includes(i)) {
      insStatus = 'Active';
      insExpiry = new Date(baseExpiry.getTime() + randInt(1, 29) * 86400000);
    } else {
      insExpiry = new Date(baseExpiry.getTime() + randInt(60, 365) * 86400000);
    }

    const autoLiability = pickWeighted(['$1,000,000', '$750,000', '$500,000'], [60, 25, 15]);
    const cargoIns = pickWeighted(['$100,000', '$250,000', '$500,000'], [40, 40, 20]);
    const genLiability = pickWeighted(['$1,000,000', '$2,000,000', '$500,000'], [50, 30, 20]);

    // Safety
    let safetyRating = pickWeighted(['Satisfactory', 'Conditional', 'None'], [70, 15, 15]);
    if (conditionalAuth.includes(i)) safetyRating = 'Conditional';

    let csaScore = randInt(20, 65);
    if (highCSA.includes(i)) csaScore = randInt(76, 95);

    const oosRate = (randFloat(2, 25)).toFixed(1);
    const powerUnits = randInt(5, 350);
    const drivers = Math.round(powerUnits * randFloat(1.0, 1.5));
    const equipType = pick(equipTypes);
    const homeState = pick(states);
    const payTerms = pickWeighted(['Net 30', 'Net 15', 'Quick Pay', 'Net 45'], [50, 25, 15, 10]);

    let reliability = randInt(70, 98);
    if (lowReliability.includes(i)) reliability = randInt(42, 69);

    const riskScore = reliability >= 80 ? pickWeighted(['Low', 'Medium', 'High'], [70, 25, 5]) :
                      reliability >= 60 ? pickWeighted(['Low', 'Medium', 'High'], [10, 60, 30]) :
                      pickWeighted(['Low', 'Medium', 'High'], [0, 30, 70]);

    const lastVerified = fmtDate(new Date(baseExpiry.getTime() - randInt(0, 60) * 86400000));

    let contractStatus = pickWeighted(['Active', 'Pending', 'Expired'], [75, 15, 10]);
    if (lapsedInsurance.includes(i) || expiredInsurance.includes(i)) {
      contractStatus = rand() < 0.6 ? 'Expired' : 'Active';
    }

    const row = [
      csvField(c.name),
      c.mc,
      dotNum,
      scac,
      authStatus,
      insStatus,
      csvField(autoLiability),
      csvField(cargoIns),
      csvField(genLiability),
      safetyRating,
      csaScore,
      oosRate + '%',
      powerUnits,
      drivers,
      csvField(equipType),
      homeState,
      payTerms,
      reliability,
      riskScore,
      lastVerified,
      fmtDate(insExpiry),
      contractStatus
    ].join(',');

    rows.push(row);
  }

  return rows.join('\n');
}

// ========== FILE 3: DAT Rates ==========

function generateDATRates() {
  const header = 'Origin State,Destination State,Equipment Type,Avg Rate Per Mile,Min Rate Per Mile,Max Rate Per Mile,Avg Total Rate,Sample Size,Confidence,Rate Date,Benchmark Source';

  const lanes = [
    // Reefer lanes
    ['FL', 'GA', 'Reefer'], ['FL', 'NC', 'Reefer'], ['FL', 'VA', 'Reefer'], ['FL', 'NJ', 'Reefer'],
    ['FL', 'PA', 'Reefer'], ['FL', 'OH', 'Reefer'], ['FL', 'MI', 'Reefer'], ['FL', 'IL', 'Reefer'],
    ['FL', 'TN', 'Reefer'], ['FL', 'SC', 'Reefer'], ['FL', 'FL', 'Reefer'],
    ['GA', 'FL', 'Reefer'], ['GA', 'NC', 'Reefer'], ['GA', 'SC', 'Reefer'], ['GA', 'VA', 'Reefer'],
    ['GA', 'OH', 'Reefer'], ['GA', 'TN', 'Reefer'],
    ['MI', 'OH', 'Reefer'], ['MI', 'IL', 'Reefer'], ['MI', 'PA', 'Reefer'], ['MI', 'IN', 'Reefer'],
    ['OH', 'MI', 'Reefer'], ['OH', 'PA', 'Reefer'], ['OH', 'IL', 'Reefer'],
    ['VA', 'NC', 'Reefer'], ['VA', 'FL', 'Reefer'],
    ['NC', 'SC', 'Reefer'],
    ['NJ', 'PA', 'Reefer'], ['NJ', 'VA', 'Reefer'], ['NJ', 'FL', 'Reefer'],
    ['PA', 'NJ', 'Reefer'], ['PA', 'OH', 'Reefer'],
    // Dry Van lanes
    ['GA', 'FL', 'Dry Van'], ['FL', 'GA', 'Dry Van'], ['NC', 'FL', 'Dry Van'],
    // Flatbed lanes
    ['ID', 'IL', 'Flatbed'], ['ID', 'TX', 'Flatbed'], ['ID', 'CA', 'Flatbed'], ['ID', 'OH', 'Flatbed'],
    ['GA', 'NJ', 'Flatbed'],
  ];

  const rows = [header];

  for (const [orig, dest, equip] of lanes) {
    let avgRpm;
    if (equip === 'Reefer') {
      avgRpm = randFloat(5.50, 7.00);
    } else if (equip === 'Dry Van') {
      avgRpm = randFloat(4.50, 6.00);
    } else {
      avgRpm = randFloat(4.00, 5.50);
    }

    const minRpm = Math.round((avgRpm * randFloat(0.78, 0.88)) * 100) / 100;
    const maxRpm = Math.round((avgRpm * randFloat(1.12, 1.25)) * 100) / 100;
    avgRpm = Math.round(avgRpm * 100) / 100;

    // Avg miles for lane
    const avgMiles = randInt(200, 1400);
    const avgTotal = Math.round(avgRpm * avgMiles * 100) / 100;
    const sampleSize = randInt(45, 380);
    const confidence = sampleSize > 200 ? 'High' : sampleSize > 100 ? 'Medium' : 'Low';

    const row = [
      orig,
      dest,
      equip,
      avgRpm.toFixed(2),
      minRpm.toFixed(2),
      maxRpm.toFixed(2),
      avgTotal.toFixed(2),
      sampleSize,
      confidence,
      '2026-03-15',
      'DAT RateView'
    ].join(',');

    rows.push(row);
  }

  return rows.join('\n');
}

// ========== WRITE FILES ==========

const samplesDir = '/Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/verticals/freight_broker/frontend/public/samples';

console.log('Generating McLeod loads CSV...');
const loadsCSV = generateLoads();
const loadsPath = path.join(samplesDir, 'cw-carriers-mcleod-loads.csv');
fs.writeFileSync(loadsPath, loadsCSV);
const loadsRows = loadsCSV.split('\n').length - 1;
console.log(`  Wrote ${loadsRows} rows to ${loadsPath}`);
console.log(`  File size: ${(fs.statSync(loadsPath).size / 1024).toFixed(1)} KB`);

console.log('Generating Carrier Assure CSV...');
const carrierCSV = generateCarrierAssure();
const carrierPath = path.join(samplesDir, 'cw-carriers-carrier-assure.csv');
fs.writeFileSync(carrierPath, carrierCSV);
const carrierRows = carrierCSV.split('\n').length - 1;
console.log(`  Wrote ${carrierRows} rows to ${carrierPath}`);
console.log(`  File size: ${(fs.statSync(carrierPath).size / 1024).toFixed(1)} KB`);

console.log('Generating DAT Rates CSV...');
const datCSV = generateDATRates();
const datPath = path.join(samplesDir, 'cw-carriers-dat-rates.csv');
fs.writeFileSync(datPath, datCSV);
const datRows = datCSV.split('\n').length - 1;
console.log(`  Wrote ${datRows} rows to ${datPath}`);
console.log(`  File size: ${(fs.statSync(datPath).size / 1024).toFixed(1)} KB`);

console.log('\nDone. All 3 CSV files generated.');
