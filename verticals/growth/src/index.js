'use strict';

/**
 * DIGIT2AI GROWTH — internal, owner-only "AI CMO" for our OWN portfolio.
 * Mounted at /growth. Login-only (no public signup). Each brand is one of our
 * verticals; growth agents draft SEO/content/social/GEO work into a review queue.
 * Nothing auto-publishes. Reuses ANTHROPIC_API_KEY (Haiku) with zero-key fallback.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize, Brand, Draft, Run } = require('./models');
const { seedUsers, verify } = require('./services/users');
const { seedBrands } = require('./services/brands');
const { runBrand, ALL_AGENTS } = require('./services/agents');
const settingsSvc = require('./services/settings');
const { publishDraft } = require('./services/publish');
const { User, Post } = require('./models');

const AUTH_SECRET = process.env.GROWTH_JWT_SECRET || process.env.JWT_SECRET || 'growth-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

// ── Boot: create tables + seed owner + brands (idempotent) ──────────────────
let OWNER_ID = null;
(async () => {
  try {
    await sequelize.sync({ alter: false });
    // First boot on a fresh DB needs the tables created.
    await sequelize.sync();
    const owner = await seedUsers();
    OWNER_ID = owner.id;
    await seedBrands(owner.id);
    console.log('[growth] ready — owner', owner.email, 'brands seeded');
  } catch (e) {
    console.error('[growth] init error:', e.message);
  }
})();

router.use(express.json({ limit: '2mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Auth gate ───────────────────────────────────────────────────────────────
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const PUBLIC_EXACT = ['/login', '/health'];
const PUBLIC_ASSET = /\.(png|svg|css|js|ico|webmanifest|woff2?)$/i;
router.use((req, res, next) => {
  const token = getCookie(req, 'growth_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }
  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p) || p === '/api/v1/login') return next();
  if (req.user) return next();
  if (p.startsWith('/api/')) return res.status(401).json({ error: 'No autorizado' });
  return res.redirect('/growth/login');
});

// ── Health ──────────────────────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ ok: true, service: 'growth', agents: ALL_AGENTS }));

// ── Auth ────────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
router.post('/api/v1/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = await User.findOne({ where: { email: (email || '').toLowerCase().trim() } });
  if (!user || !verify(password, user.password_hash)) return res.status(401).json({ error: 'Credenciales invalidas' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, AUTH_SECRET, { expiresIn: '30d' });
  res.cookie('growth_token', token, { httpOnly: true, secure: true, sameSite: 'Lax', maxAge: 30 * 86400000 });
  res.json({ ok: true });
});
router.post('/api/v1/logout', (req, res) => { res.clearCookie('growth_token'); res.json({ ok: true }); });

// ── Brands ──────────────────────────────────────────────────────────────────
router.get('/api/v1/brands', async (req, res) => {
  const brands = await Brand.findAll({ where: { owner_id: req.user.id }, order: [['name', 'ASC']] });
  const counts = await Draft.findAll({
    where: { owner_id: req.user.id, status: 'draft' },
    attributes: ['brand_id', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
    group: ['brand_id'], raw: true
  });
  const byBrand = Object.fromEntries(counts.map(c => [c.brand_id, Number(c.n)]));
  res.json({ brands: brands.map(b => ({ ...b.toJSON(), pending_drafts: byBrand[b.id] || 0 })) });
});
router.patch('/api/v1/brands/:id', async (req, res) => {
  const b = await Brand.findOne({ where: { id: req.params.id, owner_id: req.user.id } });
  if (!b) return res.status(404).json({ error: 'not found' });
  const allow = ['name', 'url', 'tagline', 'positioning', 'icp', 'voice', 'keywords', 'channels', 'active'];
  const patch = {}; allow.forEach(k => { if (k in req.body) patch[k] = req.body[k]; });
  await b.update(patch);
  res.json({ ok: true, brand: b });
});

// ── Run agents over a brand ─────────────────────────────────────────────────
router.post('/api/v1/brands/:id/run', async (req, res) => {
  try {
    const agents = Array.isArray(req.body.agents) && req.body.agents.length ? req.body.agents : ALL_AGENTS;
    const result = await runBrand(Number(req.params.id), req.user.id, { agents, trigger: 'manual' });
    res.json({ ok: true, ...result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Drafts (review queue) ───────────────────────────────────────────────────
router.get('/api/v1/drafts', async (req, res) => {
  const where = { owner_id: req.user.id };
  if (req.query.brand_id) where.brand_id = Number(req.query.brand_id);
  if (req.query.status) where.status = req.query.status;
  const drafts = await Draft.findAll({ where, order: [['created_at', 'DESC']], limit: 200 });
  res.json({ drafts });
});
router.patch('/api/v1/drafts/:id', async (req, res) => {
  const d = await Draft.findOne({ where: { id: req.params.id, owner_id: req.user.id } });
  if (!d) return res.status(404).json({ error: 'not found' });
  const patch = {};
  if (typeof req.body.body === 'string') patch.body = req.body.body;
  if (typeof req.body.title === 'string') patch.title = req.body.title;
  if (['draft', 'approved', 'published', 'dismissed'].includes(req.body.status)) patch.status = req.body.status;
  await d.update(patch);
  res.json({ ok: true, draft: d });
});
router.delete('/api/v1/drafts/:id', async (req, res) => {
  await Draft.destroy({ where: { id: req.params.id, owner_id: req.user.id } });
  res.json({ ok: true });
});

// Publish an SEO/Contenido draft to the brand's blog -> live crawlable URL.
router.post('/api/v1/drafts/:id/publish', async (req, res) => {
  try {
    const result = await publishDraft(Number(req.params.id), req.user.id);
    res.json({ ok: true, ...result });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Published posts (for the "Publicados" view / weekly cadence tracking).
router.get('/api/v1/posts', async (req, res) => {
  const where = { owner_id: req.user.id };
  if (req.query.brand_id) where.brand_id = Number(req.query.brand_id);
  const posts = await Post.findAll({ where, order: [['published_at', 'DESC']], limit: 100 });
  res.json({ posts });
});

// ── Settings (per-channel config: SEO / Contenido / X / LinkedIn / GEO) ─────
router.get('/api/v1/settings', async (req, res) => {
  res.json({ settings: await settingsSvc.getMasked(req.user.id) });
});
router.put('/api/v1/settings', async (req, res) => {
  try {
    const saved = await settingsSvc.save(req.user.id, req.body || {});
    res.json({ ok: true, settings: saved });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/settings', (req, res) => res.sendFile(path.join(publicDir, 'settings.html')));

// ── Static cockpit ──────────────────────────────────────────────────────────
router.use(express.static(publicDir));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

module.exports = router;
