'use strict';

const router = require('express').Router();
const service = require('../services/clinical-overlay-service');

/**
 * GET /api/v1/clinical-overlay/:projectId/enrichment?conversion_pct=15
 * Returns 4 deck-aligned blocks for Step 6 Clinical Benefit Overlay (THE MOAT).
 * Default conversion = 15% of OPEN volume only (laparoscopic NEVER counted).
 */
router.get('/:projectId/enrichment', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    if (!projectId) return res.status(400).json({ error: 'Invalid projectId' });

    const conversionPct = parseInt(req.query.conversion_pct || 15);

    const data = await service.buildClinicalOverlayEnrichment({
      projectId,
      models: req.models,
      conversionPct,
    });
    res.json({ success: true, data });
  } catch (err) {
    console.error('clinical-overlay enrichment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
