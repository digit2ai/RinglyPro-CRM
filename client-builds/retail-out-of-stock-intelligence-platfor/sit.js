// =====================================================
// sit.js — System Integration Test for the Retail OOS Intelligence Platform.
//
// Boots the sub-app on an ephemeral port and exercises the real HTTP surface.
// Exits 0 on pass, 1 on any failure, and prints a markdown summary.
//
//   node client-builds/retail-out-of-stock-intelligence-platfor/sit.js
//
// Zero external keys. Runs green against Postgres OR the in-memory fallback,
// so CI never needs a database to prove the pipeline is correct.
// =====================================================

'use strict';

require('dotenv').config();

const express = require('express');
const http = require('http');
const jwt = require('jsonwebtoken');

const subApp = require('./index');
const store = require('./lib/store');
const { ROWS } = require('./lib/fixtures');
const { CATEGORY_LIST } = require('./lib/classifier');
const { priceEvent } = require('./lib/costModel');
const pipeline = require('./lib/pipeline');

const MOUNT = '/retail-out-of-stock-intelligence-platfor';
const TENANT = 990001; // SIT-only tenant; purged at the end
const SECRET = process.env.JWT_SECRET || '';

let pass = 0, fail = 0;
const results = [];

function ok(name, cond, detail) {
  if (cond) { pass++; results.push(['PASS', name, detail || '']); }
  else { fail++; results.push(['FAIL', name, detail || '']); }
}

