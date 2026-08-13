'use strict';

/**
 * CITI OPPORTUNITY TRACKER — mounted at /citi-tracker.
 *
 * A private job hunter for Citigroup requisitions. It watches Citi's Workday
 * feed daily, scores each new requisition against the owner's own résumé,
 * tailors a résumé (and a PDF) per requisition, and tracks the whole board
 * through New -> Applied -> Interview -> Offer -> Closed.
 *
 * Owner-only. No public signup, no billing, no public surface. Emoji-free.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const jwt = require('jsonwebtoken');
const router = express.Router();

const { sequelize } = require('./models');
const { seedAll } = require('./services/seed');
const workday = require('./services/workday');
const agent = require('./services/agent');
const matcher = require('./services/matcher');

const AUTH_SECRET = process.env.CITIJOBS_JWT_SECRET || process.env.JWT_SECRET || 'citijobs-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

let initState = { ready: false, error: null, seeded: null };

// ── Boot ─────────────────────────────────────────────────────────────────────
// sync({alter:false}) never adds columns to an existing table, so new columns
// arrive through idempotent ALTERs, and the uniqueness the app depends on is
// created explicitly rather than hoped for.
async function init() {
  await sequelize.sync({ alter: false });

  const ddl = [
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_reqs_tenant_req_uq ON cj_reqs (tenant_id, req_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_profiles_tenant_slug_uq ON cj_profiles (tenant_id, slug)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_tracked_profile_req_uq ON cj_tracked (profile_id, req_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_matches_profile_req_uq ON cj_matches (profile_id, req_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_skills_profile_norm_uq ON cj_skills (profile_id, norm)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_queries_tenant_text_uq ON cj_queries (tenant_id, search_text)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_tailorings_pr_v_uq ON cj_tailorings (profile_id, req_id, version)`,
    // THE DAILY CLAIM. Partial, so a scheduled run can be claimed exactly once
    // per tenant per day across every Render instance, while manual runs stay
    // unrestricted — an operator must never be locked out of their own tool.
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_runs_daily_claim_uq ON cj_runs (tenant_id, run_date) WHERE trigger = 'schedule'`,
    `CREATE INDEX IF NOT EXISTS cj_reqs_close_idx ON cj_reqs (tenant_id, close_date)`,
    `CREATE INDEX IF NOT EXISTS cj_tracked_status_idx ON cj_tracked (tenant_id, profile_id, status)`
  ];
  for (const sql of ddl) {
    try { await sequelize.query(sql); } catch (e) { console.warn('[citijobs] index skipped:', e.message); }
  }

  initState.seeded = await seedAll();
  initState.ready = true;
}

init().catch((e) => {
  initState.error = e;
  console.error('[citijobs] init failed:', e.message);
});

// ── Body parsing (scoped to this router) ─────────────────────────────────────
router.use(express.json({ limit: '1mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Auth gate ────────────────────────────────────────────────────────────────
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
const PUBLIC_EXACT = ['/login', '/health', '/favicon.svg'];
const PUBLIC_ASSET = /\.(png|svg|css|js|woff2?|ico)$/i;

router.use((req, res, next) => {
  const token = getCookie(req, 'citijobs_token');
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }

  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p)) return next();
  if (p.startsWith('/api/v1/auth/login') || p.startsWith('/api/v1/auth/logout')) return next();
  if (req.user) return next();

  if (p.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/citi-tracker/login');
});

// ── Health ───────────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  let db = false;
  try { await sequelize.authenticate(); db = true; } catch (e) { db = false; }
  res.json({
    service: 'citi-opportunity-tracker',
    status: initState.ready && db ? 'ok' : 'degraded',
    database: db,
    initialized: initState.ready,
    init_error: initState.error ? initState.error.message : null,
    feed: workday.config(),
    feed_note: 'Workday CXS JSON only. jobs.citi.com is never crawled (its robots.txt disallows /search-jobs/), and a jobs.citi.com deep link is only ever stored when a human pastes one.',
    agent_enabled: agent.enabled(),
    scoring: matcher.hasModel() ? matcher.MODEL : 'heuristic (no ANTHROPIC_API_KEY; scores labelled simulated)',
    request_budget_per_run: Number(process.env.CITIJOBS_MAX_REQUESTS || 120),
    cost_cap_usd_per_run: Number(process.env.CITIJOBS_COST_CAP_USD || 0.5)
  });
});

// ── API ──────────────────────────────────────────────────────────────────────
router.use('/api/v1', require('./routes/api'));

// ── Pages ────────────────────────────────────────────────────────────────────
router.get('/login', (req, res) => res.sendFile(path.join(publicDir, 'login.html')));
router.use(express.static(publicDir, { index: false }));
router.get('/', (req, res) => res.sendFile(path.join(publicDir, 'index.html')));

module.exports = router;
module.exports.init = init;
module.exports.initState = initState;
