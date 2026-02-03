'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const storeController = require('../controllers/store-controller');

/**
 * Store Routes
 */

// GET /api/v1/stores - Get all stores
router.get('/', asyncHandler(storeController.getAllStores));

// GET /api/v1/stores/:id - Get store by ID
router.get('/:id', asyncHandler(storeController.getStoreById));

// GET /api/v1/stores/:id/health - Get store health status
router.get('/:id/health', asyncHandler(storeController.getStoreHealth));

// GET /api/v1/stores/:id/health/history - Get health history
router.get('/:id/health/history', asyncHandler(storeController.getHealthHistory));

// GET /api/v1/stores/:id/kpis - Get current KPIs for store
router.get('/:id/kpis', asyncHandler(storeController.getStoreKpis));

// GET /api/v1/stores/:id/kpis/history - Get KPI history
router.get('/:id/kpis/history', asyncHandler(storeController.getKpiHistory));

// GET /api/v1/stores/:id/alerts - Get alerts for store
router.get('/:id/alerts', asyncHandler(storeController.getStoreAlerts));

// GET /api/v1/stores/:id/tasks - Get tasks for store
router.get('/:id/tasks', asyncHandler(storeController.getStoreTasks));

// GET /api/v1/stores/:id/escalations - Get escalations for store
router.get('/:id/escalations', asyncHandler(storeController.getStoreEscalations));

// GET /api/v1/stores/:id/ai-calls - Get AI call history
router.get('/:id/ai-calls', asyncHandler(storeController.getAiCallHistory));

module.exports = router;
