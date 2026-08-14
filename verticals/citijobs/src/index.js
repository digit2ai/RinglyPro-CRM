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
const crypto = require('crypto');
const router = express.Router();

const { sequelize, User } = require('./models');
const { seedAll } = require('./services/seed');
const workday = require('./services/workday');
const agent = require('./services/agent');
const matcher = require('./services/matcher');

const AUTH_SECRET = process.env.CITIJOBS_JWT_SECRET || process.env.JWT_SECRET || 'citijobs-2026-secret';
const publicDir = path.join(__dirname, '..', 'public');

// ── Single sign-on from the CV admin console ─────────────────────────────────
// The tracker is embedded as a "Citi Jobs" tab inside /cv-admin, and two logins
// for one person is the kind of friction that gets a tool abandoned. The CV
// console's cookie is Path=/, so it already arrives here; this verifies it with
// the CV console's own secret and issues a tracker session.
//
// It is an ALLOWLIST, not a trust-anything bridge: only the named CV profiles
// can cross, so a console session for another person's CV grants nothing here.
// The tracker's own login still works standalone.
const CV_ADMIN_SECRET = process.env.CV_ADMIN_SECRET || process.env.JWT_SECRET || 'cv-engine-secret';
const SSO_SLUGS = String(process.env.CITIJOBS_SSO_SLUGS || 'manuelstagg')
  .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);

let initState = { ready: false, error: null, seeded: null };

