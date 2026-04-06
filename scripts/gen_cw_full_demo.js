#!/usr/bin/env node
/**
 * gen_cw_full_demo.js
 * Generates 6 CSV files for CW Carriers USA — $55M annual revenue freight broker.
 * Seed-based PRNG for reproducibility.
 */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..', 'verticals', 'freight_broker', 'frontend', 'public', 'samples');

// --- Seed-based PRNG (mulberry32) ---
function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(55);
function rand() { return rng(); }
function randInt(min, max) { return Math.floor(rand() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function csvField(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function csvRow(fields) {
  return fields.map(csvField).join(',');
}

function writeCSV(filename, headers, rows) {
  const lines = [headers.join(','), ...rows.map(r => csvRow(r))];
  const content = lines.join('\n') + '\n';
  const fp = path.join(OUT_DIR, filename);
  fs.writeFileSync(fp, content);
  const stats = fs.statSync(fp);
  console.log(`  ${filename}: ${rows.length} rows, ${(stats.size / 1024).toFixed(1)} KB`);
}

// --- Date helpers ---
function dateStr(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
function randomDate(start, end) {
  const t = start.getTime() + rand() * (end.getTime() - start.getTime());
  return new Date(t);
}
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// --- Shared data ---
const CARRIERS_30 = [
  'Swift Transport LLC', 'Eagle Freight Inc', 'Patriot Trucking Corp', 'Sunbelt Carriers LLC',
  'Mountain West Transport', 'Pacific Coast Logistics', 'Volunteer Express Inc', 'Buckeye Freight Systems',
  'Keystone Carriers Inc', 'Evergreen Transport LLC', 'Gulf Coast Carriers', 'Great Lakes Express',
  'Lone Star Freight', 'Blue Ridge Transport', 'Carolina Freight Corp', 'Heartland Trucking Co',
  'Cardinal Logistics LLC', 'Redline Freight Corp', 'Empire State Trucking', 'Tri-State Hauling Inc',
  'Copperhead Carriers', 'Seminole Express', 'Wolverine Freight Inc', 'Northstar Logistics',
  'Allegheny Freight Co', 'Badger Freight Inc', 'Hoosier Express LLC', 'Pinnacle Freight LLC',
  'Shenandoah Freight', 'Coastal Freight Lines'
];

// Additional 20 carriers for file 2 (50 total)
const CARRIERS_EXTRA = [
  'Tidewater Freight LLC', 'Appalachian Transport Inc', 'Magnolia Carriers Corp', 'Prairie Land Express',
  'Rocky Mountain Freight', 'Cascade Logistics Inc', 'Delta River Transport', 'Iron Horse Carriers',
  'Frontier Freight LLC', 'Liberty Express Corp', 'Patriot Hauling Inc', 'Summit Transport LLC',
  'Riverbend Freight Co', 'Thunderbird Logistics', 'Crossroads Carriers', 'Silver State Transport',
  'Timberline Express', 'Bluegrass Freight Inc', 'Palmetto Carriers LLC', 'Granite State Freight'
];

const ALL_CARRIERS_50 = [...CARRIERS_30, ...CARRIERS_EXTRA];

const CUSTOMER_DEFS = [
  { name: 'PepsiCo', loads: 420, commodities: ['Beverages', 'Snack Foods', 'Sports Drinks'] },
  { name: 'Spartan Nash', loads: 168, commodities: ['Grocery Products', 'Frozen Foods', 'Dairy'] },
  { name: 'Performance Food Group', loads: 144, commodities: ['Restaurant Supplies', 'Fresh Produce', 'Frozen Entrees'] },
  { name: 'Coca-Cola', loads: 120, commodities: ['Beverages', 'Bottled Water', 'Syrup Concentrate'] },
  { name: 'Kroger', loads: 96, commodities: ['Grocery', 'Bakery', 'Frozen Foods'] },
  { name: 'Target', loads: 84, commodities: ['General Merchandise', 'Household Goods', 'Seasonal'] },
  { name: 'FedEx Ground', loads: 60, commodities: ['E-Commerce Packages', 'Ground Parcels'] },
  { name: 'Boise Paper', loads: 48, commodities: ['Paper Products', 'Cardboard Rolls', 'Packaging'] },
  { name: 'Sysco', loads: 36, commodities: ['Foodservice', 'Fresh Produce'] },
  { name: 'Publix', loads: 24, commodities: ['Grocery', 'Dairy', 'Fresh Produce'] },
];

// Equipment by customer
function equipmentForCustomer(cust) {
  if (cust === 'Boise Paper') return pick(['Flatbed', 'Flatbed', 'Flatbed', 'Dry Van']);
  if (cust === 'Target') return pick(['Dry Van', 'Dry Van', 'Dry Van', 'Reefer']);
  if (cust === 'FedEx Ground') return pick(['Dry Van', 'Dry Van', 'Dry Van', 'Reefer']);
  // Default: 70% reefer, 20% dry van, 10% flatbed
  const r = rand();
  if (r < 0.70) return 'Reefer';
  if (r < 0.90) return 'Dry Van';
  return 'Flatbed';
}

// Cities by state
const CITIES = {
  FL: ['Jacksonville', 'Tampa', 'Orlando', 'Miami', 'Lakeland', 'Fort Myers', 'Ocala', 'Tallahassee', 'Pensacola', 'Daytona Beach'],
  GA: ['Atlanta', 'Savannah', 'Macon', 'Augusta', 'Columbus', 'Albany', 'Valdosta', 'Dalton'],
  MI: ['Detroit', 'Grand Rapids', 'Kalamazoo', 'Lansing', 'Flint', 'Saginaw', 'Battle Creek'],
  VA: ['Richmond', 'Norfolk', 'Roanoke', 'Virginia Beach', 'Lynchburg', 'Harrisonburg'],
  NC: ['Charlotte', 'Raleigh', 'Greensboro', 'Winston-Salem', 'Durham', 'Fayetteville'],
  OH: ['Columbus', 'Cleveland', 'Cincinnati', 'Dayton', 'Toledo', 'Akron'],
  NJ: ['Newark', 'Edison', 'Elizabeth', 'Trenton', 'Camden', 'Cherry Hill'],
  PA: ['Philadelphia', 'Harrisburg', 'Pittsburgh', 'Allentown', 'Scranton', 'Reading'],
  ID: ['Boise', 'Nampa', 'Meridian', 'Idaho Falls', 'Twin Falls'],
  IL: ['Chicago', 'Rockford', 'Joliet', 'Springfield', 'Peoria'],
  TN: ['Nashville', 'Memphis', 'Knoxville', 'Chattanooga'],
  SC: ['Charleston', 'Columbia', 'Greenville', 'Spartanburg'],
  IN: ['Indianapolis', 'Fort Wayne', 'South Bend', 'Evansville'],
  TX: ['Dallas', 'Houston', 'San Antonio', 'Austin', 'El Paso'],
  AL: ['Birmingham', 'Mobile', 'Montgomery', 'Huntsville'],
};

// Lat/lng by city (approximate)
const CITY_COORDS = {
  'Jacksonville,FL': [30.33, -81.66], 'Tampa,FL': [27.95, -82.46], 'Orlando,FL': [28.54, -81.38],
  'Miami,FL': [25.76, -80.19], 'Lakeland,FL': [28.04, -81.95], 'Fort Myers,FL': [26.64, -81.87],
  'Ocala,FL': [29.19, -82.14], 'Tallahassee,FL': [30.44, -84.28], 'Pensacola,FL': [30.44, -87.22],
  'Daytona Beach,FL': [29.21, -81.02],
  'Atlanta,GA': [33.75, -84.39], 'Savannah,GA': [32.08, -81.09], 'Macon,GA': [32.84, -83.63],
  'Augusta,GA': [33.47, -81.97], 'Columbus,GA': [32.46, -84.99], 'Albany,GA': [31.58, -84.16],
  'Valdosta,GA': [30.83, -83.28], 'Dalton,GA': [34.77, -84.97],
  'Detroit,MI': [42.33, -83.05], 'Grand Rapids,MI': [42.96, -85.66], 'Kalamazoo,MI': [42.29, -85.59],
  'Lansing,MI': [42.73, -84.56], 'Flint,MI': [43.01, -83.69], 'Saginaw,MI': [43.42, -83.95],
  'Battle Creek,MI': [42.32, -85.18],
  'Richmond,VA': [37.54, -77.44], 'Norfolk,VA': [36.85, -76.29], 'Roanoke,VA': [37.27, -79.94],
  'Virginia Beach,VA': [36.85, -75.98], 'Lynchburg,VA': [37.41, -79.14], 'Harrisonburg,VA': [38.45, -78.87],
  'Charlotte,NC': [35.23, -80.84], 'Raleigh,NC': [35.78, -78.64], 'Greensboro,NC': [36.07, -79.79],
  'Winston-Salem,NC': [36.10, -80.24], 'Durham,NC': [35.99, -78.90], 'Fayetteville,NC': [35.05, -78.88],
  'Columbus,OH': [39.96, -83.00], 'Cleveland,OH': [41.50, -81.69], 'Cincinnati,OH': [39.10, -84.51],
  'Dayton,OH': [39.76, -84.19], 'Toledo,OH': [41.65, -83.54], 'Akron,OH': [41.08, -81.52],
  'Newark,NJ': [40.74, -74.17], 'Edison,NJ': [40.52, -74.41], 'Elizabeth,NJ': [40.66, -74.21],
  'Trenton,NJ': [40.22, -74.76], 'Camden,NJ': [39.93, -75.12], 'Cherry Hill,NJ': [39.93, -75.00],
  'Philadelphia,PA': [39.95, -75.17], 'Harrisburg,PA': [40.27, -76.88], 'Pittsburgh,PA': [40.44, -80.00],
  'Allentown,PA': [40.60, -75.49], 'Scranton,PA': [41.41, -75.66], 'Reading,PA': [40.34, -75.93],
  'Boise,ID': [43.62, -116.21], 'Nampa,ID': [43.54, -116.56], 'Meridian,ID': [43.61, -116.39],
  'Idaho Falls,ID': [43.49, -112.03], 'Twin Falls,ID': [42.56, -114.46],
  'Chicago,IL': [41.88, -87.63], 'Rockford,IL': [42.27, -89.09], 'Joliet,IL': [41.53, -88.08],
  'Springfield,IL': [39.78, -89.65], 'Peoria,IL': [40.69, -89.59],
  'Nashville,TN': [36.16, -86.78], 'Memphis,TN': [35.15, -90.05], 'Knoxville,TN': [35.96, -83.92],
  'Chattanooga,TN': [35.05, -85.31],
  'Charleston,SC': [32.78, -79.93], 'Columbia,SC': [34.00, -81.03], 'Greenville,SC': [34.85, -82.40],
  'Spartanburg,SC': [34.95, -81.93],
  'Indianapolis,IN': [39.77, -86.16], 'Fort Wayne,IN': [41.08, -85.14], 'South Bend,IN': [41.68, -86.25],
  'Evansville,IN': [37.97, -87.56],
  'Dallas,TX': [32.78, -96.80], 'Houston,TX': [29.76, -95.37], 'San Antonio,TX': [29.42, -98.49],
  'Austin,TX': [30.27, -97.74], 'El Paso,TX': [31.76, -106.44],
  'Birmingham,AL': [33.52, -86.81], 'Mobile,AL': [30.69, -88.04], 'Montgomery,AL': [32.38, -86.30],
  'Huntsville,AL': [34.73, -86.59],
};

// Origin state distribution
function pickOriginState(customer) {
  if (customer === 'Boise Paper') return 'ID';
  const r = rand();
  if (r < 0.40) return 'FL';
  if (r < 0.60) return 'GA';
  if (r < 0.70) return 'MI';
  if (r < 0.80) return pick(['VA', 'NC']);
  if (r < 0.88) return 'OH';
  if (r < 0.95) return pick(['NJ', 'PA']);
  return pick(['IL', 'TN', 'SC', 'IN']);
}

function pickDestState(originState) {
  const DEST_MAP = {
    FL: ['GA', 'NC', 'VA', 'NJ', 'PA', 'OH', 'MI', 'IL', 'TN', 'SC', 'FL', 'AL', 'IN'],
    GA: ['FL', 'NC', 'SC', 'VA', 'OH', 'TN', 'AL', 'PA', 'NJ', 'MI'],
    MI: ['OH', 'IL', 'PA', 'IN', 'NJ', 'VA', 'NC', 'GA', 'FL'],
    VA: ['NC', 'FL', 'GA', 'PA', 'NJ', 'SC', 'OH', 'TN'],
    NC: ['SC', 'VA', 'GA', 'FL', 'PA', 'NJ', 'TN', 'OH'],
    OH: ['MI', 'PA', 'IL', 'IN', 'NJ', 'VA', 'NC', 'GA', 'FL'],
    NJ: ['PA', 'VA', 'FL', 'GA', 'NC', 'OH', 'MI'],
    PA: ['NJ', 'OH', 'VA', 'NC', 'MI', 'IL', 'GA', 'FL'],
    ID: ['WA', 'OR', 'UT', 'MT', 'NV', 'CA', 'CO'],
    IL: ['MI', 'OH', 'IN', 'PA', 'NJ', 'MO', 'GA'],
    TN: ['GA', 'NC', 'AL', 'OH', 'VA', 'FL', 'SC'],
    SC: ['GA', 'NC', 'FL', 'VA', 'TN'],
    IN: ['OH', 'MI', 'IL', 'PA', 'NJ'],
  };
  // Add missing dest states for ID destinations
  CITIES['WA'] = ['Seattle', 'Tacoma', 'Spokane'];
  CITIES['OR'] = ['Portland', 'Salem', 'Eugene'];
  CITIES['UT'] = ['Salt Lake City', 'Provo', 'Ogden'];
  CITIES['MT'] = ['Billings', 'Missoula', 'Great Falls'];
  CITIES['NV'] = ['Reno', 'Las Vegas', 'Henderson'];
  CITIES['CA'] = ['Los Angeles', 'Sacramento', 'Fresno'];
  CITIES['CO'] = ['Denver', 'Colorado Springs', 'Fort Collins'];
  CITIES['MO'] = ['St. Louis', 'Kansas City', 'Springfield'];

  const dests = DEST_MAP[originState] || ['FL', 'GA', 'OH', 'PA', 'NJ'];
  return pick(dests);
}

// Approximate miles between state pairs
const MILES_MAP = {};
function mileKey(s1, s2) { return [s1, s2].sort().join('-'); }
function setMiles(s1, s2, m) { MILES_MAP[mileKey(s1, s2)] = m; }
setMiles('FL','GA',350); setMiles('FL','NC',650); setMiles('FL','VA',850); setMiles('FL','NJ',1050);
setMiles('FL','PA',1000); setMiles('FL','OH',900); setMiles('FL','MI',1100); setMiles('FL','IL',1050);
setMiles('FL','TN',650); setMiles('FL','SC',500); setMiles('FL','FL',250); setMiles('FL','AL',450);
setMiles('FL','IN',950); setMiles('GA','NC',350); setMiles('GA','SC',250); setMiles('GA','VA',500);
setMiles('GA','OH',600); setMiles('GA','TN',250); setMiles('GA','AL',200); setMiles('GA','PA',750);
setMiles('GA','NJ',800); setMiles('GA','MI',750); setMiles('GA','FL',350);
setMiles('MI','OH',250); setMiles('MI','IL',300); setMiles('MI','PA',500); setMiles('MI','IN',200);
setMiles('MI','NJ',600); setMiles('MI','VA',600); setMiles('MI','NC',650); setMiles('MI','GA',750);
setMiles('MI','FL',1100);
setMiles('VA','NC',200); setMiles('VA','FL',850); setMiles('VA','GA',500); setMiles('VA','PA',300);
setMiles('VA','NJ',300); setMiles('VA','SC',350); setMiles('VA','OH',400); setMiles('VA','TN',450);
setMiles('NC','SC',150); setMiles('NC','VA',200); setMiles('NC','GA',350); setMiles('NC','FL',650);
setMiles('NC','PA',450); setMiles('NC','NJ',500); setMiles('NC','TN',350); setMiles('NC','OH',500);
setMiles('OH','PA',300); setMiles('OH','IL',350); setMiles('OH','IN',200); setMiles('OH','NJ',450);
setMiles('OH','VA',400); setMiles('OH','NC',500); setMiles('OH','GA',600); setMiles('OH','FL',900);
setMiles('NJ','PA',100); setMiles('NJ','VA',300); setMiles('NJ','FL',1050); setMiles('NJ','GA',800);
setMiles('NJ','NC',500); setMiles('NJ','OH',450); setMiles('NJ','MI',600);
setMiles('PA','OH',300); setMiles('PA','VA',300); setMiles('PA','NC',450); setMiles('PA','MI',500);
setMiles('PA','IL',600); setMiles('PA','GA',750); setMiles('PA','FL',1000);
setMiles('ID','WA',500); setMiles('ID','OR',450); setMiles('ID','UT',350); setMiles('ID','MT',400);
setMiles('ID','NV',500); setMiles('ID','CA',700); setMiles('ID','CO',800);
setMiles('IL','IN',200); setMiles('IL','PA',600); setMiles('IL','NJ',750); setMiles('IL','MO',300);
setMiles('IL','GA',700); setMiles('IL','OH',350);
setMiles('TN','GA',250); setMiles('TN','NC',350); setMiles('TN','AL',200); setMiles('TN','OH',400);
setMiles('TN','VA',450); setMiles('TN','FL',650); setMiles('TN','SC',300);
setMiles('SC','GA',250); setMiles('SC','FL',500); setMiles('SC','VA',350); setMiles('SC','TN',300);
setMiles('IN','OH',200); setMiles('IN','IL',200); setMiles('IN','PA',550); setMiles('IN','NJ',650);

function getMiles(s1, s2) {
  if (s1 === s2) return randInt(120, 350);
  return MILES_MAP[mileKey(s1, s2)] || randInt(400, 900);
}

// Rate per mile by equipment
function ratePerMile(equip) {
  if (equip === 'Reefer') return 2.40 + rand() * 0.60;
  if (equip === 'Dry Van') return 1.90 + rand() * 0.60;
  return 2.10 + rand() * 0.60; // Flatbed
}

const STATUSES_POOL = [];
// delivered 850, in_transit 120, dispatched 90, covered 60, open 50, cancelled 30
for (let i = 0; i < 850; i++) STATUSES_POOL.push('delivered');
for (let i = 0; i < 120; i++) STATUSES_POOL.push('in_transit');
for (let i = 0; i < 90; i++) STATUSES_POOL.push('dispatched');
for (let i = 0; i < 60; i++) STATUSES_POOL.push('covered');
for (let i = 0; i < 50; i++) STATUSES_POOL.push('open');
for (let i = 0; i < 30; i++) STATUSES_POOL.push('cancelled');

const START_DATE = new Date('2025-03-25');
const END_DATE = new Date('2026-03-24');

// ============================================================
// FILE 1: McLeod Loads
// ============================================================
function genLoads() {
  console.log('Generating cw-carriers-mcleod-loads.csv...');
  const headers = ['Movement ID','Customer','Origin City','Origin State','Dest City','Dest State',
    'Ship Date','Del Date','Equipment','Weight','Miles','Customer Charge','Carrier Pay',
    'Fuel Surcharge','Margin','Margin %','Status','Commodity','Carrier Name','Carrier MC',
    'Temperature'];

  const rows = [];
  let loadIdx = 0;

  // Track negative margin indices, thin margin, etc.
  const negativeMarginSlots = new Set();
  const thinMarginSlots = new Set();
  const belowTargetSlots = new Set();

  // Pre-assign margin categories
  // 22 negative
  while (negativeMarginSlots.size < 22) negativeMarginSlots.add(randInt(0, 1199));
  // 35 thin (1-5%)
  while (thinMarginSlots.size < 35) {
    const s = randInt(0, 1199);
    if (!negativeMarginSlots.has(s)) thinMarginSlots.add(s);
  }
  // 180 below target (5-12%)
  while (belowTargetSlots.size < 180) {
    const s = randInt(0, 1199);
    if (!negativeMarginSlots.has(s) && !thinMarginSlots.has(s)) belowTargetSlots.add(s);
  }

  // Shuffle statuses
  const shuffledStatuses = shuffle(STATUSES_POOL);

  for (const cdef of CUSTOMER_DEFS) {
    for (let i = 0; i < cdef.loads; i++) {
      const idx = loadIdx;
      const movId = `CW-${70001 + idx}`;

      // Date: Sysco starts Oct 2025, Publix starts Jan 2026
      let shipDate;
      if (cdef.name === 'Sysco') {
        shipDate = randomDate(new Date('2025-10-01'), END_DATE);
      } else if (cdef.name === 'Publix') {
        shipDate = randomDate(new Date('2026-01-01'), END_DATE);
      } else {
        shipDate = randomDate(START_DATE, END_DATE);
      }

      const origState = pickOriginState(cdef.name);
      const destState = pickDestState(origState);
      const origCity = pick(CITIES[origState] || ['Unknown']);
      const destCities = CITIES[destState] || ['Unknown'];
      const destCity = pick(destCities);

      const equip = equipmentForCustomer(cdef.name);
      const miles = getMiles(origState, destState) + randInt(-50, 80);
      const clampedMiles = Math.max(80, miles);

      const rpm = ratePerMile(equip);
      let custCharge = Math.round(clampedMiles * rpm * (1 + rand() * 0.15));

      // Weight
      let weight;
      if (equip === 'Flatbed') weight = randInt(20000, 45000);
      else if (equip === 'Reefer') weight = randInt(30000, 44000);
      else weight = randInt(25000, 44000);

      // Fuel surcharge
      const fuelSurcharge = Math.round(custCharge * (0.08 + rand() * 0.06));

      // Carrier pay & margin
      let carrierPay, margin, marginPct;
      if (negativeMarginSlots.has(idx)) {
        // Negative margin
        carrierPay = Math.round(custCharge * (1.02 + rand() * 0.08));
        margin = custCharge - carrierPay;
        marginPct = ((margin / custCharge) * 100).toFixed(1);
      } else if (thinMarginSlots.has(idx)) {
        // 1-5%
        const mp = 0.01 + rand() * 0.04;
        carrierPay = Math.round(custCharge * (1 - mp));
        margin = custCharge - carrierPay;
        marginPct = ((margin / custCharge) * 100).toFixed(1);
      } else if (belowTargetSlots.has(idx)) {
        // 5-12%
        const mp = 0.05 + rand() * 0.07;
        carrierPay = Math.round(custCharge * (1 - mp));
        margin = custCharge - carrierPay;
        marginPct = ((margin / custCharge) * 100).toFixed(1);
      } else {
        // Healthy 12-19%
        const mp = 0.12 + rand() * 0.07;
        carrierPay = Math.round(custCharge * (1 - mp));
        margin = custCharge - carrierPay;
        marginPct = ((margin / custCharge) * 100).toFixed(1);
      }

      // Clamp customer charge to realistic range
      custCharge = Math.max(680, Math.min(12500, custCharge));
      if (carrierPay > custCharge && !negativeMarginSlots.has(idx)) {
        carrierPay = Math.round(custCharge * (1 - 0.14));
      }
      margin = custCharge - carrierPay;
      marginPct = ((margin / custCharge) * 100).toFixed(1);

      const transitDays = Math.max(1, Math.round(clampedMiles / 450));
      const delDate = addDays(shipDate, transitDays + randInt(0, 1));

      const status = shuffledStatuses[idx] || 'delivered';
      const commodity = pick(cdef.commodities);
      const carrier = pick(CARRIERS_30);
      const carrierMC = 'MC-' + (100000 + (CARRIERS_30.indexOf(carrier) * 3571 + 123456) % 900000);

      // Temperature
      let temp = '';
      if (equip === 'Reefer') {
        temp = rand() < 0.15 ? '-10F' : '34F';
      }

      rows.push([movId, cdef.name, origCity, origState, destCity, destState,
        dateStr(shipDate), dateStr(delDate), equip, weight, clampedMiles,
        custCharge, carrierPay, fuelSurcharge, margin, marginPct,
        status, commodity, carrier, carrierMC, temp]);

      loadIdx++;
    }
  }

  writeCSV('cw-carriers-mcleod-loads.csv', headers, rows);
  return rows;
}

// ============================================================
// FILE 2: Carrier Assure
// ============================================================
function genCarrierAssure() {
  console.log('Generating cw-carriers-carrier-assure.csv...');
  const headers = ['Carrier Name','MC Number','DOT Number','SCAC','Authority Status',
    'Insurance Status','Auto Liability','Cargo Insurance','General Liability','Safety Rating',
    'CSA Score','Out of Service Rate','Power Units','Drivers','Equipment Types','Home State',
    'Payment Terms','Reliability Score','Risk Score','Last Verified','Insurance Expiry','Contract Status'];

  const rows = [];
  const states = ['FL','GA','MI','OH','PA','NJ','VA','NC','IL','TN','SC','IN','TX','AL','ID'];

  for (let i = 0; i < 50; i++) {
    const name = ALL_CARRIERS_50[i];
    const mc = 'MC-' + (100000 + (i * 3571 + 123456) % 900000);
    const dot = String(1000000 + randInt(0, 8999999));
    const scac = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 4).padEnd(4, 'X');

    let authStatus = 'Active';
    if (i === 42) authStatus = 'Conditional';
    if (i === 47) authStatus = 'Conditional';

    let insStatus = 'Active';
    let insExpiry;
    if (i < 5) {
      // Lapsed
      insStatus = 'Lapsed';
      insExpiry = dateStr(randomDate(new Date('2026-01-01'), new Date('2026-03-15')));
    } else if (i >= 5 && i < 9) {
      // Expired 2+ months ago
      insStatus = 'Expired';
      insExpiry = dateStr(randomDate(new Date('2025-10-01'), new Date('2026-01-15')));
    } else if (i >= 9 && i < 12) {
      // Expiring within 30 days
      insStatus = 'Active';
      insExpiry = dateStr(randomDate(new Date('2026-03-25'), new Date('2026-04-23')));
    } else {
      insExpiry = dateStr(randomDate(new Date('2026-06-01'), new Date('2027-03-31')));
    }

    const autoLiab = pick(['$1,000,000', '$1,000,000', '$1,500,000', '$2,000,000', '$750,000']);
    const cargoIns = pick(['$100,000', '$250,000', '$500,000', '$100,000']);
    const genLiab = pick(['$1,000,000', '$2,000,000', '$1,000,000']);
    const safetyRating = pick(['Satisfactory', 'Satisfactory', 'Satisfactory', 'Conditional', 'None']);

    let csaScore = randInt(15, 65);
    if (i >= 12 && i < 19) csaScore = randInt(76, 98); // 7 with CSA > 75

    let oosRate = (1 + rand() * 5).toFixed(1);
    if (i >= 19 && i < 25) oosRate = (7.1 + rand() * 8).toFixed(1); // 6 with OOS > 7%

    // Fleet sizes
    let powerUnits, drivers;
    if (i < 20) { powerUnits = randInt(1, 5); drivers = randInt(1, 6); }
    else if (i < 35) { powerUnits = randInt(6, 20); drivers = randInt(6, 25); }
    else if (i < 45) { powerUnits = randInt(21, 50); drivers = randInt(25, 60); }
    else { powerUnits = randInt(51, 200); drivers = randInt(55, 250); }

    const equipTypes = pick(['Reefer, Dry Van', 'Dry Van', 'Flatbed', 'Reefer', 'Reefer, Dry Van, Flatbed', 'Dry Van, Flatbed']);
    const homeState = pick(states);
    let payTerms;
    if (i < 25) payTerms = 'Net 30';
    else if (i < 40) payTerms = 'Quick Pay';
    else payTerms = 'Factoring';

    let reliabilityScore = randInt(72, 98);
    if (i >= 25 && i < 33) reliabilityScore = randInt(45, 69); // 8 below 70

    const riskScore = reliabilityScore > 80 ? randInt(10, 35) : randInt(40, 85);
    const lastVerified = dateStr(randomDate(new Date('2025-12-01'), new Date('2026-03-20')));
    const contractStatus = pick(['Active', 'Active', 'Active', 'Pending Renewal', 'Expired']);

    rows.push([name, mc, dot, scac, authStatus, insStatus, autoLiab, cargoIns, genLiab,
      safetyRating, csaScore, oosRate, powerUnits, drivers, equipTypes, homeState,
      payTerms, reliabilityScore, riskScore, lastVerified, insExpiry, contractStatus]);
  }

  writeCSV('cw-carriers-carrier-assure.csv', headers, rows);
}

// ============================================================
// FILE 3: DAT Rates
// ============================================================
function genDATRates() {
  console.log('Generating cw-carriers-dat-rates.csv...');
  const headers = ['Origin State','Destination State','Equipment Type','Avg Rate Per Mile',
    'Min Rate Per Mile','Max Rate Per Mile','Avg Total Rate','Sample Size','Confidence',
    'Rate Date','Benchmark Source'];

  const lanes = [
    // Reefer lanes
    ['FL','GA','Reefer',350], ['FL','NC','Reefer',650], ['FL','VA','Reefer',850],
    ['FL','NJ','Reefer',1050], ['FL','PA','Reefer',1000], ['FL','OH','Reefer',900],
    ['FL','MI','Reefer',1100], ['FL','IL','Reefer',1050], ['FL','TN','Reefer',650],
    ['FL','SC','Reefer',500], ['GA','FL','Reefer',350], ['GA','NC','Reefer',350],
    ['GA','SC','Reefer',250], ['GA','VA','Reefer',500], ['GA','OH','Reefer',600],
    ['GA','TN','Reefer',250], ['MI','OH','Reefer',250], ['MI','IL','Reefer',300],
    ['MI','PA','Reefer',500], ['MI','IN','Reefer',200], ['OH','MI','Reefer',250],
    ['OH','PA','Reefer',300], ['OH','IL','Reefer',350], ['VA','NC','Reefer',200],
    ['VA','FL','Reefer',850], ['NC','SC','Reefer',150], ['NJ','PA','Reefer',100],
    ['NJ','VA','Reefer',300],
    // Dry Van lanes
    ['FL','GA','Dry Van',350], ['FL','NC','Dry Van',650], ['GA','FL','Dry Van',350],
    ['MI','OH','Dry Van',250], ['OH','PA','Dry Van',300], ['NJ','FL','Dry Van',1050],
    ['PA','NJ','Dry Van',100], ['PA','OH','Dry Van',300],
    // Flatbed ID lanes
    ['ID','WA','Flatbed',500], ['ID','OR','Flatbed',450], ['ID','UT','Flatbed',350],
    ['ID','CO','Flatbed',800],
  ];

  const rows = [];
  for (const [orig, dest, equip, typMiles] of lanes) {
    let baseRPM;
    if (equip === 'Reefer') baseRPM = 2.40 + rand() * 0.60;
    else if (equip === 'Dry Van') baseRPM = 1.90 + rand() * 0.60;
    else baseRPM = 2.10 + rand() * 0.60;

    const avgRPM = baseRPM.toFixed(2);
    const minRPM = (baseRPM - 0.20 - rand() * 0.15).toFixed(2);
    const maxRPM = (baseRPM + 0.20 + rand() * 0.20).toFixed(2);
    const avgTotal = Math.round(baseRPM * typMiles);
    const sampleSize = randInt(500, 5000);
    const confidence = pick(['High', 'High', 'High', 'Medium', 'Medium']);

    rows.push([orig, dest, equip, avgRPM, minRPM, maxRPM, avgTotal, sampleSize, confidence,
      '2026-03-15', 'DAT RateView']);
  }

  writeCSV('cw-carriers-dat-rates.csv', headers, rows);
}

// ============================================================
// FILE 4: HubSpot CRM
// ============================================================
function genHubSpot() {
  console.log('Generating cw-carriers-hubspot-crm.csv...');
  const headers = ['Deal ID','Deal Name','Company','Contact Name','Contact Email','Contact Phone',
    'Pipeline','Stage','Amount','Close Date','Owner','Lane','Equipment','Loads Per Month',
    'Contract Type','Win Probability','Lost Reason','Competitor','Notes','Last Activity','Created Date'];

  const owners = ['Ilija Tojagic', 'Nicholas King', 'Robert Workman'];
  const rows = [];
  let dealId = 5001;

  // Closed Won deals
  const wonDeals = [
    { co: 'PepsiCo', count: 6, total: 19250000, contact: 'Sarah Mitchell', email: 'smitchell@pepsico.com', phone: '(914) 253-4100' },
    { co: 'Spartan Nash', count: 4, total: 7700000, contact: 'Mike Daniels', email: 'mdaniels@spartannash.com', phone: '(616) 878-2400' },
    { co: 'Performance Food Group', count: 3, total: 6600000, contact: 'James Henderson', email: 'jhenderson@pfgc.com', phone: '(804) 484-7700' },
    { co: 'Coca-Cola', count: 4, total: 5500000, contact: 'Lisa Park', email: 'lpark@coca-cola.com', phone: '(404) 676-2121' },
    { co: 'Kroger', count: 3, total: 4400000, contact: 'David Nguyen', email: 'dnguyen@kroger.com', phone: '(513) 762-4000' },
    { co: 'Target', count: 3, total: 3850000, contact: 'Rachel Torres', email: 'rtorres@target.com', phone: '(612) 304-6073' },
    { co: 'FedEx Ground', count: 2, total: 2750000, contact: 'Brian Foster', email: 'bfoster@fedex.com', phone: '(800) 463-3339' },
    { co: 'Boise Paper', count: 2, total: 2200000, contact: 'Karen White', email: 'kwhite@boisepaper.com', phone: '(208) 384-7000' },
    { co: 'Sysco', count: 2, total: 1650000, contact: 'Tom Bradley', email: 'tbradley@sysco.com', phone: '(281) 584-1390' },
    { co: 'Publix', count: 1, total: 1100000, contact: 'Angela Reeves', email: 'areeves@publix.com', phone: '(863) 688-1188' },
  ];

  const laneOptions = ['FL-GA', 'FL-NJ', 'FL-OH', 'FL-MI', 'GA-NC', 'GA-VA', 'MI-IL', 'MI-OH', 'VA-NC', 'OH-PA', 'ID-WA', 'NJ-VA'];
  const equipOptions = ['Reefer', 'Dry Van', 'Flatbed', 'Reefer/Dry Van'];

  for (const wd of wonDeals) {
    const perDeal = Math.round(wd.total / wd.count);
    for (let i = 0; i < wd.count; i++) {
      const amt = i === wd.count - 1 ? wd.total - perDeal * (wd.count - 1) : perDeal;
      const lpm = Math.round(amt / 12 / 4500);
      const closeDate = dateStr(randomDate(new Date('2024-06-01'), new Date('2025-12-31')));
      const createdDate = dateStr(addDays(new Date(closeDate), -randInt(30, 120)));
      const lastActivity = dateStr(randomDate(new Date('2026-02-01'), new Date('2026-03-24')));
      rows.push([
        `D-${dealId++}`, `${wd.co} - ${pick(laneOptions)} ${pick(['Annual', 'Multi-Lane', 'Dedicated', 'Spot+Contract'])}`,
        wd.co, wd.contact, wd.email, wd.phone,
        'Freight Sales', 'Closed Won', amt, closeDate, pick(owners),
        pick(laneOptions), pick(equipOptions), lpm, pick(['Annual Contract', 'Spot + Contract', 'Annual Contract']),
        100, '', '', `${lpm} loads/mo. Key account.`, lastActivity, createdDate
      ]);
    }
  }

  // Negotiation/Proposal (15)
  const negDeals = [
    { co: 'Sysco', contact: 'Tom Bradley', email: 'tbradley@sysco.com', phone: '(281) 584-1390', amt: 450000 },
    { co: 'US Foods', contact: 'Mark Stevens', email: 'mstevens@usfoods.com', phone: '(847) 720-8000', amt: 380000 },
    { co: 'Dollar General', contact: 'Amy Clark', email: 'aclark@dollargeneral.com', phone: '(615) 855-4000', amt: 220000 },
    { co: 'AutoZone', contact: 'Derek Mills', email: 'dmills@autozone.com', phone: '(901) 495-6500', amt: 175000 },
    { co: "O'Reilly Auto Parts", contact: 'Steve Walsh', email: 'swalsh@oreillyauto.com', phone: '(417) 862-6708', amt: 160000 },
    { co: 'Nestle', contact: 'Maria Gonzalez', email: 'mgonzalez@nestle.com', phone: '(818) 549-6000', amt: 340000 },
    { co: 'General Mills', contact: 'Paul Richardson', email: 'prichardson@genmills.com', phone: '(763) 764-7600', amt: 290000 },
    { co: 'Tyson Foods', contact: 'Chris Abbott', email: 'cabbott@tyson.com', phone: '(479) 290-4000', amt: 310000 },
    { co: 'Conagra Brands', contact: 'Jennifer Liu', email: 'jliu@conagra.com', phone: '(312) 549-5000', amt: 200000 },
    { co: 'Kellogg', contact: 'Robert Yang', email: 'ryang@kellogg.com', phone: '(269) 961-2000', amt: 185000 },
    { co: 'Home Depot', contact: 'Nancy Cooper', email: 'ncooper@homedepot.com', phone: '(770) 433-8211', amt: 150000 },
    { co: "Lowe's", contact: 'Tim Baker', email: 'tbaker@lowes.com', phone: '(704) 758-1000', amt: 120000 },
    { co: 'Walmart', contact: 'Sandra Lee', email: 'slee@walmart.com', phone: '(479) 273-4000', amt: 250000 },
    { co: 'Mondelez', contact: 'Eric Patel', email: 'epatel@mondelez.com', phone: '(847) 943-4000', amt: 210000 },
    { co: 'Amazon', contact: 'Kevin Brooks', email: 'kbrooks@amazon.com', phone: '(206) 266-1000', amt: 280000 },
  ];

  for (const nd of negDeals) {
    const stage = pick(['Negotiation', 'Proposal Sent', 'Negotiation', 'Proposal Sent']);
    const winProb = randInt(30, 70);
    const closeDate = dateStr(randomDate(new Date('2026-04-01'), new Date('2026-07-31')));
    const createdDate = dateStr(randomDate(new Date('2025-11-01'), new Date('2026-02-28')));
    const lastActivity = dateStr(randomDate(new Date('2026-03-01'), new Date('2026-03-24')));
    rows.push([
      `D-${dealId++}`, `${nd.co} - New Business`, nd.co, nd.contact, nd.email, nd.phone,
      'Freight Sales', stage, nd.amt, closeDate, pick(owners),
      pick(laneOptions), pick(equipOptions), Math.round(nd.amt / 12 / 4500) || 1,
      'TBD', winProb, '', '', `Pipeline opportunity. ${stage}.`, lastActivity, createdDate
    ]);
  }

  // Prospecting (10)
  const prospDeals = [
    { co: 'Walmart', contact: 'Sandra Lee', email: 'slee@walmart.com', phone: '(479) 273-4000', amt: 500000 },
    { co: 'Amazon Fresh', contact: 'Kevin Brooks', email: 'kbrooks@amazon.com', phone: '(206) 266-1000', amt: 400000 },
    { co: 'Costco Logistics', contact: 'Nina Sharma', email: 'nsharma@costco.com', phone: '(425) 313-8100', amt: 350000 },
    { co: 'Albertsons', contact: 'Greg Lawson', email: 'glawson@albertsons.com', phone: '(208) 395-6200', amt: 280000 },
    { co: 'Aldi', contact: 'Hans Gruber', email: 'hgruber@aldi.com', phone: '(630) 879-8100', amt: 220000 },
    { co: "Trader Joe's", contact: 'Linda Chen', email: 'lchen@traderjoes.com', phone: '(626) 599-3700', amt: 180000 },
    { co: 'Dollar Tree', contact: 'Sam Morales', email: 'smorales@dollartree.com', phone: '(757) 321-5000', amt: 150000 },
    { co: 'Whole Foods', contact: 'Dana Wright', email: 'dwright@wholefoods.com', phone: '(512) 477-4455', amt: 200000 },
    { co: 'McLane Company', contact: 'Jeff Turner', email: 'jturner@mclaneco.com', phone: '(254) 771-7500', amt: 320000 },
    { co: 'C&S Wholesale', contact: 'Beth Collins', email: 'bcollins@cswg.com', phone: '(603) 354-7000', amt: 260000 },
  ];

  for (const pd of prospDeals) {
    const stage = pick(['Prospecting', 'Qualification', 'Prospecting']);
    const createdDate = dateStr(randomDate(new Date('2026-01-15'), new Date('2026-03-20')));
    const lastActivity = dateStr(randomDate(new Date('2026-03-10'), new Date('2026-03-24')));
    rows.push([
      `D-${dealId++}`, `${pd.co} - Expansion`, pd.co, pd.contact, pd.email, pd.phone,
      'Freight Sales', stage, pd.amt, '', pick(owners),
      pick(laneOptions), pick(equipOptions), Math.round(pd.amt / 12 / 4500) || 1,
      'TBD', randInt(5, 20), '', '', `Early stage. ${stage}.`, lastActivity, createdDate
    ]);
  }

  // Closed Lost (25)
  const lostReasons = [
    ...Array(10).fill('Price'), ...Array(5).fill('Capacity'),
    ...Array(5).fill('Competitor'), ...Array(3).fill('No Response'), ...Array(2).fill('Internal Decision')
  ];
  const competitors = ['Echo Global', 'TQL', 'XPO', 'Coyote Logistics', 'CH Robinson', 'Schneider'];
  const lostCompanies = [
    'Unilever', 'Procter & Gamble', 'Johnson & Johnson', 'Mars Inc', 'Kraft Heinz',
    'Campbell Soup', 'Hormel Foods', 'JM Smucker', 'McCormick', 'Church & Dwight',
    'Colgate-Palmolive', 'Clorox', 'Energizer', 'Spectrum Brands', 'TreeHouse Foods',
    'Post Holdings', 'Flowers Foods', 'Lamb Weston', 'Pilgrim\'s Pride', 'Sanderson Farms',
    'Dean Foods', 'Land O\'Lakes', 'Smithfield Foods', 'JBS USA', 'Perdue Farms'
  ];
  const firstNames = ['Michael', 'Jennifer', 'William', 'Patricia', 'James', 'Elizabeth', 'John', 'Barbara',
    'Richard', 'Susan', 'Thomas', 'Jessica', 'Daniel', 'Sarah', 'Matthew', 'Karen', 'Anthony', 'Nancy',
    'Andrew', 'Lisa', 'Joshua', 'Margaret', 'Ryan', 'Betty', 'Kevin'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
    'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas',
    'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris'];

  for (let i = 0; i < 25; i++) {
    const co = lostCompanies[i];
    const fn = pick(firstNames);
    const ln = pick(lastNames);
    const reason = lostReasons[i];
    const comp = reason === 'Competitor' ? pick(competitors) : '';
    const amt = randInt(100000, 800000);
    const closeDate = dateStr(randomDate(new Date('2025-04-01'), new Date('2026-03-15')));
    const createdDate = dateStr(addDays(new Date(closeDate), -randInt(30, 90)));
    const lastActivity = closeDate;

    rows.push([
      `D-${dealId++}`, `${co} - ${pick(['Reefer Lanes', 'Southeast', 'Midwest', 'National', 'Regional'])}`,
      co, `${fn} ${ln}`, `${fn.toLowerCase()}.${ln.toLowerCase()}@${co.toLowerCase().replace(/[^a-z]/g, '')}.com`,
      `(${randInt(200,999)}) ${randInt(200,999)}-${randInt(1000,9999)}`,
      'Freight Sales', 'Closed Lost', amt, closeDate, pick(owners),
      pick(laneOptions), pick(equipOptions), Math.round(amt / 12 / 4500) || 1,
      '', 0, reason, comp, `Lost: ${reason}. ${comp ? 'To ' + comp + '.' : ''}`, lastActivity, createdDate
    ]);
  }

  writeCSV('cw-carriers-hubspot-crm.csv', headers, rows);
}

// ============================================================
// FILE 5: Macropoint Tracking
// ============================================================
function genMacropoint(loadRows) {
  console.log('Generating cw-carriers-macropoint-tracking.csv...');
  const headers = ['Load ID','Carrier','Truck Number','Driver','Status','Latitude','Longitude',
    'City','State','Timestamp','ETA','Miles Remaining','Speed MPH','Temperature F',
    'Event Type','Notes'];

  const driverNames = [
    'Carlos Rivera', 'James Thompson', 'Andre Williams', 'Michael Brown', 'David Johnson',
    'Robert Garcia', 'Chris Martinez', 'Juan Hernandez', 'Frank Wilson', 'Tony Anderson',
    'Steve Taylor', 'Mark Thomas', 'Larry Moore', 'Dennis Jackson', 'Jerry Martin',
    'Wayne Lee', 'Billy Perez', 'Ray White', 'Eddie Harris', 'Tommy Clark',
    'Bobby Lewis', 'Jimmy Robinson', 'Joe Walker', 'Rick Hall', 'Kenny Allen',
    'Russell Young', 'Harry King', 'Ralph Wright', 'Howard Lopez', 'Earl Hill'
  ];

  const eventSequence = ['pickup_arrived', 'pickup_departed', 'in_transit', 'check_call', 'delivery_arrived', 'delivery_completed'];

  // Pick 60 delivered/in_transit loads
  const eligibleLoads = loadRows.filter(r => r[16] === 'delivered' || r[16] === 'in_transit');
  const selectedLoads = shuffle(eligibleLoads).slice(0, 60);

  const rows = [];
  let delayCount = 0;
  let exceptionCount = 0;
  let gapCount = 0;

  for (let li = 0; li < selectedLoads.length; li++) {
    const load = selectedLoads[li];
    const loadId = load[0];
    const carrier = load[18];
    const origCity = load[2];
    const origState = load[3];
    const destCity = load[4];
    const destState = load[5];
    const shipDate = new Date(load[6]);
    const delDate = new Date(load[7]);
    const equip = load[8];
    const temp = load[20];
    const miles = parseInt(load[10]);

    const truckNum = `T-${randInt(1000, 9999)}`;
    const driver = pick(driverNames);

    const origKey = `${origCity},${origState}`;
    const destKey = `${destCity},${destState}`;
    const origCoords = CITY_COORDS[origKey] || [30 + rand() * 10, -80 - rand() * 10];
    const destCoords = CITY_COORDS[destKey] || [35 + rand() * 10, -85 - rand() * 10];

    const numEvents = randInt(4, 7);
    const transitMs = delDate.getTime() - shipDate.getTime();

    const isDelay = delayCount < 15 && li < 20;
    const isException = exceptionCount < 5 && li >= 20 && li < 27;
    const isGap = gapCount < 8 && li >= 27 && li < 36;

    for (let ei = 0; ei < numEvents; ei++) {
      const frac = ei / (numEvents - 1);
      const ts = new Date(shipDate.getTime() + frac * transitMs);
      const lat = (origCoords[0] + (destCoords[0] - origCoords[0]) * frac + (rand() - 0.5) * 0.3).toFixed(4);
      const lng = (origCoords[1] + (destCoords[1] - origCoords[1]) * frac + (rand() - 0.5) * 0.3).toFixed(4);

      const milesRem = Math.round(miles * (1 - frac));
      const speed = ei === 0 || ei === numEvents - 1 ? 0 : randInt(55, 70);

      let eventType = eventSequence[Math.min(ei, eventSequence.length - 1)];
      let notes = '';
      let tempF = '';

      if (equip === 'Reefer') {
        tempF = temp === '-10F' ? String(-10 + randInt(-2, 2)) : String(34 + randInt(-1, 1));
      }

      // Inject delays
      if (isDelay && ei === 2) {
        eventType = 'delay';
        notes = pick(['HOS reset required - driver at 10hr limit', 'Weather delay - severe thunderstorm',
          'Traffic congestion - I-95 construction zone', 'Facility closed - arrived after hours',
          'Lumper delay - 3hr wait at dock', 'Mechanical issue - tire replacement',
          'Detention - 4hr wait for loading', 'Border inspection delay']);
        delayCount++;
      }

      // Inject exceptions
      if (isException && ei === 3) {
        eventType = 'exception';
        if (equip === 'Reefer' && temp !== '-10F') {
          tempF = String(randInt(44, 48));
          notes = `Temperature excursion: ${tempF}F detected. Reefer unit cycling.`;
        } else {
          notes = pick(['Reefer malfunction - unit not cooling', 'Seal broken at inspection point',
            'Load refused at receiver - appointment missed', 'Damaged freight reported']);
        }
        exceptionCount++;
      }

      // Simulate gaps (skip middle events -> large time gap)
      if (isGap && ei === 2) {
        gapCount++;
        continue; // skip this event to create a gap
      }

      // Interpolate city
      let city, state;
      if (ei === 0) { city = origCity; state = origState; }
      else if (ei === numEvents - 1) { city = destCity; state = destState; }
      else {
        // Pick an intermediate state/city
        const midStates = [origState, destState];
        state = pick(midStates);
        city = pick(CITIES[state] || [origCity]);
      }

      const eta = dateStr(addDays(ts, Math.max(0, Math.round(milesRem / 450))));

      rows.push([loadId, carrier, truckNum, driver, load[16], lat, lng, city, state,
        ts.toISOString().replace('T', ' ').slice(0, 19), eta, milesRem, speed,
        tempF, eventType, notes]);
    }
  }

  writeCSV('cw-carriers-macropoint-tracking.csv', headers, rows);
}

// ============================================================
// FILE 6: Drivers
// ============================================================
function genDrivers() {
  console.log('Generating cw-carriers-drivers.csv...');
  const headers = ['Driver ID','Driver Name','CDL Class','CDL State','CDL Expiry','Endorsements',
    'Medical Card Expiry','Hire Date','Home City','Home State','Assigned Truck','Status',
    'HOS Drive Remaining','HOS Duty Remaining','HOS Cycle Remaining','Last Drug Test','Phone'];

  const names = [
    'Carlos Rivera', 'James Thompson', 'Andre Williams', 'Michael Brown', 'David Johnson',
    'Robert Garcia', 'Chris Martinez', 'Juan Hernandez', 'Frank Wilson', 'Tony Anderson',
    'Steve Taylor', 'Mark Thomas', 'Larry Moore', 'Dennis Jackson', 'Jerry Martin',
    'Wayne Lee', 'Billy Perez', 'Ray White', 'Eddie Harris', 'Tommy Clark',
    'Bobby Lewis', 'Jimmy Robinson', 'Joe Walker', 'Rick Hall', 'Kenny Allen',
    'Russell Young', 'Harry King', 'Ralph Wright', 'Howard Lopez', 'Earl Hill'
  ];

  const homeStates = ['FL', 'FL', 'FL', 'GA', 'GA', 'GA', 'MI', 'MI', 'OH', 'OH', 'PA', 'PA', 'NJ', 'NJ',
    'FL', 'GA', 'MI', 'OH', 'PA', 'NJ', 'FL', 'GA', 'FL', 'OH', 'MI', 'PA', 'NJ', 'FL', 'GA', 'OH'];

  const statuses = [
    ...Array(12).fill('available'), ...Array(8).fill('driving'),
    ...Array(5).fill('off_duty'), ...Array(3).fill('sleeper'), ...Array(2).fill('inactive')
  ];

  const rows = [];
  for (let i = 0; i < 30; i++) {
    const drvId = `DRV-${1001 + i}`;
    const name = names[i];
    const cdlClass = i < 25 ? 'A' : 'B';
    const homeState = homeStates[i];
    const homeCity = pick(CITIES[homeState]);

    // CDL Expiry: 3 expiring within 60 days
    let cdlExpiry;
    if (i < 3) {
      cdlExpiry = dateStr(randomDate(new Date('2026-03-25'), new Date('2026-05-23')));
    } else {
      cdlExpiry = dateStr(randomDate(new Date('2026-08-01'), new Date('2028-12-31')));
    }

    // Endorsements: no HazMat
    const endorsements = pick(['T,N', 'T', 'N', 'P', 'T,N', 'T', 'N', '']);

    // Medical card: 4 expired
    let medExpiry;
    if (i >= 3 && i < 7) {
      medExpiry = dateStr(randomDate(new Date('2025-09-01'), new Date('2026-03-15')));
    } else {
      medExpiry = dateStr(randomDate(new Date('2026-06-01'), new Date('2027-12-31')));
    }

    const hireDate = dateStr(randomDate(new Date('2018-01-01'), new Date('2025-12-31')));
    const truck = `T-${randInt(1000, 9999)}`;
    const status = statuses[i];

    // HOS: 5 with drive remaining under 3 hours
    let hosDrive, hosDuty, hosCycle;
    if (i >= 7 && i < 12) {
      hosDrive = (rand() * 2.9).toFixed(1);
      hosDuty = (parseFloat(hosDrive) + rand() * 3).toFixed(1);
      hosCycle = (40 + rand() * 20).toFixed(1);
    } else {
      hosDrive = (4 + rand() * 7).toFixed(1);
      hosDuty = (parseFloat(hosDrive) + 1 + rand() * 4).toFixed(1);
      hosCycle = (40 + rand() * 30).toFixed(1);
    }

    const lastDrug = dateStr(randomDate(new Date('2025-06-01'), new Date('2026-03-15')));
    const phone = `(${randInt(200, 999)}) ${randInt(200, 999)}-${randInt(1000, 9999)}`;

    rows.push([drvId, name, cdlClass, homeState, cdlExpiry, endorsements, medExpiry,
      hireDate, homeCity, homeState, truck, status, hosDrive, hosDuty, hosCycle,
      lastDrug, phone]);
  }

  writeCSV('cw-carriers-drivers.csv', headers, rows);
}

// ============================================================
// MAIN
// ============================================================
const startTime = Date.now();
console.log('=== CW Carriers USA Full Demo Data Generator ===\n');

// Ensure output dir exists
fs.mkdirSync(OUT_DIR, { recursive: true });

const loadRows = genLoads();
genCarrierAssure();
genDATRates();
genHubSpot();
genMacropoint(loadRows);
genDrivers();

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
console.log(`\nDone in ${elapsed}s`);
