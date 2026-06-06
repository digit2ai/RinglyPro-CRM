'use strict';

/**
 * VERITAS — AI Deepfake Detection & Takedown
 * Digit2AI vertical. Mounted at /veritas.
 *
 * Detect and remove deepfakes at scale — protecting brands, executives, and
 * individuals from impersonation fraud. Provider-agnostic detection engine
 * (stub in Phase 0; Hive / Reality Defender / Sensity in Phase 1).
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { seedSampleData } = require('./services/seed');
const { seedUsers } = require('./services/users');

const AUTH_SECRET = process.env.VERITAS_JWT_SECRET || process.env.JWT_SECRET || 'veritas-defensores-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

// ── Body parsing (scoped to this router) ──────────────────────────────────
router.use(express.json({ limit: '25mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Auth gate ───────────────────────────────────────────────────────────────
// Cookie-based JWT login. Public: login page, auth endpoints, health, webhooks
// (own api_key auth), favicon. Everything else (dashboard + data API) requires
// a valid session, else redirect to /veritas/login (browser) or 401 (API).
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const PUBLIC_EXACT = ['/login', '/health', '/favicon.svg'];
router.use((req, res, next) => {
  const token = getCookie(req, 'veritas_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }
  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || p.startsWith('/api/v1/auth') || p.startsWith('/api/v1/webhooks')) return next();
  if (req.user) return next();
  if (p.startsWith('/api/')) return res.status(401).json({ error: 'No autorizado' });
  return res.redirect('/veritas/login');
});

// ── Login page ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));

// ── API routes ─────────────────────────────────────────────────────────────
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/health', require('./routes/health'));
router.use('/api/v1/monitors', require('./routes/monitors'));
router.use('/api/v1/detections', require('./routes/detections'));
router.use('/api/v1/takedowns', require('./routes/takedowns'));
router.use('/api/v1/scan', require('./routes/scan'));
router.use('/api/v1/webhooks', require('./routes/webhooks'));
router.use('/api/v1/analyst', require('./routes/analyst'));

// ── Static dashboard (no build step — single self-contained HTML) ───────────
router.use(express.static(publicDir));

router.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

// ── Init: sync tables + seed sample data (non-blocking) ─────────────────────
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  VERITAS database tables synced (df_*)');
    // Seed console operator accounts (idempotent — always ensured)
    try {
      const u = await seedUsers();
      console.log(`  VERITAS users ensured (${u.total} accounts, ${u.created} new)`);
    } catch (uErr) {
      console.error('  VERITAS user seed error:', uErr.message);
    }
    // Demo seeding is OPT-IN. Set VERITAS_SEED_DEMO=1 to populate sample data.
    // Default (unset) leaves the tenant clean for real scans — and never
    // re-seeds on restart.
    if (process.env.VERITAS_SEED_DEMO === '1') {
      try {
        const result = await seedSampleData();
        if (result.seeded) console.log(`  VERITAS seeded sample data (${result.detections} detections)`);
        else console.log(`  VERITAS sample data present (${result.detections} detections)`);
      } catch (seedErr) {
        console.error('  VERITAS seed error:', seedErr.message);
      }
    } else {
      console.log('  VERITAS demo seeding disabled (set VERITAS_SEED_DEMO=1 to enable)');
    }
  } catch (err) {
    console.error('  VERITAS DB sync error:', err.message);
  }
})();

module.exports = router;
