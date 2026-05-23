'use strict';

const router = require('express').Router();
const service = require('../services/business-plan-service');

/**
 * GET /api/v1/business-plan-enrichment/:projectId/enrichment
 * Returns 4 deck-aligned blocks for Step 8 Business Plan.
 */
router.get('/:projectId/enrichment', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });

    const data = await service.buildBusinessPlanEnrichment({
      projectId,
      models: req.models,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('business-plan enrichment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
