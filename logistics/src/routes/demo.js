'use strict';

const express = require('express');
const router = express.Router();
const analyticsService = require('../services/analytics');
const productMatcher = require('../services/product-matcher');

// POST /api/v1/demo/generate — Create demo project matching LogiVision Dashboard Playbook
router.post('/generate', async (req, res) => {
  const startTime = Date.now();
  try {
    const { company_name } = req.body;
    const seq = req.models.sequelize;

    // 1. Create project
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
    const now = new Date().toISOString();
    console.log(`[DEMO] Generating LogiVision-matching data for project ${pid}...`);

    // ========================================================================
    // 2. ITEM MASTER — 5,000 SKUs matching LogiVision percentages
    //    Fit: 65.7%, Missing: 27.7%, Bulky: 3.2%, NoFit: 3.4%
    //    Temp: ambient 72.8%, 34F 17.4%, 28F 9.8%
    //    Pick units: case ~70%, single ~29%, pallet ~1%
    // ========================================================================
    const TOTAL_SKUS = 5000;
    const FIT = Math.round(TOTAL_SKUS * 0.657);      // 3285
    const MISSING = Math.round(TOTAL_SKUS * 0.277);   // 1385
    const BULKY = Math.round(TOTAL_SKUS * 0.032);     // 160
    // rest = nofit

    const itemRows = [];
    let fitC = 0, missC = 0, bulkC = 0;

    for (let i = 0; i < TOTAL_SKUS; i++) {
      const sku = String(10000 + i);
      const r10 = i % 10;
      const temp = r10 < 7 ? 'ambient' : r10 < 9 ? '34F' : '28F'; // 70/20/10 ≈ 72.8/17.4/9.8
      const puR = Math.random();
      const pu = puR < 0.70 ? 'case' : puR < 0.99 ? 'single' : 'pallet';
      const ppu = pu === 'case' ? 12 : pu === 'pallet' ? 96 : 1;

      let l, w, h, wt, bin_capable;
      if (fitC < FIT) {
        l = 30 + Math.floor(Math.random() * 534);
        w = 20 + Math.floor(Math.random() * 346);
        h = 10 + Math.floor(Math.random() * 188);
        wt = (0.05 + Math.random() * 34.95).toFixed(2);
        bin_capable = true; fitC++;
      } else if (missC < MISSING) {
        l = null; w = null; h = null; wt = null; bin_capable = false; missC++;
      } else if (bulkC < BULKY) {
        l = 600 + Math.floor(Math.random() * 900);
        w = 400 + Math.floor(Math.random() * 600);
        h = 400 + Math.floor(Math.random() * 800);
        wt = (50 + Math.random() * 150).toFixed(2);
        bin_capable = false; bulkC++;
      } else {
        l = 200 + Math.floor(Math.random() * 399);
        w = 200 + Math.floor(Math.random() * 250);
        h = 200 + Math.floor(Math.random() * 300);
        wt = (1 + Math.random() * 48).toFixed(2);
        bin_capable = false;
      }

      itemRows.push(`(${pid},'${sku}','Category-${(i % 20) + 1} Item ${sku}','${pu === "pallet" ? "pallet" : "piece"}',${l === null ? 'NULL' : l},${w === null ? 'NULL' : w},${h === null ? 'NULL' : h},${wt === null ? 'NULL' : wt},${ppu},96,'${temp}','Category-${(i % 20) + 1}',${bin_capable},'${now}','${now}')`);
    }

    // Bulk insert items in one shot
    const IM_CHUNK = 1000;
    for (let i = 0; i < itemRows.length; i += IM_CHUNK) {
      await seq.query(`INSERT INTO logistics_item_master (project_id,sku,description,unit_of_measure,length_mm,width_mm,height_mm,weight_kg,pieces_per_picking_unit,pieces_per_pallet,temperature_range,category,bin_capable,created_at,updated_at) VALUES ${itemRows.slice(i, i + IM_CHUNK).join(',')}`);
    }
    console.log(`[DEMO] Item master: ${TOTAL_SKUS} SKUs (${Date.now() - startTime}ms)`);

    // ========================================================================
    // 3. INVENTORY — for moved SKUs
    // ========================================================================
    const MOVED_SKUS = Math.round(TOTAL_SKUS * 0.87); // ~4350 moved
    const invRows = [];
    const locs = ['A', 'B', 'C', 'D', 'E', 'F'];
    for (let i = 0; i < MOVED_SKUS; i++) {
      const sku = String(10000 + i);
      const loc = locs[i % 6] + '-' + String(1 + (i % 30)).padStart(2, '0');
      const stock = 10 + Math.floor(Math.random() * 990);
      invRows.push(`(${pid},'${sku}',${stock},'${loc}','piece','2021-10-15','${now}','${now}')`);
    }
    for (let i = 0; i < invRows.length; i += IM_CHUNK) {
      await seq.query(`INSERT INTO logistics_inventory_data (project_id,sku,stock,location,unit_of_measure,snapshot_date,created_at,updated_at) VALUES ${invRows.slice(i, i + IM_CHUNK).join(',')}`);
    }
    console.log(`[DEMO] Inventory: ${invRows.length} rows (${Date.now() - startTime}ms)`);

    // ========================================================================
    // 4. GOODS IN — receipts
    // ========================================================================
    const giRows = [];
    const suppliers = ['Supplier-001', 'Supplier-002', 'Supplier-003', 'Supplier-004', 'Supplier-005'];
    let rid = 10001;
    for (let m = 0; m < 12; m++) {
      for (let d = 0; d < 25; d++) {
        const date = new Date('2020-10-01');
        date.setMonth(date.getMonth() + m);
        date.setDate(1 + Math.floor(Math.random() * 27));
        if (date.getDay() === 0) continue;
        const ds = date.toISOString().split('T')[0];
        const sup = suppliers[Math.floor(Math.random() * 5)];
        const sku = String(10000 + Math.floor(Math.random() * MOVED_SKUS));
        giRows.push(`(${pid},'GR-${rid++}','${sku}',${20 + Math.floor(Math.random() * 1000)},'piece','${ds}','08:00:00','${sup}','${now}','${now}')`);
      }
    }
    await seq.query(`INSERT INTO logistics_goods_in_data (project_id,receipt_id,sku,quantity,unit_of_measure,receipt_date,receipt_time,supplier,created_at,updated_at) VALUES ${giRows.join(',')}`);
    console.log(`[DEMO] Goods in: ${giRows.length} rows (${Date.now() - startTime}ms)`);

    // ========================================================================
    // 5. GOODS OUT — 1,500 orders / ~15,000 lines / 370 days
    //    Same percentages as LogiVision: ABC 80/15/5, avg 10.6 lines/order
    //    XYZ: X≥30d, Y 20-29d, Z<20d
    //    Order types: 86% store replenishment
    // ========================================================================
    const TARGET_ORDERS = 1500;
    const TARGET_LINES = 15900; // avg ~10.6 lines/order

    // ABC weights for SKU selection
    const A_COUNT = Math.round(MOVED_SKUS * 0.10); // 10% = A items
    const B_COUNT = Math.round(MOVED_SKUS * 0.10); // 10% = B items

    function pickSku() {
      const r = Math.random();
      let idx;
      if (r < 0.80) idx = Math.floor(Math.random() * A_COUNT); // A items: 80% of volume
      else if (r < 0.95) idx = A_COUNT + Math.floor(Math.random() * B_COUNT); // B: 15%
      else idx = A_COUNT + B_COUNT + Math.floor(Math.random() * (MOVED_SKUS - A_COUNT - B_COUNT)); // C: 5%
      return String(10000 + idx);
    }

    // Generate 370 operating days
    const allDates = [];
    let dt = new Date('2020-10-01');
    while (allDates.length < 370) {
      if (dt.getDay() !== 0) allDates.push(dt.toISOString().split('T')[0]);
      dt = new Date(dt.getTime() + 86400000);
    }

    const orderTypes = ['store replenishment', 'store replenishment', 'store replenishment', 'store replenishment', 'store replenishment', 'store replenishment', 'store replenishment', 'store replenishment', 'store replenishment', 'e-com', 'first allocation'];
    const methods = ['CEP', 'CEP', 'Freight', 'Freight', 'Air Freight'];

    const goRows = [];
    let oid = 100001;
    let totalLines = 0;
    let totalOrders = 0;
    const ordersPerDay = Math.ceil(TARGET_ORDERS / 370);

    for (const dateStr of allDates) {
      const todayOrders = Math.max(1, ordersPerDay + Math.floor((Math.random() - 0.5) * 4));

      for (let o = 0; o < todayOrders && totalOrders < TARGET_ORDERS; o++) {
        const ordId = 'SO-' + oid++;
        totalOrders++;
        const otype = orderTypes[Math.floor(Math.random() * orderTypes.length)];
        const cust = 'CUST-' + String(1 + Math.floor(Math.random() * 500)).padStart(4, '0');
        const method = methods[Math.floor(Math.random() * methods.length)];
        const hr = String(6 + Math.floor(Math.random() * 12)).padStart(2, '0');
        const shipTime = hr + ':' + String(Math.floor(Math.random() * 60)).padStart(2, '0') + ':00';

        // Lines/order: avg ~10.6, range 1-138
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
          goRows.push(`(${pid},'${ordId}','${ordId}-${l + 1}','${sku}',${qty},'${pu}','piece','${otype}','${dateStr}','${dateStr}','${dateStr}','${shipTime}','${cust}','${method}','${now}','${now}')`);
          totalLines++;
        }
      }
    }

    // Bulk insert goods out
    const GO_CHUNK = 2000;
    for (let i = 0; i < goRows.length; i += GO_CHUNK) {
      await seq.query(`INSERT INTO logistics_goods_out_data (project_id,order_id,orderline_id,sku,quantity,picking_unit,unit_of_measure,order_type,order_date,picking_date,ship_date,ship_time,customer_id,shipping_method,created_at,updated_at) VALUES ${goRows.slice(i, i + GO_CHUNK).join(',')}`);
    }
    console.log(`[DEMO] Goods out: ${totalOrders} orders, ${totalLines} lines (${Date.now() - startTime}ms)`);

    // Track file records
    for (const [ft, fn, rc] of [
      ['item_master', 'demo_item_master.csv', TOTAL_SKUS],
      ['inventory', 'demo_inventory.csv', invRows.length],
      ['goods_in', 'demo_goods_in.csv', giRows.length],
      ['goods_out', 'demo_goods_out.csv', totalLines]
    ]) {
      await req.models.LogisticsUploadedFile.create({
        project_id: pid, file_type: ft, original_filename: fn,
        file_size: 0, mime_type: 'text/csv', row_count: rc, column_count: 10, parse_status: 'parsed'
      });
    }

    // ========================================================================
    // 6. Run analysis + product matching
    // ========================================================================
    await project.update({ status: 'analyzing', analysis_started_at: new Date() });
    console.log(`[DEMO] Running analysis...`);
    const analysisResults = await analyticsService.runAll(req.models, pid);

    const analysisMap = {};
    const savedResults = await req.models.LogisticsAnalysisResult.findAll({ where: { project_id: pid } });
    for (const r of savedResults) analysisMap[r.analysis_type] = r.result_data;

    const recommendations = await productMatcher.match(analysisMap);
    await req.models.LogisticsProductRecommendation.bulkCreate(
      recommendations.map(rec => ({ ...rec, project_id: pid, computed_at: new Date() }))
    );

    await project.update({ status: 'completed', analysis_completed_at: new Date() });

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[DEMO] Complete in ${elapsed}s — project ${pid}`);

    res.status(201).json({
      success: true,
      data: {
        project_id: pid,
        project_code: project.project_code,
        items: TOTAL_SKUS,
        inventory_records: invRows.length,
        goods_in_records: giRows.length,
        goods_out_records: totalLines,
        orders: totalOrders,
        analyses_completed: Object.keys(analysisResults).length,
        recommendations: recommendations.length,
        elapsed_seconds: elapsed
      }
    });
  } catch (error) {
    console.error('[DEMO] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
