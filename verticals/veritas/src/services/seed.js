'use strict';

/**
 * Veritas — sample data seeder (idempotent).
 * Seeds one demo tenant with monitors, assets, detections, and takedowns so the
 * dashboard is fully populated on first boot. Safe to run repeatedly: it no-ops
 * if the demo tenant already has detections.
 */

const { Tenant, Monitor, Asset, Detection, Takedown } = require('../models');

const DEMO_TENANT_ID = 1;

async function seedSampleData() {
  // Idempotency guard
  const existing = await Detection.count({ where: { tenant_id: DEMO_TENANT_ID } });
  if (existing > 0) return { seeded: false, reason: 'already populated', detections: existing };

  // Tenant
  await Tenant.findOrCreate({
    where: { id: DEMO_TENANT_ID },
    defaults: { id: DEMO_TENANT_ID, name: 'Digit2AI (Demo)', plan: 'enterprise', seats: 10, contact_email: 'support@veritas.app' }
  });

  // Monitors
  const monitors = await Monitor.bulkCreate([
    { tenant_id: DEMO_TENANT_ID, type: 'brand',   target_label: 'Digit2AI', query_terms: ['Digit2AI', 'digit2ai.com'], platforms: ['facebook', 'instagram'], cadence: 'daily', last_scanned_at: new Date() },
    { tenant_id: DEMO_TENANT_ID, type: 'person',  target_label: 'Manuel Stagg (CEO)', query_terms: ['Manuel Stagg'], platforms: ['facebook', 'instagram', 'tiktok'], cadence: 'daily', last_scanned_at: new Date() },
    { tenant_id: DEMO_TENANT_ID, type: 'keyword', target_label: 'Crypto giveaway scam', query_terms: ['free crypto', 'doubling event'], platforms: ['youtube', 'facebook'], cadence: 'hourly', last_scanned_at: new Date() }
  ], { returning: true });

  const mBrand = monitors[0].id, mPerson = monitors[1].id, mKeyword = monitors[2].id;

  // Assets + detections + takedowns
  const rows = [
    { monitor: mKeyword, platform: 'facebook',  media: 'video', verdict: 'deepfake', confidence: 96, person: 'Manuel Stagg', impact: 'Fake video promoting a crypto "doubling" scam using the CEO likeness.', td_status: 'removed',      method: 'impersonation' },
    { monitor: mBrand,   platform: 'instagram', media: 'image', verdict: 'deepfake', confidence: 91, person: 'Digit2AI brand', impact: 'Counterfeit ad with cloned Digit2AI logo and fake testimonial.',          td_status: 'submitted',    method: 'trademark' },
    { monitor: mPerson,  platform: 'tiktok',    media: 'video', verdict: 'deepfake', confidence: 88, person: 'Manuel Stagg', impact: 'Lip-synced deepfake endorsing an unrelated investment app.',                  td_status: 'acknowledged', method: 'impersonation' },
    { monitor: mKeyword, platform: 'youtube',   media: 'video', verdict: 'suspect',  confidence: 63, person: 'Manuel Stagg', impact: 'Possible voice-clone in a livestream thumbnail; under review.',               td_status: 'draft',        method: 'dmca' },
    { monitor: mBrand,   platform: 'facebook',  media: 'image', verdict: 'suspect',  confidence: 52, person: 'Digit2AI brand', impact: 'Ad reusing brand imagery without authorization.',                          td_status: 'draft',        method: 'trademark' },
    { monitor: mPerson,  platform: 'instagram', media: 'image', verdict: 'clean',    confidence: 12, person: 'Manuel Stagg', impact: 'Authentic press photo — no manipulation detected.',                          td_status: null,           method: null },
    { monitor: mBrand,   platform: 'instagram', media: 'image', verdict: 'clean',    confidence: 8,  person: 'Digit2AI brand', impact: 'Legitimate partner repost.',                                              td_status: null,           method: null }
  ];

  let order = 0;
  for (const r of rows) {
    order++;
    const asset = await Asset.create({
      tenant_id: DEMO_TENANT_ID,
      monitor_id: r.monitor,
      source_platform: r.platform,
      source_url: `https://${r.platform}.com/sample/post-${order}`,
      media_type: r.media,
      thumbnail_url: '',
      raw_meta: { sample: true, reach_estimate: r.verdict === 'deepfake' ? 50000 + order * 1000 : order * 200 }
    });

    const detection = await Detection.create({
      tenant_id: DEMO_TENANT_ID,
      asset_id: asset.id,
      provider: 'stub',
      provider_score: r.confidence / 100,
      confidence: r.confidence,
      verdict: r.verdict,
      targeted_person: r.person,
      deepfakes_impact: r.impact,
      evidence: { signals: { face_warping: +(r.confidence / 110).toFixed(2), temporal_inconsistency: +(r.confidence / 120).toFixed(2) } }
    });

    if (r.td_status) {
      const now = new Date();
      await Takedown.create({
        tenant_id: DEMO_TENANT_ID,
        detection_id: detection.id,
        platform: r.platform,
        method: r.method,
        status: r.td_status,
        reference_id: r.td_status === 'draft' ? null : `VRT-${1000 + order}`,
        notes: `${r.method.toUpperCase()} request for ${r.person}`,
        submitted_at: ['submitted', 'acknowledged', 'removed'].includes(r.td_status) ? now : null,
        removed_at: r.td_status === 'removed' ? now : null
      });
    }
  }

  const detections = await Detection.count({ where: { tenant_id: DEMO_TENANT_ID } });
  return { seeded: true, detections };
}

module.exports = { seedSampleData, DEMO_TENANT_ID };
