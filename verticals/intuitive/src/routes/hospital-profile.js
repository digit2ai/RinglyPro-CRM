'use strict';

const router = require('express').Router();
const service = require('../services/hospital-profile-service');

/**
 * GET /api/v1/hospital-profile/:projectId/enrichment
 * Returns the 4 deck-aligned additions for the Step 1 Hospital Profile page:
 *   - strategic_impact (Deck p3)
 *   - capital_snapshot (Deck p2)
 *   - peer_benchmark (Deck p34)
 *   - research_profile (Deck p20-23 via PubMed)
 */
router.get('/:projectId/enrichment', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });

    const data = await service.buildHospitalProfileEnrichment({
      projectId,
      models: req.models,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('hospital-profile enrichment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
