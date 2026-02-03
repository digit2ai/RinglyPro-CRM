'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const dashboardController = require('../controllers/dashboard-controller');

/**
 * Dashboard Routes
 */

// GET /api/v1/dashboard/overview - Get dashboard overview
router.get('/overview', asyncHandler(dashboardController.getOverview));

// GET /api/v1/dashboard/stores-requiring-action - Get stores needing attention
router.get('/stores-requiring-action', asyncHandler(dashboardController.getStoresRequiringAction));

// GET /api/v1/dashboard/critical-stores - Get critical stores
router.get('/critical-stores', asyncHandler(dashboardController.getCriticalStores));

// GET /api/v1/dashboard/kpi-trends - Get KPI trends
router.get('/kpi-trends', asyncHandler(dashboardController.getKpiTrends));

// GET /api/v1/dashboard/top-issues - Get top issues across all stores
router.get('/top-issues', asyncHandler(dashboardController.getTopIssues));

module.exports = router;
