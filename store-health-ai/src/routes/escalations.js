'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const escalationController = require('../controllers/escalation-controller');

/**
 * Escalation Routes
 */

// GET /api/v1/escalations - Get all escalations (with filters)
router.get('/', asyncHandler(escalationController.getAllEscalations));

// GET /api/v1/escalations/:id - Get escalation by ID
router.get('/:id', asyncHandler(escalationController.getEscalationById));

// POST /api/v1/escalations/:id/acknowledge - Acknowledge escalation
router.post('/:id/acknowledge', asyncHandler(escalationController.acknowledgeEscalation));

// POST /api/v1/escalations/:id/resolve - Resolve escalation
router.post('/:id/resolve', asyncHandler(escalationController.resolveEscalation));

// GET /api/v1/escalations/pending/all - Get pending escalations
router.get('/status/pending', asyncHandler(escalationController.getPendingEscalations));

// POST /api/v1/escalations/monitor - Trigger escalation monitoring
router.post('/monitor', asyncHandler(escalationController.monitorAndEscalate));

module.exports = router;
