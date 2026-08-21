'use strict';

// =============================================================
// ReachUp — the marketing layer inside JobUp Admin. Entry point.
//
// Exposes:
//   - init()          create tables, seed the default (JobUp) tenant + roles
//   - apiRouter       public capture/unsubscribe/webhook + admin JSON actions
//                     (mounted at /api/v1/reachup)
//   - adminRouter     the /admin/marketing UI (mounted under the existing admin)
//   - resolveTenant   config-driven tenant lookup by slug (default 'jobup')
//
// Multi-tenant by CONFIG: a tenant is one ru_tenants row. seedTenant() /
// scripts/seed-tenant.js onboard a second tenant with zero code change.
// =============================================================

const express = require('express');
const RM = require('./models');
const audience = require('./services/audience');
const studio = require('./services/studio');
const approval = require('./services/approval');
const campaigns = require('./services/campaigns');
const admin = require('../routes/admin');
const requireOwner = admin.requireOwner;

const DEFAULT_SLUG = 'jobup';

async function seedTenant(spec) {
  const { models } = RM;
  let t = await models.tenants.findOne({ where: { slug: spec.slug } });
  if (!t) {
    t = await models.tenants.create({
      slug: spec.slug, name: spec.name || spec.slug,
      brand_kit: spec.brand_kit || { tagline: '', positioning: '', proof_points: [], banned_phrases: [], compliance_flags: [] },
      ai_monthly_ceiling_usd: spec.ai_monthly_ceiling_usd || Number(process.env.REACHUP_AI_MONTHLY_CEILING_USD || 25),
      approval_target: spec.approval_target || null,
      sending: spec.sending || {},
      config: spec.config || {},
    });
  }
  for (const r of (spec.roles || [])) {
    const exists = await models.roles.findOne({ where: { tenant_id: t.id, user_ref: r.user_ref, role: r.role } });
    if (!exists) await models.roles.create({ tenant_id: t.id, user_ref: r.user_ref, role: r.role });
  }
  return t;
}

async function init() {
  const r = await RM.init();
  if (!r.ok) { console.log('[reachup] no database — marketing layer inert'); return r; }
  // Default tenant = JobUp. The operator (mstagg) reviews both EN and ES.
  await seedTenant({
    slug: DEFAULT_SLUG, name: 'JobUp',
    brand_kit: {
      tagline: 'Your AI career platform', positioning: 'Get found by recruiters and AI',
      proof_points: ['Public CV site in minutes', 'AI matches to thousands of real jobs', 'Machine-readable profile'],
      banned_phrases: [], channel_style_rules: {}, compliance_flags: [],
    },
    approval_target: process.env.REACHUP_APPROVAL_TARGET || (admin.ownerEmails && admin.ownerEmails()[0]) || null,
    roles: (admin.ownerEmails ? admin.ownerEmails() : ['mstagg@digit2ai.com']).flatMap((e) =>
      ['admin', 'marketing_reviewer', 'bilingual_reviewer'].map((role) => ({ user_ref: e, role }))),
  });
  console.log(`[reachup] ready: ${r.tables} tables, default tenant '${DEFAULT_SLUG}'`);
  return r;
}

async function resolveTenant(req) {
  const slug = String((req.query && req.query.tenant) || (req.body && req.body.tenant) || DEFAULT_SLUG).toLowerCase();
  return RM.models.tenants.findOne({ where: { slug } });
}

function ip(req) { return req.headers['cf-connecting-ip'] || req.headers['true-client-ip'] ||
  (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || null; }

// ---- PUBLIC + ADMIN JSON API (/api/v1/reachup) ----------------------------
const apiRouter = express.Router();

// Public: capture a subscriber + consent.
apiRouter.post('/capture', async (req, res) => {
  const t = await resolveTenant(req); if (!t) return res.status(404).json({ ok: false, error: 'unknown tenant' });
  const r = await audience.capture(t.id, req.body || {}, { ip: ip(req), user_agent: req.headers['user-agent'] });
  res.status(r.ok ? 201 : 400).json(r);
});

// Public: one-click unsubscribe — writes the suppression synchronously, replies
// in the subscriber's stored language.
async function doUnsub(req, res) {
  const t = await resolveTenant(req); if (!t) return res.status(404).json({ ok: false, error: 'unknown tenant' });
  const email = String((req.query.email) || (req.body && req.body.email) || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ ok: false, error: 'a valid email is required' });
  const sub = await RM.scoped('subscribers', t.id).findOne({ where: { email } });
  await audience.suppress(t.id, { email, reason: 'unsubscribe' });   // synchronous
  const es = sub && sub.language === 'es';
  res.json({ ok: true, message: es ? 'Has cancelado tu suscripción. No recibirás más correos de marketing.'
                                    : 'You are unsubscribed. You will receive no further marketing emails.' });
}
apiRouter.get('/unsubscribe', doUnsub);
apiRouter.post('/unsubscribe', doUnsub);

// Public: SendGrid Event Webhook -> events + auto-suppress.
apiRouter.post('/webhooks/sendgrid', express.json({ type: '*/*', limit: '1mb' }), async (req, res) => {
  const t = await resolveTenant(req); if (!t) return res.status(404).json({ ok: false });
  const r = await campaigns.ingestEvents(t.id, t, req.body);
  res.json(r);
});

