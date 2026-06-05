'use strict';

/**
 * Veritas — inbound candidate webhook.
 *
 * Lets external scanners / n8n / browser extensions / PLC-style agents push a
 * piece of media for analysis. Mirrors the OEE webhook auth pattern: validates
 * api_key against VERITAS_WEBHOOK_API_KEY. When the env var is unset, auth is
 * skipped (dev/demo) so the endpoint still works out of the box.
 *
 *   POST /api/v1/webhooks/candidate
 *   Body: { tenant_id, monitor_id?, platform, url, media_type, targeted_person?, api_key }
 */

const express = require('express');
const router = express.Router();
const { Asset, Detection } = require('../models');
const detection = require('../services/detection');

router.post('/candidate', async (req, res) => {
  try {
    const expected = process.env.VERITAS_WEBHOOK_API_KEY;
    if (expected && req.body.api_key !== expected) {
      return res.status(401).json({ error: 'invalid api_key' });
    }

    const { tenant_id, monitor_id, platform, url, media_type, targeted_person } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const tid = parseInt(tenant_id || 1, 10);
    const mediaType = media_type || 'video';

    // Dedupe on source_url within tenant
    let asset = await Asset.findOne({ where: { tenant_id: tid, source_url: url } });
    if (!asset) {
      asset = await Asset.create({
        tenant_id: tid,
        monitor_id: monitor_id || null,
        source_platform: platform || 'web',
        source_url: url,
        media_type: mediaType,
        raw_meta: { via: 'webhook' }
      });
    }

    const result = await detection.detect({ mediaUrl: url, mediaType });
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
        : `Webhook candidate flagged ${result.verdict} (${result.confidence}%).`,
      evidence: { ...result.evidence, ingest: 'webhook' }
    });

    res.status(201).json({
      success: true,
      data: { detection_id: det.id, asset_id: asset.id, verdict: result.verdict, confidence: result.confidence, provider: result.provider }
    });
  } catch (e) {
    console.error('Veritas webhook error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