// ── Boot ─────────────────────────────────────────────────────────────────────
// sync({alter:false}) never adds columns to an existing table, so new columns
// arrive through idempotent ALTERs, and the uniqueness the app depends on is
// created explicitly rather than hoped for.
async function init() {
  await sequelize.sync({ alter: false });

  const ddl = [
    // New columns arrive here, because sync({alter:false}) never adds them.
    `ALTER TABLE cj_profiles ADD COLUMN IF NOT EXISTS min_salary_cents BIGINT DEFAULT 14000000`,
    `ALTER TABLE cj_profiles ADD COLUMN IF NOT EXISTS hide_unpriced BOOLEAN DEFAULT FALSE`,
    `ALTER TABLE cj_profiles ADD COLUMN IF NOT EXISTS states JSONB DEFAULT '[]'::jsonb`,
    // Multi-employer. Existing rows are all Citi, so the default backfills them.
    `ALTER TABLE cj_reqs ADD COLUMN IF NOT EXISTS employer VARCHAR(40) NOT NULL DEFAULT 'citi'`,
    `ALTER TABLE cj_tracked ADD COLUMN IF NOT EXISTS employer VARCHAR(40) NOT NULL DEFAULT 'citi'`,
    `ALTER TABLE cj_matches ADD COLUMN IF NOT EXISTS employer VARCHAR(40) NOT NULL DEFAULT 'citi'`,
    `ALTER TABLE cj_tailorings ADD COLUMN IF NOT EXISTS employer VARCHAR(40) NOT NULL DEFAULT 'citi'`,
    `ALTER TABLE cj_queries ADD COLUMN IF NOT EXISTS employer VARCHAR(40) NOT NULL DEFAULT 'citi'`,
    // Uniqueness is re-keyed on (…, employer, req_id). The old indexes must go
    // first or two banks sharing a requisition number could never coexist.
    `DROP INDEX IF EXISTS cj_reqs_tenant_req_uq`,
    `DROP INDEX IF EXISTS cj_tracked_profile_req_uq`,
    `DROP INDEX IF EXISTS cj_matches_profile_req_uq`,
    `DROP INDEX IF EXISTS cj_tailorings_pr_v_uq`,
    `DROP INDEX IF EXISTS cj_queries_tenant_text_uq`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_reqs_tenant_emp_req_uq ON cj_reqs (tenant_id, employer, req_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_tracked_prof_emp_req_uq ON cj_tracked (profile_id, employer, req_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_matches_prof_emp_req_uq ON cj_matches (profile_id, employer, req_id)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_tail_prof_emp_req_v_uq ON cj_tailorings (profile_id, employer, req_id, version)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_queries_tenant_emp_text_uq ON cj_queries (tenant_id, employer, search_text)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_profiles_tenant_slug_uq ON cj_profiles (tenant_id, slug)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS cj_skills_profile_norm_uq ON cj_skills (profile_id, norm)`,
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

// ── Host lock ────────────────────────────────────────────────────────────────
// The tracker is reachable ONLY on the CV console's own domain. On
// aiagent.ringlypro.com — where the rest of the CRM lives and where the URL
// could be guessed — it does not exist at all.
//
// It answers 404, not 403: a 403 confirms there is something here worth
// finding. /health stays open on every host so deploy verification and uptime
// monitoring keep working; it exposes service state, never a requisition.
//
// Loopback is allowed only outside production, so the SIT can drive the router
// on 127.0.0.1 without opening a hole on the live origin.
const ALLOWED_HOSTS = String(process.env.CITIJOBS_ALLOWED_HOSTS || 'manuelstagg.com,www.manuelstagg.com')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

function hostAllowed(req) {
  const host = String(req.headers.host || '').toLowerCase().split(':')[0];
  if (ALLOWED_HOSTS.includes(host)) return true;
  if (process.env.NODE_ENV !== 'production' && LOOPBACK.includes(host)) return true;
  return false;
}

router.use((req, res, next) => {
  if (req.path === '/health') return next();
  if (hostAllowed(req)) return next();
  return res.status(404).json({ error: 'Not found' });
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
const COOKIE_NAME = 'citijobs_token';
const PUBLIC_EXACT = ['/login', '/health', '/favicon.svg'];
const PUBLIC_ASSET = /\.(png|svg|css|js|woff2?|ico)$/i;

/**
 * Verify a CV console cookie.
 *
 * THE CONSOLE DOES NOT ISSUE JWTs. src/routes/cv-engine.js signs its own
 * `base64url(JSON).hmac-sha256` token with `exp` in EPOCH MILLISECONDS. Reading
 * it as a JWT parses nothing and rejects every real session — which is exactly
 * what shipped once, because the test minted the token the same wrong way the
 * verifier read it and so agreed with the bug. The SIT now mints it the way the
 * console actually does and asserts a JWT is refused.
 */
function verifyCvAdminToken(raw) {
  try {
    const parts = String(raw || '').split('.');
    if (parts.length !== 2) return null;         // a JWT has three; refuse it
    const [body, mac] = parts;
    if (!body || !mac) return null;
    const expected = crypto.createHmac('sha256', CV_ADMIN_SECRET).update(body).digest('base64url');
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;      // timingSafeEqual throws on a length mismatch
    if (!crypto.timingSafeEqual(a, b)) return null;
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!p || typeof p.exp !== 'number' || p.exp < Date.now()) return null;
    return p;
  } catch (e) {
    return null;
  }
}

/** Accept a CV-admin console session for an allowlisted profile. */
async function trySsoFromCvAdmin(req, res) {
  const raw = getCookie(req, 'cv_admin_token');
  if (!raw) return null;
  const payload = verifyCvAdminToken(raw);
  if (!payload) return null;
  const slug = String((payload && payload.slug) || '').toLowerCase();
  if (!slug || !SSO_SLUGS.includes(slug)) return null;

  const owner = await User.findOne({ order: [['id', 'ASC']] });
  if (!owner) return null;
  const tenant_id = owner.tenant_id || owner.id;

  const token = jwt.sign(
    { id: owner.id, tenant_id, email: owner.email, name: owner.name, role: owner.role, via: 'cv-admin:' + slug },
    AUTH_SECRET, { expiresIn: '30d' }
  );
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, secure: true, sameSite: 'none',
    maxAge: 1000 * 60 * 60 * 24 * 30, path: '/citi-tracker'
  });
  return jwt.verify(token, AUTH_SECRET);
}

router.use(async (req, res, next) => {
  const token = getCookie(req, COOKIE_NAME);
  if (token) { try { req.user = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }

  const p = req.path;
  if (PUBLIC_EXACT.includes(p) || PUBLIC_ASSET.test(p)) return next();
  if (p.startsWith('/api/v1/auth/login') || p.startsWith('/api/v1/auth/logout')) return next();
  if (req.user) return next();

  // No tracker session — see whether the CV console already vouched for them.
  try {
    const sso = await trySsoFromCvAdmin(req, res);
    if (sso) { req.user = sso; return next(); }
  } catch (e) {
    console.warn('[citijobs] sso check failed:', e.message);
  }

  if (p.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/citi-tracker/login');
});

// ── Health ───────────────────────────────────────────────────────────────────
router.get('/health', async (req, res) => {
  let db = false;
  try { await sequelize.authenticate(); db = true; } catch (e) { db = false; }
  res.json({
    service: 'bank-opportunity-tracker',
    status: initState.ready && db ? 'ok' : 'degraded',
    database: db,
    initialized: initState.ready,
    init_error: initState.error ? initState.error.message : null,
    feed: workday.config(),
    employers: require('./services/employers').list().map((e) => ({ key: e.key, name: e.name, adapter: e.adapter })),
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
