'use strict';

/**
 * RUN + EVAL STORE — Postgres primary, memory safety net.
 *
 * Every agent call and every eval run is a row. That is the whole point of
 * this module: before it, a specialist's work vanished into a chat transcript,
 * so nobody could say what an agent cost, how long it took, or whether it was
 * any good. Now each of those is a query.
 *
 * No DATABASE_URL (or FACTORY_STORE=memory) degrades to an in-memory store
 * behind the identical interface, so /health and the dashboard stay up and
 * the SIT runs offline. /health reports which backend is live.
 */

const MEMORY = { runs: [], evals: [], seq: 0 };
let sequelize = null;
let backend = 'memory';
let ready = null;

const DDL = `
CREATE TABLE IF NOT EXISTS fx_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  agent_id VARCHAR(80) NOT NULL,
  tool VARCHAR(120) NOT NULL,
  channel VARCHAR(20),
  actor VARCHAR(160),
  task_excerpt TEXT,
  output JSONB,
  runner VARCHAR(20) NOT NULL,
  model VARCHAR(60),
  tokens_in INTEGER DEFAULT 0,
  tokens_out INTEGER DEFAULT 0,
  cost_usd NUMERIC(12,6) DEFAULT 0,
  latency_ms INTEGER DEFAULT 0,
  success BOOLEAN NOT NULL,
  error TEXT,
  code VARCHAR(40),
  eval_run_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fx_runs_tenant ON fx_runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fx_runs_tenant_agent ON fx_runs (tenant_id, agent_id, created_at);
CREATE TABLE IF NOT EXISTS fx_eval_runs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  agent_id VARCHAR(80) NOT NULL,
  runner VARCHAR(20) NOT NULL,
  model VARCHAR(60),
  cases INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  failed INTEGER NOT NULL,
  not_run INTEGER NOT NULL,
  score NUMERIC(5,4),
  cost_usd NUMERIC(12,6) DEFAULT 0,
  results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fx_eval_runs_tenant ON fx_eval_runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_fx_eval_runs_tenant_agent ON fx_eval_runs (tenant_id, agent_id, created_at);
`;

function init() {
  if (ready) return ready;
  ready = (async () => {
    const url = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
    if (process.env.FACTORY_STORE === 'memory' || !url) { backend = 'memory'; return backend; }
    try {
      const { Sequelize } = require('sequelize');
      sequelize = new Sequelize(url, {
        dialect: 'postgres', logging: false,
        dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
        pool: { max: 3, min: 0, acquire: 20000, idle: 10000 }
      });
      await sequelize.authenticate();
      await sequelize.query(DDL);
      backend = 'postgres';
    } catch (e) {
      console.error('[factory] store falling back to memory:', e.message);
      sequelize = null; backend = 'memory';
    }
    return backend;
  })();
  return ready;
}

function now() { return new Date().toISOString(); }

async function addRun(row) {
  await init();
  if (backend === 'memory') {
    const r = { id: ++MEMORY.seq, created_at: now(), ...row };
    MEMORY.runs.push(r); return r;
  }
  const [rows] = await sequelize.query(
    `INSERT INTO fx_runs (tenant_id, agent_id, tool, channel, actor, task_excerpt, output, runner, model, tokens_in, tokens_out, cost_usd, latency_ms, success, error, code, eval_run_id)
     VALUES (:tenant_id, :agent_id, :tool, :channel, :actor, :task_excerpt, CAST(:output AS JSONB), :runner, :model, :tokens_in, :tokens_out, :cost_usd, :latency_ms, :success, :error, :code, :eval_run_id)
     RETURNING id, created_at`,
    { replacements: { channel: null, actor: null, task_excerpt: null, model: null, tokens_in: 0, tokens_out: 0, cost_usd: 0, latency_ms: 0, error: null, code: null, eval_run_id: null, ...row, output: JSON.stringify(row.output === undefined ? null : row.output) } }
  );
  return { ...row, ...rows[0] };
}

async function addEval(row) {
  await init();
  if (backend === 'memory') {
    const r = { id: ++MEMORY.seq, created_at: now(), ...row };
    MEMORY.evals.push(r); return r;
  }
  const [rows] = await sequelize.query(
    `INSERT INTO fx_eval_runs (tenant_id, agent_id, runner, model, cases, passed, failed, not_run, score, cost_usd, results)
     VALUES (:tenant_id, :agent_id, :runner, :model, :cases, :passed, :failed, :not_run, :score, :cost_usd, CAST(:results AS JSONB))
     RETURNING id, created_at`,
    { replacements: { model: null, cost_usd: 0, ...row, results: JSON.stringify(row.results || []) } }
  );
  return { ...row, ...rows[0] };
}

