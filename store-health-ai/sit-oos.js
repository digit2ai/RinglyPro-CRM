'use strict';

// =====================================================
// sit-oos.js — SIT for the Store Health AI OOS Intelligence upgrade.
//
//   node store-health-ai/sit-oos.js
//
// Boots the real /aiastore app, seeds an isolated throwaway store with a
// fixture inventory day, and exercises the OOS surface end to end. Cleans up
// after itself. Exits 0 on pass, 1 on any failure.
// =====================================================

require('dotenv').config();

const http = require('http');
const express = require('express');

let pass = 0, fail = 0;
const results = [];
function ok(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail || '']); }
  else { fail++; results.push(['FAIL', name, detail || '']); }
}

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1', port, method, path,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0
      }
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, body: json, raw: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const TEST_STORE_CODE = 'SIT-OOS-99001';
const TODAY = new Date().toISOString().slice(0, 10);

(async function main() {
  const models = require('./models');
  const { Store, InventoryLevel, sequelize } = models;
  const oos = require('./src/services/oos-intelligence');

  let storeId = null;
  let server = null;

  try {
    ok('Shared OOS libs resolve from store-health-ai', oos.available(),
      oos.available() ? 'classifier + costModel + pipeline loaded' : oos.libError());

    // Apply the schema top-up before seeding — the live tables historically did
    // not match their models, so the fixture insert depends on this running.
    const schemaOk = await oos.ensureSchema();
    ok('Schema top-up applied (models reconciled with live tables)', schemaOk === true,
      schemaOk ? 'inventory_levels + out_of_stock_events aligned' : 'ALTER failed — see log');

    // --- seed an isolated store ---
    // stores.organization_id is FK-constrained, so adopt a real org rather than
    // assuming id 1 exists.
    const org = await models.Organization.findOne({ order: [['id', 'ASC']], raw: true });
    ok('An organization exists to attach the SIT store to', !!org,
      org ? `org ${org.id} (${org.name})` : 'none found — seed an organization first');
    if (!org) throw new Error('no organization rows; cannot run SIT');

    const [store] = await Store.findOrCreate({
      where: { store_code: TEST_STORE_CODE },
      defaults: {
        organization_id: org.id, store_code: TEST_STORE_CODE, name: 'SIT OOS Store',
        city: 'Testville', state: 'FL', status: 'active'
      }
    });
    storeId = store.id;
    await InventoryLevel.destroy({ where: { store_id: storeId } });

    // Fixture day: 4 stockouts across distinct root causes + 16 healthy SKUs.
    const rows = [
      // anchor: velocity 10 x $4.00 x 1 day = $40.00 lost, $12.00 GP
      { sku: 'SIT-0001', quantity_on_hand: 0, average_daily_sales: 10, is_out_of_stock: true,
        metadata: { unit_price: 4.00, margin: 0.30, oos_days: 1 } },
      // planogram compliance: stock on hand, facing empty
      { sku: 'SIT-0002', quantity_on_hand: 20, average_daily_sales: 8, is_out_of_stock: false,
        metadata: { unit_price: 5.00, margin: 0.30, shelf_empty: true } },
      // replenishment: PO open, unfilled
      { sku: 'SIT-0003', quantity_on_hand: 0, average_daily_sales: 4, is_out_of_stock: true,
        metadata: { unit_price: 10.00, margin: 0.25, po_open: true, po_filled: false } },
      // order/inventory accuracy: zero despite a recent delivery
      { sku: 'SIT-0004', quantity_on_hand: 0, average_daily_sales: 6, is_out_of_stock: true,
        metadata: { unit_price: 3.00, margin: 0.40, recent_delivery: true } },
      // product data accuracy: item master flagged incomplete
      { sku: 'SIT-0005', quantity_on_hand: 0, average_daily_sales: 3, is_out_of_stock: true,
        metadata: { unit_price: 6.00, margin: 0.30, product_data_incomplete: true } },
      // demand forecast accuracy: actual 3x the forecast
      { sku: 'SIT-0006', quantity_on_hand: 0, average_daily_sales: 15, is_out_of_stock: true,
        metadata: { unit_price: 2.00, margin: 0.35, forecast_velocity: 5 } },
      // shelf space allocation: facing cannot hold a day of demand
      { sku: 'SIT-0007', quantity_on_hand: 0, average_daily_sales: 12, is_out_of_stock: true,
        metadata: { unit_price: 3.50, margin: 0.28, shelf_capacity: 4 } }
    ];
    for (let i = 0; i < 13; i++) {
      rows.push({ sku: 'SIT-H' + i, quantity_on_hand: 50, average_daily_sales: 5,
        is_out_of_stock: false, metadata: { unit_price: 4.00, margin: 0.30 } });
    }

    await InventoryLevel.bulkCreate(rows.map((r) => ({
      store_id: storeId, snapshot_date: TODAY, product_name: r.sku,
      category: 'SIT', is_top_sku: false, status: 'green', ...r
    })));

    // --- boot the real app ---
    const subApp = require('./src/index');
    const app = express();
    app.use('/aiastore', subApp);
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const port = server.address().port;

    // --- existing surface must still work (no regression) ---
    const health = await request(port, 'GET', '/aiastore/health');
    ok('Existing /aiastore/health still 200', health.status === 200, 'status=' + health.status);

    // --- benchmarks ---
    const bench = await request(port, 'GET', '/aiastore/api/v1/oos/benchmarks');
    ok('Benchmarks endpoint returns 200', bench.status === 200, 'status=' + bench.status);
    ok('Benchmarks carry the 8.3% worldwide rate',
      bench.body && bench.body.data && bench.body.data.worldwide_oos_rate_pct === 8.3,
      'rate=' + (bench.body && bench.body.data && bench.body.data.worldwide_oos_rate_pct));
    ok('Benchmarks cite the source',
      bench.body && bench.body.data && /Shelf-Confidence/.test(bench.body.data.source || ''),
      'source present');

    // --- categories ---
    const cats = await request(port, 'GET', '/aiastore/api/v1/oos/categories');
    ok('Categories endpoint returns all seven',
      cats.status === 200 && cats.body.data && cats.body.data.length === 7,
      (cats.body && cats.body.data || []).length + ' categories');
    ok('Every category carries a layer and an action',
      cats.body && cats.body.data && cats.body.data.every((c) => c.layer && c.action),
      'layer + action present');

    // --- per-store analysis ---
    const s = await request(port, 'GET', `/aiastore/api/v1/oos/store/${storeId}?date=${TODAY}`);
    ok('Store analysis returns 200', s.status === 200, 'status=' + s.status);
    const d = (s.body && s.body.data) || {};
    ok('Store analysis detects 7 stockouts', d.oos_count === 7, 'oos_count=' + d.oos_count);
    ok('Store analysis counts 20 active SKUs', d.total_skus === 20, 'total_skus=' + d.total_skus);
    // 7 stockouts of 20 active SKUs = 35%
    ok('Store OOS rate is 35%', Math.abs(d.oos_rate - 35) < 0.1, 'oos_rate=' + d.oos_rate);

    const anchor = (d.events || []).find((e) => e.sku === 'SIT-0001');
    ok('Anchor SKU prices to $40.00 lost sales',
      anchor && Math.abs(anchor.lost_sales_usd - 40.00) < 0.005,
      anchor ? 'got ' + anchor.lost_sales_usd : 'missing');
    ok('Anchor SKU prices to $12.00 lost GP',
      anchor && Math.abs(anchor.lost_gross_profit_usd - 12.00) < 0.005,
      anchor ? 'got ' + anchor.lost_gross_profit_usd : 'missing');

    // The back-room stockout must be caught and correctly attributed.
    const pog = (d.events || []).find((e) => e.sku === 'SIT-0002');
    ok('Back-room stockout detected despite on_hand > 0', !!pog, pog ? 'detected' : 'MISSED');
    ok('Back-room stockout attributed to Planogram Compliance',
      pog && pog.root_cause === 'Planogram Compliance', pog ? pog.root_cause : 'n/a');
    ok('Planogram Compliance is a shelf-layer cause',
      pog && pog.layer === 'shelf', pog ? pog.layer : 'n/a');

    const po = (d.events || []).find((e) => e.sku === 'SIT-0003');
    ok('Open unfilled PO attributed to Replenishment and Allocation',
      po && po.root_cause === 'Replenishment and Allocation', po ? po.root_cause : 'n/a');

    const inv = (d.events || []).find((e) => e.sku === 'SIT-0004');
    ok('Zero-after-delivery attributed to Order and Inventory Accuracy',
      inv && inv.root_cause === 'Order and Inventory Accuracy', inv ? inv.root_cause : 'n/a');

    // Signals that only ever arrive via inventory metadata must reach the rule
    // engine. An earlier build mapped metadata through an allowlist, which
    // silently dropped these and made whole categories unreachable from Store
    // Health AI no matter what the feed supplied.
    const pda = (d.events || []).find((e) => e.sku === 'SIT-0005');
    ok('metadata-only signal reaches the classifier (product_data_incomplete)',
      pda && pda.root_cause === 'Product Data Accuracy', pda ? pda.root_cause : 'n/a');
    const spike = (d.events || []).find((e) => e.sku === 'SIT-0006');
    ok('metadata-only signal reaches the classifier (forecast_velocity)',
      spike && spike.root_cause === 'Demand Forecast Accuracy', spike ? spike.root_cause : 'n/a');
    const cap = (d.events || []).find((e) => e.sku === 'SIT-0007');
    ok('metadata-only signal reaches the classifier (shelf_capacity)',
      cap && cap.root_cause === 'Shelf Space Allocation', cap ? cap.root_cause : 'n/a');
    ok('All seven root causes are reachable from Store Health AI',
      new Set((d.events || []).map((e) => e.root_cause)).size === 7,
      new Set((d.events || []).map((e) => e.root_cause)).size + ' distinct categories');

    ok('Every event carries a recommended action',
      (d.events || []).length > 0 && d.events.every((e) => e.action && e.action.length > 10),
      'actions present');
    ok('OSA score returned', typeof d.osa_score === 'number', 'osa_score=' + d.osa_score);
    ok('price_basis reported as actual (fixture supplies prices)',
      d.price_basis === 'actual' && d.is_estimated === false,
      'basis=' + d.price_basis + ' estimated=' + d.is_estimated);

    // --- chain rollup ---
    const chain = await request(port, 'GET', `/aiastore/api/v1/oos/chain?date=${TODAY}`);
    ok('Chain rollup returns 200', chain.status === 200, 'status=' + chain.status);
    const c = (chain.body && chain.body.data) || {};
    ok('Chain rollup includes the SIT store',
      Array.isArray(c.stores_by_impact) && c.stores_by_impact.some((x) => x.store_id === storeId),
      c.store_count + ' stores analyzed');
    ok('Chain league table is sorted by dollar impact descending',
      !c.stores_by_impact || c.stores_by_impact.every((x, i, a) =>
        i === 0 || a[i - 1].lost_sales_usd >= x.lost_sales_usd),
      'sorted');
    ok('Chain reports a layer mix', c.layer_mix && typeof c.layer_mix.in_store_pct === 'number',
      'in_store=' + (c.layer_mix && c.layer_mix.in_store_pct) + '%');
    ok('Chain annualizes the bleed', typeof c.annualized_lost_sales_usd === 'number',
      '$' + c.annualized_lost_sales_usd + '/yr');

    // --- read-only chain preview (no JWT, persists nothing) ---
    const cd = await request(port, 'GET', '/aiastore/api/v1/oos/chain/demo');
    ok('Chain demo preview returns 200 without JWT', cd.status === 200, 'status=' + cd.status);
    const cdd = (cd.body && cd.body.data) || {};
    ok('Chain demo is flagged as generated', cdd.demo === true && !!cdd.note, 'demo=' + cdd.demo);
    ok('Chain demo covers all seven root causes',
      (cdd.root_cause_mix || []).length === 7, (cdd.root_cause_mix || []).length + ' categories');
    ok('Chain demo OOS rate is realistic (3-15%)',
      cdd.oos_rate >= 3 && cdd.oos_rate <= 15, 'oos_rate=' + cdd.oos_rate + '%');
    ok('Chain demo in-store share near the 70-75% benchmark',
      cdd.layer_mix && cdd.layer_mix.in_store_pct >= 60,
      'in_store=' + (cdd.layer_mix && cdd.layer_mix.in_store_pct) + '%');

    // A preview must NOT write anything.
    const beforeCount = await InventoryLevel.count();
    await request(port, 'GET', '/aiastore/api/v1/oos/chain/demo');
    const afterCount = await InventoryLevel.count();
    ok('Chain demo persists nothing', beforeCount === afterCount,
      beforeCount + ' -> ' + afterCount + ' rows');

    // --- seed endpoint must be JWT gated ---
    const seedNoAuth = await request(port, 'POST', '/aiastore/api/v1/oos/seed-demo', {});
    ok('Seed endpoint returns 401 without JWT', seedNoAuth.status === 401, 'status=' + seedNoAuth.status);

    // --- honesty: estimation must be labelled when prices are absent ---
    await InventoryLevel.update({ metadata: null }, { where: { store_id: storeId } });
    const est = await request(port, 'GET', `/aiastore/api/v1/oos/store/${storeId}?date=${TODAY}`);
    const ed = (est.body && est.body.data) || {};
    ok('Missing prices are labelled as estimated',
      ed.is_estimated === true && ed.price_basis === 'default' && !!ed.estimation_note,
      'basis=' + ed.price_basis + ' estimated=' + ed.is_estimated);

    // --- 404 on a store with no snapshot ---
    const missing = await request(port, 'GET', `/aiastore/api/v1/oos/store/${storeId}?date=1999-01-01`);
    ok('Store with no snapshot returns 404 not 500', missing.status === 404, 'status=' + missing.status);

    // --- bad input ---
    const bad = await request(port, 'GET', '/aiastore/api/v1/oos/store/not-a-number');
    ok('Invalid store_id returns 400 not 500', bad.status === 400, 'status=' + bad.status);

    // --- schema top-up applied the attribution columns ---
    const [cols] = await sequelize.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='out_of_stock_events' AND column_name IN ('root_cause','oos_layer','lost_gross_profit','recommended_action')"
    );
    ok('Attribution columns exist on out_of_stock_events', cols.length === 4,
      cols.map((c) => c.column_name).join(',') || 'none — run migrations/20260801-oos-intelligence.sql');

  } catch (err) {
    ok('SIT harness completed without throwing', false, err.message + '\n' + (err.stack || '').split('\n')[1]);
  } finally {
    try {
      if (storeId) {
        const { InventoryLevel, Store } = require('./models');
        await InventoryLevel.destroy({ where: { store_id: storeId } });
        await Store.destroy({ where: { store_code: TEST_STORE_CODE } });
      }
    } catch (e) { /* best effort */ }
    if (server) server.close();
  }

  console.log('\n# SIT — Store Health AI · OOS Intelligence\n');
  console.log('| Result | Check | Detail |');
  console.log('|---|---|---|');
  for (const [r, n, d] of results) {
    console.log(`| ${r} | ${n} | ${String(d).replace(/\|/g, '/')} |`);
  }
  console.log(`\n**${pass}/${pass + fail} passed**`);

  process.exit(fail === 0 ? 0 : 1);
})();
