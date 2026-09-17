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
// Machine routes for the GitHub workflow. They authenticate themselves with an
// HMAC over SPEAKUP_FACTORY_SECRET and never accept a session cookie as proof.
const MACHINE = (p) => p === '/api/v1/factory/callback' || p === '/api/v1/factory/progress-log' ||
  /^\/api\/v1\/factory\/(brief|attachment)\/\d+$/.test(p);
const PUBLIC_ASSET = /\.(png|svg|webmanifest|css|js|woff2?|ico)$/i;
router.use((req, res, next) => {
  const token = getCookie(req, 'speakup_token');
  // audience 'speakup': other verticals sign with the same JWT_SECRET fallback, and their
  // tokens must not open SpeakUp (or the AI Factory) in a tenant of their choosing.
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET, { audience: 'speakup' }); } catch (e) { /* invalid */ } }
  const p = req.path;
  if (MACHINE(p)) { req.user = null; return next(); }
  if (PUBLIC_EXACT.includes(p) || (PUBLIC_ASSET.test(p) && !p.startsWith('/api/')) || p.startsWith('/api/v1/auth')) return next();
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
router.use('/api/v1/factory', require('./routes/factory')); // AI Factory: voice -> architect -> GitHub PR
router.use('/api/v1/meetings', require('./routes/meetings')); // History + the conversation about a meeting

// ── Static app (no build step — self-contained HTML) ─────────────────────────────
router.use(express.static(publicDir));

// TWO SCREENS, AND NOTHING ELSE. The Factory is the default; the Meeting Notes Taker is
// the other. /recorder (library, import, translate, rewrite, notes) is gone, and so is the
// /api/v1 ai router that only served the removed editing tools.
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'app.html')));
router.get('/meetings', (req, res) => res.sendFile(path.join(publicDir, 'meetings.html')));
// History moved off the meetings screen to its own page; Settings is the third menu entry.
router.get('/history', (req, res) => res.sendFile(path.join(publicDir, 'history.html')));
router.get('/settings', (req, res) => res.sendFile(path.join(publicDir, 'settings.html')));
router.get('/recorder', (req, res) => res.redirect('/speakup/meetings'));

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
      await sequelize.query("ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS revisions JSONB DEFAULT '[]'");
      // AI Factory session fields on recordings (sessions)
      await sequelize.query('ALTER TABLE su_recordings ADD COLUMN IF NOT EXISTS mode VARCHAR(20)');
      await sequelize.query('ALTER TABLE su_recordings ADD COLUMN IF NOT EXISTS project_key VARCHAR(60)');
      await sequelize.query("ALTER TABLE su_recordings ADD COLUMN IF NOT EXISTS participants JSONB DEFAULT '[]'");
      await sequelize.query('CREATE INDEX IF NOT EXISTS su_recordings_tenant_created_idx ON su_recordings(tenant_id, created_at)');
      await sequelize.query('CREATE INDEX IF NOT EXISTS su_recordings_tenant_project_idx ON su_recordings(tenant_id, project_key)');
      // The console works on the whole repository; the first seed scoped RinglyPro to src/.
      await sequelize.query(`UPDATE su_projects SET path_scope = '[]'::jsonb WHERE key = 'ringlypro' AND path_scope = '["src"]'::jsonb`);
      // AI Factory job snapshot + verification fields
      for (const ddl of ['auto_run BOOLEAN DEFAULT FALSE', "attachments JSONB DEFAULT '[]'", 'workflow_file VARCHAR(120)', "test_commands JSONB DEFAULT '[]'", "path_scope JSONB DEFAULT '[]'",
        "changed_files JSONB DEFAULT '[]'", 'suite_modified BOOLEAN', 'baseline_ok BOOLEAN', 'brief_token_used_at TIMESTAMPTZ']) {
        await sequelize.query('ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS ' + ddl);
      }
    } catch (mErr) {
      console.error('  SPEAKUP column ensure error:', mErr.message);
    }
    // SIT sets SPEAKUP_SEED_USERS=off: the local .env can point at the production
    // database, and seeding force-syncs the owner's password.
    if (process.env.SPEAKUP_SEED_USERS !== 'off') try {
      const u = await seedUsers();
      console.log(`  SPEAKUP team accounts ensured (${u.total}, ${u.created} new)`);
      const { User } = require('./models');
      const factorySecurity = require('./factory/security');
      for (const admin of await User.findAll({ where: { role: 'admin' } })) {
        if (factorySecurity.isFactoryOperator(admin)) await require('./factory/projects').ensureDefaults(admin.tenant_id || admin.id);
      }
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
    const started = require('./factory/jobs').startWatchdog();
    console.log('  SPEAKUP AI Factory watchdog ' + (started ? 'running' : 'off (not production)'));
  } catch (err) {
    console.error('  SPEAKUP DB sync error:', err.message);
  }
})();

module.exports = router;
