'use strict';

/**
 * Claude Code — HTTP surface. Mounted at /speakup/api/v1/claude-code.
 *
 * OPERATOR ONLY, the same audience as the AI Factory. A run clones a repository, spends
 * money and pushes a branch: it is the Factory's authority reached a different way, so
 * it reuses the Factory's operator allow-list rather than inventing a second one.
 *
 * Every state-changing route requires X-SpeakUp: 1 and a same-host Origin, and tenant_id
 * comes from the verified session — never from a body, a query or a header.
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const models = require('../models');   // resolved at call time (see claudecode/store.js)
const security = require('../factory/security');
const jobs = require('../factory/jobs');   // readiness() only — the same configuration gate the Factory uses
const audit = require('../factory/audit');
const store = require('../claudecode/store');
const runner = require('../claudecode/runner');
const github = require('../claudecode/github');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }

function mutation(req, res, next) {
  if (!security.sameOriginRequest(req)) return res.status(403).json({ error: 'Cross-site request refused' });
  next();
}
function operator(req, res, next) {
  if (!security.isFactoryOperator(req.user)) return res.status(403).json({ error: 'AI Factory operator only' });
  next();
}

// THE ROLE AND THE EMAIL COME FROM THE DATABASE, NOT FROM A 30-DAY TOKEN. Without this, an
// account demoted or disabled today keeps an admin token with an allow-listed email for up to a
// month — and on this surface that token clones, executes and pushes. The Factory router already
// does exactly this; the copy is deliberate, because the two must not drift.
function freshUser(req, res, next) {
  (async () => {
    const u = req.user && await models.User.findByPk(req.user.id);
    if (!u || String(u.email).toLowerCase() !== String(req.user.email || '').toLowerCase()) {
      return res.status(401).json({ error: 'No autorizado' });
    }
    req.user = Object.assign({}, req.user, { role: u.role, email: u.email, tenant_id: u.tenant_id || u.id });
    next();
  })().catch(e => res.status(500).json({ error: e.message }));
}

// A SURFACE THAT RUNS ARBITRARY CODE MUST NOT BE LOOSER THAN ONE THAT ONLY OPENS A PULL REQUEST.
// The Factory refuses every execution while SPEAKUP_TEAM_PASSWORD is the published default or
// SPEAKUP_JWT_SECRET is unset — both of which would let anyone who has read this public
// repository sign in and be an operator by email. This surface had no such gate; it does now,
// and it applies to the routes that START work, not to reading a past run.
function configured(req, res, next) {
  const r = jobs.readiness();
  const blocking = (r.blockers || []).filter(b => b.code === 'weak_password' || b.code === 'auth_secret_default');
  if (blocking.length) {
    return res.status(423).json({ error: 'Claude Code is closed until this server is configured: ' + blocking.map(b => b.fix).join(' '), blockers: blocking });
  }
  next();
}
const wrap = (fn) => (req, res) => fn(req, res).catch(e => {
  console.error('CLAUDE CODE route error', req.method, req.path, e.message);
  const status = e && e.status && e.status >= 400 && e.status < 600 ? e.status : 500;
  res.status(status).json({ error: e.message });
});

router.use(freshUser);
router.use(operator);

// ── config / health of this surface ──────────────────────────────────────────
router.get('/config', wrap(async (req, res) => res.json(runner.config())));

// ── repositories ─────────────────────────────────────────────────────────────
// Cached in cc_repos so the page loads without a GitHub round trip; Sync refreshes.
router.get('/repos', wrap(async (req, res) => {
  const tenant_id = tenantOf(req);
  let rows = await models.CcRepo.findAll({ where: { tenant_id }, order: [['repo_full_name', 'ASC']] });
  if (!rows.length && github.configured()) {
    const live = await github.listRepos();
    for (const r of live) {
      await models.CcRepo.findOrCreate({
        where: { tenant_id, repo_full_name: r.repo_full_name },
        defaults: { tenant_id, repo_full_name: r.repo_full_name, default_branch: r.default_branch, last_synced_at: new Date() }
      });
    }
    rows = await models.CcRepo.findAll({ where: { tenant_id }, order: [['repo_full_name', 'ASC']] });
  }
  res.json({
    configured: github.configured(),
    allowed_owners: github.allowedOwners(),
    repos: rows.map(r => ({
      id: r.id, repo_full_name: r.repo_full_name, default_branch: r.default_branch || 'main',
      has_architect_skill: r.has_architect_skill, can_push: r.can_push, last_synced_at: r.last_synced_at
    }))
  });
}));

// Refresh one repository: default branch and whether it carries the architect skill.
router.post('/repos/:id/sync', mutation, wrap(async (req, res) => {
  const tenant_id = tenantOf(req);
  const row = await models.CcRepo.findOne({ where: { tenant_id, id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'No encontrado' });
  const meta = await github.getRepo(row.repo_full_name);
  const skill = await github.hasArchitectSkill(row.repo_full_name);
  const push = !!(meta && meta.permissions && meta.permissions.push);
  await row.update({ default_branch: meta.default_branch || row.default_branch || 'main', has_architect_skill: skill, can_push: push, last_synced_at: new Date() });
  res.json({ ok: true, repo: { id: row.id, repo_full_name: row.repo_full_name, default_branch: row.default_branch, has_architect_skill: row.has_architect_skill, can_push: row.can_push, last_synced_at: row.last_synced_at } });
}));

// Re-read the whole list from GitHub (new repositories appear here).
router.post('/repos/refresh', mutation, wrap(async (req, res) => {
  const tenant_id = tenantOf(req);
  const live = await github.listRepos();
  for (const r of live) {
    const [row] = await models.CcRepo.findOrCreate({
      where: { tenant_id, repo_full_name: r.repo_full_name },
      defaults: { tenant_id, repo_full_name: r.repo_full_name, default_branch: r.default_branch }
    });
    await row.update({ default_branch: r.default_branch || row.default_branch, last_synced_at: new Date() });
  }
  res.json({ ok: true, count: live.length });
}));

// A run id is an integer. Passing 'abc' into a `where` made Postgres throw
// "invalid input syntax for type integer", which `wrap` turned into a 500 quoting the driver.
router.param('id', (req, res, next, value) => (/^\d+$/.test(String(value)) ? next() : res.status(404).json({ error: 'No encontrado' })));

// ── runs ─────────────────────────────────────────────────────────────────────
async function createRun(req, { repo_full_name, brief, base_branch, source, source_ref }) {
  const tenant_id = tenantOf(req);
  const text = String(brief || '').trim();
  if (!text) { const e = new Error('The brief is empty'); e.status = 400; throw e; }
  if (text.length > 50000) { const e = new Error('The brief is too long (50,000 characters)'); e.status = 400; throw e; }
  github.assertAllowed(repo_full_name);            // the owner allow-list, before anything is stored
  // AND THE TOKEN MUST BE ABLE TO PUSH. Read access carries a run all the way through the clone,
  // the agent and the commit before failing — after the money is spent. One API call here turns
  // that into an immediate, actionable refusal.
  const push = await github.canPush(repo_full_name);
  if (!push.ok) {
    const e = new Error(push.reason + '. Set GITHUB_TOKEN on Render to a token with Contents: Read and write and Pull requests: Read and write on this repository.');
    e.status = 403; throw e;
  }
  // CLAIMED BEFORE THE FIRST await, AND RELEASED BY THE RUNNER. `atCapacity` alone was checked
  // about three awaits before the runner registered the run, so a burst of requests all saw an
  // empty table and all started: N clones on the shared instance's /tmp and N times the cost cap.
  if (!runner.reserve(tenant_id)) {
    const e = new Error('Already running ' + runner.MAX_CONCURRENT + ' jobs. Wait for one to finish.');
    e.status = 429; throw e;
  }
  let reserved = true;
  const release = () => { if (reserved) { reserved = false; runner.release(tenant_id); } };
  try {
  if (!security.rateLimit('cc_run', String(tenant_id), 30, 60 * 60 * 1000)) {
    const e = new Error('Too many runs this hour'); e.status = 429; throw e;
  }
  const repo = await models.CcRepo.findOne({ where: { tenant_id, repo_full_name } });
  const run = await models.CcRun.create({
    tenant_id, user_id: req.user.id,
    repo_full_name,
    base_branch: String(base_branch || (repo && repo.default_branch) || 'main').slice(0, 120),
    brief: text,
    source: ['manual', 'speakup', 'factory'].includes(String(source)) ? String(source) : 'manual',
    source_ref: source_ref ? String(source_ref).slice(0, 120) : null,
    status: 'queued'
  });
  await audit.record({
    tenant_id, user_id: req.user.id, actor: req.user.email, action: 'cc.run_created',
    entity: 'cc_run', entity_id: run.id, to_status: 'queued',
    detail: { repo: repo_full_name, source: run.source, source_ref: run.source_ref }, req
  });
  await store.emit(run.id, 'system', { status: 'queued', repo: repo_full_name, base_branch: run.base_branch });
  // The runner takes the reservation over and releases it once the run is registered as active.
  reserved = false;
  runner.start(run.id, tenant_id);
  return run;
  } catch (e) { release(); throw e; }
}

router.post('/runs', mutation, configured, wrap(async (req, res) => {
  const run = await createRun(req, req.body || {});
  res.status(201).json({ ok: true, run: store.view(run) });
}));

// The door SpeakUp's "Transfer to Factory" and the Factory itself use. Same gates, same
// creation path — it exists so a caller inside the app does not reimplement the checks.
router.post('/intake', mutation, configured, wrap(async (req, res) => {
  const body = req.body || {};
  if (!body.source) body.source = 'speakup';
  const run = await createRun(req, body);
  res.status(201).json({
    ok: true, run_id: run.id,
    url: '/speakup/claude-code/runs/' + run.id,
    run: store.view(run)
  });
}));

router.get('/runs', wrap(async (req, res) => {
  const tenant_id = tenantOf(req);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const rows = await models.CcRun.findAll({ where: { tenant_id }, order: [['id', 'DESC']], limit });
  res.json({ runs: rows.map(store.view) });
}));

router.get('/runs/:id', wrap(async (req, res) => {
  const run = await store.own(tenantOf(req), req.params.id);
  if (!run) return res.status(404).json({ error: 'No encontrado' });
  const after = Number(req.query.after) || 0;
  // The newest N, and the page is TOLD when that is not all of them. Returning a silent tail
  // meant every reload of a real run quietly threw away the beginning of its own log.
  const LIMIT = Math.min(1000, Math.max(50, Number(process.env.CC_EVENTS_PAGE) || 500));
  const where = after ? { run_id: run.id, id: { [Op.gt]: after } } : { run_id: run.id };
  const total = await models.CcRunEvent.count({ where });
  const events = await models.CcRunEvent.findAll({ where, order: [['id', 'DESC']], limit: LIMIT });
  res.json({
    run: store.view(run),
    events: events.reverse().map(e => ({ id: e.id, ts: e.ts, kind: e.kind, payload: e.payload })),
    total, truncated: total > events.length
  });
}));

// Live events. Replays what is stored (so a late connection misses nothing) and then
// follows the bus until the run reaches a terminal status.
router.get('/runs/:id/stream', wrap(async (req, res) => {
  const run = await store.own(tenantOf(req), req.params.id);
  if (!run) return res.status(404).json({ error: 'No encontrado' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  const send = (obj) => { try { res.write('data: ' + JSON.stringify(obj) + '\n\n'); } catch (e) {} };

  const after = Number(req.query.after) || 0;
  const stored = await models.CcRunEvent.findAll({
    where: after ? { run_id: run.id, id: { [Op.gt]: after } } : { run_id: run.id },
    order: [['id', 'ASC']], limit: 500
  });
  for (const e of stored) send({ id: e.id, kind: e.kind, payload: e.payload, ts: e.ts });

  let closed = false;
  const unsubscribe = store.subscribe(run.id, (ev) => {
    send(ev);
    if (ev.kind === 'system' && ev.payload && store.isTerminal(ev.payload.status)) finish();
  });
  // A 20 s comment keeps Cloudflare and the browser from closing an idle stream.
  const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
  function finish() {
    if (closed) return;
    closed = true;
    clearInterval(ping);
    unsubscribe();
    send({ kind: 'end' });
    try { res.end(); } catch (e) {}
  }
  req.on('close', finish);

  const fresh = await store.own(tenantOf(req), req.params.id);
  if (fresh && store.isTerminal(fresh.status)) { send({ kind: 'system', payload: store.view(fresh) }); finish(); }
}));

router.post('/runs/:id/cancel', mutation, wrap(async (req, res) => {
  const run = await store.own(tenantOf(req), req.params.id);
  if (!run) return res.status(404).json({ error: 'No encontrado' });
  if (store.isTerminal(run.status)) return res.status(409).json({ error: 'Already finished: ' + run.status });
  await runner.cancel(run);
  await audit.record({
    tenant_id: run.tenant_id, user_id: req.user.id, actor: req.user.email, action: 'cc.run_cancelled',
    entity: 'cc_run', entity_id: run.id, to_status: 'cancelled', req
  });
  const after = await store.own(tenantOf(req), req.params.id);
  res.json({ ok: true, run: after ? store.view(after) : store.view(run) });
}));

// Merge by hand. The pull request number is read back from the stored URL rather than
// taken from the caller, so this can only ever merge the PR this run opened.
router.post('/runs/:id/merge', mutation, configured, wrap(async (req, res) => {
  const run = await store.own(tenantOf(req), req.params.id);
  if (!run) return res.status(404).json({ error: 'No encontrado' });
  if (run.status !== 'pr_open') return res.status(409).json({ error: 'The run is ' + run.status + ', not pr_open' });
  const m = String(run.pr_url || '').match(/\/pull\/(\d+)/);
  if (!m) return res.status(409).json({ error: 'No pull request on this run' });
  const pr = await github.getPR(run.repo_full_name, m[1]);
  if (pr.draft) return res.status(409).json({ error: 'The pull request is a draft: the tests were red. Review it on GitHub.' });
  await github.mergePR(run.repo_full_name, m[1], pr.head.sha, 'AutoDev ' + run.id);
  await store.setStatus(run, 'merged');
  await audit.record({
    tenant_id: run.tenant_id, user_id: req.user.id, actor: req.user.email, action: 'cc.run_merged',
    entity: 'cc_run', entity_id: run.id, to_status: 'merged', detail: { pr: run.pr_url }, req
  });
  const hook = process.env.RENDER_DEPLOY_HOOK_URL;
  if (hook) {
    try {
      await fetch(hook, { method: 'POST' });
      await store.setStatus(run, 'deployed', { deploy_url: process.env.CC_DEPLOY_URL || null });
    } catch (e) {
      await store.log(run.id, 'Merged, but the deploy hook did not answer: ' + e.message);
    }
  }
  const after = await store.own(tenantOf(req), req.params.id);
  res.json({ ok: true, run: after ? store.view(after) : store.view(run) });
}));

module.exports = router;
module.exports.__createRun = createRun;
