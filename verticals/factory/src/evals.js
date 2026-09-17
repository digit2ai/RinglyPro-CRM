'use strict';

/**
 * EVAL RUNNER — runs an agent's cases through the Brain (so an eval costs,
 * audits and gates exactly like real work) and stores one fx_eval_runs row.
 *
 * WITHOUT A MODEL, CASES ARE "not_run", NEVER "passed". A keyless environment
 * producing a green score would be the exact fabrication the evals exist to
 * catch. The score is passed / (passed + failed) and is null when nothing ran.
 */

const registry = require('../registry/workforce');
const sets = require('../registry/evals');
const { brain } = require('./brain');
const store = require('./store');
const model = require('./model');

async function runAgent(agentId, ctx) {
  const agent = registry.get(agentId);
  if (!agent) return { success: false, error: 'Unknown agent: ' + agentId };
  const cases = sets.casesFor(agentId);
  if (!cases.length) return { success: false, code: 'no_evals', error: `${agent.name} has no eval cases yet` };

  const results = [];
  let cost = 0;
  for (const c of cases) {
    const r = await brain.callTool(`${agentId}.run`, { task: c.task, context: c.context, deliverable: c.deliverable }, { ...ctx, channel: 'system' });
    if (!r.executed) {
      results.push({ id: c.id, status: 'not_run', reason: r.code || r.error, why: c.why });
      continue;
    }
    cost += Number(r.cost_usd || 0);
    const g = sets.grade(c.checks, r.artifact);
    results.push({ id: c.id, status: g.pass ? 'passed' : 'failed', failures: g.failures, why: c.why, run_id: r.run_id, excerpt: String(r.artifact || '').slice(0, 600) });
  }
  const passed = results.filter(x => x.status === 'passed').length;
  const failed = results.filter(x => x.status === 'failed').length;
  const notRun = results.filter(x => x.status === 'not_run').length;
  const row = await store.addEval({
    tenant_id: ctx.tenant_id, agent_id: agentId,
    runner: model.available() ? 'model' : 'none', model: model.available() ? model.modelFor(agent.tier) : null,
    cases: cases.length, passed, failed, not_run: notRun,
    score: (passed + failed) ? passed / (passed + failed) : null,
    cost_usd: Math.round(cost * 1e6) / 1e6, results
  });
  return { success: true, agent: agentId, cases: cases.length, passed, failed, not_run: notRun, score: row.score, cost_usd: row.cost_usd, results, eval_run_id: row.id };
}

async function runAll(ctx) {
  const out = [];
  for (const id of sets.coveredAgents()) out.push(await runAgent(id, ctx));
  return out;
}

module.exports = { runAgent, runAll };
