// =====================================================
// routes/calculate.js — POST /api/v1/calculate
//
// Public and stateless. Persists nothing, requires nothing, and returns
// everything the five tabs need to render. This is the endpoint the whole
// product hangs off; if persistence, auth and export all fell over, the app
// would still be the thing Greg came for.
//
// The response carries the model output AND its provenance AND its
// reconciliation against a public anchor, together, because a projection
// separated from the quality of its inputs is how the teaser simulator ended up
// asserting a market larger than the vendor it proposed to renegotiate against.
// =====================================================

'use strict';

const express = require('express');
const model = require('../lib/model');
const benchmarks = require('../lib/benchmarks');

const MAX_BODY_KEYS = 24;

function buildPayload(rawInputs) {
  const result = model.project(rawInputs);
  const inputs = result.inputs;

  const sens = model.sensitivity(inputs);

  return {
    model_version: result.model_version,
    inputs,
    tam_usd: result.tam_usd,
    perTier: result.perTier,
    perYear: result.perYear,
    cumulative: result.cumulative,
    unit_economics: result.unit_economics,
    capacity: result.capacity,
    capacity_exceeded: result.capacity_exceeded,
    netContribution: result.netContribution,
    pipeline: model.pipeline(inputs.named_accounts, inputs.market),
    reconciliation: model.reconcile(result, benchmarks.ANCHORS),
    sensitivity: sens,
    what_has_to_be_true: model.whatHasToBeTrue(sens, result),
    provenance: benchmarks.provenanceFor(inputs),
  };
}

function calculateRoutes() {
  const router = express.Router();

  router.post('/api/v1/calculate', (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      if (Object.keys(body).length > MAX_BODY_KEYS) {
        return res.status(400).json({ success: false, error: 'Unexpected input shape' });
      }
      const payload = buildPayload(body.inputs || body);
      return res.json({ success: true, ...payload });
    } catch (err) {
      console.error('[srcaf] calculate error:', err.message);
      return res.status(400).json({ success: false, error: 'Could not compute a projection from those inputs' });
    }
  });

  // Convenience for the UI boot and for anyone curling the defaults.
  router.get('/api/v1/calculate', (_req, res) => {
    try {
      return res.json({ success: true, ...buildPayload({}) });
    } catch (err) {
      console.error('[srcaf] calculate(default) error:', err.message);
      return res.status(500).json({ success: false, error: 'Model failed on default inputs' });
    }
  });

  return router;
}

module.exports = calculateRoutes;
module.exports.buildPayload = buildPayload;
