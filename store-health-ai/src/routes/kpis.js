'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const kpiController = require('../controllers/kpi-controller');

/**
 * KPI Routes
 */

// POST /api/v1/kpis/calculate - Calculate and store KPI
router.post('/calculate', asyncHandler(kpiController.calculateKpi));

// POST /api/v1/kpis/batch-calculate - Batch calculate KPIs
router.post('/batch-calculate', asyncHandler(kpiController.batchCalculateKpis));

// GET /api/v1/kpis/definitions - Get all KPI definitions
router.get('/definitions', asyncHandler(kpiController.getKpiDefinitions));

// GET /api/v1/kpis/thresholds - Get KPI thresholds
router.get('/thresholds', asyncHandler(kpiController.getKpiThresholds));

// GET /api/v1/kpis/metrics - Get KPI metrics (with filters)
router.get('/metrics', asyncHandler(kpiController.getKpiMetrics));

module.exports = router;
