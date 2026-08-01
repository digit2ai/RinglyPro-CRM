'use strict';

const oosIntelligence = require('../services/oos-intelligence');

/**
 * OOS Intelligence Controller
 *
 * On-shelf availability, priced and root-caused. Wraps
 * src/services/oos-intelligence.js, which imports the shared four-step pipeline
 * so a number here can never disagree with the standalone platform.
 */

function guard(res) {
  if (oosIntelligence.available()) return false;
  res.status(503).json({
    success: false,
    error: 'OOS intelligence unavailable',
    detail: oosIntelligence.libError()
  });
  return true;
}

/**
 * GET /api/v1/oos/store/:store_id?date=YYYY-MM-DD
 * One store, one day: OOS rate, lost dollars, root-cause mix, ranked worklist.
 */
exports.getStore = async (req, res) => {
  if (guard(res)) return;

  const storeId = parseInt(req.params.store_id, 10);
  if (!storeId) {
    return res.status(400).json({ success: false, error: 'valid store_id required' });
  }

  const result = await oosIntelligence.analyzeStore(storeId, req.query.date);
  if (!result) {
    return res.status(404).json({
      success: false,
      error: 'no inventory snapshot for that store and date',
      store_id: storeId,
      date: req.query.date || 'today'
    });
  }

  res.json({
    success: true,
    data: { ...result, osa_score: oosIntelligence.osaScore(result.oos_rate) }
  });
};

/**
 * GET /api/v1/oos/chain?organization_id=&date=
 * Chain rollup + the store league table ranked by dollars lost.
 */
exports.getChain = async (req, res) => {
  if (guard(res)) return;

  const orgId = req.query.organization_id ? parseInt(req.query.organization_id, 10) : null;
  const result = await oosIntelligence.analyzeChain(orgId, req.query.date, {
    country: req.query.country,
    region_id: req.query.region_id,
    district_id: req.query.district_id
  });

  res.json({
    success: true,
    data: { ...result, osa_score: oosIntelligence.osaScore(result.oos_rate) }
  });
};

/**
 * GET /api/v1/oos/stores
 * Store directory for the drill-down picker: identity + hierarchy + currency.
 * Cheap — no analysis, just the list needed to populate filters and navigation.
 */
exports.getStores = async (req, res) => {
  const { Store, Region, District } = require('../../models');

  const where = { status: 'active' };
  if (req.query.organization_id) where.organization_id = parseInt(req.query.organization_id, 10);
  if (req.query.country) where.country = String(req.query.country).toUpperCase();

  const stores = await Store.findAll({
    where,
    attributes: ['id', 'store_code', 'name', 'city', 'state', 'country', 'currency',
      'timezone', 'manager_name', 'region_id', 'district_id'],
    order: [['store_code', 'ASC']],
    raw: true
  });

  // Region/district names make the filter chips readable; ids alone are useless
  // to a human. Missing tables must not break the picker.
  let regions = [], districts = [];
  try { regions = await Region.findAll({ attributes: ['id', 'name'], raw: true }); } catch (e) { /* optional */ }
  try { districts = await District.findAll({ attributes: ['id', 'name', 'region_id'], raw: true }); } catch (e) { /* optional */ }

  const countries = Array.from(new Set(stores.map((s) => s.country || 'US'))).sort();
  const currencies = Array.from(new Set(stores.map((s) => s.currency || 'USD'))).sort();

  res.json({
    success: true,
    data: {
      stores,
      countries,
      currencies,
      regions,
      districts,
      reporting_currency: oosIntelligence.available()
        ? require('../../../client-builds/retail-out-of-stock-intelligence-platfor/lib/currency').reportingCurrency()
        : 'USD'
    }
  });
};

/**
 * POST /api/v1/oos/backfill
 * Classify + price existing out_of_stock_events rows that have no root cause.
 * Only fills null columns — a human correction is never overwritten.
 */
exports.backfill = async (req, res) => {
  if (guard(res)) return;

  const { store_id, date, limit } = req.body || {};
  const result = await oosIntelligence.backfillEvents(
    store_id ? parseInt(store_id, 10) : null, date, limit
  );

  res.json({ success: true, data: result });
};

/**
 * GET /api/v1/oos/chain/demo
 *
 * Read-only chain preview over the REAL store list with a generated inventory
 * day. Runs the full pipeline in memory and PERSISTS NOTHING, which is why it
 * needs no JWT — it is a read, and it cannot touch any tenant's data.
 *
 * Exists so the OOS surface is demonstrable before any real POS feed is wired.
 * Clearly flagged `demo:true`; the moment real inventory rows land for a date,
 * use /chain instead.
 */