async function spentTodayUsd(tenant_id) {
  await init();
  const since = new Date(); since.setHours(0, 0, 0, 0);
  if (backend === 'memory') {
    return MEMORY.runs.filter(r => r.tenant_id === tenant_id && new Date(r.created_at) >= since)
      .reduce((s, r) => s + Number(r.cost_usd || 0), 0);
  }
  const [rows] = await sequelize.query(
    'SELECT COALESCE(SUM(cost_usd),0) AS s FROM fx_runs WHERE tenant_id = :t AND created_at >= :since',
    { replacements: { t: tenant_id, since } });
  return Number(rows[0].s);
}

async function listRuns(tenant_id, { agent_id, limit = 50 } = {}) {
  await init();
  limit = Math.max(1, Math.min(200, Number(limit) || 50));
  if (backend === 'memory') {
    return MEMORY.runs.filter(r => r.tenant_id === tenant_id && (!agent_id || r.agent_id === agent_id))
      .slice(-limit).reverse();
  }
  const [rows] = await sequelize.query(
    `SELECT * FROM fx_runs WHERE tenant_id = :t ${agent_id ? 'AND agent_id = :a' : ''} ORDER BY id DESC LIMIT :l`,
    { replacements: { t: tenant_id, a: agent_id, l: limit } });
  return rows;
}

/** Per-agent rollup: runs, success rate, spend, median-ish latency, latest eval. */
async function stats(tenant_id) {
  await init();
  let runs, evals;
  if (backend === 'memory') {
    runs = MEMORY.runs.filter(r => r.tenant_id === tenant_id && !r.eval_run_id);
    evals = MEMORY.evals.filter(r => r.tenant_id === tenant_id);
  } else {
    [runs] = await sequelize.query(
      `SELECT agent_id, success, cost_usd, latency_ms, runner FROM fx_runs WHERE tenant_id = :t AND eval_run_id IS NULL AND created_at > NOW() - INTERVAL '30 days'`,
      { replacements: { t: tenant_id } });
    [evals] = await sequelize.query(
      `SELECT DISTINCT ON (agent_id) agent_id, runner, cases, passed, failed, not_run, score, created_at FROM fx_eval_runs WHERE tenant_id = :t ORDER BY agent_id, id DESC`,
      { replacements: { t: tenant_id } });
  }
  const out = {};
  runs.forEach(r => {
    const s = out[r.agent_id] || (out[r.agent_id] = { runs: 0, ok: 0, cost_usd: 0, latency: [], simulated: 0 });
    s.runs++; if (r.success) s.ok++; s.cost_usd += Number(r.cost_usd || 0); s.latency.push(Number(r.latency_ms || 0));
    if (r.runner !== 'model') s.simulated++;
  });
  Object.values(out).forEach(s => {
    const l = s.latency.sort((x, y) => x - y);
    s.p50_latency_ms = l.length ? l[Math.floor(l.length / 2)] : null;
    s.success_rate = s.runs ? s.ok / s.runs : null;
    s.cost_usd = Math.round(s.cost_usd * 1e6) / 1e6;
    delete s.latency; delete s.ok;
  });
  const latestEval = {};
  evals.forEach(e => { if (!latestEval[e.agent_id] || e.id > latestEval[e.agent_id].id || e.created_at > latestEval[e.agent_id].created_at) latestEval[e.agent_id] = e; });
  Object.keys(latestEval).forEach(id => {
    const e = latestEval[id];
    (out[id] || (out[id] = { runs: 0, cost_usd: 0, simulated: 0, p50_latency_ms: null, success_rate: null })).eval = {
      runner: e.runner, cases: e.cases, passed: e.passed, failed: e.failed, not_run: e.not_run,
      score: e.score === null || e.score === undefined ? null : Number(e.score), at: e.created_at
    };
  });
  return out;
}

function _reset() { MEMORY.runs = []; MEMORY.evals = []; MEMORY.seq = 0; }

module.exports = { init, addRun, addEval, spentTodayUsd, listRuns, stats, backend: () => backend, _reset };
