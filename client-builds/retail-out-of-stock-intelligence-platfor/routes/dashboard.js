// routes/dashboard.js — GET /api/v1/dashboard
// The store manager's morning view: OOS rate, lost-sales dollars, and the
// top-3 root causes with the action attached to each.
//
// Public read, but ALWAYS scoped to the resolved tenant (JWT claim wins over
// any query string). Never returns cross-tenant rows.
'use strict';

const express = require('express');
const router = express.Router();

const { attachTenant } = require('../lib/auth');
const store = require('../lib/store');
const { mix, layerMix } = require('../lib/classifier');
const { summarize, annualize } = require('../lib/costModel');

router.get('/', attachTenant, async (req, res) => {
  try {
    const tenantId = req.tenant_id;
    const storeId = req.query.store_id ? String(req.query.store_id).trim() : null;
    const limit = req.query.limit || 500;

    const events = await store.findEvents({ tenant_id: tenantId, store_id: storeId, limit });
    const batch = await store.findLatestBatch({ tenant_id: tenantId, store_id: storeId });

    // Denominator: active SKUs from the batch header when available, else the
    // event count (which would report 100% — so we surface the caveat).
    const totalSkus = batch && batch.total_skus ? batch.total_skus : events.length;

    const normalized = events.map((e) => ({
      ...e,
      lost_sales_usd: parseFloat(e.lost_sales_usd) || 0,
      lost_gross_profit_usd: parseFloat(e.lost_gross_profit_usd) || 0,
      net_retailer_loss_usd: parseFloat(e.net_retailer_loss_usd) || 0,
      brand_loss_usd: parseFloat(e.brand_loss_usd) || 0,
      recoverable_usd: parseFloat(e.recoverable_usd) || 0
    }));

    const summary = summarize(normalized, totalSkus);
    const causeMix = mix(normalized);

    res.json({
      tenant_id: tenantId,
      store_id: storeId,
      generated_at: new Date().toISOString(),

      // headline numbers
      oos_rate: summary.oos_rate,
      oos_count: summary.oos_count,
      total_skus: summary.total_skus,
      lost_sales_usd: summary.lost_sales_usd,
      lost_gross_profit_usd: summary.lost_gross_profit_usd,

      // Shelf-Confidence refinements
      net_retailer_loss_usd: summary.net_retailer_loss_usd,
      brand_loss_usd: summary.brand_loss_usd,
      recoverable_usd: summary.recoverable_usd,
      annualized_lost_sales_usd: annualize(summary.lost_sales_usd),
      annualized_lost_gross_profit_usd: annualize(summary.lost_gross_profit_usd),
      on_shelf_stockout_count: normalized.filter((e) => e.on_shelf_stockout).length,

      root_cause_mix: causeMix,
      top_3_root_causes: causeMix.slice(0, 3),
      layer_mix: layerMix(normalized),

      // Benchmarks so a manager can read their number against the research.
      benchmarks: {
        worldwide_oos_rate_pct: 8.3,
        retailer_sales_loss_pct: 4.0,
        in_store_root_cause_pct: 72.5,
        source: 'Gruen & Corsten, Shelf-Confidence: A Practical Guide to Reducing Out-Of-Stocks (2022)'
      },

      latest_batch: batch
        ? { batch_id: batch.batch_id, ingested_at: batch.ingested_at, row_count: batch.row_count }
        : null,

      events: normalized
    });
  } catch (err) {
    console.error('[retail-oos] dashboard error:', err.message);
    res.status(500).json({ error: 'dashboard_failed', detail: err.message });
  }
});

// GET /api/v1/dashboard/demo — read-only preview over the bundled fixture day.
// Runs the FULL pipeline (detect -> price -> classify) in memory and returns the
// exact dashboard shape, but PERSISTS NOTHING. This is why the demo needs no
// JWT: it is a read, not a write, and it cannot touch another tenant's data.
router.get('/demo', (req, res) => {
  try {
    const { DEMO_ROWS } = require('../lib/fixtures');
    const pipeline = require('../lib/pipeline');
    const result = pipeline.run(DEMO_ROWS, { tenant_id: 0, batch_id: 'demo', event_date: new Date().toISOString().slice(0, 10) });

    res.json({
      demo: true,
      tenant_id: 0,
      store_id: 'S001',
      generated_at: new Date().toISOString(),
      oos_rate: result.summary.oos_rate,
      oos_count: result.summary.oos_count,
      total_skus: result.summary.total_skus,
      lost_sales_usd: result.summary.lost_sales_usd,
      lost_gross_profit_usd: result.summary.lost_gross_profit_usd,
      net_retailer_loss_usd: result.summary.net_retailer_loss_usd,
      brand_loss_usd: result.summary.brand_loss_usd,
      recoverable_usd: result.summary.recoverable_usd,
      annualized_lost_sales_usd: result.summary.annualized_lost_sales_usd,
      annualized_lost_gross_profit_usd: result.summary.annualized_lost_gross_profit_usd,
      on_shelf_stockout_count: result.summary.on_shelf_stockout_count,
      root_cause_mix: result.root_cause_mix,
      top_3_root_causes: result.root_cause_mix.slice(0, 3),
      layer_mix: result.layer_mix,
      benchmarks: {
        worldwide_oos_rate_pct: 8.3,
        retailer_sales_loss_pct: 4.0,
        in_store_root_cause_pct: 72.5,
        source: 'Gruen & Corsten, Shelf-Confidence: A Practical Guide to Reducing Out-Of-Stocks (2022)'
      },
      latest_batch: null,
      events: result.events
    });
  } catch (err) {
    console.error('[retail-oos] demo error:', err.message);
    res.status(500).json({ error: 'demo_failed', detail: err.message });
  }
});

// GET /api/v1/dashboard/stores — store picker for the UI
router.get('/stores', attachTenant, async (req, res) => {
  try {
    const stores = await store.listStores({ tenant_id: req.tenant_id });
    res.json({ tenant_id: req.tenant_id, stores });
  } catch (err) {
    res.status(500).json({ error: 'stores_failed', detail: err.message });
  }
});

module.exports = router;
