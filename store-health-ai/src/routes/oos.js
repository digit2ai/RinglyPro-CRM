'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const oosController = require('../controllers/oos-controller');

/**
 * OOS Intelligence Routes — on-shelf availability, priced and root-caused.
 * Mounted at /aiastore/api/v1/oos
 */

// GET /api/v1/oos/benchmarks - published research figures
router.get('/benchmarks', oosController.getBenchmarks);

// GET /api/v1/oos/categories - the seven root causes + layer + action
router.get('/categories', asyncHandler(oosController.getCategories));

// GET /api/v1/oos/stores - store directory + hierarchy for the drill-down picker
router.get('/stores', asyncHandler(oosController.getStores));

// GET /api/v1/oos/chain/demo - read-only generated preview, persists nothing.
// Registered before /chain so the literal path is not shadowed.
router.get('/chain/demo', asyncHandler(oosController.getChainDemo));

// GET /api/v1/oos/chain - chain rollup + store league table
router.get('/chain', asyncHandler(oosController.getChain));

// POST /api/v1/oos/backfill - classify + price unattributed events
router.post('/backfill', asyncHandler(oosController.backfill));

// POST /api/v1/oos/seed-demo - JWT-gated deterministic demo day
router.post('/seed-demo', asyncHandler(oosController.seedDemo));

// GET /api/v1/oos/store/:store_id - one store, one day
// Registered last so it cannot shadow the literal paths above.
router.get('/store/:store_id', asyncHandler(oosController.getStore));

module.exports = router;
