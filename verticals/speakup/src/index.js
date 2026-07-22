'use strict';

/**
 * SPEAKUP — Voice-to-Text + AI editing (internal team tool). Mounted at /speakup.
 *
 * Record or upload audio, transcribe with OUR OWN engine (browser Web Speech
 * live, or self-hosted whisper.cpp/Vosk for files — no STT vendor), then one-tap
 * summarize, translate (50+ langs) or rewrite the tone. Records meetings by
 * capturing the user's own device audio — no bot joins the call. The only
 * external dependency is Claude for AI text editing (reuses ANTHROPIC_API_KEY).
 *
 * Login-only (no public signup). Multi-tenant: every recording is scoped to the
 * teammate's tenant_id. Bilingual ES/EN, emoji-free, installable PWA.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { seedUsers } = require('./services/users');
const { seedDemo } = require('./services/seed');

const AUTH_SECRET = process.env.SPEAKUP_JWT_SECRET || process.env.JWT_SECRET || 'speakup-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

// ── Body parsing (scoped to this router) ──────────────────────────────────────
router.use(express.json({ limit: '25mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Auth gate ──────────────────────────────────────────────────────────────────
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const PUBLIC_EXACT = ['/login', '/health', '/favicon.svg', '/manifest.webmanifest', '/sw.js'];
const PUBLIC_ASSET = /\.(png|svg|webmanifest|css|js|woff2?|ico)$/i;
router.use((req, res, next) => {
  const token = getCookie(req, 'speakup_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }
  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p) || p.startsWith('/api/v1/auth')) return next();
  if (req.user) return next();
  if (p.startsWith('/api/')) return res.status(401).json({ error: 'No autorizado' });
  return res.redirect('/speakup/login');
});

// ── Login page ──────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));

// ── API routes ──────────────────────────────────────────────────────────────────
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/health', require('./routes/health'));
router.use('/api/v1/recordings', require('./routes/recordings'));
router.use('/api/v1', require('./routes/ai')); // /translate, /rewrite, /:id/summarize

// ── Static app (no build step — self-contained HTML) ─────────────────────────────
router.use(express.static(publicDir));

router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'app.html')));

// ── Init: sync tables + ensure columns + seed team (non-blocking) ────────────────
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  SPEAKUP database tables synced (su_*)');
    // sync({alter:false}) never adds columns to existing tables — ensure idempotently.
    try {
      await sequelize.query('ALTER TABLE su_users ADD COLUMN IF NOT EXISTS tenant_id INTEGER');
      await sequelize.query("ALTER TABLE su_users ADD COLUMN IF NOT EXISTS lang VARCHAR(12) DEFAULT 'es'");
      await sequelize.query('UPDATE su_users SET tenant_id = id WHERE tenant_id IS NULL');
      await sequelize.query('ALTER TABLE su_transcripts ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT false');
      await sequelize.query('ALTER TABLE su_recordings ADD COLUMN IF NOT EXISTS error TEXT');
      await sequelize.query('ALTER TABLE su_documents ADD COLUMN IF NOT EXISTS prompt TEXT');
    } catch (mErr) {
      console.error('  SPEAKUP column ensure error:', mErr.message);
    }
    try {
      const u = await seedUsers();
      console.log(`  SPEAKUP team accounts ensured (${u.total}, ${u.created} new)`);
    } catch (uErr) {
      console.error('  SPEAKUP user seed error:', uErr.message);
    }
    if (process.env.SPEAKUP_SEED_DEMO === '1') {
      try {
        const r = await seedDemo();
        console.log(r.seeded ? '  SPEAKUP demo recording seeded' : `  SPEAKUP data present (${r.recordings} recordings)`);
      } catch (sErr) {
        console.error('  SPEAKUP demo seed error:', sErr.message);
      }
    }
  } catch (err) {
    console.error('  SPEAKUP DB sync error:', err.message);
  }
})();

module.exports = router;
