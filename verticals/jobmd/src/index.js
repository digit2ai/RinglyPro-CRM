'use strict';

/**
 * JobMD.io — an AI Healthcare Talent Intelligence Network for physician and
 * surgeon recruitment. A specialized division of JobUp.dev.
 *
 * Mounted at /jobmd (and the /jobMD alias the project request declares) by
 * src/app.js. Self-contained Express Router with its own Sequelize instance.
 *
 * Two surfaces:
 *   1. The public landing page — the market, the right fit, who we serve, the
 *      specialties, the Robotics Division, and the AI layer.
 *   2. The JobMD Build Plan Architect — turns the project request into the
 *      declared build-plan JSON, with every constraint enforced in code by
 *      services/verify.js rather than requested in a prompt.
 *
 * Multi-tenant: tenant_id is taken from the session and NEVER from a request
 * body. Emoji-free.
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const { sequelize, User, BuildPlan, PlanRun, Lead } = require('./models');
const { composePlan, MODEL } = require('./services/architect');
const { SCHEMA_KEYS } = require('./services/verify');
const C = require('./services/corpus');

const router = express.Router();
const publicDir = path.join(__dirname, '..', 'public');

const AUTH_SECRET = process.env.JOBMD_JWT_SECRET || process.env.JWT_SECRET || 'jobmd-dev-insecure-secret';
const OWNER_EMAIL = process.env.JOBMD_OWNER_EMAIL || 'mstagg@digit2ai.com';
const OWNER_PASSWORD = process.env.JOBMD_PASSWORD || process.env.SPEAKUP_TEAM_PASSWORD ||
                       process.env.LAWNCOPILOT_MSTAGG_PASSWORD || 'Palindrome@7';
const SALT = process.env.SESSION_SALT || 'd2ai-default-salt';
const DEFAULT_TENANT = parseInt(process.env.JOBMD_TENANT_ID || '1', 10);

router.use(express.json({ limit: '1mb' }));
router.use(express.urlencoded({ extended: true }));

// ── Boot ────────────────────────────────────────────────────────────────────
let initError = null;
let initDone = false;

async function init() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: false });
  // sync({alter:false}) never adds a column to an existing table.
  const alters = [
    'ALTER TABLE jm_build_plans ADD COLUMN IF NOT EXISTS evidence JSONB',
    'ALTER TABLE jm_build_plans ADD COLUMN IF NOT EXISTS counts JSONB',
    'ALTER TABLE jm_plan_runs   ADD COLUMN IF NOT EXISTS rejected_rewrites JSONB',
    'ALTER TABLE jm_leads       ADD COLUMN IF NOT EXISTS status VARCHAR(255) DEFAULT \'new\''
  ];
  for (const sql of alters) {
    try { await sequelize.query(sql); } catch (e) { console.warn('[jobmd] alter skipped:', e.message); }
  }
  const hash = await bcrypt.hash(OWNER_PASSWORD, 10);
  const existing = await User.findOne({ where: { email: OWNER_EMAIL } });
  if (!existing) {
    await User.create({ tenant_id: DEFAULT_TENANT, email: OWNER_EMAIL, name: 'Owner',
                        role: 'admin', password_hash: hash });
  }
  initDone = true;
}

// A transient database blip at boot (Render restarts Postgres, and it answers
// "the database system is in recovery mode" for a few seconds) must not leave
// the vertical permanently degraded. Retry with backoff, then give up loudly —
// /health reports the last error either way.
function initWithRetry(attempt) {
  attempt = attempt || 1;
  return init().then(function () { initError = null; }).catch(function (e) {
    initError = e;
    if (attempt >= 5) {
      console.error('[jobmd] init failed after ' + attempt + ' attempts:', e.message);
      return;
    }
    const wait = Math.min(30000, 2000 * Math.pow(2, attempt - 1));
    console.warn('[jobmd] init attempt ' + attempt + ' failed (' + e.message + '); retrying in ' + wait + 'ms');
    setTimeout(function () { initWithRetry(attempt + 1); }, wait);
  });
}
initWithRetry();

// ── Auth ────────────────────────────────────────────────────────────────────
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

router.use(function (req, res, next) {
  const t = getCookie(req, 'jobmd_token');
  if (t) { try { req.user = jwt.verify(t, AUTH_SECRET); } catch (e) { /* invalid */ } }
  next();
});

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// TENANT COMES FROM THE SESSION. A tenant_id in a body is ignored, not trusted.
function tenantOf(req) { return req.user ? req.user.tenant_id : DEFAULT_TENANT; }

