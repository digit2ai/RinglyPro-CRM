/**
 * seed_lms.js
 * Seeds the RinglyPro Logistics Training Platform (LMS) with all course content.
 * 12 modules (6 warehouse + 6 freight), 58 lessons, 174 quiz questions.
 *
 * Run: /opt/homebrew/bin/node scripts/seed_lms.js
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

// ---------------------------------------------------------------------------
// 1. CREATE TABLES
// ---------------------------------------------------------------------------
async function createTables() {
  console.log('[1/4] Creating tables...');

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lms_modules (
      id SERIAL PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      track VARCHAR(50) NOT NULL,
      position INTEGER NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lms_lessons (
      id SERIAL PRIMARY KEY,
      module_id INTEGER NOT NULL REFERENCES lms_modules(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      transcript_notes TEXT,
      position INTEGER NOT NULL,
      duration_minutes INTEGER DEFAULT 10,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lms_quiz_questions (
      id SERIAL PRIMARY KEY,
      lesson_id INTEGER NOT NULL REFERENCES lms_lessons(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option CHAR(1) NOT NULL,
      explanation TEXT,
      position INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lms_progress (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL REFERENCES lms_lessons(id) ON DELETE CASCADE,
      completed BOOLEAN DEFAULT FALSE,
      quiz_score INTEGER,
      completed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, lesson_id)
    );
  `);

  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS lms_certificates (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      module_id INTEGER NOT NULL REFERENCES lms_modules(id) ON DELETE CASCADE,
      issued_at TIMESTAMPTZ DEFAULT NOW(),
      certificate_url TEXT,
      UNIQUE(user_id, module_id)
    );
  `);

  console.log('  Tables ready.');
}

// ---------------------------------------------------------------------------
// 2. CLEAR EXISTING SEED DATA
// ---------------------------------------------------------------------------
async function clearData() {
  console.log('[2/4] Clearing existing data...');
  await sequelize.query('DELETE FROM lms_quiz_questions');
  await sequelize.query('DELETE FROM lms_progress');
  await sequelize.query('DELETE FROM lms_certificates');
  await sequelize.query('DELETE FROM lms_lessons');
  await sequelize.query('DELETE FROM lms_modules');
  console.log('  Cleared.');
}

// ---------------------------------------------------------------------------
// 3. SEED MODULES
// ---------------------------------------------------------------------------
async function seedModules() {
  console.log('[3/4] Seeding modules...');

  const moduleDefs = [
    // WAREHOUSE TRACK
    { title: 'Warehouse Fundamentals', description: 'How a warehouse is structured, what happens inside it, and why it exists in the supply chain.', track: 'warehouse', position: 1 },
    { title: 'Inbound Operations', description: 'Everything from purchase order creation to product being stored in a bin.', track: 'warehouse', position: 2 },
    { title: 'Inventory Management', description: 'How inventory is tracked, counted, and optimized inside a warehouse.', track: 'warehouse', position: 3 },
    { title: 'Outbound Operations', description: 'From order receipt to truck departure.', track: 'warehouse', position: 4 },
    { title: 'Warehouse Management Systems', description: 'The software brain of the warehouse — how WMS platforms work.', track: 'warehouse', position: 5 },
    { title: 'Reverse Logistics and Returns', description: 'The full returns processing cycle from customer RMA to disposition.', track: 'warehouse', position: 6 },
    // FREIGHT TRACK
    { title: 'Freight Fundamentals', description: 'The building blocks of moving goods — modes, terminology, and industry structure.', track: 'freight', position: 1 },
    { title: 'Truckload (TL/FTL)', description: 'Full truckload shipping — when to use it, how to book and manage it.', track: 'freight', position: 2 },
    { title: 'Less-Than-Truckload (LTL)', description: 'How LTL freight works, pricing, and common pitfalls.', track: 'freight', position: 3 },
    { title: 'Freight Brokerage', description: "The broker's role — how to operate as a broker or work with one.", track: 'freight', position: 4 },
    { title: 'International Freight and Customs', description: 'Moving goods across borders — ocean, air, and customs.', track: 'freight', position: 5 },
    { title: 'Transportation Management Systems', description: 'How TMS platforms automate freight operations end-to-end.', track: 'freight', position: 6 },
  ];

  const modules = {};
  for (const m of moduleDefs) {
    const [rows] = await sequelize.query(
      `INSERT INTO lms_modules (title, description, track, position) VALUES ($1, $2, $3, $4) RETURNING id`,
      { bind: [m.title, m.description, m.track, m.position] }
    );
    const key = `${m.track}_${m.position}`;
    modules[key] = { id: rows[0].id, ...m };
    console.log(`  Module: ${m.track.toUpperCase()} ${m.position} — ${m.title} (id=${rows[0].id})`);
  }

  return modules;
}

// ---------------------------------------------------------------------------
// 4. SEED LESSONS
// ---------------------------------------------------------------------------
async function seedLessons(modules) {
  console.log('[4/4] Seeding lessons and quizzes...');

  // Each entry: [moduleKey, position, title, notes]
  const lessonDefs = [
    // ---- W1: Warehouse Fundamentals ----
    ['warehouse_1', 1, 'What is a Warehouse? Types and Purposes',
      'Distribution center vs. fulfillment center vs. storage warehouse. Public, private, bonded, and climate-controlled types. Role in the supply chain as a buffer between production and consumption.'],
    ['warehouse_1', 2, 'Warehouse Layout and Zones',
      'Receiving dock, bulk storage zone, pick zone, staging area, dispatch dock. Zone-based vs. random storage. Cross-docking layout. Aisle width standards for forklifts.'],
    ['warehouse_1', 3, 'Key Warehouse Metrics (KPIs)',
      'Order accuracy rate (target 99.5%+). Fill rate and perfect order rate. Dock-to-stock time. Inventory turns and days on hand. Cost per order shipped.'],
    ['warehouse_1', 4, 'Health, Safety, and OSHA Basics',
      'OSHA warehouse safety standards. Forklift certification requirements. PPE requirements. Aisle clearance rules. Emergency exits and fire suppression. Injury reporting and recordkeeping.'],

    // ---- W2: Inbound Operations ----
    ['warehouse_2', 1, 'Purchase Orders and Vendor Management',
      'PO lifecycle: create, approve, transmit, acknowledge, ship, receive. Lead time calculations. Vendor scorecards: on-time delivery, quality, fill rate.'],
    ['warehouse_2', 2, 'Advance Ship Notices (ASN)',
      'EDI 856 transaction. Contents: PO number, SKU, qty, carton count, tracking number. Benefits: pre-stage receiving labor, reduce check-in time by 30-50%.'],
    ['warehouse_2', 3, 'Dock Scheduling and Truck Arrival',
      'Appointment scheduling systems. Yard management: trailer tracking, dock door assignment. Lumper services for unloading. Detention charges for late unloading.'],
    ['warehouse_2', 4, 'Receiving, Counting, and Scanning',
      'Blind receiving vs. PO-based receiving. RF scanning workflow. Discrepancy handling: short shipment, overage, damage. Receiving SLA: dock-to-stock within 24 hours.'],
    ['warehouse_2', 5, 'Quality Control and Put-Away',
      'QC sampling rates (1-10% based on vendor score). Directed put-away: WMS assigns optimal location. Bin types: pallet rack, flow rack, shelving, bulk floor. Slotting optimization for pick efficiency.'],

    // ---- W3: Inventory Management ----
    ['warehouse_3', 1, 'Inventory Control Methods (FIFO, FEFO, LIFO)',
      'FIFO: First In First Out — most common. FEFO: First Expired First Out — required for food/pharma. LIFO: Last In First Out — rare, used for non-perishable bulk. Lot tracking and serial number tracking.'],
    ['warehouse_3', 2, 'Barcode, RFID, and License Plate Tracking',
      '1D barcodes (UPC, Code 128) vs 2D (QR, DataMatrix). RFID: passive vs active tags, read range, cost comparison. License Plate Number (LPN): pallet-level tracking. GS1 standards.'],
    ['warehouse_3', 3, 'Cycle Counting vs. Physical Inventory',
      'Full physical inventory: annual, disruptive, labor-intensive. Cycle counting: ongoing, non-disruptive. ABC analysis: A items counted monthly, B quarterly, C annually. Variance thresholds and root cause analysis.'],
    ['warehouse_3', 4, 'Slotting Optimization',
      'Velocity-based slotting: fast movers in golden zone (waist to shoulder height). Ergonomic considerations. Pick density optimization. Re-slotting triggers: seasonal changes, new product launches. Software tools for automated slotting.'],
    ['warehouse_3', 5, 'Shrinkage, Damage, and Loss Prevention',
      'Common shrinkage causes: theft, damage, mis-picks, receiving errors. Loss prevention: cameras, access control, cage areas. Damage prevention: proper stacking, stretch wrap, dunnage. Inventory accuracy target: 99.5%+.'],

    // ---- W4: Outbound Operations ----
    ['warehouse_4', 1, 'Order Management and Wave Planning',
      'Order batching strategies. Wave planning: group orders by carrier, zone, or priority. Wave release windows: balance labor across shifts. Real-time vs. scheduled wave processing.'],
    ['warehouse_4', 2, 'Pick Strategies',
      'Discrete picking: one order at a time — simple but slow. Zone picking: each picker stays in assigned zone. Batch picking: multiple orders simultaneously. Cluster picking: pick cart with multiple totes. Pick-to-light and voice-directed picking.'],
    ['warehouse_4', 3, 'Pack Station Operations',
      'Cartonization: right-size box selection. Void fill materials: air pillows, paper, foam. Dimensional weight pricing impact. Packing slip and shipping label generation. Quality check at pack station.'],
    ['warehouse_4', 4, 'Manifesting and Carrier Selection',
      'Rate shopping across carriers. Small parcel vs. LTL decision threshold (usually 150 lbs). UCC-128 / GS1-128 shipping labels. Manifest close and end-of-day processing. Carrier pickup scheduling.'],
    ['warehouse_4', 5, 'Outbound Staging and Load Planning',
      'Door assignment by carrier/route. Load sequence: last stop loaded first. Trailer cube utilization optimization. Floor-loaded vs. palletized freight. Bill of lading generation.'],

    // ---- W5: Warehouse Management Systems ----
    ['warehouse_5', 1, 'What is a WMS and Why It Matters',
      'On-premise vs. cloud WMS. Major vendors: Manhattan Associates, Blue Yonder, SAP EWM, Oracle WMS, Korber. WMS vs. ERP inventory module. ROI: 25-30% labor efficiency gain typical.'],
    ['warehouse_5', 2, 'WMS Receiving and Put-Away Workflows',
      'RF gun-directed receiving workflow. Task interleaving: combine put-away with replenishment trips. System-directed vs. user-directed put-away. Exception handling in WMS.'],
    ['warehouse_5', 3, 'WMS Picking and Replenishment',
      'Pick task generation and prioritization. Min/max replenishment triggers. Dynamic replenishment during wave. Zone skip logic. Pick path optimization algorithms.'],
    ['warehouse_5', 4, 'WMS Reporting and Dashboards',
      'Labor management: units per hour by function. Throughput dashboards: orders, lines, units per shift. Inventory accuracy and adjustment reports. Aging reports for slow-moving stock.'],
    ['warehouse_5', 5, 'WMS Integration with ERP and TMS',
      'EDI integration: 940 (ship order), 945 (ship confirm), 943 (stock transfer). API-based real-time integration. Middleware layers (MuleSoft, Boomi). TMS integration for carrier selection and BOL generation.'],

    // ---- W6: Reverse Logistics and Returns ----
    ['warehouse_6', 1, 'What is Reverse Logistics?',
      'Returns account for 15-30% of e-commerce orders. Cost of processing a return: $10-20 average. Consumer expectation: free, easy returns. Reverse logistics as competitive advantage.'],
    ['warehouse_6', 2, 'RMA Process and Returns Authorization',
      'RMA (Return Merchandise Authorization) workflow. Reason codes: defective, wrong item, changed mind, damaged in transit. Return shipping label generation. Tracking returned shipments.'],
    ['warehouse_6', 3, 'Returns Receiving and Grading',
      'Condition codes: A (like new), B (minor defect), C (major defect), D (unsalvageable). Grading criteria checklist. Photography for documentation. Routing decisions based on grade.'],
    ['warehouse_6', 4, 'Refurbishment, Repackaging, Restocking',
      'Grade A: direct restock to inventory. Grade B: repackage, relabel, restock. Refurbishment lines for electronics/appliances. Quality re-test before restocking. Time-to-restock KPI.'],
    ['warehouse_6', 5, 'Liquidation, Donation, and Destruction',
      'Bulk liquidation platforms (B-Stock, Liquidation.com). Charitable donation programs: tax benefits, brand protection. Data destruction for electronics. Environmental compliance for disposal. Grade D destruction documentation.'],

    // ---- F1: Freight Fundamentals ----
    ['freight_1', 1, 'Freight Modes: TL, LTL, Rail, Air, Ocean',
      'Truckload: 40,000+ lbs, dedicated trailer. LTL: shared trailer, 100-10,000 lbs. Rail: bulk commodities, intermodal containers. Air: urgent, high-value. Ocean: international, lowest cost per ton-mile.'],
    ['freight_1', 2, 'Industry Structure: Shippers, Brokers, Carriers',
      'Shipper: owns the freight, pays for transportation. Broker: intermediary, matches shippers with carriers, earns margin. Carrier: owns trucks/equipment, moves the freight. 3PL: manages logistics for shipper.'],
    ['freight_1', 3, 'Key Freight Terminology',
      'BOL: Bill of Lading — master shipping document. POD: Proof of Delivery — signed confirmation. NMFC: National Motor Freight Classification. FAK: Freight All Kinds. Drayage: short-distance port/rail moves. Deadhead: empty truck miles.'],
    ['freight_1', 4, 'Freight Documents: BOL, POD, Invoice',
      'Bill of Lading: shipper, consignee, commodity, weight, class. POD: delivery time, condition, signature. Freight invoice: charges, accessorials, payment terms. Rate confirmation: agreed rate between broker and carrier.'],

    // ---- F2: Truckload (TL/FTL) ----
    ['freight_2', 1, 'What is Truckload Freight?',
      'Equipment types: dry van (53ft standard), reefer (temperature-controlled), flatbed (open deck), step deck (lowered deck). Weight limits: 44,000-45,000 lbs typical. Full trailer dedicated to one shipment.'],
    ['freight_2', 2, 'Spot Market vs. Contract Rates',
      'Contract rates: annual agreements, fixed price, guaranteed capacity. Spot market: real-time pricing, volatile, load boards (DAT, Truckstop). Rate cycle: peak season (Oct-Jan) vs. soft season (Feb-May). Rate per mile benchmarks by lane.'],
    ['freight_2', 3, 'Driver HOS Regulations',
      '11-hour driving limit after 10 consecutive hours off. 14-hour on-duty window. 30-minute break after 8 hours driving. 60/70 hour weekly limit. 34-hour restart provision. ELD mandate since December 2017.'],
    ['freight_2', 4, 'Load Tendering and Tracking',
      'EDI 204: load tender from shipper to carrier. EDI 990: tender response (accept/decline). EDI 214: shipment status updates. Real-time GPS tracking via ELD. Check calls: proactive status updates.'],
    ['freight_2', 5, 'Accessorial Charges',
      'Detention: waiting time at shipper/receiver ($50-100/hour after 2 hours free time). TONU: Truck Ordered Not Used — cancellation fee. Layover: overnight wait. Lumper: unloading labor fee. Driver assist. Overlength/overweight surcharges.'],

    // ---- F3: Less-Than-Truckload (LTL) ----
    ['freight_3', 1, 'LTL Network Structure',
      'Hub-and-spoke network: local P&D (pickup & delivery) routes feed into terminals. Linehaul: terminal-to-terminal long-haul. Break-bulk: transferring freight between trailers. Transit times: 1-5 days depending on lanes. Top carriers: FedEx Freight, XPO, Estes, SAIA, Old Dominion.'],
    ['freight_3', 2, 'NMFC Freight Classification',
      '18 freight classes from 50 (lowest) to 500 (highest). Based on: density, stowability, handling, liability. Lower class = lower rate. Sub-classes within each main class. How to look up NMFC codes.'],
    ['freight_3', 3, 'LTL Pricing and Tariffs',
      'Base rate from tariff tables. Discount off base rate (50-80% typical). Minimum charge per shipment. FAK (Freight All Kinds): simplified pricing, one class for all. Fuel surcharge: percentage added weekly based on diesel index.'],
    ['freight_3', 4, 'Dimensional Weight and Density',
      'Density = weight / cubic feet. LTL carriers audit shipments for class accuracy. Reweigh and reclass charges. How to calculate: L x W x H / 1,728 = cubic feet. Density-based rating vs. class-based rating.'],
    ['freight_3', 5, 'Claims: Filing and Preventing Damage',
      'Carmack Amendment: carrier liability for freight damage. Filing deadline: 9 months from delivery. Document everything: photos at pickup and delivery. Concealed damage: report within 5 days. Shrink wrap, palletize, and label properly to prevent claims.'],

    // ---- F4: Freight Brokerage ----
    ['freight_4', 1, 'What Does a Freight Broker Do?',
      'Licensed intermediary (FMCSA MC authority). Revenue model: margin between shipper rate and carrier rate (12-18% typical). $75,000 surety bond or trust fund required. Broker vs. agent vs. carrier.'],
    ['freight_4', 2, 'Load Boards and Carrier Sourcing',
      'DAT: largest load board, 500M+ loads/year. Truckstop.com: second largest, strong in FTL. How to post a load: origin, destination, equipment, rate. Carrier vetting: MC#, insurance, safety score. Building a carrier network vs. spot sourcing.'],
    ['freight_4', 3, 'Carrier Onboarding and Compliance',
      'Carrier packet: W-9, insurance certificate, MC authority, signed contract. Insurance minimums: $1M auto liability, $100K cargo. FMCSA SAFER system for authority verification. Ongoing monitoring: insurance lapses, safety changes.'],
    ['freight_4', 4, 'Rate Negotiation and Margin Management',
      'Buy rate (to carrier) vs. sell rate (to shipper). Target margin: 15-18% for spot, 10-12% for contract. Lane analysis for pricing optimization. Volume commitments for better carrier rates. When to take a low-margin load (backhaul, relationship).'],
    ['freight_4', 5, 'TMS for Brokers',
      'Core TMS functions: load entry, carrier matching, tracking, invoicing. Top broker TMS: McLeod PowerBroker, Turvo, AscendTMS, Rose Rocket. Integration with load boards, accounting (QuickBooks), ELD providers. Automation: auto-dispatch, auto-tracking, auto-invoicing.'],

    // ---- F5: International Freight and Customs ----
    ['freight_5', 1, 'Incoterms Explained',
      'EXW (Ex Works): buyer assumes all risk from seller\'s door. FOB (Free On Board): seller delivers to port, risk transfers at ship\'s rail. CIF (Cost Insurance Freight): seller pays freight + insurance to destination port. DDP (Delivered Duty Paid): seller handles everything to buyer\'s door.'],
    ['freight_5', 2, 'Ocean Freight: FCL vs LCL',
      'FCL: Full Container Load — dedicated 20ft or 40ft container. LCL: Less than Container Load — shared container, consolidated. Transit times: Asia-US West Coast 12-18 days, Asia-US East Coast 25-35 days. Booking process: carrier or NVOCC.'],
    ['freight_5', 3, 'Air Freight Operations',
      'IATA regulations for air cargo. Air waybill (AWB) vs. bill of lading. ULD containers: pallets and containers for aircraft. Dimensional weight: L x W x H cm / 6000. Cost: 4-5x ocean freight but 10x faster.'],
    ['freight_5', 4, 'Customs Clearance and Import Duties',
      'HTS (Harmonized Tariff Schedule) codes: 10-digit classification. Duty rates: 0-25%+ depending on product and country of origin. Customs broker: licensed agent who files entries with CBP. Entry types: formal (>$2,500), informal (<$2,500). ISF (10+2): required 24 hours before vessel departure.'],
    ['freight_5', 5, 'Drayage and Port Operations',
      'Drayage: short-haul trucking from port to warehouse (or rail ramp). Chassis: the trailer frame that carries a container. Per diem: daily charge for keeping chassis past free time. Demurrage: charge for leaving container at port past free time. Last Free Day (LFD): deadline to pick up container without charges.'],

    // ---- F6: Transportation Management Systems ----
    ['freight_6', 1, 'What is a TMS?',
      'Software that plans, executes, and optimizes freight movement. Shipper TMS: for companies shipping their own goods. Broker TMS: for freight brokers managing loads. Major vendors: Oracle TMS, SAP TM, MercuryGate, project44, Kuebix. Cloud vs. on-premise deployment.'],
    ['freight_6', 2, 'Rate Shopping and Carrier Selection',
      'Multi-modal rate comparison in one screen. Routing guide: prioritized carrier list per lane. Spot rate integration from load boards. Service level considerations: transit time, on-time %, claims ratio. Total cost analysis: base rate + fuel + accessorials.'],
    ['freight_6', 3, 'Shipment Execution and Tracking',
      'Tender workflow: offer load to carrier, await accept/decline. EDI 204/990 automation. Real-time tracking: GPS, ELD, carrier API, check calls. Exception management: delays, route deviations, temperature alerts. Customer portal: self-service tracking for shippers.'],
    ['freight_6', 4, 'Freight Audit and Payment',
      '3-way match: PO, BOL, invoice. Common billing errors: duplicate charges, wrong weight, wrong accessorials. Automated audit rules. Dispute management workflow. Payment terms: net 30, quick pay (2% discount for payment in <7 days).'],
    ['freight_6', 5, 'TMS Analytics and Reporting',
      'On-time delivery percentage by carrier/lane. Cost per mile/shipment/unit trends. Carrier scorecard: service, cost, capacity metrics. Lane analysis: volume, spend, rate trends. Mode optimization: when to shift between TL, LTL, intermodal.'],
  ];

  // Quiz questions keyed by "moduleKey_lessonPosition"
  const quizDefs = {
    // =====================================================================
    // W1: Warehouse Fundamentals
    // =====================================================================
    'warehouse_1_1': [
      { question: 'What is the primary difference between a distribution center and a storage warehouse?', option_a: 'Distribution centers are always larger', option_b: 'Distribution centers focus on throughput and rapid movement of goods, while storage warehouses prioritize long-term holding', option_c: 'Storage warehouses only handle pallets', option_d: 'There is no meaningful difference', correct_option: 'B', explanation: 'Distribution centers are designed to move product quickly (cross-dock, sort, ship), while storage warehouses are optimized for holding inventory over longer periods.' },
      { question: 'Which type of warehouse is required when storing imported goods before customs duties are paid?', option_a: 'Public warehouse', option_b: 'Climate-controlled warehouse', option_c: 'Bonded warehouse', option_d: 'Private warehouse', correct_option: 'C', explanation: 'A bonded warehouse is authorized by customs authorities to store imported goods before duty payment, allowing the importer to defer duty until the goods are released.' },
      { question: 'What role does a warehouse play in the supply chain?', option_a: 'It replaces the need for transportation', option_b: 'It serves as a buffer between production and consumption to balance supply and demand timing', option_c: 'It only exists for returns processing', option_d: 'It is used exclusively for manufacturing', correct_option: 'B', explanation: 'Warehouses buffer the difference in timing between when goods are produced and when they are consumed, enabling economies of scale in production and transportation.' },
    ],
    'warehouse_1_2': [
      { question: 'In a standard warehouse layout, where does product first enter the building?', option_a: 'Pick zone', option_b: 'Dispatch dock', option_c: 'Receiving dock', option_d: 'Staging area', correct_option: 'C', explanation: 'Product enters through the receiving dock where it is unloaded, inspected, and checked in before being moved to storage.' },
      { question: 'What is cross-docking?', option_a: 'Storing products in two different zones simultaneously', option_b: 'Moving inbound freight directly to outbound staging with minimal or no storage time', option_c: 'A forklift traffic pattern', option_d: 'A method of stacking pallets', correct_option: 'B', explanation: 'Cross-docking transfers goods from inbound receiving directly to outbound shipping, bypassing storage to reduce handling time and cost.' },
      { question: 'Why do aisle width standards matter in warehouse design?', option_a: 'They only affect aesthetics', option_b: 'Wider aisles always improve efficiency', option_c: 'They determine which types of forklifts can operate safely and how much storage density is possible', option_d: 'They are only relevant for OSHA compliance', correct_option: 'C', explanation: 'Aisle widths must accommodate the turning radius of the forklifts used (standard, narrow-aisle, very-narrow-aisle), directly impacting storage density and equipment selection.' },
    ],
    'warehouse_1_3': [
      { question: 'What is the industry target for order accuracy rate?', option_a: '90%', option_b: '95%', option_c: '99.5% or higher', option_d: '100% is the only acceptable target', correct_option: 'C', explanation: 'Best-in-class warehouses target 99.5%+ order accuracy. While 100% is ideal, the industry benchmark for excellence is 99.5% or above.' },
      { question: 'What does "dock-to-stock time" measure?', option_a: 'Time from order placement to delivery', option_b: 'Time from when a truck arrives at the dock until the product is put away in its storage location', option_c: 'Time to pick an order', option_d: 'Time between inventory counts', correct_option: 'B', explanation: 'Dock-to-stock time measures the elapsed time from truck arrival at the receiving dock to the product being stored in its assigned bin or location.' },
      { question: 'If a warehouse has high inventory turns, what does that indicate?', option_a: 'The warehouse is overstocked', option_b: 'Products are selling and being replaced quickly, meaning capital is not tied up in sitting inventory', option_c: 'The warehouse has too many employees', option_d: 'Shrinkage is a major problem', correct_option: 'B', explanation: 'High inventory turns mean products move through the warehouse quickly, which reduces holding costs and indicates strong demand alignment.' },
    ],
    'warehouse_1_4': [
      { question: 'What is required before an employee can operate a forklift in a warehouse?', option_a: 'A standard driver\'s license', option_b: 'OSHA-compliant forklift certification and training', option_c: 'No special requirements', option_d: 'Only a safety vest', correct_option: 'B', explanation: 'OSHA requires all forklift operators to complete formal training and evaluation before operating powered industrial trucks (29 CFR 1910.178).' },
      { question: 'What is the purpose of maintaining clear aisle clearance in a warehouse?', option_a: 'To make the warehouse look organized for visitors', option_b: 'To ensure safe movement of equipment and personnel and provide clear emergency egress', option_c: 'To maximize storage density', option_d: 'It is only required during inspections', correct_option: 'B', explanation: 'Clear aisles prevent collisions, allow safe forklift operation, and ensure emergency exit routes are unobstructed per OSHA standards.' },
      { question: 'When a workplace injury occurs in a warehouse, what must the employer do?', option_a: 'Nothing unless the employee files a complaint', option_b: 'Record and report the injury per OSHA recordkeeping requirements', option_c: 'Only notify the insurance company', option_d: 'Wait until the annual safety audit', correct_option: 'B', explanation: 'OSHA requires employers to maintain records of work-related injuries and illnesses (OSHA 300 log) and report serious incidents within specified timeframes.' },
    ],

    // =====================================================================
    // W2: Inbound Operations
    // =====================================================================
    'warehouse_2_1': [
      { question: 'What is the correct sequence in a purchase order lifecycle?', option_a: 'Ship, create, approve, receive', option_b: 'Create, approve, transmit, acknowledge, ship, receive', option_c: 'Receive, approve, ship, create', option_d: 'Transmit, create, ship, acknowledge', correct_option: 'B', explanation: 'The PO lifecycle follows a logical sequence: the buyer creates and approves the PO, transmits it to the vendor, the vendor acknowledges, then ships, and the buyer receives.' },
      { question: 'What metrics are typically tracked on a vendor scorecard?', option_a: 'Only pricing', option_b: 'On-time delivery, quality, and fill rate', option_c: 'Warehouse square footage', option_d: 'Number of employees', correct_option: 'B', explanation: 'Vendor scorecards track performance across on-time delivery percentage, product quality (defect rates), and fill rate (percentage of ordered quantity actually shipped).' },
      { question: 'Why is lead time calculation important for purchase orders?', option_a: 'It only matters for international orders', option_b: 'It determines when to place orders so inventory arrives before stockout', option_c: 'It is only used for accounting purposes', option_d: 'It has no impact on warehouse operations', correct_option: 'B', explanation: 'Accurate lead time calculation ensures purchase orders are placed early enough for inventory to arrive before existing stock runs out, preventing stockouts and lost sales.' },
    ],
    'warehouse_2_2': [
      { question: 'What EDI transaction code is used for an Advance Ship Notice?', option_a: 'EDI 810', option_b: 'EDI 850', option_c: 'EDI 856', option_d: 'EDI 940', correct_option: 'C', explanation: 'EDI 856 is the standard transaction set for Advance Ship Notices, providing detailed shipment information before the goods arrive.' },
      { question: 'How much can ASNs reduce receiving check-in time?', option_a: '5-10%', option_b: '10-20%', option_c: '30-50%', option_d: '80-90%', correct_option: 'C', explanation: 'ASNs allow the warehouse to pre-stage receiving labor and know exactly what is coming, reducing check-in time by 30-50% compared to blind receiving.' },
      { question: 'What information is typically included in an ASN?', option_a: 'Only the carrier name', option_b: 'PO number, SKU, quantity, carton count, and tracking number', option_c: 'Only the expected delivery date', option_d: 'Payment terms only', correct_option: 'B', explanation: 'ASNs contain detailed shipment contents including PO number, SKU details, quantities, carton count, and tracking information so the warehouse can prepare for receipt.' },
    ],
    'warehouse_2_3': [
      { question: 'What is yard management in the context of dock scheduling?', option_a: 'Landscaping the warehouse exterior', option_b: 'Tracking trailers in the yard and assigning dock doors for efficient loading/unloading', option_c: 'Managing employee parking', option_d: 'Cleaning the dock area', correct_option: 'B', explanation: 'Yard management involves tracking the location of trailers on the property and strategically assigning dock doors to optimize the flow of inbound and outbound freight.' },
      { question: 'What is a detention charge?', option_a: 'A charge for damaged goods', option_b: 'A fee charged by the carrier when a truck is delayed at the dock beyond free time during loading or unloading', option_c: 'A penalty for late PO submission', option_d: 'A storage fee', correct_option: 'B', explanation: 'Detention charges are fees carriers impose when their trucks and drivers are held at a facility beyond the agreed-upon free time, compensating for lost productivity.' },
      { question: 'What is a lumper service?', option_a: 'A type of forklift', option_b: 'Third-party labor hired to unload trucks at receiving docks', option_c: 'A dock scheduling software', option_d: 'A trailer tracking device', correct_option: 'B', explanation: 'Lumper services provide third-party labor to unload trucks, often used when carriers or receivers do not want to use their own labor for unloading.' },
    ],
    'warehouse_2_4': [
      { question: 'What is the difference between blind receiving and PO-based receiving?', option_a: 'There is no difference', option_b: 'Blind receiving counts without seeing the PO, forcing an accurate count; PO-based receiving shows expected quantities', option_c: 'Blind receiving skips the counting step', option_d: 'PO-based receiving is only used for returns', correct_option: 'B', explanation: 'Blind receiving hides expected quantities from the receiver, forcing them to independently count what arrived. PO-based receiving shows expected quantities, which can lead to confirmation bias.' },
      { question: 'What is the standard SLA for dock-to-stock time?', option_a: '1 hour', option_b: '4 hours', option_c: 'Within 24 hours', option_d: '3 business days', correct_option: 'C', explanation: 'The standard receiving SLA is dock-to-stock within 24 hours, meaning received product should be put away in its storage location within one day of arrival.' },
      { question: 'When a shipment arrives with fewer units than the PO specified, this is called:', option_a: 'Overage', option_b: 'Damage claim', option_c: 'Short shipment', option_d: 'Return authorization', correct_option: 'C', explanation: 'A short shipment occurs when the quantity received is less than what was ordered on the PO. This discrepancy must be documented and reported to the vendor.' },
    ],
    'warehouse_2_5': [
      { question: 'What determines the QC sampling rate for incoming goods?', option_a: 'The weight of the shipment', option_b: 'The vendor\'s quality score — lower-rated vendors get higher sampling rates (1-10%)', option_c: 'The day of the week', option_d: 'All shipments get 100% inspection', correct_option: 'B', explanation: 'QC sampling rates are typically based on vendor quality history. Trusted vendors with high scores may get 1% sampling while problematic vendors may get up to 10% or higher.' },
      { question: 'What is directed put-away?', option_a: 'The operator chooses any available location', option_b: 'The WMS automatically assigns the optimal storage location based on product attributes and slotting rules', option_c: 'Products are always put on the floor', option_d: 'A manual paper-based process', correct_option: 'B', explanation: 'Directed put-away uses the WMS to assign optimal bin locations based on product velocity, size, weight, and slotting rules, improving pick efficiency and space utilization.' },
      { question: 'Which bin type is best suited for high-velocity small items?', option_a: 'Bulk floor storage', option_b: 'Pallet rack', option_c: 'Flow rack (carton flow)', option_d: 'Mezzanine storage', correct_option: 'C', explanation: 'Flow racks use gravity-fed rollers to present cartons at the pick face, ideal for high-velocity small items because they maintain FIFO and provide ergonomic, fast picking.' },
    ],

    // =====================================================================
    // W3: Inventory Management
    // =====================================================================
    'warehouse_3_1': [
      { question: 'Which inventory control method is required for food and pharmaceutical products?', option_a: 'FIFO', option_b: 'LIFO', option_c: 'FEFO (First Expired First Out)', option_d: 'Random', correct_option: 'C', explanation: 'FEFO ensures products closest to expiration are shipped first, which is critical for food and pharmaceuticals to prevent selling expired goods and minimize waste.' },
      { question: 'When is LIFO (Last In First Out) typically used?', option_a: 'For all perishable goods', option_b: 'For non-perishable bulk goods where the product does not expire or degrade', option_c: 'For pharmaceutical products', option_d: 'It is the most common method for all warehouses', correct_option: 'B', explanation: 'LIFO is rare in warehousing and mainly used for non-perishable bulk commodities (like coal, sand, or gravel) where product quality does not change over time.' },
      { question: 'What is lot tracking?', option_a: 'Tracking the location of a parking lot', option_b: 'Assigning and following a batch number through the supply chain so items can be traced to their production run', option_c: 'Counting total inventory', option_d: 'A method of organizing warehouse zones', correct_option: 'B', explanation: 'Lot tracking assigns a unique batch or lot number to a group of products from the same production run, enabling traceability for recalls, quality issues, or regulatory compliance.' },
    ],
    'warehouse_3_2': [
      { question: 'What is the key advantage of RFID over traditional barcodes?', option_a: 'RFID is always cheaper', option_b: 'RFID can read multiple tags simultaneously without line-of-sight, enabling faster scanning', option_c: 'Barcodes are no longer used in warehouses', option_d: 'RFID only works on metal products', correct_option: 'B', explanation: 'RFID does not require line-of-sight and can read hundreds of tags per second simultaneously, making it much faster for inventory counts and receiving than scanning barcodes one at a time.' },
      { question: 'What is a License Plate Number (LPN) in warehouse operations?', option_a: 'The vehicle registration of a delivery truck', option_b: 'A unique identifier assigned to a pallet or container that tracks all contents as a single unit', option_c: 'A barcode standard for retail products', option_d: 'An OSHA compliance number', correct_option: 'B', explanation: 'An LPN is a unique barcode assigned to a pallet or container that links to all the SKUs and quantities on that unit, enabling pallet-level tracking throughout the warehouse.' },
      { question: 'What organization sets the standards for barcode formats used in supply chain?', option_a: 'OSHA', option_b: 'GS1', option_c: 'FMCSA', option_d: 'IATA', correct_option: 'B', explanation: 'GS1 is the global standards organization that manages barcode formats (UPC, EAN, GS1-128), RFID standards (EPC), and data standards used throughout the supply chain.' },
    ],
    'warehouse_3_3': [
      { question: 'What is the main advantage of cycle counting over a full physical inventory?', option_a: 'Cycle counting is less accurate', option_b: 'Cycle counting is ongoing and non-disruptive, allowing the warehouse to continue operations', option_c: 'Full physical inventory is faster', option_d: 'Cycle counting only works for small warehouses', correct_option: 'B', explanation: 'Cycle counting counts a small subset of inventory on a rotating basis without shutting down operations, unlike a full physical inventory which requires stopping all activity.' },
      { question: 'In ABC analysis, how often should A items typically be cycle counted?', option_a: 'Annually', option_b: 'Monthly', option_c: 'Only when discrepancies are found', option_d: 'Every 2 years', correct_option: 'B', explanation: 'A items (high-value or high-velocity) are counted monthly because discrepancies in these items have the greatest financial or operational impact.' },
      { question: 'What should happen when a cycle count reveals a variance beyond the threshold?', option_a: 'Ignore it until the annual count', option_b: 'Conduct a root cause analysis to identify why the variance occurred and correct the issue', option_c: 'Simply adjust the number in the system', option_d: 'Recount the entire warehouse', correct_option: 'B', explanation: 'Variance beyond threshold triggers a root cause analysis to identify whether the issue is theft, mis-picks, receiving errors, or system problems, so the underlying cause can be fixed.' },
    ],
    'warehouse_3_4': [
      { question: 'What is the "golden zone" in slotting optimization?', option_a: 'The most expensive area of the warehouse', option_b: 'Waist to shoulder height — the most ergonomic and fastest picking area', option_c: 'The top rack level', option_d: 'The area closest to the break room', correct_option: 'B', explanation: 'The golden zone (waist to shoulder height) requires the least bending and reaching, making picks fastest and most ergonomic. High-velocity items should be slotted here.' },
      { question: 'What typically triggers a re-slotting analysis?', option_a: 'Only when the warehouse moves to a new building', option_b: 'Seasonal demand changes, new product launches, or significant velocity shifts', option_c: 'Every day', option_d: 'Re-slotting is never needed after initial setup', correct_option: 'B', explanation: 'Re-slotting should occur when product velocity patterns change significantly, such as seasonal shifts, new product introductions, or when pick efficiency metrics decline.' },
      { question: 'What is pick density?', option_a: 'The weight of items in a pick zone', option_b: 'The number of picks that can be made per distance traveled — higher density means less walking', option_c: 'The number of pickers in the warehouse', option_d: 'The size of the pick label', correct_option: 'B', explanation: 'Pick density measures how many picks can be completed per unit of distance traveled. Higher pick density means less travel time between picks, improving productivity.' },
    ],
    'warehouse_3_5': [
      { question: 'What is the inventory accuracy target for a well-managed warehouse?', option_a: '90%', option_b: '95%', option_c: '99.5% or higher', option_d: '85%', correct_option: 'C', explanation: 'Best-in-class warehouses maintain inventory accuracy of 99.5% or higher. Below this level, order fulfillment errors, stockouts, and customer dissatisfaction increase significantly.' },
      { question: 'What are the most common causes of inventory shrinkage?', option_a: 'Only theft', option_b: 'Theft, damage, mis-picks, and receiving errors', option_c: 'Only system errors', option_d: 'Shrinkage does not occur in modern warehouses', correct_option: 'B', explanation: 'Shrinkage comes from multiple sources: internal/external theft, product damage during handling, mis-picks (wrong item sent), and receiving errors (wrong count or item checked in).' },
      { question: 'Which loss prevention measure helps protect high-value inventory?', option_a: 'Storing it in the parking lot', option_b: 'Cage areas with restricted access control', option_c: 'Placing it near the dock doors for easy access', option_d: 'No special measures are needed', correct_option: 'B', explanation: 'High-value inventory is typically stored in locked cage areas with restricted access, security cameras, and sign-out procedures to prevent theft and unauthorized access.' },
    ],

    // =====================================================================
    // W4: Outbound Operations
    // =====================================================================
    'warehouse_4_1': [
      { question: 'What is wave planning in outbound operations?', option_a: 'A method of organizing shifts', option_b: 'Grouping orders by carrier, zone, or priority and releasing them together for efficient processing', option_c: 'A type of pick strategy', option_d: 'Planning ocean freight shipments', correct_option: 'B', explanation: 'Wave planning batches orders with similar characteristics (same carrier, destination zone, priority level) and releases them together to optimize labor and carrier loading.' },
      { question: 'Why would a warehouse use wave release windows?', option_a: 'To delay all shipments', option_b: 'To balance labor across shifts and align with carrier pickup schedules', option_c: 'Waves are only used in ocean freight', option_d: 'To reduce inventory accuracy', correct_option: 'B', explanation: 'Wave release windows spread work evenly across the shift, prevent labor bottlenecks, and ensure orders are ready when carriers arrive for pickup.' },
      { question: 'What is the difference between real-time and scheduled wave processing?', option_a: 'There is no difference', option_b: 'Real-time releases orders as they arrive; scheduled releases batches at set intervals for efficiency', option_c: 'Scheduled processing is always faster', option_d: 'Real-time processing only works for e-commerce', correct_option: 'B', explanation: 'Real-time processing releases orders immediately for fastest fulfillment (common in e-commerce), while scheduled waves batch orders at intervals for more efficient picking and labor planning.' },
    ],
    'warehouse_4_2': [
      { question: 'Which pick strategy is simplest but least efficient for high-volume operations?', option_a: 'Zone picking', option_b: 'Batch picking', option_c: 'Discrete picking (one order at a time)', option_d: 'Cluster picking', correct_option: 'C', explanation: 'Discrete picking handles one order at a time start-to-finish. It is the simplest to train and implement but requires the most travel time, making it inefficient at high volumes.' },
      { question: 'What is the advantage of zone picking?', option_a: 'Each picker memorizes their zone, reducing search time and travel distance', option_b: 'It requires fewer total employees', option_c: 'It eliminates the need for a WMS', option_d: 'It only works for small warehouses', correct_option: 'A', explanation: 'Zone picking assigns each picker to a specific area. Pickers become experts in their zone layout, reducing travel distance and increasing pick speed within their assigned area.' },
      { question: 'What technology does voice-directed picking use?', option_a: 'Paper pick lists', option_b: 'Headsets that give verbal pick instructions and accept voice confirmations, keeping hands free', option_c: 'Automated robots only', option_d: 'Handheld barcode scanners', correct_option: 'B', explanation: 'Voice-directed picking uses headsets to speak pick locations and quantities to the operator, who confirms verbally. This keeps both hands free for picking and improves accuracy and speed.' },
    ],
    'warehouse_4_3': [
      { question: 'What is cartonization?', option_a: 'A method of counting inventory', option_b: 'Selecting the right-size shipping box for the items in an order to minimize void fill and dimensional weight charges', option_c: 'A type of pallet wrapping', option_d: 'Recycling cardboard boxes', correct_option: 'B', explanation: 'Cartonization algorithms determine the optimal box size for each order, reducing void fill material, dimensional weight shipping charges, and packaging waste.' },
      { question: 'Why does dimensional weight pricing matter at the pack station?', option_a: 'It does not affect shipping costs', option_b: 'Carriers charge based on whichever is greater — actual weight or dimensional weight — so oversized boxes increase shipping costs', option_c: 'It only applies to international shipments', option_d: 'Dimensional weight is only used for air freight', correct_option: 'B', explanation: 'Carriers use the greater of actual weight or dimensional weight (based on box volume) to calculate charges. Using a box that is too large inflates dimensional weight and increases costs.' },
      { question: 'What quality check should happen at the pack station before sealing a box?', option_a: 'No checks are needed at pack', option_b: 'Verify the correct items and quantities match the order, check for damage, and confirm packing slip accuracy', option_c: 'Only check the shipping label', option_d: 'Only verify the box weight', correct_option: 'B', explanation: 'The pack station is the last quality checkpoint before the order leaves. Verifying items, quantities, condition, and packing slip accuracy prevents shipping errors and returns.' },
    ],
    'warehouse_4_4': [
      { question: 'At what weight threshold do shipments typically shift from small parcel to LTL?', option_a: '50 lbs', option_b: '150 lbs', option_c: '500 lbs', option_d: '1,000 lbs', correct_option: 'B', explanation: 'The typical breakpoint between small parcel (UPS, FedEx Ground) and LTL is around 150 lbs. Above this weight, LTL rates usually become more cost-effective than parcel rates.' },
      { question: 'What is manifest close?', option_a: 'Closing the warehouse doors', option_b: 'The end-of-day process that finalizes all shipment records and transmits them to the carrier for billing and tracking', option_c: 'A type of shipping label', option_d: 'Canceling shipments', correct_option: 'B', explanation: 'Manifest close is the end-of-day process where all shipment data is finalized and transmitted to carriers. This triggers carrier billing and ensures accurate tracking information.' },
      { question: 'What is rate shopping in outbound logistics?', option_a: 'Comparing warehouse rental rates', option_b: 'Comparing shipping rates across multiple carriers to find the best combination of cost and service for each shipment', option_c: 'Negotiating employee pay rates', option_d: 'Comparing WMS software prices', correct_option: 'B', explanation: 'Rate shopping uses TMS or multi-carrier shipping software to compare rates across carriers in real-time, selecting the optimal carrier based on cost, transit time, and service requirements.' },
    ],
    'warehouse_4_5': [
      { question: 'Why should the last delivery stop be loaded into the truck first?', option_a: 'It does not matter what order items are loaded', option_b: 'So it is at the back of the trailer and deliveries can be unloaded in the correct sequence without moving other freight', option_c: 'The last stop always has the lightest freight', option_d: 'This is only done for international shipments', correct_option: 'B', explanation: 'Loading in reverse delivery order means each stop\'s freight is accessible at the trailer doors without having to move other shipments, reducing delivery time and preventing damage.' },
      { question: 'What is trailer cube utilization?', option_a: 'The weight of the trailer', option_b: 'The percentage of the trailer\'s total volume that is filled with freight — higher utilization means lower cost per unit shipped', option_c: 'The number of trailers in the yard', option_d: 'The speed of the trailer', correct_option: 'B', explanation: 'Cube utilization measures how much of the trailer\'s available volume is used. Maximizing cube utilization reduces the number of trailers needed and lowers per-unit shipping costs.' },
      { question: 'What document is generated during outbound staging that serves as the legal shipping contract?', option_a: 'Purchase order', option_b: 'Packing slip', option_c: 'Bill of Lading (BOL)', option_d: 'Vendor scorecard', correct_option: 'C', explanation: 'The Bill of Lading is the legal document between shipper and carrier that describes the freight, serves as a receipt, and acts as the contract of carriage.' },
    ],

    // =====================================================================
    // W5: Warehouse Management Systems
    // =====================================================================
    'warehouse_5_1': [
      { question: 'What is the typical ROI from implementing a WMS in terms of labor efficiency?', option_a: '5-10% gain', option_b: '25-30% gain', option_c: '50-60% gain', option_d: '1-2% gain', correct_option: 'B', explanation: 'A well-implemented WMS typically delivers a 25-30% improvement in labor efficiency through directed work, optimized pick paths, task interleaving, and reduced errors.' },
      { question: 'How does a WMS differ from an ERP inventory module?', option_a: 'They are exactly the same', option_b: 'A WMS provides granular bin-level control, directed work, and real-time RF workflows; ERP inventory tracks quantities at a location level', option_c: 'ERP is always better than WMS', option_d: 'WMS cannot track inventory', correct_option: 'B', explanation: 'A WMS offers detailed bin-level inventory control, directed workflows via RF guns, task management, and warehouse-specific optimization that ERP inventory modules do not provide.' },
      { question: 'Which of the following is NOT a major WMS vendor?', option_a: 'Manhattan Associates', option_b: 'Blue Yonder', option_c: 'QuickBooks', option_d: 'SAP EWM', correct_option: 'C', explanation: 'QuickBooks is an accounting software product. Manhattan Associates, Blue Yonder, SAP EWM, Oracle WMS, and Korber are major WMS vendors.' },
    ],
    'warehouse_5_2': [
      { question: 'What is task interleaving in a WMS?', option_a: 'Running multiple WMS systems simultaneously', option_b: 'Combining tasks like put-away and replenishment into a single trip so operators are always doing productive work, even while traveling', option_c: 'A method of printing labels', option_d: 'Scheduling employee shifts', correct_option: 'B', explanation: 'Task interleaving assigns a put-away task on the way to a pick location (or vice versa), eliminating empty travel and maximizing labor productivity.' },
      { question: 'What is the difference between system-directed and user-directed put-away?', option_a: 'They produce the same results', option_b: 'System-directed has the WMS assign the optimal location; user-directed lets the operator choose where to put the product', option_c: 'User-directed is always more efficient', option_d: 'System-directed does not use a WMS', correct_option: 'B', explanation: 'System-directed put-away uses WMS logic (slotting rules, product attributes) to assign optimal locations. User-directed gives the operator flexibility to choose, which can lead to suboptimal placement.' },
      { question: 'How does the WMS handle exceptions during receiving?', option_a: 'Exceptions are ignored', option_b: 'The WMS flags discrepancies (quantity mismatches, unexpected items, damage) and routes them through an exception workflow for resolution', option_c: 'The product is automatically returned to the vendor', option_d: 'The WMS shuts down until the exception is resolved', correct_option: 'B', explanation: 'WMS exception handling captures discrepancies during receiving, creates alerts, and routes them through a defined workflow for investigation and resolution while allowing normal operations to continue.' },
    ],
    'warehouse_5_3': [
      { question: 'What triggers a replenishment task in a WMS?', option_a: 'A manager manually requests it', option_b: 'The pick face inventory drops below the minimum level, triggering a move from reserve to the pick location', option_c: 'Replenishment only happens during the night shift', option_d: 'When a new PO is created', correct_option: 'B', explanation: 'Min/max replenishment triggers fire when pick face inventory hits the minimum threshold, prompting the WMS to create a task to move product from reserve storage to the pick location.' },
      { question: 'What is zone skip logic?', option_a: 'Skipping quality checks in certain zones', option_b: 'WMS routing logic that skips zones where no picks are needed, reducing unnecessary travel for the picker', option_c: 'Removing zones from the warehouse layout', option_d: 'Assigning pickers to skip every other order', correct_option: 'B', explanation: 'Zone skip logic optimizes pick routes by detecting when no picks are needed in a zone and directing the picker to bypass it, reducing total travel distance.' },
      { question: 'What is dynamic replenishment?', option_a: 'Replenishing stock once per week', option_b: 'Real-time replenishment triggered during an active wave when the system detects the pick face will be depleted before the wave completes', option_c: 'Moving all inventory to the pick face at once', option_d: 'A manual replenishment process', correct_option: 'B', explanation: 'Dynamic replenishment occurs in real-time during wave processing when the WMS calculates that current pick face quantities will not cover the remaining wave demand.' },
    ],
    'warehouse_5_4': [
      { question: 'What does "units per hour" measure in WMS labor management?', option_a: 'How many hours employees work per week', option_b: 'The productivity rate of warehouse workers — how many units they process per hour in each function (pick, pack, receive)', option_c: 'The speed of conveyor belts', option_d: 'The number of WMS users online', correct_option: 'B', explanation: 'Units per hour is the primary labor productivity metric, measuring how many units a worker processes per hour. It is tracked by function (picking, packing, receiving, put-away) to identify performance gaps.' },
      { question: 'What is an aging report in the context of WMS reporting?', option_a: 'A report on warehouse building age', option_b: 'A report showing how long inventory has been sitting in the warehouse, identifying slow-moving and obsolete stock', option_c: 'A report on employee tenure', option_d: 'A report on equipment maintenance schedules', correct_option: 'B', explanation: 'Aging reports show inventory days on hand, flagging slow-moving stock that ties up capital and space. This data drives markdown, liquidation, or promotional decisions.' },
      { question: 'What are the key throughput metrics shown on a WMS dashboard?', option_a: 'Only total revenue', option_b: 'Orders per shift, lines per shift, and units per shift', option_c: 'Only the number of employees on shift', option_d: 'Weather conditions', correct_option: 'B', explanation: 'Throughput dashboards track orders, lines (distinct SKUs picked), and units processed per shift, giving managers real-time visibility into warehouse output and capacity utilization.' },
    ],
    'warehouse_5_5': [
      { question: 'What is the EDI 940 transaction used for?', option_a: 'Sending a purchase order', option_b: 'Sending a ship order (warehouse order) from the host system to the WMS to fulfill and ship', option_c: 'Confirming a shipment', option_d: 'Transferring stock between warehouses', correct_option: 'B', explanation: 'EDI 940 (Warehouse Shipping Order) is sent from the ERP or order management system to the WMS, instructing the warehouse to pick, pack, and ship an order.' },
      { question: 'What role does middleware play in WMS integration?', option_a: 'It replaces the WMS', option_b: 'It acts as a translation and routing layer between systems (WMS, ERP, TMS), normalizing data formats and handling message queuing', option_c: 'It is only used for email', option_d: 'Middleware is hardware, not software', correct_option: 'B', explanation: 'Middleware platforms like MuleSoft and Boomi translate data between different system formats, manage message queuing, handle errors, and route data between WMS, ERP, TMS, and other systems.' },
      { question: 'Which EDI transaction confirms a shipment from the warehouse?', option_a: 'EDI 940', option_b: 'EDI 943', option_c: 'EDI 945', option_d: 'EDI 856', correct_option: 'C', explanation: 'EDI 945 (Warehouse Shipping Advice) is sent from the WMS back to the host system confirming that a shipment has been picked, packed, and shipped, including tracking details.' },
    ],

    // =====================================================================
    // W6: Reverse Logistics and Returns
    // =====================================================================
    'warehouse_6_1': [
      { question: 'What percentage of e-commerce orders are typically returned?', option_a: '1-5%', option_b: '5-10%', option_c: '15-30%', option_d: '50-60%', correct_option: 'C', explanation: 'E-commerce returns typically range from 15-30% of orders, significantly higher than brick-and-mortar retail (8-10%), due to inability to touch/try products before purchase.' },
      { question: 'What is the average cost of processing a single return?', option_a: '$1-2', option_b: '$10-20', option_c: '$50-75', option_d: '$100+', correct_option: 'B', explanation: 'Processing a return costs $10-20 on average when accounting for return shipping, inspection, repackaging, restocking labor, and customer service time.' },
      { question: 'How can reverse logistics become a competitive advantage?', option_a: 'By making returns as difficult as possible', option_b: 'By offering easy, fast returns that build customer loyalty while efficiently recovering value from returned products', option_c: 'By eliminating the returns program entirely', option_d: 'By charging high restocking fees', correct_option: 'B', explanation: 'Companies like Amazon and Zappos have shown that easy returns build customer trust and increase purchase frequency, while efficient returns processing recovers maximum product value.' },
    ],
    'warehouse_6_2': [
      { question: 'What does RMA stand for?', option_a: 'Retail Merchandise Allocation', option_b: 'Return Merchandise Authorization', option_c: 'Reverse Movement Assessment', option_d: 'Receiving Management Application', correct_option: 'B', explanation: 'RMA (Return Merchandise Authorization) is the process by which a customer receives approval to return a product, including the authorization number, reason code, and return instructions.' },
      { question: 'Why are reason codes important in the RMA process?', option_a: 'They are only required for legal compliance', option_b: 'They categorize why products are returned, enabling root cause analysis to reduce future returns', option_c: 'They are optional metadata', option_d: 'They only matter for accounting', correct_option: 'B', explanation: 'Reason codes (defective, wrong item, changed mind, damaged in transit) provide data for identifying patterns. If many returns cite "wrong item," there may be a pick accuracy problem to fix.' },
      { question: 'What should happen as soon as an RMA is issued?', option_a: 'The product is immediately refunded', option_b: 'A return shipping label is generated and the return is tracked until it arrives back at the warehouse', option_c: 'Nothing until the customer ships it back', option_d: 'The customer is charged a fee', correct_option: 'B', explanation: 'After RMA issuance, a return shipping label should be generated, and the return should be tracked so the warehouse can plan receiving labor and the customer can be updated on refund status.' },
    ],
    'warehouse_6_3': [
      { question: 'What does a condition code of "B" typically mean in returns grading?', option_a: 'Brand new, sealed', option_b: 'Minor defect — can be repackaged and restocked', option_c: 'Major defect requiring refurbishment', option_d: 'Unsalvageable, must be destroyed', correct_option: 'B', explanation: 'Grade B indicates a minor cosmetic defect or opened packaging that can be addressed with repackaging and relabeling before the product is returned to sellable inventory.' },
      { question: 'Why is photography used during returns grading?', option_a: 'For social media marketing', option_b: 'To document the product\'s condition for dispute resolution, quality analysis, and vendor chargebacks', option_c: 'It is not actually used', option_d: 'Only for high-value electronics', correct_option: 'B', explanation: 'Photos document the returned product condition to support customer dispute resolution, provide evidence for vendor chargebacks, and feed quality analysis processes.' },
      { question: 'What determines the routing decision after a return is graded?', option_a: 'The customer\'s preference', option_b: 'The condition grade — Grade A goes to restock, B to repackaging, C to refurbishment, D to disposition', option_c: 'All returns go back to the vendor', option_d: 'The return date', correct_option: 'B', explanation: 'The condition grade directly determines the product\'s path: A-grade items are restocked immediately, B-grade needs repackaging, C-grade requires refurbishment, and D-grade goes to liquidation or destruction.' },
    ],
    'warehouse_6_4': [
      { question: 'What happens with Grade A returned items?', option_a: 'They are sent to liquidation', option_b: 'They are directly restocked into sellable inventory with no additional processing', option_c: 'They are always refurbished', option_d: 'They are donated to charity', correct_option: 'B', explanation: 'Grade A items are in like-new condition (sealed, undamaged) and can be placed directly back into sellable inventory, requiring no additional processing beyond a quality check.' },
      { question: 'What is the time-to-restock KPI?', option_a: 'The time to order new inventory from vendors', option_b: 'The elapsed time from when a return is received until it is back in sellable inventory and available for new orders', option_c: 'The time to close the warehouse at night', option_d: 'The time between cycle counts', correct_option: 'B', explanation: 'Time-to-restock measures returns processing speed — shorter time means returned products are generating revenue again faster, reducing the cost impact of returns.' },
      { question: 'Why is a quality re-test performed before restocking refurbished items?', option_a: 'It is not necessary', option_b: 'To verify the product functions correctly after refurbishment and meets resale quality standards', option_c: 'Only to satisfy insurance requirements', option_d: 'Because the WMS requires it', correct_option: 'B', explanation: 'Quality re-testing ensures refurbished products actually work properly before being sold again, preventing a second return (which doubles processing costs and damages customer trust).' },
    ],
    'warehouse_6_5': [
      { question: 'What is a bulk liquidation platform?', option_a: 'A type of warehouse', option_b: 'An online marketplace (like B-Stock or Liquidation.com) where companies sell excess, returned, or overstock inventory in bulk at discounted prices', option_c: 'A destruction service', option_d: 'A shipping carrier', correct_option: 'B', explanation: 'Bulk liquidation platforms connect sellers of excess/returned inventory with buyers who purchase in large lots at steep discounts, recovering some value from products that cannot be resold at full price.' },
      { question: 'Why must data destruction be performed before disposing of returned electronics?', option_a: 'It is not necessary', option_b: 'To protect customer personal data stored on devices and comply with data privacy regulations', option_c: 'Only for phones, not other electronics', option_d: 'To make the devices lighter for disposal', correct_option: 'B', explanation: 'Returned electronics may contain customer personal data. Data privacy laws (GDPR, CCPA) require proper data destruction before disposal to prevent data breaches and regulatory penalties.' },
      { question: 'What documentation is required when destroying Grade D inventory?', option_a: 'No documentation needed', option_b: 'Certificates of destruction, environmental compliance records, and inventory adjustment documentation', option_c: 'Only a photograph', option_d: 'Only an email to the manager', correct_option: 'B', explanation: 'Grade D destruction requires formal documentation: certificates of destruction (for audit trails), environmental compliance records (especially for hazardous materials), and inventory adjustments in the WMS.' },
    ],

    // =====================================================================
    // F1: Freight Fundamentals
    // =====================================================================
    'freight_1_1': [
      { question: 'Which freight mode has the lowest cost per ton-mile?', option_a: 'Air freight', option_b: 'Truckload', option_c: 'Ocean freight', option_d: 'LTL', correct_option: 'C', explanation: 'Ocean freight has the lowest cost per ton-mile due to the massive scale of container ships. A single vessel can carry 20,000+ TEUs, spreading fixed costs across enormous volume.' },
      { question: 'What is the typical weight range for LTL (Less-Than-Truckload) shipments?', option_a: '1-50 lbs', option_b: '100-10,000 lbs', option_c: '20,000-40,000 lbs', option_d: '50,000+ lbs', correct_option: 'B', explanation: 'LTL handles shipments between approximately 100 and 10,000 lbs that do not require a full trailer. Below 100 lbs is typically small parcel; above 10,000 lbs is usually more cost-effective as truckload.' },
      { question: 'When is air freight the appropriate choice?', option_a: 'For all shipments over 1,000 lbs', option_b: 'For urgent, high-value, or time-sensitive shipments where speed justifies the higher cost', option_c: 'Only for international shipments', option_d: 'When the shipper wants the cheapest option', correct_option: 'B', explanation: 'Air freight costs 4-5x more than ocean but is 10x faster. It is appropriate for urgent deliveries, perishable goods, high-value items, or when inventory carrying costs exceed the premium.' },
    ],
    'freight_1_2': [
      { question: 'What is the primary role of a freight broker?', option_a: 'To drive trucks', option_b: 'To act as an intermediary matching shippers who have freight with carriers who have capacity, earning a margin', option_c: 'To manufacture goods', option_d: 'To operate warehouses', correct_option: 'B', explanation: 'A freight broker is a licensed intermediary who connects shippers with carriers. They do not own trucks or freight — they facilitate the match and earn margin on the rate difference.' },
      { question: 'What is a 3PL?', option_a: 'A type of truck', option_b: 'A third-party logistics provider that manages logistics operations (warehousing, transportation, or both) on behalf of a shipper', option_c: 'A government regulatory agency', option_d: 'A freight classification system', correct_option: 'B', explanation: 'A 3PL (Third-Party Logistics provider) manages outsourced logistics functions for shippers, which can include warehousing, transportation management, order fulfillment, and value-added services.' },
      { question: 'Who pays for transportation in the supply chain?', option_a: 'Always the carrier', option_b: 'Always the broker', option_c: 'The shipper — the party who owns the freight and contracts for its transportation', option_d: 'The consignee always pays', correct_option: 'C', explanation: 'The shipper (freight owner) pays for transportation, though payment terms vary. Prepaid means shipper pays; collect means consignee pays; third-party billing sends the invoice elsewhere.' },
    ],
    'freight_1_3': [
      { question: 'What does BOL stand for and what is its purpose?', option_a: 'Bill of Loading — a truck maintenance form', option_b: 'Bill of Lading — the master shipping document that serves as receipt, contract, and document of title', option_c: 'Bulk Order Listing — an inventory report', option_d: 'Bureau of Logistics — a government agency', correct_option: 'B', explanation: 'Bill of Lading is the most important freight document. It serves three functions: receipt for goods from shipper to carrier, contract of carriage, and document of title for the goods.' },
      { question: 'What is deadhead in freight?', option_a: 'A type of freight damage', option_b: 'Empty truck miles — when a truck drives without a load, generating cost without revenue', option_c: 'A delivery that arrives early', option_d: 'A premium freight service', correct_option: 'B', explanation: 'Deadhead miles are empty (non-revenue) miles a truck drives to reach its next load. Carriers try to minimize deadhead as it represents pure cost (fuel, driver time, wear) with zero revenue.' },
      { question: 'What is drayage?', option_a: 'Long-haul trucking across the country', option_b: 'Short-distance freight moves, typically between a port or rail terminal and a nearby warehouse', option_c: 'A type of ocean freight', option_d: 'Air cargo handling', correct_option: 'B', explanation: 'Drayage is short-haul trucking that moves containers or freight between ports, rail ramps, and nearby warehouses. It is the critical first/last mile of intermodal transportation.' },
    ],
    'freight_1_4': [
      { question: 'What information must be included on a Bill of Lading?', option_a: 'Only the carrier name', option_b: 'Shipper, consignee, commodity description, weight, and freight class', option_c: 'Only the origin and destination', option_d: 'Only the payment amount', correct_option: 'B', explanation: 'A BOL must include shipper and consignee details, commodity description, weight, freight class, piece count, special handling instructions, and terms (prepaid/collect).' },
      { question: 'What is a rate confirmation?', option_a: 'A receipt from a gas station', option_b: 'A document between broker and carrier that confirms the agreed-upon rate, lane, pickup/delivery details, and terms', option_c: 'A customs form', option_d: 'A type of insurance policy', correct_option: 'B', explanation: 'A rate confirmation (rate con) is the contractual agreement between broker and carrier specifying the load details, rate, payment terms, and any special requirements. It is legally binding.' },
      { question: 'What is a POD and why is it important?', option_a: 'Point of Departure — where the truck leaves from', option_b: 'Proof of Delivery — a signed document confirming the freight was delivered, required to invoice and collect payment', option_c: 'Purchase Order Document — for ordering inventory', option_d: 'Port of Discharge — where a ship unloads', correct_option: 'B', explanation: 'POD (Proof of Delivery) is signed at delivery confirming receipt. It is essential for invoicing (proving delivery occurred), claims (documenting condition at delivery), and payment processing.' },
    ],

    // =====================================================================
    // F2: Truckload (TL/FTL)
    // =====================================================================
    'freight_2_1': [
      { question: 'What is the standard length of a dry van trailer in the US?', option_a: '40 feet', option_b: '48 feet', option_c: '53 feet', option_d: '60 feet', correct_option: 'C', explanation: 'The standard US dry van trailer is 53 feet long. This is the most common equipment type, accounting for the majority of truckload freight moved domestically.' },
      { question: 'When would you use a reefer trailer instead of a dry van?', option_a: 'For heavy machinery', option_b: 'For temperature-sensitive freight like food, pharmaceuticals, or chemicals that require climate control', option_c: 'For oversized freight', option_d: 'Reefers are always cheaper', correct_option: 'B', explanation: 'Reefer (refrigerated) trailers maintain a set temperature range and are required for perishable food, pharmaceuticals, chemicals, and any freight that must be kept within specific temperature limits.' },
      { question: 'What is the typical weight limit for a truckload shipment?', option_a: '10,000 lbs', option_b: '20,000 lbs', option_c: '44,000-45,000 lbs', option_d: '80,000 lbs', correct_option: 'C', explanation: 'The typical payload limit is 44,000-45,000 lbs. The gross vehicle weight limit is 80,000 lbs, and after accounting for the weight of the tractor and trailer, the freight payload is approximately 44,000-45,000 lbs.' },
    ],
    'freight_2_2': [
      { question: 'What is the main advantage of contract rates over spot market rates?', option_a: 'Contract rates are always cheaper', option_b: 'Contract rates provide price stability and guaranteed capacity, protecting against market volatility', option_c: 'Spot market rates are never available', option_d: 'Contract rates require no commitment', correct_option: 'B', explanation: 'Contract rates lock in pricing (usually annually) and provide capacity guarantees. This protects shippers from rate spikes during tight markets, though they may pay more than spot during soft markets.' },
      { question: 'When is peak season in the US truckload market?', option_a: 'February to May', option_b: 'June to August', option_c: 'October to January (holiday shipping and produce season)', option_d: 'There is no peak season', correct_option: 'C', explanation: 'October to January is peak season driven by holiday retail shipping and produce season. Capacity tightens, spot rates increase, and advance booking becomes more important.' },
      { question: 'What are DAT and Truckstop?', option_a: 'Government regulatory agencies', option_b: 'The two largest freight load boards where brokers post loads and carriers search for freight', option_c: 'Types of trailers', option_d: 'Customs clearance systems', correct_option: 'B', explanation: 'DAT and Truckstop.com are the two dominant freight load boards. They serve as marketplaces where brokers post available loads and carriers find freight, primarily for spot market transactions.' },
    ],
    'freight_2_3': [
      { question: 'How many hours can a truck driver drive per day under HOS regulations?', option_a: '8 hours', option_b: '11 hours after 10 consecutive hours off duty', option_c: '14 hours', option_d: 'There is no limit', correct_option: 'B', explanation: 'Under FMCSA Hours of Service rules, a driver may drive a maximum of 11 hours after 10 consecutive hours off duty. The 14-hour window is total on-duty time, not all driving.' },
      { question: 'What is the ELD mandate?', option_a: 'A requirement for all trucks to have GPS', option_b: 'A federal requirement since December 2017 that commercial vehicles use Electronic Logging Devices to automatically record driving hours', option_c: 'An optional technology program', option_d: 'A fuel efficiency regulation', correct_option: 'B', explanation: 'The ELD mandate (effective December 2017) requires most commercial motor vehicles to use electronic logging devices instead of paper logs to automatically record driving time, improving compliance and safety.' },
      { question: 'What is the 34-hour restart provision?', option_a: 'A requirement to restart the truck engine every 34 hours', option_b: 'After 34 consecutive hours off duty, a driver can reset their 60/70 hour weekly clock back to zero', option_c: 'A maintenance schedule', option_d: 'A rule about fueling stops', correct_option: 'B', explanation: 'The 34-hour restart allows drivers to reset their cumulative 60/70 hour weekly limit by taking at least 34 consecutive hours off duty, effectively starting a fresh work week.' },
    ],
    'freight_2_4': [
      { question: 'What is the EDI 204 transaction?', option_a: 'An invoice', option_b: 'A load tender — the electronic transmission of a load offer from shipper/broker to carrier', option_c: 'A proof of delivery', option_d: 'A bill of lading', correct_option: 'B', explanation: 'EDI 204 (Motor Carrier Load Tender) is the electronic offer of a load from a shipper or broker to a carrier, containing pickup/delivery details, commodity, weight, and rate information.' },
      { question: 'What is a check call in freight tracking?', option_a: 'A phone call to check on driver health', option_b: 'A proactive status update from the driver or carrier reporting current location and estimated arrival time', option_c: 'A call to verify insurance', option_d: 'A customs clearance call', correct_option: 'B', explanation: 'Check calls are proactive status updates (by phone, app, or EDI 214) where the driver or carrier reports current location, ETA, and any issues. They supplement GPS tracking with human context.' },
      { question: 'What does EDI 990 communicate?', option_a: 'Shipment tracking updates', option_b: 'The carrier\'s response to a load tender — either accepting or declining the load', option_c: 'A freight invoice', option_d: 'A customs declaration', correct_option: 'B', explanation: 'EDI 990 (Response to a Load Tender) is the carrier\'s acceptance or rejection of a load offered via EDI 204. It completes the electronic booking process.' },
    ],
    'freight_2_5': [
      { question: 'What is detention in freight?', option_a: 'Holding a driver in jail', option_b: 'A charge for excessive wait time at a shipper or receiver facility, typically $50-100/hour after 2 hours of free time', option_c: 'A type of trailer', option_d: 'A customs hold', correct_option: 'B', explanation: 'Detention is charged when a truck is held at a facility beyond the agreed free time (usually 2 hours) for loading or unloading. It compensates the carrier for lost driving time.' },
      { question: 'What does TONU mean?', option_a: 'Total Order Net Units', option_b: 'Truck Ordered Not Used — a cancellation fee when a carrier dispatches a truck but the load is cancelled', option_c: 'A type of freight classification', option_d: 'Transportation Of Non-Urgent freight', correct_option: 'B', explanation: 'TONU (Truck Ordered Not Used) is a fee paid to the carrier when they dispatch a truck to a pickup location but the load is cancelled or not ready. It compensates for wasted time and fuel.' },
      { question: 'What is a layover charge?', option_a: 'A charge for driving overnight', option_b: 'A fee when a driver must wait overnight (or longer) at a facility because loading/unloading is delayed to the next day', option_c: 'A hotel booking fee', option_d: 'A toll road charge', correct_option: 'B', explanation: 'Layover charges apply when delays force a driver to stay overnight at a location. It covers the cost of the driver\'s time and the opportunity cost of the truck sitting idle.' },
    ],

    // =====================================================================
    // F3: Less-Than-Truckload (LTL)
    // =====================================================================
    'freight_3_1': [
      { question: 'How does an LTL carrier\'s network work?', option_a: 'Direct point-to-point only', option_b: 'Hub-and-spoke: local P&D routes collect shipments and feed them into terminals, then linehaul moves them between terminals', option_c: 'Each truck handles one shipment', option_d: 'LTL carriers do not use terminals', correct_option: 'B', explanation: 'LTL carriers use a hub-and-spoke network. Local pickup routes collect shipments and bring them to terminals where they are consolidated for linehaul movement to destination terminals, then delivered locally.' },
      { question: 'What is break-bulk in LTL operations?', option_a: 'Breaking pallets apart', option_b: 'The process of transferring individual shipments between trailers at a terminal to consolidate them for their next destination', option_c: 'Bulk freight shipping', option_d: 'A type of damage', correct_option: 'B', explanation: 'Break-bulk is the terminal process of unloading trailers and reloading individual shipments onto different trailers based on their destination. This consolidation is core to the LTL network model.' },
      { question: 'What is a typical transit time range for LTL shipments?', option_a: 'Same day', option_b: '1-5 days depending on distance and lane', option_c: '2-4 weeks', option_d: '30+ days', correct_option: 'B', explanation: 'LTL transit times range from 1 day (short-haul, direct lanes) to 5 days (coast-to-coast), depending on distance, number of terminal transfers, and the carrier\'s network structure.' },
    ],
    'freight_3_2': [
      { question: 'How many freight classes exist in the NMFC system?', option_a: '5', option_b: '10', option_c: '18', option_d: '50', correct_option: 'C', explanation: 'The NMFC system has 18 freight classes ranging from class 50 (densest, cheapest to ship) to class 500 (lightest density, most expensive). Classification is based on density, stowability, handling, and liability.' },
      { question: 'What factors determine a product\'s freight class?', option_a: 'Only the weight', option_b: 'Density, stowability, handling difficulty, and liability', option_c: 'Only the value of the goods', option_d: 'The origin and destination', correct_option: 'B', explanation: 'Freight class is determined by four factors: density (weight per cubic foot), stowability (how well it fits with other freight), handling requirements, and liability (value, fragility, perishability).' },
      { question: 'Does a lower or higher freight class result in lower shipping rates?', option_a: 'Higher class = lower rate', option_b: 'Lower class = lower rate (class 50 is cheapest, class 500 is most expensive)', option_c: 'Class has no effect on rate', option_d: 'All classes are priced the same', correct_option: 'B', explanation: 'Lower freight classes have lower rates. Class 50 (densest products) is the cheapest because dense freight uses trailer space efficiently. Class 500 items (like ping pong balls) take lots of space relative to weight.' },
    ],
    'freight_3_3': [
      { question: 'What is FAK pricing in LTL?', option_a: 'A type of freight insurance', option_b: 'Freight All Kinds — a simplified pricing model where all products ship at a single negotiated class regardless of actual NMFC classification', option_c: 'A fuel surcharge', option_d: 'A pickup fee', correct_option: 'B', explanation: 'FAK (Freight All Kinds) simplifies pricing by assigning one freight class to all shipments regardless of actual product classification. High-volume shippers negotiate FAK rates to simplify billing and reduce costs.' },
      { question: 'How is the LTL fuel surcharge typically calculated?', option_a: 'A flat fee per shipment', option_b: 'A percentage of the base freight rate, adjusted weekly based on the national diesel fuel index', option_c: 'It is included in the base rate', option_d: 'Based on the truck\'s fuel efficiency', correct_option: 'B', explanation: 'LTL fuel surcharges are a percentage of the base rate, recalculated weekly using the Department of Energy\'s national average diesel price as a benchmark.' },
      { question: 'What is a typical discount range off the LTL base tariff rate?', option_a: '5-10%', option_b: '10-20%', option_c: '50-80%', option_d: '90-95%', correct_option: 'C', explanation: 'LTL carriers set high base tariff rates and then negotiate discounts of 50-80% for regular shippers. The published tariff is a starting point, not what anyone actually pays.' },
    ],
    'freight_3_4': [
      { question: 'What is the formula for calculating freight density?', option_a: 'Length x Width x Height', option_b: 'Weight divided by cubic feet (where cubic feet = L x W x H / 1,728 for dimensions in inches)', option_c: 'Weight x Volume', option_d: 'Weight divided by total miles', correct_option: 'B', explanation: 'Density = Weight / Cubic Feet. First convert dimensions to cubic feet (L x W x H in inches / 1,728), then divide the weight by the cubic feet to get pounds per cubic foot.' },
      { question: 'What happens when an LTL carrier audits a shipment and finds it misclassified?', option_a: 'Nothing', option_b: 'The carrier issues a reweigh or reclass charge, billing at the correct (usually higher) class and weight', option_c: 'The shipment is returned to the shipper', option_d: 'The carrier absorbs the cost', correct_option: 'B', explanation: 'LTL carriers routinely weigh and measure shipments. If actual dimensions or weight differ from the BOL, the carrier reclassifies and bills at the correct (usually higher) rate, often adding an inspection fee.' },
      { question: 'What is the difference between density-based and class-based rating?', option_a: 'They are the same thing', option_b: 'Class-based uses NMFC classification; density-based uses actual pounds per cubic foot, which can be more accurate and sometimes cheaper', option_c: 'Density-based is only for international freight', option_d: 'Class-based is no longer used', correct_option: 'B', explanation: 'Class-based rating uses the NMFC class (which considers multiple factors). Density-based rating prices purely on weight-per-cubic-foot, which can benefit shippers with dense freight that has a high NMFC class.' },
    ],
    'freight_3_5': [
      { question: 'What is the Carmack Amendment?', option_a: 'A tax regulation', option_b: 'A federal law establishing carrier liability for loss or damage to freight during interstate transportation', option_c: 'An international trade agreement', option_d: 'A driver safety regulation', correct_option: 'B', explanation: 'The Carmack Amendment (part of the Interstate Commerce Act) establishes that carriers are liable for loss or damage to freight during transit, setting the legal framework for freight claims in the US.' },
      { question: 'How long does a shipper have to file a freight damage claim?', option_a: '30 days', option_b: '90 days', option_c: '9 months from the delivery date', option_d: '2 years', correct_option: 'C', explanation: 'Under the Carmack Amendment, shippers have 9 months from the delivery date to file a freight claim for loss or damage. After this period, the claim is time-barred.' },
      { question: 'What should you do when concealed damage is discovered after delivery?', option_a: 'Wait for the next shipment to mention it', option_b: 'Report it within 5 days of delivery, document with photos, and file a claim noting it as concealed damage', option_c: 'There is no recourse for concealed damage', option_d: 'Only contact the manufacturer', correct_option: 'B', explanation: 'Concealed damage (not visible at delivery) should be reported within 5 days, documented with photographs, and filed as a claim specifying concealed damage. The sooner it is reported, the stronger the claim.' },
    ],

    // =====================================================================
    // F4: Freight Brokerage
    // =====================================================================
    'freight_4_1': [
      { question: 'What financial bond is required to operate as a freight broker?', option_a: '$10,000', option_b: '$25,000', option_c: '$75,000 surety bond or trust fund', option_d: '$500,000', correct_option: 'C', explanation: 'FMCSA requires freight brokers to maintain a $75,000 surety bond (BMC-84) or trust fund (BMC-85) to protect carriers and shippers against financial loss if the broker defaults on payments.' },
      { question: 'What is the typical margin a freight broker earns?', option_a: '1-3%', option_b: '5-8%', option_c: '12-18%', option_d: '30-40%', correct_option: 'C', explanation: 'Freight brokers typically earn 12-18% margin on spot loads and 10-12% on contract freight. The margin is the difference between the sell rate (charged to shipper) and buy rate (paid to carrier).' },
      { question: 'What is the difference between a freight broker and a freight agent?', option_a: 'They are the same thing', option_b: 'A broker holds MC authority and is the licensed party; an agent works under a broker\'s authority and typically earns a commission split', option_c: 'An agent owns trucks', option_d: 'A broker works for the carrier', correct_option: 'B', explanation: 'A broker holds their own FMCSA MC authority and bond. An agent operates under a broker\'s authority, using the broker\'s systems and bond, and earns a percentage of the gross margin on loads they book.' },
    ],
    'freight_4_2': [
      { question: 'What is the primary information needed to post a load on a load board?', option_a: 'Only the rate', option_b: 'Origin, destination, equipment type, pickup date, and rate', option_c: 'Only the weight', option_d: 'The driver\'s name', correct_option: 'B', explanation: 'A load board posting requires origin city/state, destination, equipment type (dry van, reefer, flatbed), pickup date, and either a posted rate or "call for rate" to attract carrier interest.' },
      { question: 'What should be checked when vetting a new carrier?', option_a: 'Only their truck color', option_b: 'MC number validity, insurance coverage (auto and cargo), FMCSA safety score, and authority status', option_c: 'Only their location', option_d: 'Only their rate', correct_option: 'B', explanation: 'Carrier vetting must verify active MC authority, adequate insurance (typically $1M auto + $100K cargo), satisfactory FMCSA safety rating, and no patterns of complaints or safety violations.' },
      { question: 'What is the advantage of building a carrier network vs. relying solely on spot sourcing?', option_a: 'Spot sourcing is always better', option_b: 'A built network provides reliable capacity, better rates through relationships, and carriers who know your freight and standards', option_c: 'There is no advantage', option_d: 'Networks only work for LTL', correct_option: 'B', explanation: 'A cultivated carrier network provides dependable capacity (especially in tight markets), negotiated rates below spot market, and carriers familiar with shipper requirements, reducing service failures.' },
    ],
    'freight_4_3': [
      { question: 'What documents make up a standard carrier onboarding packet?', option_a: 'Only a business card', option_b: 'W-9, certificate of insurance, MC authority documentation, and signed broker-carrier agreement', option_c: 'Only a driver\'s license copy', option_d: 'Only proof of truck ownership', correct_option: 'B', explanation: 'The carrier packet includes W-9 (for tax reporting), certificate of insurance (proving coverage), MC authority documentation (proving legal operating authority), and the signed contract (defining terms).' },
      { question: 'What are the minimum insurance requirements for a carrier working with a broker?', option_a: '$100K auto, $25K cargo', option_b: '$1M auto liability, $100K cargo insurance', option_c: '$500K auto, $50K cargo', option_d: 'No minimums required', correct_option: 'B', explanation: 'Standard broker requirements are $1,000,000 auto liability and $100,000 cargo insurance. Some shippers require higher limits depending on commodity value.' },
      { question: 'Why is ongoing monitoring of carrier compliance important?', option_a: 'It is not important after initial onboarding', option_b: 'Insurance can lapse, authority can be revoked, and safety scores can change — using a non-compliant carrier creates serious liability', option_c: 'Only to generate reports', option_d: 'It is only required annually', correct_option: 'B', explanation: 'Carrier compliance is dynamic — insurance policies expire, authorities get revoked, and safety ratings change. Ongoing monitoring catches these changes before dispatching a non-compliant carrier, which could create huge liability.' },
    ],
    'freight_4_4': [
      { question: 'What is the difference between buy rate and sell rate?', option_a: 'They are the same', option_b: 'Buy rate is what the broker pays the carrier; sell rate is what the broker charges the shipper — the difference is the broker\'s margin', option_c: 'Buy rate is for international freight only', option_d: 'Sell rate is what the carrier charges', correct_option: 'B', explanation: 'The buy rate (carrier rate) is what the broker pays the carrier to move the load. The sell rate (shipper rate) is what the broker charges the shipper. The margin (sell minus buy) is the broker\'s gross profit.' },
      { question: 'What is a typical margin target for contract freight vs. spot freight?', option_a: '10-12% contract, 15-18% spot', option_b: '50% for both', option_c: '1-2% for both', option_d: 'Contract has higher margins than spot', correct_option: 'A', explanation: 'Contract freight margins are typically 10-12% (lower because of guaranteed volume), while spot freight margins target 15-18% (higher to compensate for the effort and uncertainty of one-time loads).' },
      { question: 'When might a broker accept a low-margin load?', option_a: 'Never', option_b: 'For backhaul positioning (getting a carrier to a desirable area) or to maintain an important shipper relationship', option_c: 'Only on weekends', option_d: 'Low-margin loads should always be declined', correct_option: 'B', explanation: 'Brokers sometimes accept low-margin loads strategically: to position a carrier in a high-demand area for a profitable return load, or to maintain volume commitments with key shipper accounts.' },
    ],
    'freight_4_5': [
      { question: 'What are the core functions of a broker TMS?', option_a: 'Only email management', option_b: 'Load entry, carrier matching, shipment tracking, and invoicing/settlement', option_c: 'Only accounting', option_d: 'Only GPS tracking', correct_option: 'B', explanation: 'A broker TMS handles the full load lifecycle: entering load details, matching and dispatching carriers, tracking shipments in transit, and generating invoices for shippers and pay statements for carriers.' },
      { question: 'What automation capabilities do modern broker TMS platforms offer?', option_a: 'No automation is available', option_b: 'Auto-dispatch to preferred carriers, auto-tracking via ELD/GPS integration, and auto-invoicing upon delivery confirmation', option_c: 'Only auto-email replies', option_d: 'Automation is only for enterprise brokers', correct_option: 'B', explanation: 'Modern broker TMS platforms automate dispatching (offer loads to preferred carriers automatically), tracking (pull GPS/ELD data without manual check calls), and invoicing (generate invoices when POD is received).' },
      { question: 'Why is TMS integration with load boards important for brokers?', option_a: 'It is not important', option_b: 'It allows posting loads and finding carriers directly from the TMS without switching between platforms, saving time and reducing errors', option_c: 'Load boards are not used by brokers with a TMS', option_d: 'Integration only works for large brokerages', correct_option: 'B', explanation: 'Load board integration lets brokers post loads, search carrier availability, and compare market rates directly within their TMS, eliminating duplicate data entry and speeding up the carrier sourcing process.' },
    ],

    // =====================================================================
    // F5: International Freight and Customs
    // =====================================================================
    'freight_5_1': [
      { question: 'Under FOB terms, at what point does risk transfer from seller to buyer?', option_a: 'At the seller\'s factory', option_b: 'When the goods pass over the ship\'s rail at the port of origin', option_c: 'At the destination port', option_d: 'At the buyer\'s warehouse', correct_option: 'B', explanation: 'FOB (Free On Board) means the seller is responsible for delivering goods to the port and loading them onto the vessel. Risk transfers to the buyer once the goods are on the ship.' },
      { question: 'Which Incoterm gives the buyer the most responsibility?', option_a: 'DDP', option_b: 'CIF', option_c: 'EXW (Ex Works)', option_d: 'FOB', correct_option: 'C', explanation: 'EXW (Ex Works) places maximum responsibility on the buyer, who must arrange pickup from the seller\'s premises, all transportation, insurance, customs clearance, and duties.' },
      { question: 'Which Incoterm requires the seller to handle everything to the buyer\'s door, including duties?', option_a: 'EXW', option_b: 'FOB', option_c: 'CIF', option_d: 'DDP (Delivered Duty Paid)', correct_option: 'D', explanation: 'DDP (Delivered Duty Paid) places maximum responsibility on the seller, who must deliver goods to the buyer\'s premises, paying all transportation, insurance, customs clearance, and import duties.' },
    ],
    'freight_5_2': [
      { question: 'What is the difference between FCL and LCL in ocean freight?', option_a: 'FCL is faster because it uses airplanes', option_b: 'FCL is a full dedicated container; LCL shares container space with other shippers and is consolidated at a CFS', option_c: 'LCL is always more expensive per unit', option_d: 'There is no difference', correct_option: 'B', explanation: 'FCL (Full Container Load) dedicates an entire container to one shipper. LCL (Less than Container Load) consolidates multiple shippers\' freight into one container at a Container Freight Station (CFS).' },
      { question: 'What is the approximate ocean transit time from Asia to the US West Coast?', option_a: '3-5 days', option_b: '12-18 days', option_c: '30-45 days', option_d: '60+ days', correct_option: 'B', explanation: 'Transit from major Asian ports (Shanghai, Shenzhen) to US West Coast ports (Long Beach, Oakland) takes approximately 12-18 days, depending on the shipping line, route, and port congestion.' },
      { question: 'What is an NVOCC?', option_a: 'A type of container', option_b: 'A Non-Vessel Operating Common Carrier — a company that books and sells ocean freight space without owning ships', option_c: 'A government agency', option_d: 'A port crane operator', correct_option: 'B', explanation: 'An NVOCC (Non-Vessel Operating Common Carrier) contracts space on ocean vessels and resells it to shippers. They issue their own bills of lading but do not operate ships, functioning as ocean freight intermediaries.' },
    ],
    'freight_5_3': [
      { question: 'How is dimensional weight calculated for air freight?', option_a: 'Length + Width + Height', option_b: 'Length x Width x Height in centimeters divided by 6,000', option_c: 'Actual weight x 2', option_d: 'Volume divided by 1,728', correct_option: 'B', explanation: 'Air freight dimensional weight = (L x W x H in cm) / 6,000. The carrier charges based on whichever is greater: actual weight or dimensional weight, ensuring they are compensated for space used.' },
      { question: 'How does air freight cost compare to ocean freight?', option_a: 'Air is cheaper', option_b: 'Air freight costs 4-5x more than ocean but transit is approximately 10x faster', option_c: 'They cost the same', option_d: 'Ocean is more expensive', correct_option: 'B', explanation: 'Air freight is 4-5x more expensive per kilogram than ocean freight, but delivers in 1-3 days versus 12-35 days by sea. The speed premium is justified for urgent, perishable, or high-value goods.' },
      { question: 'What is an air waybill (AWB)?', option_a: 'A customs declaration', option_b: 'The air freight equivalent of an ocean bill of lading — the transportation contract and receipt between shipper and airline', option_c: 'A packing list', option_d: 'An insurance certificate', correct_option: 'B', explanation: 'The Air Waybill (AWB) is the principal document for air cargo, serving as receipt, contract of carriage, and customs declaration document. Unlike an ocean BOL, it is not a document of title.' },
    ],
    'freight_5_4': [
      { question: 'What is an HTS code?', option_a: 'A tracking number for shipments', option_b: 'A Harmonized Tariff Schedule code — a 10-digit classification that determines the import duty rate for a product', option_c: 'A type of barcode', option_d: 'A carrier identification number', correct_option: 'B', explanation: 'HTS (Harmonized Tariff Schedule) codes are 10-digit numbers that classify every imported product. The code determines the duty rate, any applicable trade remedies, and statistical tracking.' },
      { question: 'What is the ISF (10+2) requirement?', option_a: 'An insurance form', option_b: 'Importer Security Filing — 10 data elements from the importer and 2 from the carrier, required 24 hours before the vessel departs for the US', option_c: 'A type of container seal', option_d: 'A warehouse inspection', correct_option: 'B', explanation: 'ISF (10+2) requires importers to submit 10 data elements (manufacturer, seller, buyer, etc.) and carriers to submit 2 elements at least 24 hours before a vessel departs a foreign port bound for the US.' },
      { question: 'What is the threshold between formal and informal customs entries?', option_a: '$500', option_b: '$1,000', option_c: '$2,500', option_d: '$10,000', correct_option: 'C', explanation: 'Shipments valued over $2,500 require a formal entry with CBP (more documentation, surety bond). Shipments under $2,500 qualify for informal entry with simplified procedures.' },
    ],
    'freight_5_5': [
      { question: 'What is demurrage?', option_a: 'A type of cargo insurance', option_b: 'A daily charge for leaving a container at the port or terminal beyond the allotted free time', option_c: 'A trucking fee', option_d: 'A customs penalty', correct_option: 'B', explanation: 'Demurrage is a daily fee charged by the ocean carrier or port when a container sits at the terminal beyond the free time period (typically 3-5 days). It incentivizes timely pickup.' },
      { question: 'What is the difference between demurrage and per diem?', option_a: 'They are the same thing', option_b: 'Demurrage is for the container sitting at the port; per diem is for keeping the chassis (the trailer frame) beyond free time', option_c: 'Per diem is always more expensive', option_d: 'Demurrage only applies to air freight', correct_option: 'B', explanation: 'Demurrage is charged for container time at the port/terminal. Per diem is charged for keeping the chassis (the wheeled frame that carries the container) past the free time. They are separate charges from different parties.' },
      { question: 'What is the Last Free Day (LFD)?', option_a: 'The last day of a sale', option_b: 'The deadline to pick up a container from the port without incurring demurrage charges', option_c: 'The last day to file customs documents', option_d: 'The last day of free shipping', correct_option: 'B', explanation: 'Last Free Day (LFD) is the final day you can pick up a container from the port or terminal without incurring demurrage. Missing LFD triggers daily charges that escalate rapidly.' },
    ],

    // =====================================================================
    // F6: Transportation Management Systems
    // =====================================================================
    'freight_6_1': [
      { question: 'What is the primary purpose of a TMS?', option_a: 'Managing warehouse inventory', option_b: 'Planning, executing, and optimizing the movement of freight across all modes of transportation', option_c: 'Tracking employee hours', option_d: 'Managing customer relationships', correct_option: 'B', explanation: 'A TMS (Transportation Management System) is purpose-built software for planning shipments, selecting carriers, executing bookings, tracking freight in transit, and analyzing transportation spend and performance.' },
      { question: 'What is the difference between a shipper TMS and a broker TMS?', option_a: 'They are identical', option_b: 'A shipper TMS manages a company\'s own freight; a broker TMS manages loads on behalf of multiple shippers and focuses on carrier matching and margin', option_c: 'Broker TMS is always cloud-based', option_d: 'Shipper TMS does not track shipments', correct_option: 'B', explanation: 'Shipper TMS is designed for companies shipping their own goods (inbound and outbound). Broker TMS is designed for intermediaries, emphasizing load matching, carrier management, and margin tracking across many customers.' },
      { question: 'Which is NOT a major TMS vendor?', option_a: 'Oracle TMS', option_b: 'MercuryGate', option_c: 'Instagram', option_d: 'SAP TM', correct_option: 'C', explanation: 'Oracle TMS, MercuryGate, SAP TM, project44, and Kuebix are all established TMS vendors. Instagram is a social media platform, not a transportation management system.' },
    ],
    'freight_6_2': [
      { question: 'What is a routing guide in a TMS?', option_a: 'A map for truck drivers', option_b: 'A prioritized list of preferred carriers for each shipping lane, consulted in order when tendering loads', option_c: 'A list of warehouse locations', option_d: 'An employee handbook', correct_option: 'B', explanation: 'A routing guide is a decision matrix that lists carriers in priority order for each lane. When a load needs to move, the TMS offers it to carrier #1 first, then #2 if declined, and so on.' },
      { question: 'What is total cost analysis in carrier selection?', option_a: 'Only looking at the base rate', option_b: 'Evaluating the complete cost including base rate, fuel surcharge, accessorials, and service level to find the true lowest-cost option', option_c: 'Adding up all company expenses', option_d: 'Only comparing transit times', correct_option: 'B', explanation: 'Total cost analysis goes beyond the base rate to include fuel surcharges, likely accessorials (detention, liftgate, etc.), and the cost impact of service level (claims rate, on-time %). The cheapest base rate is not always the lowest total cost.' },
      { question: 'Why is spot rate integration from load boards valuable in a TMS?', option_a: 'It is not valuable', option_b: 'It provides real-time market pricing data alongside contract rates, helping shippers make informed decisions on whether to use contract carriers or spot market', option_c: 'Load boards are only for brokers', option_d: 'Spot rates are always lower', correct_option: 'B', explanation: 'Spot rate integration shows current market prices alongside contracted rates, allowing shippers to identify when spot rates are lower than their contracts or when the market has shifted, informing better procurement decisions.' },
    ],
    'freight_6_3': [
      { question: 'What does the tender workflow in a TMS automate?', option_a: 'Employee timesheets', option_b: 'The process of offering a load to carriers, receiving accept/decline responses, and cascading to the next carrier if declined', option_c: 'Warehouse picking', option_d: 'Customs filing', correct_option: 'B', explanation: 'The TMS tender workflow automates offering loads to carriers per the routing guide, processing EDI 204/990 tender and response messages, and waterfall tendering to backup carriers if the primary declines.' },
      { question: 'What is exception management in shipment tracking?', option_a: 'Tracking normal deliveries', option_b: 'Automated alerts and workflows triggered when shipments deviate from plan — delays, wrong routes, temperature excursions', option_c: 'A type of insurance claim', option_d: 'Employee performance management', correct_option: 'B', explanation: 'Exception management uses real-time tracking data to detect anomalies (late arrivals, route deviations, temperature out of range) and automatically triggers alerts and corrective workflows.' },
      { question: 'What is the benefit of a customer portal in a TMS?', option_a: 'It replaces the TMS entirely', option_b: 'It gives shippers self-service access to track shipments, view documents, and run reports without contacting customer service', option_c: 'It is only for carriers', option_d: 'Portals are not used in modern TMS', correct_option: 'B', explanation: 'Customer portals reduce inbound calls by letting shippers track their freight, access PODs and BOLs, view invoices, and generate reports themselves, improving satisfaction while reducing operational workload.' },
    ],
    'freight_6_4': [
      { question: 'What is a 3-way match in freight audit?', option_a: 'Matching 3 carriers for a shipment', option_b: 'Verifying that the purchase order, bill of lading, and carrier invoice all agree on quantities, weights, and charges', option_c: 'Comparing 3 TMS platforms', option_d: 'A rating for carrier performance', correct_option: 'B', explanation: 'The 3-way match cross-references the PO (what was ordered), the BOL (what was shipped), and the carrier invoice (what is being charged). Discrepancies flag potential billing errors or shipment issues.' },
      { question: 'What are the most common freight billing errors?', option_a: 'Errors are rare in freight', option_b: 'Duplicate charges, incorrect weight, wrong accessorial charges, and rate discrepancies versus the agreed contract', option_c: 'Only currency conversion errors', option_d: 'Errors only occur in international shipping', correct_option: 'B', explanation: 'Industry studies show 3-5% of freight invoices contain errors. Common ones include duplicate invoices, weights that do not match the BOL, unauthorized accessorials, and rates that differ from the contracted amount.' },
      { question: 'What is quick pay in freight payment?', option_a: 'Paying with cash at delivery', option_b: 'Offering carriers accelerated payment (within 7 days) in exchange for a 2% discount off the invoice amount', option_c: 'A type of credit card', option_d: 'Paying before the load is picked up', correct_option: 'B', explanation: 'Quick pay gives carriers faster access to cash (7 days vs. standard net 30) in exchange for a small discount (typically 2%). It improves carrier cash flow and reduces the broker/shipper\'s freight cost.' },
    ],
    'freight_6_5': [
      { question: 'What metrics make up a carrier scorecard in TMS analytics?', option_a: 'Only on-time delivery', option_b: 'Service metrics (on-time %, claims ratio), cost metrics (rate trends, accessorials), and capacity metrics (tender acceptance rate)', option_c: 'Only the rate per mile', option_d: 'Only the number of loads moved', correct_option: 'B', explanation: 'A comprehensive carrier scorecard evaluates service quality (on-time delivery %, damage claims ratio), cost efficiency (rate per mile trends, accessorial frequency), and reliability (tender acceptance rate, capacity in peak season).' },
      { question: 'What is mode optimization in TMS reporting?', option_a: 'Choosing the newest trucks', option_b: 'Analyzing shipment data to identify opportunities to shift freight between modes (TL, LTL, intermodal) for cost or service improvement', option_c: 'Optimizing warehouse layout', option_d: 'A type of GPS tracking', correct_option: 'B', explanation: 'Mode optimization uses shipment data to find opportunities like consolidating LTL into TL, shifting TL to cheaper intermodal, or identifying lanes where mode changes would improve cost or service.' },
      { question: 'Why is lane analysis important for transportation planning?', option_a: 'It is not useful', option_b: 'It reveals volume, spend, and rate trends by origin-destination pair, enabling better carrier negotiations and identifying consolidation opportunities', option_c: 'It only tracks highway construction', option_d: 'Lane analysis is only for ocean freight', correct_option: 'B', explanation: 'Lane analysis breaks down shipping data by origin-destination pair, showing volume patterns, rate trends, carrier performance, and seasonal fluctuations. This intelligence drives better procurement, carrier negotiations, and network design.' },
    ],
  };

  let lessonCount = 0;
  let quizCount = 0;
  const lessonMap = {}; // "moduleKey_position" -> lesson id

  for (const [moduleKey, position, title, notes] of lessonDefs) {
    const mod = modules[moduleKey];
    if (!mod) {
      console.error(`  ERROR: Module key "${moduleKey}" not found`);
      continue;
    }

    const [rows] = await sequelize.query(
      `INSERT INTO lms_lessons (module_id, title, transcript_notes, position)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      { bind: [mod.id, title, notes, position] }
    );
    const lessonId = rows[0].id;
    lessonCount++;

    const quizKey = `${moduleKey}_${position}`;
    lessonMap[quizKey] = lessonId;

    // Insert quizzes for this lesson
    const questions = quizDefs[quizKey];
    if (questions) {
      for (let qi = 0; qi < questions.length; qi++) {
        const q = questions[qi];
        await sequelize.query(
          `INSERT INTO lms_quiz_questions (lesson_id, question, option_a, option_b, option_c, option_d, correct_option, explanation)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          { bind: [lessonId, q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation] }
        );
        quizCount++;
      }
    } else {
      console.warn(`  WARNING: No quizzes found for ${quizKey}`);
    }

    if (lessonCount % 10 === 0) {
      console.log(`  Progress: ${lessonCount} lessons, ${quizCount} quiz questions...`);
    }
  }

  console.log(`  Done: ${lessonCount} lessons, ${quizCount} quiz questions inserted.`);
  return lessonMap;
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function seed() {
  console.log('=== RinglyPro LMS Seed Script ===');
  console.log(`Database: ${(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL || '').substring(0, 30)}...`);

  await sequelize.authenticate();
  console.log('Connected to PostgreSQL.\n');

  await createTables();
  await clearData();
  const modules = await seedModules();
  await seedLessons(modules);

  console.log('\n=== Seed complete ===');
  process.exit(0);
}

seed().catch(err => {
  console.error('SEED FAILED:', err);
  process.exit(1);
});
