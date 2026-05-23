'use strict';

const router = require('express').Router();
const service = require('../services/market-profile-service');

/**
 * GET /api/v1/market-profile/:projectId/enrichment
 * Returns 4 deck-aligned blocks + chart datasets for Step 4 Market Profile.
 */
router.get('/:projectId/enrichment', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });

    const data = await service.buildMarketProfileEnrichment({
      projectId,
      models: req.models,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('market-profile enrichment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
