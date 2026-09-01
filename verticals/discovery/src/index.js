'use strict';

/**
 * AI DISCOVERY — orbup.app/discovery
 *
 * Scribe watches you do a thing and writes down how to do it. This watches you
 * do a thing and works out what it costs, whether it can be automated, and what
 * the first safe step would be. Same recording; a different question asked of it.
 *
 * It is the self-serve front door to the AI Readiness Department: same five
 * agents, same six engines, same honesty properties — with the interview's
 * hardest section (name your processes, and how many hours they take) replaced
 * by measurement, and everything a machine cannot observe still asked of a
 * human.
 *
 * The evaluation and the roadmap are FREE and self-serve. A build is quoted.
 * That boundary is the whole distribution bet: a company that has seen its own
 * work measured and priced is a qualified lead that qualified itself.
 *
 * Three ways in, one code path behind each:
 *   web        session cookie, the dashboard
 *   ingest key the browser extension and any integration pushing captures
 *   read key   the company's own AI, over MCP
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const router = express.Router();

const { sequelize, Account, Process, Answer, Evaluation, Finding, Source, Capture, Event } = require('./models');
const accounts = require('./services/accounts');
const apikeys = require('./services/apikeys');
const captureStore = require('./services/capture-store');
const evaluate = require('./services/evaluate');
const findingsService = require('./services/findings');
const mcp = require('./services/mcp');

const publicDir = path.join(__dirname, '..', 'public');
const extensionDir = path.join(__dirname, '..', 'extension');

router.use(express.json({ limit: '4mb' }));
router.use(express.urlencoded({ extended: true }));

/* ── boot ────────────────────────────────────────────────────────────────── */
let ready = false;
let bootError = null;

