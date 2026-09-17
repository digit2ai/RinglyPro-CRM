'use strict';

/**
 * AI FACTORY RUNTIME — mounted at /factory.
 *
 *   GET  /factory/health                 open; reports config, never content
 *   GET  /factory/                       dashboard (Basic auth, architect credential)
 *   GET  /factory/api/v1/roster          registry + counts + per-agent stats
 *   GET  /factory/api/v1/agents/:id      compiled brief + eval cases
 *   POST /factory/api/v1/agents/:id/run  { task, context?, deliverable? }
 *   GET  /factory/api/v1/runs            ?agent_id=&limit=
 *   POST /factory/api/v1/evals/run       { agent_id } | { all: true }
 *   ALL  /factory/mcp                    JSON-RPC (Bearer FACTORY_API_KEY)
 *
 * BOTH CREDENTIALS FAIL SHUT. The dashboard reuses ARCHITECT_USER /
 * ARCHITECT_PASSWORD (it is the same internal audience as the Dispatch Board)
 * and the MCP surface needs FACTORY_API_KEY; either unset = 503, never open.
 * Running agents spends money, so an open default is not an option.
 *
 * The page lives in src/views/, outside any static root.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const registry = require('../registry/workforce');
const sets = require('../registry/evals');
const { brain, compileBrief } = require('./brain');
const store = require('./store');
const model = require('./model');
const evals = require('./evals');

const router = express.Router();
router.use(express.json({ limit: '256kb' }));

const TENANT = () => Number(process.env.FACTORY_TENANT_ID || 1);
const VIEW = path.join(__dirname, 'views', 'dashboard.html');

function same(a, b) {
  const ha = crypto.createHash('sha256').update(String(a), 'utf8').digest();
  const hb = crypto.createHash('sha256').update(String(b), 'utf8').digest();
  return crypto.timingSafeEqual(ha, hb);
}

function noStore(res) {
  res.set('Cache-Control', 'no-store');
  res.set('X-Robots-Tag', 'noindex, nofollow');
}

/* ── health (open) ─────────────────────────────────────────────────────── */
router.get('/health', async (req, res) => {
  await store.init();
  noStore(res);
  res.json({
    status: 'healthy', service: 'AI Factory Runtime',
    counts: registry.counts(),
    eval_coverage: { agents_with_evals: sets.coveredAgents().length, cases: Object.values(sets.CASES).reduce((s, c) => s + c.length, 0) },
    store: store.backend(),
    model: model.available() ? { deep: model.modelFor('deep'), fast: model.modelFor('fast') } : 'none (no ANTHROPIC_API_KEY): agents do not run, evals report not_run',
    dashboard: (process.env.ARCHITECT_USER && process.env.ARCHITECT_PASSWORD) ? 'configured' : 'closed',
    mcp: process.env.FACTORY_API_KEY ? 'configured' : 'closed',
    daily_cost_cap_usd: brain.costCapUsd()
  });
});

