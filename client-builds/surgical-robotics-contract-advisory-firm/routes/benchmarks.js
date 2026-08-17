// =====================================================
// routes/benchmarks.js — GET /api/v1/benchmarks
//
// The static half of the UI boot: default inputs, the provenance registry, the
// per-system spend components, the reconciliation anchors, and the Watchouts
// content. Public, cacheable, no auth.
//
// This endpoint is why `public/index.html` can carry no numbers at all. Every
// label, every default, every source string arrives from here.
// =====================================================

'use strict';

const express = require('express');
const benchmarks = require('../lib/benchmarks');
const watchouts = require('../lib/watchouts');
const model = require('../lib/model');

function benchmarkRoutes() {
  const router = express.Router();

  router.get('/api/v1/benchmarks', (_req, res) => {
    const defaults = benchmarks.defaults();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({
      success: true,
      model_version: model.MODEL_VERSION,
      years: model.YEARS,
      defaults,
      provenance: benchmarks.provenanceFor(defaults),
      spend_components: benchmarks.SPEND_COMPONENTS,
      anchors: benchmarks.ANCHORS,
      drivers: model.DRIVERS,
      watchouts: watchouts.all(),
      scenario_presets: [
        { key: 'low', label: 'Low', savings_capture_pct: 0.05, fee_pct: 0.10, note: 'Conservative' },
        { key: 'base', label: 'Base', savings_capture_pct: 0.12, fee_pct: 0.15, note: 'Most likely' },
        { key: 'high', label: 'High', savings_capture_pct: 0.18, fee_pct: 0.20, note: 'Upside' },
      ],
    });
  });

  router.get('/api/v1/watchouts', (_req, res) => {
    res.json({ success: true, ...watchouts.all() });
  });

  return router;
}

module.exports = benchmarkRoutes;
