'use strict';

const router = require('express').Router();
const service = require('../services/surgeon-profile-service');

/**
 * GET /api/v1/surgeon-profile/:projectId/enrichment
 * Returns 4 deck-aligned additions for Step 2 Surgeon Profile:
 *   - training_pipeline (Deck p11)
 *   - csr_intel (Deck p12, p18)
 *   - kol_signals (composite ranking)
 *   - payment_leaders (CMS Open Payments from Intuitive)
 */
router.get('/:projectId/enrichment', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });

    const data = await service.buildSurgeonProfileEnrichment({
      projectId,
      models: req.models,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('surgeon-profile enrichment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
