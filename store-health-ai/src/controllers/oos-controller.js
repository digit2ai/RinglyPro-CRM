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
  const result = await oosIntelligence.analyzeChain(orgId, req.query.date);

  res.json({
    success: true,
    data: { ...result, osa_score: oosIntelligence.osaScore(result.oos_rate) }
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
