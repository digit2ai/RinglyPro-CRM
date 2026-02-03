'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const alertController = require('../controllers/alert-controller');

/**
 * Alert Routes
 */

// GET /api/v1/alerts - Get all alerts (with filters)
router.get('/', asyncHandler(alertController.getAllAlerts));

// GET /api/v1/alerts/:id - Get alert by ID
router.get('/:id', asyncHandler(alertController.getAlertById));

// POST /api/v1/alerts/:id/acknowledge - Acknowledge an alert
router.post('/:id/acknowledge', asyncHandler(alertController.acknowledgeAlert));

// POST /api/v1/alerts/:id/resolve - Resolve an alert
router.post('/:id/resolve', asyncHandler(alertController.resolveAlert));

// GET /api/v1/alerts/overdue - Get overdue alerts
router.get('/status/overdue', asyncHandler(alertController.getOverdueAlerts));

module.exports = router;
