'use strict';

/**
 * COACHTRACK — Personal AI Coaching Tracker
 * Digit2AI vertical. Mounted at /coaching.
 *
 * Log weekly 1:1 coaching sessions (coach = Lala), record + transcribe the full
 * session (voice NLP or typed), auto-extract the subject of the day + action
 * items, and ask an AI coaching agent for guidance on each action item.
 * Modeled on CoachAccountable (accountability), BetterUp (session->goals),
 * Quenza (between-session reflection), Mentalyc (notes from audio).
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { seedUsers } = require('./services/users');
const { seedDemo } = require('./services/seed');

const AUTH_SECRET = process.env.COACHTRACK_JWT_SECRET || process.env.JWT_SECRET || 'coachtrack-2026-secret';
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
const PUBLIC_EXACT = ['/login', '/health', '/favicon.svg'];
router.use((req, res, next) => {
  const token = getCookie(req, 'coachtrack_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }
  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || p.startsWith('/api/v1/auth')) return next();
  if (req.user) return next();
  if (p.startsWith('/api/')) return res.status(401).json({ error: 'No autorizado' });
  return res.redirect('/coaching/login');
});

// ── Login page ───────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));

// ── API routes ─────────────────────────────────────────────────────────────
router.use('/api/v1/auth', require('./routes/auth'));
router.use('/health', require('./routes/health'));
router.use('/api/v1/sessions', require('./routes/sessions'));
router.use('/api/v1/action-items', require('./routes/action-items'));

// ── Static dashboard (no build step — single self-contained HTML) ───────────
router.use(express.static(publicDir));

router.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

// ── Init: sync tables + seed owner account (non-blocking) ───────────────────
(async function initialize() {
  try {
    await sequelize.sync({ alter: false });
    console.log('  COACHTRACK database tables synced (ct_*)');
    try {
      const u = await seedUsers();
      console.log(`  COACHTRACK owner account ensured (${u.total}, ${u.created} new)`);
    } catch (uErr) {
      console.error('  COACHTRACK user seed error:', uErr.message);
    }
    if (process.env.COACHTRACK_SEED_DEMO === '1') {
      try {
        const r = await seedDemo();
        console.log(r.seeded ? '  COACHTRACK demo session seeded' : `  COACHTRACK data present (${r.sessions} sessions)`);
      } catch (sErr) {
        console.error('  COACHTRACK demo seed error:', sErr.message);
      }
    }
  } catch (err) {
    console.error('  COACHTRACK DB sync error:', err.message);
  }
})();

module.exports = router;
