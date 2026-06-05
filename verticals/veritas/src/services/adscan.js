'use strict';

/**
 * Veritas — Ad / platform scanning.
 *
 * Phase 2 scaffold: runs a monitor against its platforms, producing assets and
 * detections. The candidate-fetch step is STUBBED (synthetic candidates) until
 * META_AD_LIBRARY_TOKEN (and TikTok/YouTube keys) are provisioned — at which
 * point fetchCandidates() calls the real APIs and the rest of the pipeline is
 * unchanged.
 *
 *   Meta Ad Library API: https://www.facebook.com/ads/library/api/
 */

const { Asset, Detection, Monitor } = require('../models');
const detection = require('./detection');

const HAS_META_TOKEN = !!process.env.META_AD_LIBRARY_TOKEN;

// Deterministic spread so a given monitor produces stable synthetic candidates.
function hash(s) {
  let h = 0; s = String(s);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * fetchCandidates(monitor) -> [{ platform, source_url, media_type, raw_meta }]
 * STUB: synthesizes 2-4 candidate ads/posts per monitor from its query terms.
 * Replace body with real Meta Ad Library / platform API calls in Phase 1/2.
 */
async function fetchCandidates(monitor) {
  if (HAS_META_TOKEN) {
    // TODO Phase 2: real Meta Ad Library search by monitor.query_terms.
    // const r = await fetch('https://graph.facebook.com/v19.0/ads_archive?...');
    // return r.data.map(ad => ({ platform:'facebook', source_url:ad.ad_snapshot_url, media_type:'image', raw_meta:ad }));
  }
  const platforms = (monitor.platforms && monitor.platforms.length) ? monitor.platforms : ['facebook'];
  const seed = hash(monitor.id + '|' + monitor.target_label);
  const n = 2 + (seed % 3); // 2..4 candidates
  const out = [];
  for (let i = 0; i < n; i++) {
    const platform = platforms[(seed + i) % platforms.length];
    const media = ['image', 'video', 'video'][(seed + i) % 3];
    out.push({
      platform,
      source_url: `https://${platform}.com/ads/${monitor.id}-${i}-${(seed + i) % 100000}`,
      media_type: media,
      raw_meta: { synthetic: true, query: monitor.query_terms, scanned_term: (monitor.query_terms || [])[i % Math.max(1, (monitor.query_terms || []).length)] || monitor.target_label }
    });
  }
  return out;
}

/**
 * scanMonitor(monitorId, tenantId) -> { monitor_id, candidates, new_detections, deepfakes }
 * Fetches candidates, runs the detection engine, persists new assets+detections.
 * Idempotent-ish: skips a candidate URL already stored for the tenant.
 */
async function scanMonitor(monitorId, tenantId) {
  const monitor = await Monitor.findOne({ where: { id: monitorId, tenant_id: tenantId } });
  if (!monitor) throw new Error('monitor not found');

  const candidates = await fetchCandidates(monitor);
  let newDetections = 0, deepfakes = 0;

  for (const c of candidates) {
    const existing = await Asset.findOne({ where: { tenant_id: tenantId, source_url: c.source_url } });
    if (existing) continue;

    const asset = await Asset.create({
      tenant_id: tenantId,
      monitor_id: monitor.id,
      source_platform: c.platform,
      source_url: c.source_url,
      media_type: c.media_type,
      raw_meta: c.raw_meta
    });

    const result = await detection.detect({ mediaUrl: c.source_url, mediaType: c.media_type });
    await Detection.create({
      tenant_id: tenantId,
      asset_id: asset.id,
      provider: result.provider,
      provider_score: result.rawScore,
      confidence: result.confidence,
      verdict: result.verdict,
      targeted_person: monitor.target_label,
      deepfakes_impact: result.verdict === 'clean'
        ? 'No manipulation detected.'
        : `Possible ${result.verdict} surfaced by monitor "${monitor.target_label}" (${result.confidence}%).`,
      evidence: result.evidence
    });
    newDetections++;
    if (result.verdict === 'deepfake') deepfakes++;
  }

  monitor.last_scanned_at = new Date();
  await monitor.save();

  return {
    monitor_id: monitor.id,
    source: HAS_META_TOKEN ? 'meta_ad_library' : 'stub',
    candidates: candidates.length,
    new_detections: newDetections,
    deepfakes
  };
}

module.exports = { scanMonitor, fetchCandidates, hasMetaToken: () => HAS_META_TOKEN };