exports.getChainDemo = async (req, res) => {
  if (guard(res)) return;

  const { Store } = require('../../models');
  const { buildStoreDay } = require('../services/oos-demo-seed');
  const base = '../../../client-builds/retail-out-of-stock-intelligence-platfor/lib/';
  const pipeline = require(base + 'pipeline');
  const classifier = require(base + 'classifier');
  const costModel = require(base + 'costModel');

  const currency = require(base + 'currency');
  const reporting = currency.reportingCurrency();

  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const where = { status: 'active' };
  if (req.query.country) where.country = String(req.query.country).toUpperCase();
  const stores = await Store.findAll({ where, raw: true });

  if (!stores.length) {
    return res.status(404).json({ success: false, error: 'no active stores to preview' });
  }

  const perStore = [];
  const allEvents = [];
  let totalSkus = 0;

  for (const s of stores) {
    // Same generator the seeder uses, mapped through the same row shape — the
    // preview and a real seeded day are identical numbers by construction.
    const rows = buildStoreDay(s, date).map((r) => ({
      ...(r.metadata || {}),
      store_id: String(r.store_id),
      sku: r.sku,
      product_name: r.product_name,
      category: r.category,
      on_hand: r.quantity_on_hand,
      avg_velocity: parseFloat(r.average_daily_sales) || 0,
      unit_price: (r.metadata && r.metadata.unit_price) || 4.5,
      margin: (r.metadata && r.metadata.margin) || 0.3,
      status: 'active'
    }));

    const result = pipeline.run(rows, { tenant_id: s.id, event_date: date });
    allEvents.push(...result.events);
    totalSkus += result.total_skus;

    // Same currency normalization the real chain path uses, so the preview and
    // a seeded day are the same numbers by construction.
    const localCcy = (s.currency || 'USD').toUpperCase();
    const norm = currency.normalize({
      lost_sales: result.summary.lost_sales_usd,
      lost_gross_profit: result.summary.lost_gross_profit_usd
    }, localCcy, reporting);

    perStore.push({
      store_id: s.id, store_code: s.store_code, name: s.name,
      city: s.city, state: s.state,
      country: s.country || 'US',
      currency: localCcy,
      region_id: s.region_id, district_id: s.district_id,
      oos_rate: result.summary.oos_rate,
      oos_count: result.summary.oos_count,
      total_skus: result.summary.total_skus,
      lost_sales_usd: norm.values.lost_sales !== null ? norm.values.lost_sales : result.summary.lost_sales_usd,
      lost_gross_profit_usd: norm.values.lost_gross_profit !== null ? norm.values.lost_gross_profit : result.summary.lost_gross_profit_usd,
      native: {
        currency: localCcy,
        lost_sales: result.summary.lost_sales_usd,
        lost_gross_profit: result.summary.lost_gross_profit_usd
      },
      fx_rate: norm.fx_rate,
      fx_converted: norm.converted,
      in_store_pct: result.layer_mix.in_store_pct,
      osa_score: oosIntelligence.osaScore(result.summary.oos_rate),
      top_root_cause: result.root_cause_mix[0] ? result.root_cause_mix[0].category : null
    });
  }

  const lostSales = costModel.money(perStore.reduce((a, s) => a + s.lost_sales_usd, 0));
  const lostGp = costModel.money(perStore.reduce((a, s) => a + s.lost_gross_profit_usd, 0));

  res.json({
    success: true,
    data: {
      demo: true,
      note: 'Generated preview over the real store list. Nothing is persisted. Use /chain once a real POS feed has been ingested.',
      snapshot_date: date,
      store_count: perStore.length,
      oos_count: allEvents.length,
      total_skus: totalSkus,
      oos_rate: totalSkus ? costModel.money((allEvents.length / totalSkus) * 100) : 0,
      lost_sales_usd: lostSales,
      lost_gross_profit_usd: lostGp,
      annualized_lost_sales_usd: costModel.annualize(lostSales),
      annualized_lost_gross_profit_usd: costModel.annualize(lostGp),

      reporting_currency: reporting,
      currencies_present: Array.from(new Set(perStore.map((s) => s.currency))).sort(),
      fx_source: 'configured',
      fx_note: 'Store figures are normalized to the reporting currency at configured rates, not live market rates.',

      root_cause_mix: classifier.mix(allEvents),
      layer_mix: classifier.layerMix(allEvents),

      by_country: oosIntelligence.rollup(perStore, 'country', reporting),
      by_region: oosIntelligence.rollup(perStore, 'region_id', reporting),
      by_district: oosIntelligence.rollup(perStore, 'district_id', reporting),

      stores_by_impact: perStore.slice().sort((a, b) => b.lost_sales_usd - a.lost_sales_usd),
      osa_score: oosIntelligence.osaScore(totalSkus ? (allEvents.length / totalSkus) * 100 : 0),
      benchmarks: oosIntelligence.BENCHMARKS
    }
  });
};

/**
 * POST /api/v1/oos/seed-demo
 *
 * Lays down one deterministic, idempotent demo inventory day across every
 * active store. JWT-gated: it writes thousands of rows, so it must never be
 * callable anonymously.
 *
 * This endpoint exists because the local .env DATABASE_URL and the production
 * DATABASE_URL are different databases — running the CLI seeder on a laptop
 * populates dev, not prod.
 */
exports.seedDemo = async (req, res) => {
  if (guard(res)) return;

  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || '';
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;

  if (!token || !secret) {
    return res.status(401).json({ success: false, error: 'Bearer token required' });
  }
  try {
    jwt.verify(token, secret);
  } catch (e) {
    return res.status(401).json({ success: false, error: 'invalid or expired token' });
  }

  const { seedDemoDay } = require('../services/oos-demo-seed');
  const body = req.body || {};
  const result = await seedDemoDay(body.date, {
    international: body.international === true,
    organization_id: body.organization_id
  });
  res.json({ success: true, data: result });
};

/**
 * GET /api/v1/oos/benchmarks
 * The published figures every number on this surface is measured against.
 */
exports.getBenchmarks = (req, res) => {
  res.json({ success: true, data: oosIntelligence.BENCHMARKS });
};

/**
 * GET /api/v1/oos/categories
 * The seven root-cause categories with their operational layer and action.
 */
exports.getCategories = (req, res) => {
  if (guard(res)) return;

  const base = '../../../client-builds/retail-out-of-stock-intelligence-platfor/lib/classifier';
  const { CATEGORY_LIST, CATEGORY_LAYER, CATEGORY_ACTION } = require(base);

  res.json({
    success: true,
    data: CATEGORY_LIST.map((c) => ({
      category: c,
      layer: CATEGORY_LAYER[c],
      action: CATEGORY_ACTION[c]
    }))
  });
};
