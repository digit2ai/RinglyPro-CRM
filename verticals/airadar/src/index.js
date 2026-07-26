'use strict';

/**
 * AI RADAR — capture AI discoveries from the phone's share sheet. Mounted at /airadar.
 *
 * You are scrolling Instagram / Facebook / TikTok / X and something AI-shaped
 * goes by. Share it into AI Radar and it lands in an inbox with the company
 * name, the company website and a short description already drafted; you fix
 * whatever the draft got wrong and move on. Search, filter, rate and export the
 * whole log later.
 *
 * Login-only (no public signup). Multi-tenant: every item is scoped to
 * tenant_id (= the user's id). Installable PWA with a Web Share Target, plus a
 * token capture endpoint for iOS Shortcuts (iOS has no Web Share Target).
 * Emoji-free.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { seedUsers } = require('./services/users');

const AUTH_SECRET = process.env.AIRADAR_JWT_SECRET || process.env.JWT_SECRET || 'airadar-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

// ── Body parsing (scoped to this router) ─────────────────────────────────────
router.use(express.json({ limit: '2mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Auth gate ────────────────────────────────────────────────────────────────
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const PUBLIC_EXACT = ['/login', '/health', '/favicon.svg', '/manifest.webmanifest', '/sw.js'];
const PUBLIC_ASSET = /\.(png|svg|webmanifest|css|js|woff2?|ico)$/i;

router.use((req, res, next) => {
  const token = getCookie(req, 'airadar_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }

  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p)) return next();
  if (p.startsWith('/api/v1/auth/login') || p.startsWith('/api/v1/auth/logout')) return next();
  if (p.startsWith('/api/v1/capture')) return next(); // token-authed inside the route
  if (req.user) return next();

  if (p.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  // Preserve where they were going (a share-target hit lands here when logged out).
  const next_ = encodeURIComponent(req.originalUrl || '/airadar/');
  return res.redirect('/airadar/login?next=' + next_);
});

// ── Login page ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));

// ── Web Share Target ─────────────────────────────────────────────────────────
// The PWA manifest points share_target at /airadar/share (GET, per the manifest's
// params). Android hands us title/text/url; we forward them to the app UI, which
// opens the quick-add sheet pre-filled and runs the AI draft.
router.get('/share', (req, res) => {
  const qs = new URLSearchParams();
  for (const k of ['url', 'text', 'title']) if (req.query[k]) qs.set(k, String(req.query[k]).slice(0, 4000));
  qs.set('share', '1');
  res.redirect('/airadar/?' + qs.toString());
});
// Some platforms POST a share target even when the manifest declares GET.
router.post('/share', (req, res) => {
  const qs = new URLSearchParams();
  for (const k of ['url', 'text', 'title']) if (req.body[k]) qs.set(k, String(req.body[k]).slice(0, 4000));
  qs.set('share', '1');
  res.redirect(303, '/airadar/?' + qs.toString());
});

// ── API routes ───────────────────────────────────────────────────────────────
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/health', require('./routes/health'));
router.use('/api/v1/capture', require('./routes/capture'));

const items = require('./routes/items');
router.use('/api/v1/items', items);
// Convenience alias so the UI can POST /api/v1/enrich for a save-nothing draft.
router.post('/api/v1/enrich', (req, res, next) => { req.url = '/enrich'; items.handle(req, res, next); });

// ── Static app (no build step — self-contained HTML) ─────────────────────────
router.use(express.static(publicDir));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'app.html')));

// ── Init: sync tables + ensure columns + seed owner (non-blocking) ───────────
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  AI RADAR database tables synced (ar_*)');
    // sync({alter:false}) never adds columns to existing tables — ensure idempotently.
    try {
      await sequelize.query('ALTER TABLE ar_users ADD COLUMN IF NOT EXISTS tenant_id INTEGER');
      await sequelize.query('ALTER TABLE ar_users ADD COLUMN IF NOT EXISTS capture_token VARCHAR(255)');
      await sequelize.query("ALTER TABLE ar_users ADD COLUMN IF NOT EXISTS lang VARCHAR(12) DEFAULT 'en'");
      await sequelize.query('UPDATE ar_users SET tenant_id = id WHERE tenant_id IS NULL');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS shared_text TEXT');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS source_title TEXT');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS thumbnail_url TEXT');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS notes TEXT');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS rating INTEGER DEFAULT 0');
      await sequelize.query("ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS enriched_by VARCHAR(32) DEFAULT 'manual'");
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT false');
      await sequelize.query('ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS needs_review BOOLEAN DEFAULT false');
      await sequelize.query("ALTER TABLE ar_items ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb");
      await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS ar_users_capture_token_idx ON ar_users (capture_token)');
    } catch (mErr) {
      console.error('  AI RADAR column ensure error:', mErr.message);
    }
    try {
      const u = await seedUsers();
      console.log(`  AI RADAR accounts ensured (${u.total}, ${u.created} new)`);
    } catch (uErr) {
      console.error('  AI RADAR user seed error:', uErr.message);
    }
  } catch (err) {
    console.error('  AI RADAR DB sync error:', err.message);
  }
})();

module.exports = router;
