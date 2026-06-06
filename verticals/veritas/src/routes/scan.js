'use strict';

const express = require('express');
const router = express.Router();
const { Asset, Detection } = require('../models');
const detection = require('../services/detection');

function tenantId(req) {
  return parseInt(req.query.tenant_id || req.body.tenant_id || 1, 10);
}

// What Veritas monitors. Configurable, defaults to the candidate.
const SCAN_QUERY = process.env.VERITAS_SCAN_QUERY || 'Abelardo de la Espriella';
const MAX_MEDIA_PER_SCAN = parseInt(process.env.VERITAS_SCAN_MAX || '10', 10);

// Web image search via Google Custom Search (reliable; free tier 100/day).
// Returns absolute image URLs for the query. Requires VERITAS_SEARCH_API_KEY + _CX.
async function searchImages(query, count) {
  const key = process.env.VERITAS_SEARCH_API_KEY;
  const cx = process.env.VERITAS_SEARCH_CX;
  if (!key || !cx) return { configured: false, urls: [] };
  const u = 'https://www.googleapis.com/customsearch/v1?searchType=image&num=' +
    Math.min(count, 10) + '&key=' + encodeURIComponent(key) + '&cx=' + encodeURIComponent(cx) +
    '&q=' + encodeURIComponent(query);
  const r = await fetch(u);
  if (!r.ok) throw new Error('search HTTP ' + r.status);
  const j = await r.json();
  const urls = (j.items || []).map(it => it.link).filter(Boolean);
  return { configured: true, urls };
}

// POST /api/v1/scan/now — one-click: search the web for the candidate's images,
// run each through the detection engine, surface any deepfakes.
router.post('/now', async (req, res) => {
  try {
    const tid = tenantId(req);
    const query = (req.body && req.body.query) || SCAN_QUERY;

    let search;
    try {
      search = await searchImages(query, MAX_MEDIA_PER_SCAN);
    } catch (e) {
      return res.status(502).json({ error: 'Búsqueda web falló: ' + e.message });
    }
    if (!search.configured) {
      return res.json({
        success: true,
        data: {
          configured: false, query, provider: detection.activeProvider(),
          message: 'Búsqueda web no configurada. Define VERITAS_SEARCH_API_KEY y VERITAS_SEARCH_CX (Google Custom Search) para activar el monitoreo automático.'
        }
      });
    }

    let scanned = 0, deepfake = 0, suspect = 0, clean = 0, skipped = 0;
    const items = [];
    for (const url of search.urls) {
      const existing = await Asset.findOne({ where: { tenant_id: tid, source_url: url } });
      if (existing) { skipped++; continue; }

      let result;
      try { result = await detection.detect({ mediaUrl: url, mediaType: 'image' }); }
      catch (e) { skipped++; continue; }

      const asset = await Asset.create({
        tenant_id: tid, source_platform: 'web', source_url: url, media_type: 'image',
        raw_meta: { web_scan: true, query }
      });
      await Detection.create({
        tenant_id: tid, asset_id: asset.id, provider: result.provider,
        provider_score: result.rawScore, confidence: result.confidence, verdict: result.verdict,
        targeted_person: query,
        deepfakes_impact: result.verdict === 'clean'
          ? 'Sin manipulación detectada.'
          : `Posible ${result.verdict} hallado en la web (${result.confidence}%).`,
        evidence: result.evidence
      });
      scanned++;
      if (result.verdict === 'deepfake') deepfake++;
      else if (result.verdict === 'suspect') suspect++;
      else clean++;
      items.push({ url, verdict: result.verdict, confidence: result.confidence });
    }

    res.json({
      success: true,
      data: { configured: true, query, provider: detection.activeProvider(),
              found: search.urls.length, scanned, skipped, deepfake, suspect, clean, items }
    });
  } catch (e) {
    console.error('Veritas scan/now error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

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