// ---- Admin JSON actions (requireOwner) ------------------------------------
apiRouter.post('/subscribers/import', requireOwner, async (req, res) => {
  const t = await resolveTenant(req); if (!t) return res.status(404).json({ ok: false });
  res.json(await audience.importBatch(t.id, (req.body && req.body.rows) || []));
});
apiRouter.post('/import-batches/:id/release', requireOwner, async (req, res) => {
  const t = await resolveTenant(req); if (!t) return res.status(404).json({ ok: false });
  const r = await audience.releaseBatch(t.id, parseInt(req.params.id, 10),
    { provenanceText: (req.body || {}).provenance_text, adminId: req.admin && req.admin.email });
  res.status(r.ok ? 200 : 400).json(r);
});
apiRouter.post('/briefs/generate', requireOwner, async (req, res) => {
  const t = await resolveTenant(req); if (!t) return res.status(404).json({ ok: false });
  const r = await studio.generateBrief(t.id, t, { prompt: (req.body || {}).prompt || '', createdBy: req.admin && req.admin.email });
  res.status(r.ok ? 200 : 400).json(r);
});
apiRouter.get('/assets', requireOwner, async (req, res) => {
  const t = await resolveTenant(req); if (!t) return res.status(404).json({ ok: false });
  const where = {}; if (req.query.status) where.status = req.query.status; if (req.query.brief_id) where.brief_id = parseInt(req.query.brief_id, 10);
  res.json({ assets: RM.plain(await RM.scoped('content_assets', t.id).findAll({ where })) });
});
apiRouter.post('/assets/:id/submit', requireOwner, async (req, res) => {
  const t = await resolveTenant(req); res.json(await approval.submitForReview(t.id, parseInt(req.params.id, 10)));
});
apiRouter.post('/assets/:id/approve', requireOwner, async (req, res) => {
  const t = await resolveTenant(req);
  const r = await approval.approve(t.id, parseInt(req.params.id, 10), { reviewerEmail: req.admin && req.admin.email });
  res.status(r.ok ? 200 : 403).json(r);
});
apiRouter.post('/assets/:id/reject', requireOwner, async (req, res) => {
  const t = await resolveTenant(req);
  res.json(await approval.reject(t.id, parseInt(req.params.id, 10), { reviewerEmail: req.admin && req.admin.email, reason: (req.body || {}).reason }));
});
apiRouter.post('/audiences', requireOwner, async (req, res) => {
  const t = await resolveTenant(req);
  const a = await RM.scoped('audiences', t.id).create({ name: (req.body || {}).name || 'Audience', definition: (req.body || {}).definition || {} });
  res.json({ ok: true, audience_id: a.id });
});
apiRouter.post('/email/campaigns', requireOwner, async (req, res) => {
  const t = await resolveTenant(req); const b = req.body || {};
  const c = await RM.scoped('campaigns', t.id).create({ name: b.name || 'Campaign', stream: b.stream || 'marketing',
    audience_id: b.audience_id || null, subject_asset_id: b.subject_asset_id || null, body_asset_id: b.body_asset_id || null });
  if (b.send) {
    const r = await campaigns.send(t.id, t, c.id, { dryRun: Boolean(b.dry_run) });
    return res.status(r.ok ? 200 : 400).json({ ok: r.ok, campaign_id: c.id, ...r });
  }
  res.json({ ok: true, campaign_id: c.id });
});
apiRouter.post('/email/campaigns/:id/send', requireOwner, async (req, res) => {
  const t = await resolveTenant(req);
  const r = await campaigns.send(t.id, t, parseInt(req.params.id, 10), { dryRun: Boolean((req.body || {}).dry_run) });
  res.status(r.ok ? 200 : 400).json(r);
});
apiRouter.get('/campaigns', requireOwner, async (req, res) => {
  const t = await resolveTenant(req);
  res.json({ campaigns: RM.plain(await RM.scoped('campaigns', t.id).findAll({})) });
});
apiRouter.get('/subscribers-list', requireOwner, async (req, res) => {
  const t = await resolveTenant(req);
  const subs = RM.plain(await RM.scoped('subscribers', t.id).findAll({}));
  // Annotate each with a live suppression check (uncached, same source of truth as send).
  const out = [];
  for (const s of subs.slice(0, 200)) {
    out.push({ id: s.id, email: s.email, language: s.language, lifecycle_stage: s.lifecycle_stage,
      source: s.source, quarantined: s.quarantined, suppressed: await audience.isSuppressed(t.id, s.email) });
  }
  res.json({ subscribers: out });
});
apiRouter.get('/import-batches', requireOwner, async (req, res) => {
  const t = await resolveTenant(req);
  const rows = RM.plain(await RM.scoped('import_batches', t.id).findAll({}));
  res.json({ batches: rows.map((b) => ({ id: b.id, status: b.status, row_count: b.row_count,
    released_by: b.released_by, released_at: b.released_at })) });
});

// ---- ADMIN UI (/admin/marketing) ------------------------------------------
// The shell is served UNAUTHENTICATED (mirrors the /admin console): the page
// carries the owner login panel and its fetch calls hit the requireOwner-guarded
// API, which 401s until the jobup_admin cookie is set. No second credential.
const adminRouter = express.Router();
const page = require('./ui');
adminRouter.get('/marketing', (req, res) => res.type('html').send(page.render('audience')));
for (const tab of ['audience', 'studio', 'queue', 'campaigns']) {
  adminRouter.get([`/marketing/${tab}`, `/marketing/${tab}/`], (req, res) =>
    res.type('html').send(page.render(tab)));
}

module.exports = { init, seedTenant, resolveTenant, apiRouter, adminRouter, models: RM.models, scoped: RM.scoped, plain: RM.plain, DEFAULT_SLUG };
