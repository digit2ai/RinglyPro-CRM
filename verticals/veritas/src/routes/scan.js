'use strict';

const express = require('express');
const router = express.Router();
const { Asset, Detection } = require('../models');
const detection = require('../services/detection');

function tenantId(req) {
  return parseInt(req.query.tenant_id || req.body.tenant_id || 1, 10);
}

// POST /api/v1/scan  — "Who should we check?" on-demand single-asset scan
// Body: { url, media_type (image|video|audio), targeted_person?, platform? }
router.post('/', async (req, res) => {
  try {
    const { url, media_type, targeted_person, platform } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const tid = tenantId(req);
    const mediaType = media_type || 'video';

    const result = await detection.detect({ mediaUrl: url, mediaType });

    const asset = await Asset.create({
      tenant_id: tid,
      source_platform: platform || 'web',
      source_url: url,
      media_type: mediaType,
      raw_meta: { on_demand: true }
    });

    const det = await Detection.create({
      tenant_id: tid,
      asset_id: asset.id,
      provider: result.provider,
      provider_score: result.rawScore,
      confidence: result.confidence,
      verdict: result.verdict,
      targeted_person: targeted_person || null,
      deepfakes_impact: result.verdict === 'clean'
        ? 'No manipulation detected.'
        : `Detected ${result.verdict} (${result.confidence}% confidence).`,
      evidence: result.evidence
    });

    res.status(201).json({
      success: true,
      data: {
        detection_id: det.id,
        verdict: result.verdict,
        confidence: result.confidence,
        provider: result.provider,
        evidence: result.evidence
      }
    });
  } catch (e) {
    console.error('Veritas scan error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