(async function init() {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: false });
    // Idempotent adds — sync({alter:false}) never adds a column to a live table.
    const adds = [
      ['dsc_accounts', 'quote_requested_at', 'TIMESTAMP'],
      ['dsc_processes', 'median_run_minutes', 'DOUBLE PRECISION'],
      ['dsc_captures', 'redaction_report', 'JSONB DEFAULT \'{}\'::jsonb'],
      ['dsc_evaluations', 'coverage', 'JSONB DEFAULT \'{}\'::jsonb'],
      ['dsc_evaluations', 'diagram', 'JSONB DEFAULT \'{}\'::jsonb']
    ];
    for (const [t, c, type] of adds) {
      await sequelize.query(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${c} ${type}`).catch(() => {});
    }
    ready = true;
    console.log('AI Discovery: schema ready');
  } catch (e) {
    bootError = e;
    console.error('AI Discovery boot error:', e.message);
  }
})();

/* ── helpers ─────────────────────────────────────────────────────────────── */
function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function setSession(res, token) {
  res.setHeader('Set-Cookie',
    `discovery_token=${encodeURIComponent(token)}; Path=/discovery; HttpOnly; SameSite=Lax; Secure; Max-Age=${60 * 60 * 24 * 30}`);
}

function clearSession(res) {
  res.setHeader('Set-Cookie', 'discovery_token=; Path=/discovery; HttpOnly; SameSite=Lax; Secure; Max-Age=0');
}

const PUBLIC_EXACT = new Set([
  '/', '/health', '/login', '/signup', '/connect', '/how-it-works',
  '/favicon.svg', '/manifest.webmanifest'
]);
const PUBLIC_ASSET = /\.(png|jpe?g|svg|webmanifest|css|js|woff2?|ico|zip)$/i;

/**
 * The gate. Three credential families, and they are deliberately not
 * interchangeable: a session cannot call the ingest endpoint on another
 * tenant, and an ingest key cannot read a roadmap.
 */
router.use(async (req, res, next) => {
  const p = req.path;

  // Key-authenticated machine surfaces resolve their own credential.
  if (p === '/mcp' || p.startsWith('/api/v1/ingest')) return next();

  const token = getCookie(req, 'discovery_token');
  if (token) {
    const claims = accounts.verify(token);
    if (claims) req.user = claims;
  }

  if (PUBLIC_EXACT.has(p) || PUBLIC_ASSET.test(p)) return next();
  if (p.startsWith('/api/v1/auth/')) return next();
  // The read-only shared roadmap: the page and the endpoint behind it. Keyed by
  // an unguessable token, no session — a CEO reading it is not an account.
  if (p.startsWith('/r/') || p.startsWith('/api/v1/public/')) return next();
  // The extension is public by necessity: it is installed before anyone signs
  // in, and it contains no secret — the key is pasted in by the operator.
  if (p.startsWith('/extension')) return next();
  if (req.user) return next();

  if (p.startsWith('/api/')) return res.status(401).json({ error: 'Unauthorized' });
  return res.redirect('/discovery/login?next=' + encodeURIComponent(req.originalUrl || '/discovery/'));
});

function tenantOf(req) { return req.user.tenant_id || req.user.id; }

async function loadAnswers(tenant_id) {
  const rows = await Answer.findAll({ where: { tenant_id } });
  const out = {};
  rows.forEach(r => { out[r.section] = r.payload || {}; });
  return out;
}

async function fullContext(tenant_id) {
  const account = await Account.findOne({ where: { id: tenant_id } });
  const processes = (await Process.findAll({
    where: { tenant_id }, order: [['status', 'ASC'], ['hours_per_week', 'DESC']]
  })).map(p => p.toJSON());
  const answers = await loadAnswers(tenant_id);
  const captureStats = await captureStore.stats(tenant_id);
  return { account, processes, answers, captureStats };
}

/* ── health ──────────────────────────────────────────────────────────────── */
router.get('/health', async (req, res) => {
  let db = 'down';
  try { await sequelize.authenticate(); db = 'up'; } catch (e) { /* down */ }
  res.json({
    service: 'AI Discovery',
    mounted_at: '/discovery',
    status: ready ? 'ok' : 'starting',
    database: db,
    boot_error: bootError ? bootError.message : null,
    engines: 'ai-readiness (data, cost, risk, scorecard, roadmap)',
    model: process.env.DISCOVERY_MODEL || process.env.AIR_MODEL || 'claude-haiku-4-5-20251001',
    model_key_present: !!process.env.ANTHROPIC_API_KEY,
    mcp: { endpoint: '/discovery/mcp', protocol: mcp.PROTOCOL_VERSION, tools: mcp.TOOLS.length },
    evaluation: 'free, self-serve',
    time: new Date().toISOString()
  });
});

/* ── pages ───────────────────────────────────────────────────────────────── */
const page = (name) => (req, res) => res.sendFile(path.join(publicDir, name));

router.get('/', (req, res, next) => (req.user ? page('app.html')(req, res, next) : page('landing.html')(req, res, next)));
router.get('/login', page('login.html'));
router.get('/signup', page('signup.html'));
router.get('/connect', (req, res, next) => (req.user ? page('connect.html')(req, res, next) : res.redirect('/discovery/login')));
router.get('/how-it-works', page('how-it-works.html'));
router.get('/r/:token', page('shared.html'));

router.use(express.static(publicDir, { index: false }));
router.use('/extension', express.static(extensionDir));

/* ── auth ────────────────────────────────────────────────────────────────── */
router.post('/api/v1/auth/signup', async (req, res) => {
  try {
    const row = await accounts.signup(req.body || {});
    setSession(res, accounts.sign(row));
    res.status(201).json({ success: true, account: accounts.clean(row) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/api/v1/auth/login', async (req, res) => {
  const row = await accounts.login(req.body || {});
  if (!row) return res.status(401).json({ error: 'Email or password is incorrect' });
  setSession(res, accounts.sign(row));
  res.json({ success: true, account: accounts.clean(row) });
});

router.post('/api/v1/auth/logout', (req, res) => { clearSession(res); res.json({ success: true }); });

router.get('/api/v1/auth/me', async (req, res) => {
  const token = getCookie(req, 'discovery_token');
  const claims = token ? accounts.verify(token) : null;
  if (!claims) return res.status(401).json({ error: 'Unauthorized' });
  const row = await Account.findOne({ where: { id: claims.id } });
  if (!row) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ success: true, account: accounts.clean(row) });
});

router.patch('/api/v1/account', async (req, res) => {
  const row = await Account.findOne({ where: { id: req.user.id } });
  if (!row) return res.status(404).json({ error: 'Not found' });
  ['name', 'company_name', 'industry', 'country', 'revenue_band', 'lang'].forEach(k => {
    if (req.body[k] !== undefined) row[k] = req.body[k];
  });
  if (req.body.headcount !== undefined) row.headcount = Number(req.body.headcount) || null;
  row.updated_at = new Date();
  await row.save();
  res.json({ success: true, account: accounts.clean(row) });
});

/* ── api keys ────────────────────────────────────────────────────────────── */
router.get('/api/v1/keys', async (req, res) => {
  res.json({ success: true, keys: await apikeys.list(tenantOf(req)) });
});

router.post('/api/v1/keys', async (req, res) => {
  const { key, plaintext } = await apikeys.mint({
    tenant_id: tenantOf(req),
    account_id: req.user.id,
    name: req.body.name,
    scopes: req.body.scopes
  });
  res.status(201).json({
    success: true,
    key: { id: key.id, name: key.name, prefix: key.prefix, scopes: key.scopes },
    plaintext,
    warning: 'This is the only time this key is shown. It is stored as a hash and cannot be recovered — if you lose it, revoke it and mint another.'
  });
});

router.delete('/api/v1/keys/:id', async (req, res) => {
  const row = await apikeys.revoke(tenantOf(req), Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, revoked_at: row.revoked_at });
});

/* ── sources ─────────────────────────────────────────────────────────────── */
router.get('/api/v1/sources', async (req, res) => {
  const rows = await Source.findAll({ where: { tenant_id: tenantOf(req) }, order: [['created_at', 'DESC']] });
  res.json({ success: true, sources: rows });
});

router.post('/api/v1/sources', async (req, res) => {
  const kind = ['extension', 'integration', 'api', 'manual'].includes(req.body.kind) ? req.body.kind : 'api';
  const row = await Source.create({
    tenant_id: tenantOf(req), kind,
    provider: req.body.provider ? String(req.body.provider).slice(0, 60) : null,
    label: req.body.label ? String(req.body.label).slice(0, 80) : null,
    meta: req.body.meta && typeof req.body.meta === 'object' ? req.body.meta : {}
  });
  res.status(201).json({ success: true, source: row });
});

/* ── INGEST — key-authenticated, never a session ─────────────────────────── */
// Kept deliberately separate from the session-authenticated API. A capture
// arrives from an employee's laptop, not from a logged-in browser tab, and the
// two credential families must not be interchangeable.
async function ingestAuth(req, res, next) {
  const presented = req.get('authorization') || req.get('x-api-key') || req.query.key;
  const key = await apikeys.resolve(presented, 'ingest');
  if (!key) return res.status(401).json({ error: 'Invalid or missing ingest key' });
  req.apiKey = key;
  next();
}

router.post('/api/v1/ingest/capture', ingestAuth, async (req, res) => {
  try {
    const r = await captureStore.ingest({
      tenant_id: req.apiKey.tenant_id,
      source_id: req.body.source_id || null,
      payload: req.body,
      channel: 'api'
    });
    res.status(r.duplicate ? 200 : 201).json({
      success: true,
      capture_id: r.capture.id,
      duplicate: !!r.duplicate,
      steps_stored: r.capture.step_count,
      redaction: r.redaction,
      note: 'Stored as shape only. Query strings, typed values and any field outside the allow-list were discarded before writing — the counts above are what the boundary removed.'
    });
  } catch (e) {
    res.status(400).json({ error: e.message, code: e.code || null });
  }
});

router.post('/api/v1/ingest/batch', ingestAuth, async (req, res) => {
  const items = Array.isArray(req.body.captures) ? req.body.captures.slice(0, 100) : [];
  if (!items.length) return res.status(400).json({ error: 'captures[] is required' });
  const results = [];
  for (const payload of items) {
    try {
      const r = await captureStore.ingest({
        tenant_id: req.apiKey.tenant_id, source_id: req.body.source_id || null, payload, channel: 'api'
      });
      results.push({ ok: true, capture_id: r.capture.id, duplicate: !!r.duplicate });
    } catch (e) {
      // One bad capture never abandons the batch — a laptop that produced 40
      // good runs and 1 malformed one should keep the 40.
      results.push({ ok: false, error: e.message });
    }
  }
  res.status(201).json({
    success: true, received: items.length,
    stored: results.filter(r => r.ok && !r.duplicate).length,
    duplicates: results.filter(r => r.duplicate).length,
    failed: results.filter(r => !r.ok).length,
    results
  });
});

router.get('/api/v1/ingest/ping', ingestAuth, (req, res) => {
  res.json({ success: true, tenant: req.apiKey.tenant_id, scopes: req.apiKey.scopes });
});

/* ── captures + processes ────────────────────────────────────────────────── */
router.get('/api/v1/captures', async (req, res) => {
  const rows = await Capture.findAll({
    where: { tenant_id: tenantOf(req) }, order: [['created_at', 'DESC']], limit: 200
  });
  res.json({ success: true, captures: rows, stats: await captureStore.stats(tenantOf(req)) });
});

router.post('/api/v1/processes/derive', async (req, res) => {
  const r = await captureStore.rederive(tenantOf(req));
  const rows = await Process.findAll({ where: { tenant_id: tenantOf(req) }, order: [['hours_per_week', 'DESC']] });
  res.json({ success: true, ...r, processes: rows });
});

router.get('/api/v1/processes', async (req, res) => {
  const where = { tenant_id: tenantOf(req) };
  if (req.query.status) where.status = String(req.query.status);
  const rows = await Process.findAll({ where, order: [['status', 'ASC'], ['hours_per_week', 'DESC']] });
  res.json({ success: true, processes: rows });
});

router.post('/api/v1/processes', async (req, res) => {
  // A manually-added process is `stated`, not `measured`, and is labelled so
  // everywhere downstream. Both are legitimate; conflating them is not.
  const row = await Process.create({
    tenant_id: tenantOf(req),
    name: String(req.body.name || '').slice(0, 160),
    status: 'confirmed', origin: 'manual', hours_source: 'stated',
    people: Number(req.body.people) || 1,
    hours_per_week: Number(req.body.hours_per_week) || 0,
    loaded_hourly_cost: req.body.loaded_hourly_cost != null ? Number(req.body.loaded_hourly_cost) : null,
    customer_facing: req.body.customer_facing != null ? !!req.body.customer_facing : null,
    involves_regulated_data: req.body.involves_regulated_data != null ? !!req.body.involves_regulated_data : null,
    error_tolerance: req.body.error_tolerance || null,
    confirmed_by: req.user.id, confirmed_at: new Date(),
    evidence: { confidence: 'stated', caveats: ['Entered by hand rather than observed. The hours are an estimate, not a measurement.'] }
  });
  if (!row.name) { await row.destroy(); return res.status(400).json({ error: 'A process name is required' }); }
  res.status(201).json({ success: true, process: row });
});

router.patch('/api/v1/processes/:id', async (req, res) => {
  const row = await Process.findOne({ where: { id: Number(req.params.id), tenant_id: tenantOf(req) } });
  if (!row) return res.status(404).json({ error: 'Not found' });

  if (req.body.name !== undefined) row.name = String(req.body.name).slice(0, 160);
  if (req.body.status !== undefined && ['proposed', 'confirmed', 'rejected'].includes(req.body.status)) {
    row.status = req.body.status;
    if (req.body.status === 'confirmed') { row.confirmed_by = req.user.id; row.confirmed_at = new Date(); }
  }
  // Measured fields are not settable through this endpoint. Hours come from
  // observation; letting the UI overwrite them would erase the one thing the
  // capture is for. A hand-entered process uses POST /processes instead.
  if (req.body.loaded_hourly_cost !== undefined) {
    const v = Number(req.body.loaded_hourly_cost);
    row.loaded_hourly_cost = Number.isFinite(v) && v > 0 ? v : null;
  }
  ['customer_facing', 'involves_regulated_data'].forEach(k => {
    if (req.body[k] !== undefined) row[k] = req.body[k] === null ? null : !!req.body[k];
  });
  if (req.body.error_tolerance !== undefined) {
    row.error_tolerance = ['high', 'medium', 'low', 'zero'].includes(req.body.error_tolerance)
      ? req.body.error_tolerance : null;
  }
  row.updated_at = new Date();
  await row.save();
  res.json({ success: true, process: row });
});

router.delete('/api/v1/processes/:id', async (req, res) => {
  const n = await Process.destroy({ where: { id: Number(req.params.id), tenant_id: tenantOf(req) } });
  if (!n) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true });
});

/* ── the questions only a person can answer ──────────────────────────────── */
router.get('/api/v1/answers', async (req, res) => {
  const answers = await loadAnswers(tenantOf(req));
  res.json({
    success: true, answers,
    required: evaluate.REQUIRED,
    missing: evaluate.missingRequired(answers)
  });
});

router.put('/api/v1/answers/:section', async (req, res) => {
  const section = String(req.params.section);
  if (!['fears', 'cost', 'risk', 'data'].includes(section)) {
    return res.status(400).json({ error: 'Unknown section' });
  }
  const tenant_id = tenantOf(req);
  const existing = await Answer.findOne({ where: { tenant_id, section } });
  const payload = req.body && typeof req.body === 'object' ? req.body : {};
  if (existing) { existing.payload = payload; existing.updated_at = new Date(); await existing.save(); }
  else await Answer.create({ tenant_id, section, payload });

  const answers = await loadAnswers(tenant_id);
  res.json({ success: true, answers, missing: evaluate.missingRequired(answers) });
});

/* ── the evaluation ──────────────────────────────────────────────────────── */
router.get('/api/v1/evaluation/preview', async (req, res) => {
  const tenant_id = tenantOf(req);
  const ctx = await fullContext(tenant_id);
  const r = evaluate.run({ ...ctx, lang: req.query.lang || ctx.account.lang });
  if (!r.ok) return res.status(200).json({ success: false, ...r });
  res.json({ success: true, ...r, saved: false });
});

router.post('/api/v1/evaluation/run', async (req, res) => {
  const tenant_id = tenantOf(req);
  const ctx = await fullContext(tenant_id);
  const r = evaluate.run({ ...ctx, lang: req.body.lang || ctx.account.lang });
  if (!r.ok) return res.status(200).json({ success: false, ...r });

  const last = await Evaluation.findOne({ where: { tenant_id }, order: [['version', 'DESC']] });
  const version = (last ? last.version : 0) + 1;
  const crypto = require('crypto');

  const row = await Evaluation.create({
    tenant_id, account_id: req.user.id, version,
    inputs: r.inputs, scorecard: r.scorecard, phases: r.phases,
    diagram: r.diagram, safe_next_step: r.safe_next_step,
    executive_summary: r.executive_summary, findings: r.neural, coverage: r.coverage,
    share_token: crypto.randomBytes(18).toString('base64url')
  });

  await Finding.destroy({ where: { tenant_id, evaluation_id: null } }).catch(() => {});
  await Finding.bulkCreate(r.neural.map(f => ({
    tenant_id, evaluation_id: row.id, code: f.code, severity: f.severity,
    title: f.title, explanation: f.explanation, dollar_impact: f.dollarImpact || '',
    source: f.source, process_id: f.process_id || null, evidence: f.evidence || {}
  }))).catch(() => {});

  await Event.create({
    tenant_id, kind: 'evaluation.run', channel: 'web',
    detail: { version, verdict: r.scorecard.verdict }
  }).catch(() => {});

  res.status(201).json({ success: true, ...r, saved: true, version, share_token: row.share_token });
});

router.get('/api/v1/evaluations', async (req, res) => {
  const rows = await Evaluation.findAll({
    where: { tenant_id: tenantOf(req) }, order: [['version', 'DESC']],
    attributes: ['id', 'version', 'created_at', 'share_token', 'scorecard']
  });
  res.json({
    success: true,
    evaluations: rows.map(r => ({
      id: r.id, version: r.version, created_at: r.created_at, share_token: r.share_token,
      verdict: (r.scorecard || {}).verdict, overall_rating: (r.scorecard || {}).overall_rating
    }))
  });
});

router.get('/api/v1/evaluations/:id', async (req, res) => {
  const row = await Evaluation.findOne({ where: { id: Number(req.params.id), tenant_id: tenantOf(req) } });
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json({ success: true, evaluation: row });
});

/* ── the shared, read-only roadmap ───────────────────────────────────────── */
// Token-keyed, no session. Deliberately omits the account's stated budget
// ceiling and worst-case description — those are the CEO's, and a link that
// travels ends up in more inboxes than the person who minted it expects.
router.get('/api/v1/public/roadmap/:token', async (req, res) => {
  const row = await Evaluation.findOne({ where: { share_token: String(req.params.token) } });
  if (!row) return res.status(404).json({ error: 'Not found' });
  const account = await Account.findOne({ where: { id: row.tenant_id } });
  res.json({
    success: true,
    company: account ? account.company_name : null,
    version: row.version, created_at: row.created_at,
    scorecard: row.scorecard, phases: row.phases, diagram: row.diagram,
    executive_summary: row.executive_summary, safe_next_step: row.safe_next_step,
    coverage: row.coverage,
    findings: (row.findings || []).map(f => ({ ...f, evidence: undefined }))
  });
});

/* ── findings ────────────────────────────────────────────────────────────── */
router.get('/api/v1/findings', async (req, res) => {
  const ctx = await fullContext(tenantOf(req));
  res.json({
    success: true,
    findings: findingsService.build({
      processes: ctx.processes, captures: ctx.captureStats, answers: ctx.answers
    })
  });
});

/* ── the dashboard's one call ────────────────────────────────────────────── */
router.get('/api/v1/overview', async (req, res) => {
  const tenant_id = tenantOf(req);
  const ctx = await fullContext(tenant_id);
  const answers = ctx.answers;
  const last = await Evaluation.findOne({ where: { tenant_id }, order: [['version', 'DESC']] });
  const keys = await apikeys.list(tenant_id);

  const confirmed = ctx.processes.filter(p => p.status === 'confirmed');
  const missing = evaluate.missingRequired(answers);

  res.json({
    success: true,
    account: accounts.clean(ctx.account),
    captures: ctx.captureStats,
    processes: ctx.processes,
    answers,
    missing_answers: missing,
    keys,
    findings: findingsService.build({ processes: ctx.processes, captures: ctx.captureStats, answers }),
    latest_evaluation: last ? {
      id: last.id, version: last.version, created_at: last.created_at,
      share_token: last.share_token, scorecard: last.scorecard,
      phases: last.phases, diagram: last.diagram, coverage: last.coverage,
      executive_summary: last.executive_summary, safe_next_step: last.safe_next_step
    } : null,
    // The one-line state machine the UI renders as a stepper.
    steps: {
      connected: keys.filter(k => k.active).length > 0 || ctx.captureStats.count > 0,
      captured: ctx.captureStats.count > 0,
      confirmed: confirmed.length > 0,
      costed: confirmed.some(p => Number(p.loaded_hourly_cost) > 0),
      answered: missing.length === 0,
      evaluated: !!last
    },
    can_evaluate: confirmed.length > 0 && missing.length === 0
  });
});

/* ── a build is quoted; the assessment is not ────────────────────────────── */
router.post('/api/v1/quote-request', async (req, res) => {
  const row = await Account.findOne({ where: { id: req.user.id } });
  if (!row) return res.status(404).json({ error: 'Not found' });
  row.quote_requested_at = new Date();
  await row.save();
  await Event.create({
    tenant_id: tenantOf(req), kind: 'quote.requested', channel: 'web',
    detail: { note: String(req.body.note || '').slice(0, 2000) }
  }).catch(() => {});
  res.json({
    success: true,
    message: 'Request recorded. Your roadmap stays yours either way — the assessment is free whether or not anything is ever built.'
  });
});

/* ── MCP — the read direction of the key ─────────────────────────────────── */
router.all('/mcp', async (req, res) => {
  const presented = req.get('authorization') || req.get('x-api-key') || req.query.key;
  const key = await apikeys.resolve(presented);
  if (!key) {
    return res.status(401).json({
      jsonrpc: '2.0', id: (req.body || {}).id || null,
      error: { code: -32001, message: 'Invalid or missing API key. Mint one at /discovery/connect.' }
    });
  }
  if (req.method === 'GET') {
    return res.json({
      server: mcp.SERVER_INFO, protocol: mcp.PROTOCOL_VERSION,
      scopes: key.scopes, tools: mcp.listTools(key.scopes)
    });
  }
  try {
    res.json(await mcp.rpc(req.body || {}, key));
  } catch (e) {
    res.status(500).json({
      jsonrpc: '2.0', id: (req.body || {}).id || null,
      error: { code: -32603, message: e.message }
    });
  }
});

module.exports = router;
module.exports.ready = () => ready;
module.exports.bootError = () => bootError;
