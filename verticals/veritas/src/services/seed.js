'use strict';

/**
 * Veritas — sample data seeder (idempotent).
 * Seeds the demo tenant (Defensores de la Patria — Abelardo de la Espriella
 * presidential campaign) with monitors, assets, detections, and takedowns so
 * the dashboard is fully populated on first boot. Safe to run repeatedly: it
 * no-ops if the demo tenant already has detections.
 *
 * Spanish copy uses proper orthography (tildes / ñ / comillas angulares).
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
    defaults: { id: DEMO_TENANT_ID, name: 'Defensores de la Patria', plan: 'enterprise', seats: 10, contact_email: 'proteccion@defensoresdelapatria.com' }
  });

  // Monitors — what the campaign protects
  const monitors = await Monitor.bulkCreate([
    { tenant_id: DEMO_TENANT_ID, type: 'person',  target_label: 'Abelardo de la Espriella («El Tigre»)', query_terms: ['Abelardo de la Espriella', 'El Tigre'], platforms: ['facebook', 'instagram', 'tiktok', 'youtube'], cadence: 'daily', last_scanned_at: new Date() },
    { tenant_id: DEMO_TENANT_ID, type: 'brand',   target_label: 'Defensores de la Patria', query_terms: ['Defensores de la Patria', 'País Milagro'], platforms: ['facebook', 'instagram'], cadence: 'daily', last_scanned_at: new Date() },
    { tenant_id: DEMO_TENANT_ID, type: 'keyword', target_label: 'Estafas de donación a la campaña', query_terms: ['donación campaña', 'apoya al Tigre'], platforms: ['facebook', 'youtube'], cadence: 'hourly', last_scanned_at: new Date() }
  ], { returning: true });

  const mPerson = monitors[0].id, mBrand = monitors[1].id, mKeyword = monitors[2].id;

  // Detections — realistic political-deepfake scenarios
  const rows = [
    { monitor: mKeyword, platform: 'facebook',  media: 'video', verdict: 'deepfake', confidence: 97, person: 'Abelardo de la Espriella', impact: 'Video falso donde «Abelardo» anuncia su retiro de la segunda vuelta — desinformación electoral.', td_status: 'removed',      method: 'impersonation' },
    { monitor: mPerson,  platform: 'youtube',   media: 'video', verdict: 'deepfake', confidence: 94, person: 'Abelardo de la Espriella', impact: 'Deepfake del candidato promocionando una plataforma de criptomonedas fraudulenta.',          td_status: 'submitted',    method: 'impersonation' },
    { monitor: mKeyword, platform: 'facebook',  media: 'audio', verdict: 'deepfake', confidence: 90, person: 'Abelardo de la Espriella', impact: 'Audio con voz clonada del candidato pidiendo donaciones a una cuenta bancaria fraudulenta.', td_status: 'acknowledged', method: 'impersonation' },
    { monitor: mBrand,   platform: 'instagram', media: 'image', verdict: 'deepfake', confidence: 89, person: 'Defensores de la Patria', impact: 'Anuncio falso con el logo de la campaña que solicita donaciones a una cuenta no oficial.',  td_status: 'submitted',    method: 'trademark' },
    { monitor: mPerson,  platform: 'tiktok',    media: 'video', verdict: 'suspect',  confidence: 64, person: 'Abelardo de la Espriella', impact: 'Clip editado fuera de contexto atribuido al candidato; en revisión.',                     td_status: 'draft',        method: 'dmca' },
    { monitor: mBrand,   platform: 'facebook',  media: 'image', verdict: 'suspect',  confidence: 51, person: 'Defensores de la Patria', impact: 'Imagen de campaña reutilizada sin autorización.',                                       td_status: 'draft',        method: 'trademark' },
    { monitor: mPerson,  platform: 'instagram', media: 'image', verdict: 'clean',    confidence: 9,  person: 'Abelardo de la Espriella', impact: 'Fotografía de prensa auténtica — sin manipulación detectada.',                       td_status: null,           method: null },
    { monitor: mBrand,   platform: 'facebook',  media: 'image', verdict: 'clean',    confidence: 6,  person: 'Defensores de la Patria', impact: 'Publicación legítima de un simpatizante.',                                            td_status: null,           method: null }
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
        notes: `Solicitud de ${r.method.toUpperCase()} para ${r.person}`,
        submitted_at: ['submitted', 'acknowledged', 'removed'].includes(r.td_status) ? now : null,
        removed_at: r.td_status === 'removed' ? now : null
      });
    }
  }

  const detections = await Detection.count({ where: { tenant_id: DEMO_TENANT_ID } });
  return { seeded: true, detections };
}

module.exports = { seedSampleData, DEMO_TENANT_ID };
