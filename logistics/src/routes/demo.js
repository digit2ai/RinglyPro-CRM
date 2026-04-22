'use strict';

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics');
const productMatcher = require('../services/product-matcher');
const { bulkInsert, bulkInsertStreaming } = require('../services/bulk-inserter');

// POST /api/v1/demo/generate — Create POC project matching Pinaxis Dashboard Playbook (FULL SCALE)
router.post('/generate', async (req, res) => {
  try {
    const { company_name } = req.body;
    const seq = req.models.sequelize;

    // 1. Create project — respond IMMEDIATELY
    const crypto = require('crypto');
    const project = await req.models.LogisticsProject.create({
      project_code: `LOGISTICS-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      company_name: company_name || 'Pinaxis POC Warehouse',
      contact_name: 'POC User',
      contact_email: 'poc@pinaxis.com',
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
        message: 'Generating Pinaxis POC data (10K items, 30K order lines). Poll /projects/' + pid + ' for status.'
      }
    });

    // ======================================================================
    // BACKGROUND PROCESSING — generate + insert + analyze
    // ======================================================================
    generateFullDemo(req.models, seq, pid).catch(err => {
      console.error(`[POC] FATAL error for project ${pid}:`, err);
      req.models.LogisticsProject.update(
        { status: 'error', analysis_completed_at: new Date() },
        { where: { id: pid } }
      ).catch(() => {});
    });

  } catch (error) {
    console.error('[POC] Error creating project:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ========================================================================
// Full-scale POC generation — runs in background
// ========================================================================
async function generateFullDemo(models, seq, pid) {
  const startTime = Date.now();
  const label = '[POC]';
  const opts = { projectId: pid, label, chunkSize: 5000 };

  console.log(`${label} Starting Pinaxis Lite generation for project ${pid}...`);

  // ====================================================================
  // ITEM MASTER — 10,000 SKUs (lite scale — same proportions as full 228K)
  //   Fit: 65.7%, Missing: 27.7%, Bulky: 3.2%, NoFit: 3.4%
  //   Same ABC/XYZ distributions, same charts — 20x faster to load
  // ====================================================================
  const TOTAL_SKUS = 10000;
  const FIT_COUNT   = Math.round(TOTAL_SKUS * 0.657);
  const MISS_COUNT  = Math.round(TOTAL_SKUS * 0.277);
  const BULKY_COUNT = Math.round(TOTAL_SKUS * 0.032);
  // rest = NoFit

  const IM_BATCH = 50000;

  const imColumns = [
    'sku', 'description', 'unit_of_measure', 'length_mm', 'width_mm', 'height_mm',
    'weight_kg', 'pieces_per_picking_unit', 'pieces_per_pallet', 'temperature_range',
    'category', 'bin_capable'
  ];

  // ====================================================================
  // MOVED SKUs — 43,680 SKUs that actually appear in goods_out
  // ABC: A=785 (top 10% of 7,851 moved unique), B=785, C=6,281
  //   -> 80/15/5 volume split
  // XYZ: X=4,994 (>=30d), Y=5,350 (20-29d), Z=33,336 (<20d)
  // ====================================================================
  const MOVED_SKUS = 2000;
  const A_COUNT = 200;   // top 10% → 80% volume
  const B_COUNT = 300;   // next 15% → 15% volume

  // ====================================================================
  // PARALLEL INSERT: Item Master + Inventory + Goods In simultaneously
  // These three tables are independent — no reason to wait for one before
  // starting the next. This cuts ~40% off the data loading phase.
  // ====================================================================
  console.log(`${label} Starting parallel insert: item_master + inventory + goods_in`);

  // --- Build inventory rows ---
  const INV_COUNT = 3000;
  const invColumns = ['sku', 'stock', 'location', 'unit_of_measure', 'snapshot_date'];
  const locs = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K'];
  const invRows = [];
  for (let i = 0; i < INV_COUNT; i++) {
    const sku = String(100000 + (i % MOVED_SKUS));
    const loc = locs[i % 10] + '-' + String(1 + (i % 50)).padStart(2, '0') + '-' + String(1 + Math.floor(i / 50) % 5);
    const stock = 10 + Math.floor(Math.random() * 990);
    invRows.push([sku, stock, loc, 'piece', '2021-10-15']);
  }

  // --- Build goods_in rows ---
  const GI_COUNT = 300;
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

  // --- Fire all three table inserts in parallel ---
  const [imResult, invResult, giResult] = await Promise.all([
    // Item master — still uses batched generation but runs concurrently with others
    (async () => {
      let total = 0;
      for (let batchStart = 0; batchStart < TOTAL_SKUS; batchStart += IM_BATCH) {
        // re-generate this batch (rows variable was already consumed above)
        const batchEnd = Math.min(batchStart + IM_BATCH, TOTAL_SKUS);
        const batchRows = [];
        for (let i = batchStart; i < batchEnd; i++) {
          const sku = String(100000 + i);
          const catNum = 1 + (i % 48);
          const r2 = Math.random();
          let pu, ppu, temp, l, w, h, wt, bin_capable;
          if (r2 < 0.60) { pu = 'single'; ppu = 1; }
          else if (r2 < 0.85) { pu = 'case'; ppu = 6 + Math.floor(Math.random() * 18); }
          else { pu = 'pallet'; ppu = 24 + Math.floor(Math.random() * 72); }
          const tr = Math.random();
          if (tr < 0.75) temp = 'ambient';
          else if (tr < 0.93) temp = 'chilled';
          else temp = 'frozen';
          const fitRoll = Math.random();
          if (fitRoll < 0.15) {
            l = null; w = null; h = null; wt = null; bin_capable = false;
          } else if (fitRoll < 0.75) {
            l = 50 + Math.floor(Math.random() * 250);
            w = 50 + Math.floor(Math.random() * 200);
            h = 20 + Math.floor(Math.random() * 250);
            wt = +(0.1 + Math.random() * 24).toFixed(2);
            bin_capable = true;
          } else if (fitRoll < 0.90) {
            l = 600 + Math.floor(Math.random() * 800);
            w = 400 + Math.floor(Math.random() * 600);
            h = 400 + Math.floor(Math.random() * 800);
            wt = +(50 + Math.random() * 150).toFixed(2);
            bin_capable = false;
          } else {
            l = 200 + Math.floor(Math.random() * 399);
            w = 200 + Math.floor(Math.random() * 250);
            h = 200 + Math.floor(Math.random() * 300);
            wt = +(1 + Math.random() * 48).toFixed(2);
            bin_capable = false;
          }
          batchRows.push([sku, `Category-${catNum} Item ${sku}`, pu === 'pallet' ? 'pallet' : 'piece', l, w, h, wt, ppu, 96, temp, `Category-${catNum}`, bin_capable]);
        }
        const r = await bulkInsert(seq, 'logistics_item_master', imColumns, batchRows, opts);
        total += r.inserted;
      }
      return { table: 'item_master', inserted: total };
    })(),
    // Inventory — single bulk insert
    bulkInsert(seq, 'logistics_inventory_data', invColumns, invRows, opts).then(r => ({ table: 'inventory', inserted: r.inserted })),
    // Goods in — single bulk insert
    bulkInsert(seq, 'logistics_goods_in_data', giColumns, giRows, opts).then(r => ({ table: 'goods_in', inserted: r.inserted }))
  ]);

  console.log(`${label} Parallel insert complete: IM=${imResult.inserted}, INV=${invResult.inserted}, GI=${giResult.inserted} (${Date.now() - startTime}ms)`);

  // Track file records
  await Promise.all([
    models.LogisticsUploadedFile.create({ project_id: pid, file_type: 'item_master', original_filename: 'poc_item_master.csv', file_size: 0, mime_type: 'text/csv', row_count: imResult.inserted, column_count: 12, parse_status: 'parsed' }),
    models.LogisticsUploadedFile.create({ project_id: pid, file_type: 'inventory', original_filename: 'poc_inventory.csv', file_size: 0, mime_type: 'text/csv', row_count: invResult.inserted, column_count: 5, parse_status: 'parsed' }),
    models.LogisticsUploadedFile.create({ project_id: pid, file_type: 'goods_in', original_filename: 'poc_goods_in.csv', file_size: 0, mime_type: 'text/csv', row_count: giResult.inserted, column_count: 7, parse_status: 'parsed' }),
  ]);

  // ====================================================================
  // GOODS OUT — Lite scale (same proportions as full 228K)
  //   3,000 orders / 30,000 lines / 90 days
  //   Avg lines/order: 10 | 2,000 moved SKUs | ABC 80/15/5
  // ====================================================================
  console.log(`${label} Starting goods_out generation...`);
  try {
  const TARGET_ORDERS = 3000;
  const TARGET_LINES = 30000;
  const TARGET_PICK_UNITS = 4200000;
  const AVG_QTY_PER_LINE = TARGET_PICK_UNITS / TARGET_LINES; // ~140.5

  // Generate exactly 370 operating days
  const allDates = [];
  let dt = new Date('2020-10-01');
  while (allDates.length < 90) {
    if (dt.getDay() !== 0) allDates.push(dt.toISOString().split('T')[0]);
    dt = new Date(dt.getTime() + 86400000);
  }

  const orderTypes = [];
  for (let i = 0; i < 861; i++) orderTypes.push('store replenishment');
  for (let i = 0; i < 100; i++) orderTypes.push('e-com');
  for (let i = 0; i < 39; i++) orderTypes.push('first allocation');

  const methods = ['CEP', 'CEP', 'Freight', 'Freight', 'Air Freight'];

  // Ensure ALL 43,680 moved SKUs appear — pre-assign each SKU at least once
  const skuUsed = new Set();
  const allMovedSkus = [];
  for (let i = 0; i < MOVED_SKUS; i++) allMovedSkus.push(String(100000 + i));

  function pickSku() {
    // If we still have unused SKUs and enough lines remaining, force-use one
    if (skuUsed.size < MOVED_SKUS && (TARGET_LINES - totalLines) > (MOVED_SKUS - skuUsed.size) * 2) {
      // 30% chance to force an unused SKU
      if (Math.random() < 0.3) {
        for (let i = skuUsed.size; i < MOVED_SKUS; i++) {
          const s = allMovedSkus[i];
          if (!skuUsed.has(s)) { skuUsed.add(s); return s; }
        }
      }
    }
    // Normal ABC-weighted pick
    const r = Math.random();
    let idx;
    if (r < 0.80) idx = Math.floor(Math.random() * A_COUNT);
    else if (r < 0.95) idx = A_COUNT + Math.floor(Math.random() * B_COUNT);
    else idx = A_COUNT + B_COUNT + Math.floor(Math.random() * (MOVED_SKUS - A_COUNT - B_COUNT));
    const sku = String(100000 + idx);
    skuUsed.add(sku);
    return sku;
  }

  const goColumns = [
    'order_id', 'orderline_id', 'sku', 'quantity', 'picking_unit', 'unit_of_measure',
    'order_type', 'order_date', 'picking_date', 'ship_date', 'ship_time',
    'customer_id', 'shipping_method'
  ];

  let totalOrders = 0;
  let totalLines = 0;
  let totalQty = 0;
  let oid = 100001;
  const GO_FLUSH = 100000;
  let goBatch = [];

  async function flushGoLines() {
    if (goBatch.length === 0) return;
    await bulkInsert(seq, 'logistics_goods_out_data', goColumns, goBatch, opts);
    console.log(`${label} Goods out flush: ${totalLines} lines, ${totalOrders} orders, qty=${totalQty} (${Date.now() - startTime}ms)`);
    goBatch = [];
  }

  // ================================================================
  // KEY FIX: Pre-compute BOTH orders AND lines per day
  // so throughput is flat across all 370 days — matching Pinaxis
  // ================================================================
  const DAYS = allDates.length; // 370
  const baseLinesPerDay = Math.floor(TARGET_LINES / DAYS); // ~1722
  const baseOrdersPerDay = Math.floor(TARGET_ORDERS / DAYS); // ~162
  const AVG_LINES_PER_ORDER = TARGET_LINES / TARGET_ORDERS; // ~10.6

  // Pre-allocate exact lines + orders per day with small random variation
  const dailyLines = [];
  const dailyOrders = [];
  let linesLeft = TARGET_LINES;
  let ordersLeft = TARGET_ORDERS;

  for (let d = 0; d < DAYS; d++) {
    const daysRemaining = DAYS - d;
    // Even distribution with ±10% random variation
    const dayLines = d === DAYS - 1 ? linesLeft : Math.round((linesLeft / daysRemaining) * (0.9 + Math.random() * 0.2));
    const dayOrders = d === DAYS - 1 ? ordersLeft : Math.round((ordersLeft / daysRemaining) * (0.9 + Math.random() * 0.2));
    dailyLines.push(Math.max(1, dayLines));
    dailyOrders.push(Math.max(1, dayOrders));
    linesLeft -= dailyLines[d];
    ordersLeft -= dailyOrders[d];
  }

  // Force unused SKUs into a queue to spread across all days
  const unusedSkuQueue = [...allMovedSkus]; // all 43,680
  let unusedIdx = 0;

  for (let dayIdx = 0; dayIdx < DAYS; dayIdx++) {
    const dateStr = allDates[dayIdx];
    const targetDayOrders = dailyOrders[dayIdx];
    const targetDayLines = dailyLines[dayIdx];
    let dayLines = 0;

    for (let o = 0; o < targetDayOrders; o++) {
      const ordId = 'SO-' + oid++;
      totalOrders++;
      const otype = orderTypes[Math.floor(Math.random() * orderTypes.length)];
      const cust = 'CUST-' + String(1 + Math.floor(Math.random() * 2000)).padStart(4, '0');
      const method = methods[Math.floor(Math.random() * methods.length)];
      const hr = String(6 + Math.floor(Math.random() * 12)).padStart(2, '0');
      const shipTime = hr + ':' + String(Math.floor(Math.random() * 60)).padStart(2, '0') + ':00';

      // How many lines for this order?
      const ordersRemaining = targetDayOrders - o;
      const linesRemaining = targetDayLines - dayLines;
      const avgNeeded = ordersRemaining > 0 ? linesRemaining / ordersRemaining : AVG_LINES_PER_ORDER;

      // Distribute lines with natural variation around the per-order average
      let lineCount;
      const lr = Math.random();
      if (lr < 0.06) lineCount = 1;
      else if (lr < 0.14) lineCount = 2 + Math.floor(Math.random() * 2);
      else if (lr < 0.30) lineCount = 4 + Math.floor(Math.random() * 3);
      else if (lr < 0.55) lineCount = 7 + Math.floor(Math.random() * 5);
      else if (lr < 0.78) lineCount = 12 + Math.floor(Math.random() * 5);
      else if (lr < 0.92) lineCount = 17 + Math.floor(Math.random() * 8);
      else if (lr < 0.98) lineCount = 25 + Math.floor(Math.random() * 20);
      else lineCount = 45 + Math.floor(Math.random() * 93);

      // Steer toward needed average to keep daily total on track
      if (avgNeeded < 6) lineCount = Math.min(lineCount, 1 + Math.floor(Math.random() * 5));
      else if (avgNeeded > 16) lineCount = Math.max(lineCount, 12 + Math.floor(Math.random() * 10));

      lineCount = Math.max(1, Math.min(lineCount, 138, targetDayLines - dayLines));

      for (let l = 0; l < lineCount; l++) {
        // Pick SKU — use unused queue first to ensure all 43,680 appear
        let sku;
        if (unusedIdx < MOVED_SKUS && Math.random() < 0.15) {
          sku = unusedSkuQueue[unusedIdx++];
        } else {
          // ABC-weighted pick
          const r = Math.random();
          let idx;
          if (r < 0.80) idx = Math.floor(Math.random() * A_COUNT);
          else if (r < 0.95) idx = A_COUNT + Math.floor(Math.random() * B_COUNT);
          else idx = A_COUNT + B_COUNT + Math.floor(Math.random() * (MOVED_SKUS - A_COUNT - B_COUNT));
          sku = String(100000 + idx);
        }
        skuUsed.add(sku);

        // Quantity: target avg ~140.5 to hit 89.5M total
        const qtyRemaining = TARGET_PICK_UNITS - totalQty;
        const totalLinesRemaining = TARGET_LINES - totalLines;
        const qtyAvg = totalLinesRemaining > 0 ? qtyRemaining / totalLinesRemaining : 140;
        const qty = Math.max(1, Math.round(qtyAvg * (0.3 + Math.random() * 1.4)));

        const pu = qty > 96 ? 'pallet' : qty > 12 ? 'case' : 'single';

        goBatch.push([
          ordId, `${ordId}-${l + 1}`, sku, qty, pu, pu === 'pallet' ? 'pallet' : 'piece',
          otype, dateStr, dateStr, dateStr, shipTime, cust, method
        ]);
        totalLines++;
        totalQty += qty;
        dayLines++;
      }

      if (goBatch.length >= GO_FLUSH) {
        await flushGoLines();
      }
    }
  }

  // Insert any remaining unused SKUs spread across last few days
  while (unusedIdx < MOVED_SKUS) {
    const dateStr = allDates[Math.floor(Math.random() * DAYS)];
    const s = unusedSkuQueue[unusedIdx++];
    if (!skuUsed.has(s)) {
      goBatch.push([
        'SO-' + oid++, 'SO-' + (oid - 1) + '-1', s, Math.max(1, Math.round(AVG_QTY_PER_LINE)),
        'case', 'piece', 'store replenishment', dateStr, dateStr, dateStr, '10:00:00',
        'CUST-0001', 'CEP'
      ]);
      totalLines++;
      totalOrders++;
    }
  }

  // Final flush
  await flushGoLines();

  await models.LogisticsUploadedFile.create({
    project_id: pid, file_type: 'goods_out', original_filename: 'poc_goods_out.csv',
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
  } catch (goErr) {
    console.error(`${label} GOODS_OUT/ANALYSIS ERROR for project ${pid}:`, goErr.message, goErr.stack);
    throw goErr;
  }
}

// POST /api/v1/demo/regenerate/:projectId — Wipe and regenerate a project with fresh POC data
router.post('/regenerate/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;
    const seq = req.models.sequelize;

    const project = await req.models.LogisticsProject.findByPk(projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    // Wipe all data for this project
    console.log(`[POC] Wiping data for project ${projectId}...`);
    await seq.query(`DELETE FROM logistics_item_master WHERE project_id = ${projectId}`);
    await seq.query(`DELETE FROM logistics_inventory_data WHERE project_id = ${projectId}`);
    await seq.query(`DELETE FROM logistics_goods_in_data WHERE project_id = ${projectId}`);
    await seq.query(`DELETE FROM logistics_goods_out_data WHERE project_id = ${projectId}`);
    await seq.query(`DELETE FROM logistics_analysis_results WHERE project_id = ${projectId}`);
    await seq.query(`DELETE FROM logistics_product_recommendations WHERE project_id = ${projectId}`);
    await req.models.LogisticsUploadedFile.destroy({ where: { project_id: projectId } });
    await project.update({ status: 'uploading', analysis_started_at: null, analysis_completed_at: null });
    console.log(`[POC] Wiped. Regenerating...`);

    res.json({ success: true, data: { project_id: parseInt(projectId), status: 'regenerating' } });

    // Run in background
    generateFullDemo(req.models, seq, parseInt(projectId)).catch(err => {
      console.error(`[POC] Regenerate failed:`, err);
      req.models.LogisticsProject.update({ status: 'error' }, { where: { id: projectId } }).catch(() => {});
    });
  } catch (error) {
    console.error('[POC] Regenerate error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/demo/instant — Clone a completed project's analysis results (< 3 seconds)
// Instant Demo for live presentations — no data generation, just clones results.
router.post('/instant', async (req, res) => {
  try {
    const { company_name } = req.body;
    const seq = req.models.sequelize;
    const crypto = require('crypto');

    // Find the best completed project to clone from — must have real populated data
    // Check that overview_kpis contains actual order data (total_orderlines > 0)
    const [sources] = await seq.query(`
      SELECT p.id, p.company_name, COUNT(a.id) as analysis_count
      FROM logistics_projects p
      JOIN logistics_analysis_results a ON a.project_id = p.id
      WHERE p.status = 'completed'
        AND EXISTS (
          SELECT 1 FROM logistics_analysis_results ar
          WHERE ar.project_id = p.id
            AND ar.analysis_type = 'overview_kpis'
            AND (ar.result_data->'orders'->>'total_orderlines')::int > 100
        )
      GROUP BY p.id, p.company_name
      HAVING COUNT(a.id) >= 10
      ORDER BY p.id DESC
      LIMIT 1
    `);

    if (!sources.length) {
      return res.status(404).json({ success: false, error: 'No completed demo project found to clone. Run Generate POC first.' });
    }

    const sourceId = sources[0].id;
    console.log(`[INSTANT] Cloning from project ${sourceId} (${sources[0].company_name}, ${sources[0].analysis_count} analyses)`);

    // Create new project
    const project = await req.models.LogisticsProject.create({
      project_code: `LOGISTICS-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      company_name: company_name || 'Pinaxis POC Warehouse',
      contact_name: 'Demo User',
      contact_email: 'demo@pinaxis.com',
      industry: '3PL / Logistics',
      country: 'Germany',
      business_info: { warehouse_size_sqm: 12000, employees: 85, shifts_per_day: 2, operating_days_per_week: 6, growth_forecast_pct: 5 },
      status: 'analyzing'
    });
    const newId = project.id;

    // Clone analysis results (the expensive part is already computed)
    await seq.query(`
      INSERT INTO logistics_analysis_results (project_id, analysis_type, result_data, created_at, updated_at)
      SELECT ${newId}, analysis_type, result_data, NOW(), NOW()
      FROM logistics_analysis_results
      WHERE project_id = ${sourceId}
    `);

    // Clone product recommendations (select only columns that exist)
    try {
      const [recCols] = await seq.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'logistics_product_recommendations' AND column_name NOT IN ('id','project_id','created_at','updated_at') ORDER BY ordinal_position`);
      if (recCols.length > 0) {
        const cols = recCols.map(c => c.column_name).join(', ');
        await seq.query(`INSERT INTO logistics_product_recommendations (project_id, ${cols}, created_at, updated_at) SELECT ${newId}, ${cols}, NOW(), NOW() FROM logistics_product_recommendations WHERE project_id = ${sourceId}`);
      }
    } catch (e) { console.log('[INSTANT] Product recs clone skipped:', e.message); }

    // Clone file records (metadata only, not actual data rows)
    try {
      const [fileCols] = await seq.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'logistics_uploaded_files' AND column_name NOT IN ('id','project_id','created_at','updated_at') ORDER BY ordinal_position`);
      if (fileCols.length > 0) {
        const cols = fileCols.map(c => c.column_name).join(', ');
        await seq.query(`INSERT INTO logistics_uploaded_files (project_id, ${cols}, created_at, updated_at) SELECT ${newId}, ${cols}, NOW(), NOW() FROM logistics_uploaded_files WHERE project_id = ${sourceId}`);
      }
    } catch (e) { console.log('[INSTANT] File records clone skipped:', e.message); }

    // Mark complete
    await project.update({ status: 'completed', analysis_started_at: new Date(), analysis_completed_at: new Date() });

    console.log(`[INSTANT] Project ${newId} ready — cloned from ${sourceId}`);
    res.status(201).json({
      success: true,
      data: {
        project_id: newId,
        project_code: project.project_code,
        status: 'completed',
        cloned_from: sourceId,
        message: 'Instant demo ready — analysis results cloned.'
      }
    });
  } catch (error) {
    console.error('[INSTANT] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