router.post('/api/v1/auth/login', async function (req, res) {
  try {
    const email = String((req.body && req.body.email) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    const user = await User.findOne({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, tenant_id: user.tenant_id },
                           AUTH_SECRET, { expiresIn: '30d' });
    res.setHeader('Set-Cookie',
      'jobmd_token=' + encodeURIComponent(token) + '; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000');
    res.json({ ok: true, user: { email: user.email, role: user.role } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/v1/auth/logout', function (req, res) {
  res.setHeader('Set-Cookie', 'jobmd_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.json({ ok: true });
});

router.get('/api/v1/auth/me', function (req, res) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ email: req.user.email, role: req.user.role, tenant_id: req.user.tenant_id });
});

// ── Health ──────────────────────────────────────────────────────────────────
router.get('/health', function (req, res) {
  res.json({
    ok: !initError,
    service: 'JobMD.io',
    parent_ecosystem: 'JobUp.dev',
    db: initDone ? 'connected' : (initError ? 'error' : 'connecting'),
    model: process.env.ANTHROPIC_API_KEY ? MODEL : null,
    narrative_path: process.env.ANTHROPIC_API_KEY ? 'model' : 'deterministic',
    counts: {
      medical_specialties: C.MEDICAL_SPECIALTIES.length,
      agents: C.AGENTS.length,
      recruitment_pipeline_stages: C.RECRUITMENT_PIPELINE.length,
      matching_dimensions: C.MATCHING_DIMENSIONS.length,
      jobup_inventory: C.JOBUP_INVENTORY.length
    },
    error: initError ? initError.message : null
  });
});

// ── The declared schema, so a caller can check what it will receive ─────────
router.get('/api/v1/architect/schema', function (req, res) {
  res.json({
    schema_keys: SCHEMA_KEYS,
    binding_counts: {
      medical_specialties: C.MEDICAL_SPECIALTIES.length,
      agents: C.AGENTS.length,
      recruitment_pipeline_stages: C.RECRUITMENT_PIPELINE.length,
      matching_dimensions: C.MATCHING_DIMENSIONS.length
    },
    jobup_inventory: C.JOBUP_INVENTORY.map(function (e) { return e.component; }),
    protected_nouns: C.PROTECTED_NOUNS,
    source_truncated: C.TALENT_DISCOVERY_TRUNCATED
  });
});

// ── Compose a plan. Persists nothing. Contains no PII by construction. ──────
router.get('/api/v1/architect/plan', async function (req, res) {
  try {
    const useModel = req.query.model !== '0';
    const out = await composePlan({ use_model: useModel });
    if (!out.ok) {
      // A plan that fails its own constraints is never returned.
      return res.status(500).json({ error: 'The composed plan failed constraint verification.',
                                    violations: out.verification.violations });
    }
    res.json(out);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Compose and persist ─────────────────────────────────────────────────────
router.post('/api/v1/architect/runs', requireAuth, async function (req, res) {
  const tenant_id = tenantOf(req);
  try {
    const out = await composePlan({ use_model: req.body && req.body.use_model !== false });
    await PlanRun.create({
      tenant_id, status: out.ok ? 'ok' : 'refused', composed_by: out.composed_by,
      violations: out.verification.violations, rejected_rewrites: out.rejected_rewrites,
      duration_ms: out.duration_ms, error: out.model_error || null
    });
    if (!out.ok) {
      return res.status(422).json({ error: 'Refused: the composed plan failed constraint verification.',
                                    violations: out.verification.violations });
    }
    const row = await BuildPlan.create({
      tenant_id,
      label: String((req.body && req.body.label) || 'JobMD.io build plan').slice(0, 200),
      plan: out.plan, evidence: out.evidence, counts: out.counts,
      verification: out.verification, composed_by: out.composed_by,
      is_simulated: out.is_simulated, model: out.model, duration_ms: out.duration_ms,
      created_by: req.user.id
    });
    res.status(201).json({ id: row.id, ok: true, composed_by: out.composed_by,
                           is_simulated: out.is_simulated, counts: out.counts, plan: out.plan });
  } catch (e) {
    try {
      await PlanRun.create({ tenant_id, status: 'error', error: e.message });
    } catch (e2) { /* audit best effort */ }
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/v1/architect/runs', requireAuth, async function (req, res) {
  try {
    const rows = await BuildPlan.findAll({
      where: { tenant_id: tenantOf(req) },
      order: [['created_at', 'DESC']], limit: 50,
      attributes: ['id', 'label', 'counts', 'composed_by', 'is_simulated', 'model', 'duration_ms', 'created_at']
    });
    res.json({ items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/v1/architect/runs/:id', requireAuth, async function (req, res) {
  try {
    // Scoped by BOTH id and tenant_id, so another tenant's plan reads as absent.
    const row = await BuildPlan.findOne({
      where: { id: parseInt(req.params.id, 10) || 0, tenant_id: tenantOf(req) }
    });
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Landing-page leads ──────────────────────────────────────────────────────
const leadBucket = new Map();
function rateLimited(key, perHour) {
  const now = Date.now();
  const windowStart = now - 3600000;
  const hits = (leadBucket.get(key) || []).filter(function (t) { return t > windowStart; });
  if (hits.length >= perHour) { leadBucket.set(key, hits); return true; }
  hits.push(now);
  leadBucket.set(key, hits);
  if (leadBucket.size > 5000) leadBucket.clear();
  return false;
}

function ipHash(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             req.ip || req.connection.remoteAddress || '';
  return crypto.createHash('sha256').update(SALT + '|' + ip).digest('hex').slice(0, 32);
}

router.post('/api/v1/leads', async function (req, res) {
  try {
    const b = req.body || {};
    const first_name = String(b.first_name || '').trim().slice(0, 120);
    const email = String(b.email || '').trim().slice(0, 200);
    if (!first_name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'A first name and a valid email address are required.' });
    }
    const hash = ipHash(req);
    if (rateLimited(hash, parseInt(process.env.JOBMD_LEADS_PER_HOUR || '10', 10))) {
      return res.status(429).json({ error: 'Too many submissions. Please call (888) 315-4401.' });
    }
    const roles = ['surgeon', 'hospital_executive', 'other'];
    const role = roles.indexOf(String(b.role || '')) !== -1 ? String(b.role) : null;
    await Lead.create({
      tenant_id: DEFAULT_TENANT,          // never from the body
      first_name,
      last_name: String(b.last_name || '').trim().slice(0, 120) || null,
      email,
      phone: String(b.phone || '').trim().slice(0, 60) || null,
      role,
      message: String(b.message || '').trim().slice(0, 4000) || null,
      source: 'landing',
      ip_hash: hash
    });
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/v1/leads', requireAuth, async function (req, res) {
  try {
    const rows = await Lead.findAll({
      where: { tenant_id: tenantOf(req) }, order: [['created_at', 'DESC']], limit: 200
    });
    res.json({ items: rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Static + landing ────────────────────────────────────────────────────────
// index:false so express.static never answers "/" with the raw file.
router.use(express.static(publicDir, { index: false }));
router.get('/', function (req, res) { res.sendFile(path.join(publicDir, 'index.html')); });

module.exports = router;
module.exports.init = init;