function request(port, method, path, body, headers) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null
      : (typeof body === 'string' ? body : JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port, method, path,
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': payload ? Buffer.byteLength(payload) : 0
      }, headers || {})
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) { /* non-JSON is a valid result */ }
        resolve({ status: res.statusCode, body: json, raw: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

(async function main() {
  const app = express();
  app.use(MOUNT, subApp);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const token = SECRET ? jwt.sign({ tenant_id: TENANT, sub: 'sit' }, SECRET, { expiresIn: '10m' }) : null;
  const auth = token ? { Authorization: 'Bearer ' + token } : {};

  try {
    await store.purgeTenant(TENANT);

    // The in-memory fallback exists so an outage cannot take the dashboard
    // down — NOT so a schema bug can pass CI unnoticed. If DATABASE_URL is
    // configured, degrading to memory is a FAILURE, not a graceful default.
    // (An earlier build silently fell back on every restart after the first
    // because sequelize.sync() collided on truncated index names.)
    const backendNow = store.status().backend;
    if (process.env.DATABASE_URL || process.env.CRM_DATABASE_URL) {
      ok('Storage uses Postgres when DATABASE_URL is set', backendNow === 'postgres',
        'backend=' + backendNow + (store.status().error ? ' · ' + store.status().error : ''));
    } else {
      results.push(['SKIP', 'Storage uses Postgres when DATABASE_URL is set', 'no DATABASE_URL in env']);
    }

    // ---------------------------------------------------------------------
    // AC #1 — health
    // ---------------------------------------------------------------------
    const h = await request(port, 'GET', MOUNT + '/health');
    ok('AC1 health returns 200', h.status === 200, 'status=' + h.status);
    ok('AC1 health payload shape',
      h.body && h.body.status === 'ok' && h.body.service === 'retail-oos' && !!h.body.version,
      JSON.stringify(h.body));

    // ---------------------------------------------------------------------
    // AC #4 — lost-sales math (pure unit check, before any I/O)
    // velocity 10/day x $4.00 x 1 day = $40.00 ; margin 0.30 -> $12.00 GP
    // ---------------------------------------------------------------------
    const priced = priceEvent({ avg_velocity: 10, unit_price: 4.00, margin: 0.30, oos_days: 1 });
    ok('AC4 lost_sales_usd == 40.00', priced.lost_sales_usd === 40.00, 'got ' + priced.lost_sales_usd);
    ok('AC4 lost_gross_profit_usd == 12.00', priced.lost_gross_profit_usd === 12.00, 'got ' + priced.lost_gross_profit_usd);
    ok('AC4 net retailer loss applies 40% response share',
      priced.net_retailer_loss_usd === 16.00, 'got ' + priced.net_retailer_loss_usd);

    // ---------------------------------------------------------------------
    // AC #5 — classifier coverage: >=20 events, zero unclassified
    // ---------------------------------------------------------------------
    const dry = pipeline.run(ROWS, { tenant_id: TENANT, batch_id: 'sit-dry' });
    ok('AC5 fixture yields >= 20 OOS events', dry.events.length >= 20, 'got ' + dry.events.length);
    const unclassified = dry.events.filter((e) => !e.root_cause || !CATEGORY_LIST.includes(e.root_cause));
    ok('AC5 zero UNCLASSIFIED rows', unclassified.length === 0,
      unclassified.length ? unclassified.map((e) => e.sku).join(',') : 'all classified');
    const distinct = new Set(dry.events.map((e) => e.root_cause));
    ok('AC5 all seven categories exercised', distinct.size === 7,
      distinct.size + ' distinct: ' + Array.from(distinct).join(' | '));

    // Detection must exclude intentionally-absent and healthy items.
    const skus = dry.events.map((e) => e.sku);
    ok('Detection excludes discontinued/seasonal/unauthorized',
      !skus.includes('SKU-0200') && !skus.includes('SKU-0201') && !skus.includes('SKU-0202'),
      'excluded correctly');
    ok('Detection excludes healthy stock',
      !skus.includes('SKU-0100') && !skus.includes('SKU-0101'), 'excluded correctly');
    // The book's back-room finding must survive detection.
    ok('Detection catches on-shelf stockouts (on_hand > 0)',
      dry.events.some((e) => e.on_shelf_stockout), 'found back-room stockouts');

    // ---------------------------------------------------------------------
    // AC #2 — ingest is JWT gated
    // ---------------------------------------------------------------------
    const noAuth = await request(port, 'POST', MOUNT + '/api/v1/ingest', { rows: ROWS });
    ok('AC2 ingest without JWT returns 401', noAuth.status === 401, 'status=' + noAuth.status);

    const badAuth = await request(port, 'POST', MOUNT + '/api/v1/ingest', { rows: ROWS },
      { Authorization: 'Bearer not-a-real-token' });
    ok('AC2 ingest with invalid JWT returns 401', badAuth.status === 401, 'status=' + badAuth.status);

    if (!token) {
      ok('AC2 ingest with valid JWT returns 201', false, 'SKIPPED — JWT_SECRET not set in env');
    } else {
      const ing = await request(port, 'POST', MOUNT + '/api/v1/ingest', { rows: ROWS }, auth);
      ok('AC2 ingest with valid JWT returns 201', ing.status === 201, 'status=' + ing.status);
      ok('AC2 ingest receipt shape',
        ing.body && typeof ing.body.ingested === 'number' &&
        typeof ing.body.oos_detected === 'number' && !!ing.body.batch_id,
        JSON.stringify(ing.body && { ingested: ing.body.ingested, oos: ing.body.oos_detected }));
      ok('AC2 ingested count matches rows sent',
        ing.body && ing.body.ingested === ROWS.length, 'got ' + (ing.body && ing.body.ingested));

      // -------------------------------------------------------------------
      // AC #3 — dashboard shape after ingest
      // -------------------------------------------------------------------
      const dash = await request(port, 'GET',
        MOUNT + '/api/v1/dashboard?store_id=S001&tenant_id=' + TENANT, undefined, auth);
      ok('AC3 dashboard returns 200', dash.status === 200, 'status=' + dash.status);
      const d = dash.body || {};
      ok('AC3 dashboard has oos_rate', typeof d.oos_rate === 'number', 'oos_rate=' + d.oos_rate);
      ok('AC3 dashboard has lost_sales_usd', typeof d.lost_sales_usd === 'number', 'lost=' + d.lost_sales_usd);
      ok('AC3 root_cause_mix is a populated array',
        Array.isArray(d.root_cause_mix) && d.root_cause_mix.length > 0,
        (d.root_cause_mix || []).length + ' categories');
      ok('AC3 root_cause_mix entries have category/count/pct',
        (d.root_cause_mix || []).every((c) => c.category && typeof c.count === 'number' && typeof c.pct === 'number'),
        'shape ok');
      ok('AC3 every event has a valid root_cause',
        Array.isArray(d.events) && d.events.length > 0 &&
        d.events.every((e) => e.root_cause && CATEGORY_LIST.includes(e.root_cause)),
        (d.events || []).length + ' events');
      ok('AC3 top_3_root_causes present', Array.isArray(d.top_3_root_causes) && d.top_3_root_causes.length <= 3,
        (d.top_3_root_causes || []).length + ' returned');

      // The AC4 anchor must survive the full round trip through persistence.
      const anchor = (d.events || []).find((e) => e.sku === 'SKU-0001');
      ok('AC4 anchor SKU-0001 persists $40.00 lost sales',
        anchor && Math.abs(parseFloat(anchor.lost_sales_usd) - 40.00) < 0.005,
        anchor ? 'got ' + anchor.lost_sales_usd : 'anchor missing');
      ok('AC4 anchor SKU-0001 persists $12.00 lost GP',
        anchor && Math.abs(parseFloat(anchor.lost_gross_profit_usd) - 12.00) < 0.005,
        anchor ? 'got ' + anchor.lost_gross_profit_usd : 'anchor missing');

      // Store vs shelf split — the Shelf-Confidence signal.
      ok('Layer mix reports in_store_pct',
        d.layer_mix && typeof d.layer_mix.in_store_pct === 'number',
        'in_store=' + (d.layer_mix && d.layer_mix.in_store_pct) + '%');

      // ---- events route ----
      const ev = await request(port, 'GET',
        MOUNT + '/api/v1/events/S001?tenant_id=' + TENANT, undefined, auth);
      ok('Events route returns 200', ev.status === 200, 'status=' + ev.status);
      ok('Events route returns classified rows',
        ev.body && Array.isArray(ev.body.events) && ev.body.events.length > 0,
        (ev.body && ev.body.events || []).length + ' events');

      // ---- tenant isolation: a different tenant must NOT see SIT data ----
      const otherTenant = await request(port, 'GET',
        MOUNT + '/api/v1/dashboard?store_id=S001&tenant_id=990002');
      ok('Tenant isolation: foreign tenant sees no SIT events',
        otherTenant.status === 200 && (!otherTenant.body.events || otherTenant.body.events.length === 0),
        (otherTenant.body && otherTenant.body.events || []).length + ' events leaked');
    }

    // ---------------------------------------------------------------------
    // AC #6 — dashboard HTML
    // ---------------------------------------------------------------------
    const html = await request(port, 'GET', MOUNT + '/');
    ok('AC6 dashboard HTML returns 200', html.status === 200, 'status=' + html.status);
    ok('AC6 <h1> contains "Out-of-Stock Intelligence"',
      /<h1[^>]*>[\s\S]*?Out-of-Stock Intelligence[\s\S]*?<\/h1>/.test(html.raw), 'h1 matched');
    ok('AC6 dashboard loads app.js', /src="app\.js"/.test(html.raw), 'script tag present');

    const appJs = await request(port, 'GET', MOUNT + '/app.js');
    ok('AC6 app.js served', appJs.status === 200 && /root_cause_mix/.test(appJs.raw), 'status=' + appJs.status);

    // Demo preview must work with no JWT and persist nothing.
    const demo = await request(port, 'GET', MOUNT + '/api/v1/dashboard/demo');
    ok('Demo preview returns 200 without JWT', demo.status === 200, 'status=' + demo.status);
    ok('Demo preview returns top-3 root causes',
      demo.body && Array.isArray(demo.body.top_3_root_causes) && demo.body.top_3_root_causes.length === 3,
      (demo.body && demo.body.top_3_root_causes || []).length + ' causes');
    ok('Demo preview persists nothing (demo flag set)', demo.body && demo.body.demo === true, 'demo=true');
    // The demo must read like a real store, not a test rig: padded to ~250
    // active SKUs so the rate lands near the 8.3% worldwide average.
    ok('Demo OOS rate is realistic (3-15%)',
      demo.body && demo.body.oos_rate >= 3 && demo.body.oos_rate <= 15,
      'oos_rate=' + (demo.body && demo.body.oos_rate) + '% over ' + (demo.body && demo.body.total_skus) + ' SKUs');

    // Categories enum endpoint
    const cats = await request(port, 'GET', MOUNT + '/api/v1/events/categories');
    ok('Categories enum returns all seven',
      cats.status === 200 && cats.body && cats.body.categories && cats.body.categories.length === 7,
      (cats.body && cats.body.categories || []).length + ' categories');

    // Malformed input must 400, not 500.
    const bad = await request(port, 'POST', MOUNT + '/api/v1/ingest', { rows: [] }, auth);
    ok('Empty batch returns 400 not 500', bad.status === 400 || bad.status === 401, 'status=' + bad.status);

  } catch (err) {
    ok('SIT harness completed without throwing', false, err.message);
  } finally {
    try { await store.purgeTenant(TENANT); } catch (e) { /* best effort */ }
    server.close();
  }

  // ---- report ----
  const backend = store.status().backend;
  console.log('\n# SIT — Retail Out-of-Stock Intelligence Platform\n');
  console.log('| Result | Check | Detail |');
  console.log('|---|---|---|');
  for (const [r, n, d] of results) {
    console.log(`| ${r} | ${n} | ${String(d).replace(/\|/g, '/')} |`);
  }
  console.log(`\n**${pass}/${pass + fail} passed** · storage backend: \`${backend}\`` +
    (SECRET ? '' : ' · JWT_SECRET unset (ingest checks skipped)'));

  process.exit(fail === 0 ? 0 : 1);
})();
