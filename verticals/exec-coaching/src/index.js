'use strict';

/**
 * EXECUTIVE ENGLISH COACHING — Digit2AI multi-tenant coaching platform.
 * Mounted at /coaching-english.
 *
 * Executive English training for international leadership (trade, investment,
 * diplomacy, press). A coach logs 1:1 sessions, records + transcribes (voice or
 * typed), and the AI generates the program's 5 post-session deliverables
 * (fortalezas, aspectos a mejorar, expresiones de alto impacto, vocabulario
 * estratégico, ejercicio) plus an "80% student speaks" meter and "entre
 * sesiones" daily tasks. Modeled on the CoachTrack / Veritas vertical pattern.
 *
 * Tenancy: one coach = one tenant (tenant_id = coach user id); schema is
 * academy-ready via ec_students.coach_id.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { seedUsers } = require('./services/users');
const { seedDemo } = require('./services/seed');

const AUTH_SECRET = process.env.EXEC_COACHING_JWT_SECRET || process.env.JWT_SECRET || 'exec-coaching-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

// ── Body parsing (scoped to this router) ──────────────────────────────────
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Auth gate ───────────────────────────────────────────────────────────────
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const PUBLIC_EXACT = ['/login', '/signup', '/start', '/health', '/favicon.svg', '/manifest.webmanifest', '/sw.js'];
const PUBLIC_ASSET = /\.(png|svg|webmanifest|css|js|woff2?|ico)$/i;
router.use((req, res, next) => {
  const token = getCookie(req, 'exec_coaching_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }
  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p) || p.startsWith('/api/v1/auth')) return next();
  if (req.user) {
    // Role-aware routing: students live in /learn, coaches in the dashboard.
    if (req.user.role === 'student' && p === '/') return res.redirect('/coaching-english/learn');
    if (req.user.role !== 'student' && p === '/learn') return res.redirect('/coaching-english/');
    return next();
  }
  if (p.startsWith('/api/')) return res.status(401).json({ error: 'No autorizado' });
  return res.redirect('/coaching-english/login');
});

// ── Login + signup + student pages ──────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
router.get('/signup', (req, res) => res.sendFile(path.join(publicDir, 'signup.html')));
router.get('/start', (req, res) => res.sendFile(path.join(publicDir, 'start.html')));   // student self-signup
router.get('/learn', (req, res) => res.sendFile(path.join(publicDir, 'learn.html')));    // student app

// ── API routes ─────────────────────────────────────────────────────────────
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/health', require('./routes/health'));
router.use('/api/v1/students', require('./routes/students'));
router.use('/api/v1/sessions', require('./routes/sessions'));
router.use('/api/v1/assignments', require('./routes/assignments'));
router.use('/api/v1/intake', require('./routes/intake'));       // student self-serve
router.use('/api/v1/learning', require('./routes/learning'));   // student self-serve
router.use('/api/v1/kb', require('./routes/knowledge-base'));   // coach KB + supervision

// ── Static dashboard (no build step — self-contained HTML) ──────────────────
router.use(express.static(publicDir));

router.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

// ── Init: sync tables + seed accounts (non-blocking) ────────────────────────
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  EXEC-COACHING database tables synced (ec_*)');
    // sync({alter:false}) does not add columns to existing tables — ensure the
    // multi-tenant + newer columns exist (idempotent).
    try {
      await sequelize.query('ALTER TABLE ec_users ADD COLUMN IF NOT EXISTS tenant_id INTEGER');
      await sequelize.query('UPDATE ec_users SET tenant_id = id WHERE tenant_id IS NULL');
      await sequelize.query('ALTER TABLE ec_sessions ADD COLUMN IF NOT EXISTS speaking_pct INTEGER');
      await sequelize.query('ALTER TABLE ec_sessions ADD COLUMN IF NOT EXISTS student_words INTEGER DEFAULT 0');
      await sequelize.query('ALTER TABLE ec_sessions ADD COLUMN IF NOT EXISTS coach_words INTEGER DEFAULT 0');
      await sequelize.query('ALTER TABLE ec_sessions ADD COLUMN IF NOT EXISTS scenario VARCHAR(160)');
    } catch (mErr) {
      console.error('  EXEC-COACHING column ensure error:', mErr.message);
    }
    try {
      const u = await seedUsers();
      console.log(`  EXEC-COACHING accounts ensured (${u.total}, ${u.created} new)`);
    } catch (uErr) {
      console.error('  EXEC-COACHING user seed error:', uErr.message);
    }
    if (process.env.EXEC_COACHING_SEED_DEMO === '1') {
      try {
        const r = await seedDemo();
        console.log(r.seeded ? '  EXEC-COACHING demo session seeded' : `  EXEC-COACHING data present`);
      } catch (sErr) {
        console.error('  EXEC-COACHING demo seed error:', sErr.message);
      }
    }
  } catch (err) {
    console.error('  EXEC-COACHING DB sync error:', err.message);
  }
})();

module.exports = router;