/* ── MCP (Bearer key) — registered before the Basic gate ──────────────── */
router.all('/mcp', async (req, res) => {
  noStore(res);
  const key = process.env.FACTORY_API_KEY || '';
  if (!key) return res.status(503).json({ error: 'MCP surface is closed: FACTORY_API_KEY is not set' });
  const m = (req.get('authorization') || '').match(/^Bearer\s+(.+)$/i);
  if (!m || !same(m[1].trim(), key)) return res.status(401).json({ error: 'Unauthorized' });
  if (req.method !== 'POST') return res.json({ name: 'digit2ai-ai-factory', transport: 'json-rpc over POST' });

  const { id = null, method, params = {} } = req.body || {};
  const ctx = { tenant_id: TENANT(), role: 'operator', channel: 'mcp', actor: 'mcp:api-key' };
  const reply = (result) => res.json({ jsonrpc: '2.0', id, result });
  const error = (code, message) => res.json({ jsonrpc: '2.0', id, error: { code, message } });

  if (method === 'initialize') return reply({ protocolVersion: '2025-06-18', serverInfo: { name: 'digit2ai-ai-factory', version: '1.0.0' }, capabilities: { tools: {} } });
  if (method === 'tools/list') return reply({ tools: brain.listTools({ channel: 'mcp', role: 'operator' }).map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
  if (method === 'tools/call') {
    const r = await brain.callTool(params.name, params.arguments || {}, ctx);
    return reply({ content: [{ type: 'text', text: JSON.stringify(r) }], isError: !r.success });
  }
  return error(-32601, 'Method not found');
});

/* ── Basic gate for dashboard + API ───────────────────────────────────── */
router.use((req, res, next) => {
  noStore(res);
  const u = process.env.ARCHITECT_USER || '';
  const p = process.env.ARCHITECT_PASSWORD || '';
  if (!u || !p) return res.status(503).type('text').send('AI Factory dashboard is closed: ARCHITECT_USER / ARCHITECT_PASSWORD are not set.');
  const h = req.get('authorization') || '';
  let decoded = '';
  if (/^basic /i.test(h)) { try { decoded = Buffer.from(h.slice(6).trim(), 'base64').toString('utf8'); } catch (e) { decoded = ''; } }
  const cut = decoded.indexOf(':');
  const gotU = cut === -1 ? '' : decoded.slice(0, cut);
  const gotP = cut === -1 ? '' : decoded.slice(cut + 1);
  const okU = same(gotU.trim().toLowerCase(), u.trim().toLowerCase());
  const okP = same(gotP, p);
  if (!(cut !== -1 && okU && okP)) {
    res.set('WWW-Authenticate', 'Basic realm="AI Factory", charset="UTF-8"');
    return res.status(401).type('text').send('Sign in required.');
  }
  req.ctx = { tenant_id: TENANT(), role: 'owner', channel: 'admin', actor: 'owner:' + gotU.trim().toLowerCase() };
  next();
});

router.get('/', (req, res) => {
  if (!req.originalUrl.split('?')[0].endsWith('/')) return res.redirect('/factory/');
  res.type('html').send(fs.readFileSync(VIEW, 'utf8'));
});

router.get('/api/v1/roster', async (req, res) => {
  const stats = await store.stats(req.ctx.tenant_id).catch(() => ({}));
  res.json({
    counts: registry.counts(),
    teams: registry.TEAMS,
    model_configured: model.available(),
    store: store.backend(),
    agents: registry.AGENTS.map(a => ({
      id: a.id, name: a.name, team: a.team, role: a.role, tier: a.tier, model: model.modelFor(a.tier),
      skills: a.skills, eval_cases: sets.casesFor(a.id).length, stats: stats[a.id] || null
    }))
  });
});

router.get('/api/v1/agents/:id', (req, res) => {
  const a = registry.get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Unknown agent' });
  res.json({ ...a, model: model.modelFor(a.tier), brief: compileBrief(a), eval_cases: sets.casesFor(a.id).map(c => ({ id: c.id, task: c.task, why: c.why, checks: c.checks })) });
});

router.post('/api/v1/agents/:id/run', async (req, res) => {
  const r = await brain.callTool(`${req.params.id}.run`, req.body || {}, req.ctx);
  res.status(r.code === 'unknown_tool' ? 404 : 200).json(r);
});

router.get('/api/v1/runs', async (req, res) => {
  res.json({ runs: await store.listRuns(req.ctx.tenant_id, { agent_id: req.query.agent_id, limit: req.query.limit }) });
});

// A full-bench eval makes dozens of model calls, far past the ~100 s proxy
// ceiling in front of this app, so it runs as a background job the page polls.
const JOBS = new Map();
router.get('/api/v1/evals/jobs/:id', (req, res) => {
  const j = JOBS.get(req.params.id);
  if (!j || j.tenant_id !== req.ctx.tenant_id) return res.status(404).json({ error: 'Unknown job' });
  res.json(j);
});

router.post('/api/v1/evals/run', async (req, res) => {
  const b = req.body || {};
  if (b.all === true) {
    const id = crypto.randomBytes(8).toString('hex');
    const job = { id, tenant_id: req.ctx.tenant_id, status: 'running', done: 0, total: sets.coveredAgents().length, results: [], started_at: new Date().toISOString() };
    JOBS.set(id, job);
    setImmediate(async () => {
      try {
        for (const agentId of sets.coveredAgents()) {
          job.results.push(await evals.runAgent(agentId, req.ctx));
          job.done++;
        }
        job.status = 'done';
      } catch (e) { job.status = 'failed'; job.error = e.message; }
      job.finished_at = new Date().toISOString();
      setTimeout(() => JOBS.delete(id), 6 * 3600 * 1000).unref();
    });
    return res.status(202).json(job);
  }
  if (!b.agent_id) return res.status(400).json({ error: 'agent_id or all:true is required' });
  const r = await evals.runAgent(String(b.agent_id), req.ctx);
  res.status(r.success ? 200 : 400).json(r);
});

module.exports = router;
