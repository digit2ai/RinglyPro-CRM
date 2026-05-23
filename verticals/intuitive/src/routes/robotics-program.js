'use strict';

const router = require('express').Router();
const service = require('../services/robotics-program-service');

/**
 * GET /api/v1/robotics-program/:projectId/enrichment
 * Returns 4 deck-aligned chart datasets for Step 3:
 *   - system_utilization (Deck 1 p6 / Deck 3 p3)
 *   - modality_by_year (Deck 1 p8)
 *   - modality_by_procedure (Deck 1 p9)
 *   - tech_generation_mix (Deck 2 p15)
 */
router.get('/:projectId/enrichment', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });

    const data = await service.buildRoboticsProgramEnrichment({
      projectId,
      models: req.models,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('robotics-program enrichment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
