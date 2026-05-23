'use strict';

const router = require('express').Router();
const service = require('../services/performance-tracking-service');

/**
 * GET /api/v1/performance-tracking/:projectId/enrichment
 * Returns 4 deck-aligned blocks for Step 9 Performance Tracking.
 */
router.get('/:projectId/enrichment', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });

    const data = await service.buildPerformanceTrackingEnrichment({
      projectId,
      models: req.models,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('performance-tracking enrichment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
