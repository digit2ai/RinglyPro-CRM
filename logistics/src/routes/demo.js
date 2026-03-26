'use strict';

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics');
const productMatcher = require('../services/product-matcher');
const { bulkInsert, bulkInsertStreaming } = require('../services/bulk-inserter');

// POST /api/v1/demo/generate — Create demo project matching LogiVision Dashboard Playbook (FULL SCALE)
router.post('/generate', async (req, res) => {
  try {
    const { company_name } = req.body;
    const seq = req.models.sequelize;

    // 1. Create project — respond IMMEDIATELY
    const crypto = require('crypto');
    const project = await req.models.LogisticsProject.create({
      project_code: `LOGISTICS-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      company_name: company_name || 'Pinaxis Demo Warehouse',
      contact_name: 'Demo User',
      contact_email: 'demo@pinaxis.com',
      industry: '3PL / Logistics',
      country: 'Germany',
      business_info: {
        warehouse_size_sqm: 12000,
        employees: 85,
        shifts_per_day: 2,
        operating_days_per_week: 6,
        growth_forecast_pct: 5
      },
      status: 'uploading'
    });

    const pid = project.id;

    // Respond immediately — frontend polls status
    res.status(201).json({
      success: true,
      data: {
        project_id: pid,
        project_code: project.project_code,
        status: 'uploading',
        message: 'Generating full-scale LogiVision data (228K items, 637K order lines). Poll /projects/' + pid + ' for status.'
      }
    });

    // ======================================================================
    // BACKGROUND PROCESSING — generate + insert + analyze
    // ======================================================================
    generateFullDemo(req.models, seq, pid).catch(err => {
      console.error(`[DEMO] FATAL error for project ${pid}:`, err);
      req.models.LogisticsProject.update(
        { status: 'error', analysis_completed_at: new Date() },
        { where: { id: pid } }
      ).catch(() => {});
    });

  } catch (error) {
    console.error('[DEMO] Error creating project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================================================
// Full-scale demo generation — runs in background
// ========================================================================
async function generateFullDemo(models, seq, pid) {
  const startTime = Date.now();
  const label = '[DEMO]';
  const opts = { projectId: pid, label, chunkSize: 2000 };

  console.log(`${label} Starting full-scale LogiVision generation for project ${pid}...`);

  // ====================================================================
  // ITEM MASTER — 228,274 SKUs
  //   Fit: 65.7% (149,984), Missing: 27.7% (63,232), Bulky: 3.2% (7,305), NoFit: 3.4% (7,753)
  //   Temp: ambient 72.8%, 34F 17.4%, 28F 9.8%
  //   Pick units: case 30,578 / single 12,884 / pallet 218 of 43,680 moved
  // ====================================================================
  const TOTAL_SKUS = 228274;
  const FIT_COUNT   = Math.round(TOTAL_SKUS * 0.657);   // 149,984
  const MISS_COUNT  = Math.round(TOTAL_SKUS * 0.277);   // 63,232
  const BULKY_COUNT = Math.round(TOTAL_SKUS * 0.032);   // 7,305
  // rest = NoFit

  // Generate in chunks of 50,000 to avoid huge arrays
  const IM_BATCH = 50000;
  let imInserted = 0;

  const imColumns = [
    'sku', 'description', 'unit_of_measure', 'length_mm', 'width_mm', 'height_mm',
    'weight_kg', 'pieces_per_picking_unit', 'pieces_per_pallet', 'temperature_range',
    'category', 'bin_capable'
  ];

  for (let batchStart = 0; batchStart < TOTAL_SKUS; batchStart += IM_BATCH) {
    const batchEnd = Math.min(batchStart + IM_BATCH, TOTAL_SKUS);
    const rows = [];

    for (let i = batchStart; i < batchEnd; i++) {
      const sku = String(100000 + i);
      const r10 = i % 10;
      const temp = r10 < 7 ? 'ambient' : r10 < 9 ? '34F' : '28F';
      const puR = Math.random();
      const pu = puR < 0.70 ? 'case' : puR < 0.99 ? 'single' : 'pallet';
      const ppu = pu === 'case' ? 12 : pu === 'pallet' ? 96 : 1;
      const catNum = (i % 40) + 1;

      let l, w, h, wt, bin_capable;
      if (i < FIT_COUNT) {
        l = 30 + Math.floor(Math.random() * 534);
        w = 20 + Math.floor(Math.random() * 346);
        h = 10 + Math.floor(Math.random() * 188);
        wt = +(0.05 + Math.random() * 34.95).toFixed(2);
        bin_capable = true;
      } else if (i < FIT_COUNT + MISS_COUNT) {
        l = null; w = null; h = null; wt = null; bin_capable = false;
      } else if (i < FIT_COUNT + MISS_COUNT + BULKY_COUNT) {
        l = 600 + Math.floor(Math.random() * 900);
        w = 400 + Math.floor(Math.random() * 600);
        h = 400 + Math.floor(Math.random() * 800);
        wt = +(50 + Math.random() * 150).toFixed(2);
        bin_capable = false;
      } else {
        // NoFit — has dimensions but doesn't fit standard bin
        l = 200 + Math.floor(Math.random() * 399);
        w = 200 + Math.floor(Math.random() * 250);
        h = 200 + Math.floor(Math.random() * 300);
        wt = +(1 + Math.random() * 48).toFixed(2);
        bin_capable = false;
      }

      rows.push([
        sku,
        `Category-${catNum} Item ${sku}`,
        pu === 'pallet' ? 'pallet' : 'piece',
        l, w, h, wt,
        ppu,
        96,
        temp,
        `Category-${catNum}`,
        bin_capable
      ]);
    }

    const result = await bulkInsert(seq, 'logistics_item_master', imColumns, rows, opts);
    imInserted += result.inserted;
    console.log(`${label} Item master batch: ${imInserted}/${TOTAL_SKUS} (${Date.now() - startTime}ms)`);
  }

  // Track file record
  await models.LogisticsUploadedFile.create({
    project_id: pid, file_type: 'item_master', original_filename: 'demo_item_master.csv',
    file_size: 0, mime_type: 'text/csv', row_count: TOTAL_SKUS, column_count: 12, parse_status: 'parsed'
  });

  // ====================================================================
  // MOVED SKUs — 43,680 SKUs that actually appear in goods_out
  // ABC: A=785 (top 10% of 7,851 moved unique), B=785, C=6,281
  //   → 80/15/5 volume split
  // XYZ: X=4,994 (≥30d), Y=5,350 (20-29d), Z=33,336 (<20d)
  // ====================================================================
  const MOVED_SKUS = 43680;
  const A_COUNT = 785;
  const B_COUNT = 785;
  // C_COUNT = MOVED_SKUS - A - B but for actual unique sampling we use 7,851 unique
  // For line generation we use the 43,680 range but weight A items heavily

  // ====================================================================
  // INVENTORY — ~65,000 records
  // ====================================================================
  const INV_COUNT = 65000;
  const invColumns = ['sku', 'stock', 'location', 'unit_of_measure', 'snapshot_date'];
  const locs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];

  const invBatch = 50000;
  let invInserted = 0;
  for (let batchStart = 0; batchStart < INV_COUNT; batchStart += invBatch) {
    const batchEnd = Math.min(batchStart + invBatch, INV_COUNT);
    const rows = [];
    for (let i = batchStart; i < batchEnd; i++) {
      const sku = String(100000 + (i % MOVED_SKUS));
      const loc = locs[i % 10] + '-' + String(1 + (i % 50)).padStart(2, '0') + '-' + String(1 + Math.floor(i / 50) % 5);
      const stock = 10 + Math.floor(Math.random() * 990);
      rows.push([sku, stock, loc, 'piece', '2021-10-15']);
    }
    const result = await bulkInsert(seq, 'logistics_inventory_data', invColumns, rows, opts);
    invInserted += result.inserted;
  }

  await models.LogisticsUploadedFile.create({
    project_id: pid, file_type: 'inventory', original_filename: 'demo_inventory.csv',
    file_size: 0, mime_type: 'text/csv', row_count: invInserted, column_count: 5, parse_status: 'parsed'
  });
  console.log(`${label} Inventory: ${invInserted} rows (${Date.now() - startTime}ms)`);

  // ====================================================================
  // GOODS IN — ~6,000 records
  // ====================================================================
  const GI_COUNT = 6000;
  const giColumns = ['receipt_id', 'sku', 'quantity', 'unit_of_measure', 'receipt_date', 'receipt_time', 'supplier'];
  const suppliers = ['Supplier-001', 'Supplier-002', 'Supplier-003', 'Supplier-004', 'Supplier-005',
                     'Supplier-006', 'Supplier-007', 'Supplier-008', 'Supplier-009', 'Supplier-010'];

  const giRows = [];
  let rid = 10001;
  for (let i = 0; i < GI_COUNT; i++) {
    const dayOffset = Math.floor(Math.random() * 370);
    const date = new Date('2020-10-01');
    date.setDate(date.getDate() + dayOffset);
    if (date.getDay() === 0) date.setDate(date.getDate() + 1);
    const ds = date.toISOString().split('T')[0];
    const sup = suppliers[Math.floor(Math.random() * suppliers.length)];
    const sku = String(100000 + Math.floor(Math.random() * MOVED_SKUS));
    giRows.push([`GR-${rid++}`, sku, 20 + Math.floor(Math.random() * 1000), 'piece', ds, '08:00:00', sup]);
  }
  await bulkInsert(seq, 'logistics_goods_in_data', giColumns, giRows, opts);

  await models.LogisticsUploadedFile.create({
    project_id: pid, file_type: 'goods_in', original_filename: 'demo_goods_in.csv',
    file_size: 0, mime_type: 'text/csv', row_count: GI_COUNT, column_count: 7, parse_status: 'parsed'
  });
  console.log(`${label} Goods in: ${GI_COUNT} rows (${Date.now() - startTime}ms)`);

  // ====================================================================
  // GOODS OUT — 60,016 orders / 637,002 lines / 370 days
  //   ABC: A=785 SKUs → 80% volume, B=785 → 15%, C=rest → 5%
  //   Order types: 86.1% store replenishment, ~10% e-com, ~4% first allocation
  //   Avg lines/order: 10.6, max 138
  //   Pick units: case 30,578 / single 12,884 / pallet 218
  // ====================================================================
  const TARGET_ORDERS = 60016;
  const TARGET_LINES = 637002;

  // Generate 370 operating days (exclude Sundays)
  const allDates = [];
  let dt = new Date('2020-10-01');
  while (allDates.length < 370) {
    if (dt.getDay() !== 0) allDates.push(dt.toISOString().split('T')[0]);
    dt = new Date(dt.getTime() + 86400000);
  }

  const orderTypes = [];
  // 86.1% store replenishment, 10% e-com, 3.9% first allocation
  for (let i = 0; i < 861; i++) orderTypes.push('store replenishment');
  for (let i = 0; i < 100; i++) orderTypes.push('e-com');
  for (let i = 0; i < 39; i++) orderTypes.push('first allocation');

  const methods = ['CEP', 'CEP', 'Freight', 'Freight', 'Air Freight'];

  function pickSku() {
    const r = Math.random();
    let idx;
    if (r < 0.80) idx = Math.floor(Math.random() * A_COUNT);           // A items: 80% of volume
    else if (r < 0.95) idx = A_COUNT + Math.floor(Math.random() * B_COUNT); // B: 15%
    else idx = A_COUNT + B_COUNT + Math.floor(Math.random() * (MOVED_SKUS - A_COUNT - B_COUNT)); // C: 5%
    return String(100000 + idx);
  }

  // We need to generate lines per order, insert in batches as we go
  const goColumns = [
    'order_id', 'orderline_id', 'sku', 'quantity', 'picking_unit', 'unit_of_measure',
    'order_type', 'order_date', 'picking_date', 'ship_date', 'ship_time',
    'customer_id', 'shipping_method'
  ];

  let totalOrders = 0;
  let totalLines = 0;
  let oid = 100001;
  const ordersPerDay = Math.ceil(TARGET_ORDERS / 370); // ~162/day
  const GO_FLUSH = 50000; // flush every 50K lines
  let goBatch = [];

  async function flushGoLines() {
    if (goBatch.length === 0) return;
    await bulkInsert(seq, 'logistics_goods_out_data', goColumns, goBatch, opts);
    console.log(`${label} Goods out flush: ${totalLines} lines so far (${Date.now() - startTime}ms)`);
    goBatch = [];
  }

  for (const dateStr of allDates) {
    // Vary orders per day around the mean
    const todayOrders = Math.max(1, ordersPerDay + Math.floor((Math.random() - 0.5) * 40));

    for (let o = 0; o < todayOrders && totalOrders < TARGET_ORDERS; o++) {
      const ordId = 'SO-' + oid++;
      totalOrders++;
      const otype = orderTypes[Math.floor(Math.random() * orderTypes.length)];
      const cust = 'CUST-' + String(1 + Math.floor(Math.random() * 2000)).padStart(4, '0');
      const method = methods[Math.floor(Math.random() * methods.length)];
      const hr = String(6 + Math.floor(Math.random() * 12)).padStart(2, '0');
      const shipTime = hr + ':' + String(Math.floor(Math.random() * 60)).padStart(2, '0') + ':00';

      // Lines/order distribution: avg ~10.6, max 138
      let lineCount;
      const lr = Math.random();
      if (lr < 0.06) lineCount = 1;
      else if (lr < 0.15) lineCount = 2 + Math.floor(Math.random() * 2);
      else if (lr < 0.35) lineCount = 4 + Math.floor(Math.random() * 4);
      else if (lr < 0.60) lineCount = 8 + Math.floor(Math.random() * 5);
      else if (lr < 0.80) lineCount = 13 + Math.floor(Math.random() * 6);
      else if (lr < 0.93) lineCount = 19 + Math.floor(Math.random() * 12);
      else if (lr < 0.98) lineCount = 31 + Math.floor(Math.random() * 30);
      else lineCount = 61 + Math.floor(Math.random() * 78);

      for (let l = 0; l < lineCount; l++) {
        const sku = pickSku();
        const qty = 1 + Math.floor(Math.random() * 30);
        const pu = qty > 15 ? 'case' : Math.random() < 0.6 ? 'case' : 'single';

        goBatch.push([
          ordId,
          `${ordId}-${l + 1}`,
          sku,
          qty,
          pu,
          'piece',
          otype,
          dateStr,
          dateStr,
          dateStr,
          shipTime,
          cust,
          method
        ]);

        totalLines++;
      }

      // Flush when batch is large enough
      if (goBatch.length >= GO_FLUSH) {
        await flushGoLines();
      }
    }
  }

  // Final flush
  await flushGoLines();

  await models.LogisticsUploadedFile.create({
    project_id: pid, file_type: 'goods_out', original_filename: 'demo_goods_out.csv',
    file_size: 0, mime_type: 'text/csv', row_count: totalLines, column_count: 13, parse_status: 'parsed'
  });
  console.log(`${label} Goods out: ${totalOrders} orders, ${totalLines} lines (${Date.now() - startTime}ms)`);

  // ====================================================================
  // RUN ANALYSIS + PRODUCT MATCHING
  // ====================================================================
  await models.LogisticsProject.update(
    { status: 'analyzing', analysis_started_at: new Date() },
    { where: { id: pid } }
  );
  console.log(`${label} Running analysis...`);

  const analysisResults = await analyticsService.runAll(models, pid);

  const analysisMap = {};
  const savedResults = await models.LogisticsAnalysisResult.findAll({ where: { project_id: pid } });
  for (const r of savedResults) analysisMap[r.analysis_type] = r.result_data;

  const recommendations = await productMatcher.match(analysisMap);
  await models.LogisticsProductRecommendation.bulkCreate(
    recommendations.map(rec => ({ ...rec, project_id: pid, computed_at: new Date() }))
  );

  await models.LogisticsProject.update(
    { status: 'completed', analysis_completed_at: new Date() },
    { where: { id: pid } }
  );

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`${label} Complete in ${elapsed}s — project ${pid}: ${TOTAL_SKUS} items, ${totalOrders} orders, ${totalLines} lines`);
}

module.exports = router;
