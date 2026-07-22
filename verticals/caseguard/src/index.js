'use strict';

/**
 * CASEGUARD — Administrative Review & Regulatory Escalation Case Manager. Mounted at /caseguard.
 *
 * A private, login-only case-management, evidence-analysis, regulatory-research,
 * escalation and correspondence platform for the owner's ongoing administrative
 * review involving Florida Orthopaedic Institute (FOI) — generic to any patient-
 * advocacy / accountability matter. Preserves a complete chronological case file,
 * every piece of evidence, a provider list, communication log, contradiction log,
 * regulatory knowledge base, policy comparisons, outstanding questions, escalation
 * tracker, and drafted correspondence. The ONLY external dependency is Claude for
 * document analysis, contradiction scanning, next-step guidance, drafting and
 * research (reuses ANTHROPIC_API_KEY); everything degrades to a zero-key heuristic.
 *
 * Multi-tenant: every row is scoped to the owner's tenant_id. Emoji-free.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { seedUsers } = require('./services/users');
const { seedCase } = require('./services/seed');

const AUTH_SECRET = process.env.CASEGUARD_JWT_SECRET || process.env.JWT_SECRET || 'caseguard-2026-secret';
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
  const token = getCookie(req, 'caseguard_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }
  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p) || p.startsWith('/api/v1/auth')) return next();
  if (req.user) return next();
  if (p.startsWith('/api/')) return res.status(401).json({ error: 'Not authorized' });
  return res.redirect('/caseguard/login');
});

// ── Login page ──────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));

// ── API routes ──────────────────────────────────────────────────────────────────
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/health', require('./routes/health'));
router.use('/api/v1', require('./routes/cases').router); // cases + all sub-resources
router.use('/api/v1/ai', require('./routes/ai'));         // analyze, scan-contradictions, next-steps, draft, research

// ── Static app (no build step — self-contained HTML) ─────────────────────────────
router.use(express.static(publicDir));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'app.html')));

// ── Init: sync tables + ensure columns + seed owner + seed FOI case (non-blocking) ─
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  CASEGUARD database tables synced (cg_*)');
    // sync({alter:false}) never adds columns to existing tables — ensure idempotently.
    try {
      await sequelize.query('ALTER TABLE cg_users ADD COLUMN IF NOT EXISTS tenant_id INTEGER');
      await sequelize.query("ALTER TABLE cg_users ADD COLUMN IF NOT EXISTS lang VARCHAR(12) DEFAULT 'en'");
      await sequelize.query('UPDATE cg_users SET tenant_id = id WHERE tenant_id IS NULL');
      await sequelize.query('ALTER TABLE cg_analyses ADD COLUMN IF NOT EXISTS is_simulated BOOLEAN DEFAULT false');
      await sequelize.query('ALTER TABLE cg_escalations ADD COLUMN IF NOT EXISTS reference_no VARCHAR(255)');
    } catch (mErr) {
      console.error('  CASEGUARD column ensure error:', mErr.message);
    }
    try {
      const u = await seedUsers();
      console.log(`  CASEGUARD owner account ensured (${u.total}, ${u.created} new)`);
    } catch (uErr) {
      console.error('  CASEGUARD user seed error:', uErr.message);
    }
    // Seed the FOI case + knowledge base once (idempotent). Disable with CASEGUARD_SEED_CASE=0.
    if (process.env.CASEGUARD_SEED_CASE !== '0') {
      try {
        const r = await seedCase();
        console.log(r.seeded
          ? `  CASEGUARD FOI case seeded (case ${r.case_id}, ${r.policies} KB entries)`
          : `  CASEGUARD FOI case present (case ${r.case_id || '-'}, ${r.policies || 0} KB entries)`);
      } catch (sErr) {
        console.error('  CASEGUARD case seed error:', sErr.message);
      }
    }
  } catch (err) {
    console.error('  CASEGUARD DB sync error:', err.message);
  }
})();

module.exports = router;
