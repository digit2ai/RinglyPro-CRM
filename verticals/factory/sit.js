'use strict';

/**
 * AI FACTORY RUNTIME — SIT.  node verticals/factory/sit.js
 *
 * Zero external keys, in-memory store. It unsets ANTHROPIC_API_KEY first, so
 * the keyless path is what runs for real; the model path is exercised with an
 * injected fake whose outputs are chosen to pass and to FAIL each check.
 * NOT COVERED: a live Anthropic call and the Postgres store (verify against
 * production: GET /factory/health).
 */

delete process.env.ANTHROPIC_API_KEY;
process.env.FACTORY_STORE = 'memory';
process.env.FACTORY_COST_CAP_USD = '1';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

const ROOT = path.join(__dirname, '..', '..');
const registry = require('./registry/workforce');
const sets = require('./registry/evals');
const model = require('./src/model');
const store = require('./src/store');
const { brain, compileBrief, verify } = require('./src/brain');
const evals = require('./src/evals');

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; } else { fail++; console.log('  FAIL ' + name + (detail ? ' :: ' + detail : '')); }
}
const OWNER = { tenant_id: 7, role: 'owner', channel: 'admin', actor: 'sit' };
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

(async () => {
  console.log('AI Factory SIT (ANTHROPIC_API_KEY unset for this run; model path uses an injected fake)');

  /* ── 1. registry integrity ─────────────────────────────────────────── */
  const c = registry.counts();
  ok(c.total === 102, 'registry has 102 agents', c.total);
  ok(c.core_seats === 10 && c.core_agents === 14, 'core = 10 seats / 14 agents', JSON.stringify(c));
  ok(c.specialists === 76, '76 specialists', c.specialists);
  ok(c.ai_services_smes === 12, '12 AI Services SMEs', c.ai_services_smes);
  const ids = registry.AGENTS.map(a => a.id);
  ok(new Set(ids).size === ids.length, 'agent ids unique');
  ok(ids.every(id => /^[a-z][a-z0-9_]*$/.test(id)), 'agent ids are lower_snake_case');
  ok(registry.AGENTS.every(a => registry.TEAMS[a.team]), 'every agent has a known team');
  ok(registry.AGENTS.filter(a => a.team === 'aisvc').every(a => a.skills.length >= 4 && a.rules.length >= 1), 'every AI Services SME carries skills and rules');
  ok(Object.keys(sets.CASES).every(id => registry.get(id)), 'every eval set names a real agent');

  /* ── 2. DRIFT: every surface quotes the registry ───────────────────── */
  const skill = read('.claude/commands/ringlypro-architect.md');
  ok(skill.includes(`${c.total}-agent workforce`), 'architect skill quotes the total', `${c.total}-agent workforce`);
  ok(skill.includes(`${c.core_seats} core seats`), 'architect skill quotes core seats');
  ok(skill.includes(`${c.specialists} specialists`) && skill.includes(`${c.ai_services_smes} AI Services SMEs`), 'architect skill quotes specialists + SMEs');
  const coreTable = skill.slice(skill.indexOf('### The 10 Always-On Core Seats'), skill.indexOf('### The 76 Senior Specialists'));
  const coreRows = (coreTable.match(/^\| (0[1-9]|1[0-9]) \| \*\*/gm) || []).length;
  ok(coreRows === c.core_seats, 'architect skill core table has one row per core seat', coreRows);

  const aiSkill = read('.claude/commands/ai-specialist.md');
  const smeHeads = (aiSkill.match(/^### \d+\. /gm) || []).length;
  ok(smeHeads === c.ai_services_smes, 'ai-specialist skill documents every SME', smeHeads);
  registry.AGENTS.filter(a => a.team === 'aisvc').forEach(a => ok(aiSkill.includes(a.name), `ai-specialist skill names ${a.name}`));

  const board = read('src/views/architect-board.html');
  const boardJs = board.slice(board.indexOf('var GROUPS'), board.indexOf('var FILTERS'));
  const GROUPS = new Function(boardJs + '; return GROUPS;')();
  ok(GROUPS.reduce((s, g) => s + g.agents.length, 0) === c.total, 'Dispatch Board bench totals the registry');
  ok(board.includes(`label:'All ${c.total}'`) && board.includes(`' of ${c.total}'`), 'Dispatch Board labels quote the total');

  const factory = read('public/ringlypro-architect-factory.html');
  ok(factory.includes(`${c.total}-AGENT WORKFORCE`), 'factory stage quotes the total');
  const army = factory.slice(factory.indexOf('<div class="army">'), factory.indexOf('<!-- ===== the 4 deliverables'));
  const armySum = (army.match(/<span class="cn">(\d+)<\/span>/g) || []).reduce((s, m) => s + Number(m.match(/\d+/)[0]), 0);
  ok(armySum === c.on_call, 'factory roster cards sum to specialists + SMEs', armySum);
  ok((factory.match(/class="node" id="n\d+"/g) || []).length === c.core_seats, 'factory stage has one node per core seat');

  const landing = read('public/neural-intelligence.html');
  ok(landing.includes(`${c.core_agents} core + ${c.on_call} specialists = a ${c.total}-agent workforce.`), 'digit2ai.com landing headline matches the registry');

  /* ── 3. briefs + verification ───────────────────────────────────────── */
  const fe = registry.get('field_extractor');
  const b = compileBrief(fe);
  ok(b.includes('Field Extractor') && b.includes('Return JSON only.') && b.includes('Never invent a statistic'), 'brief carries role, agent rules and house rules');
  ok(verify(fe, '{"a":1}').length === 0, 'valid JSON passes the JSON agent check');
  ok(verify(fe, 'Here is the JSON: {').includes('not_valid_json'), 'invalid JSON flagged for JSON agents');
  ok(verify(registry.get('outreach_drafter'), 'Hola \u{1F600}').includes('emoji_in_output'), 'emoji flagged');

  /* ── 4. gateway gates ───────────────────────────────────────────────── */
  let r = await brain.callTool('field_extractor.brief', {}, { tenant_id: 7, role: 'owner', channel: 'sms' });
  ok(r.code === 'channel_forbidden', 'unknown channel denied', r.code);
  r = await brain.callTool('field_extractor.run', { task: 'x' }, { tenant_id: 7, role: 'reader', channel: 'admin' });
  ok(r.code === 'role_forbidden', 'reader cannot run an agent', r.code);
  r = await brain.callTool('field_extractor.brief', {}, { tenant_id: 7, role: 'reader', channel: 'admin' });
  ok(r.success && r.brief, 'reader can fetch a brief');
  r = await brain.callTool('field_extractor.run', { task: 'x' }, { role: 'owner', channel: 'admin' });
  ok(r.code === 'no_tenant', 'no tenant context refused', r.code);
  r = await brain.callTool('nope.run', { task: 'x' }, OWNER);
  ok(r.code === 'unknown_tool', 'unknown tool refused');
  r = await brain.callTool('field_extractor.run', { task: '   ' }, OWNER);
  ok(r.code === 'bad_request', 'empty task refused');
  r = await brain.callTool('field_extractor.run', { task: 'x'.repeat(20001) }, OWNER);
  ok(r.code === 'too_large', 'oversized task refused');

  /* ── 5. keyless: nothing is fabricated ──────────────────────────────── */
  ok(!model.available(), 'no model configured in this run');
  r = await brain.callTool('ai_specialist.run', { task: 'Package an AI knowledge assistant.' }, OWNER);
  ok(r.success === false && r.executed === false && r.is_simulated === true && r.code === 'model_unavailable', 'keyless run is labelled not executed');
  ok(!('artifact' in r), 'keyless run returns no artifact');
  let e = await evals.runAgent('field_extractor', OWNER);
  ok(e.passed === 0 && e.failed === 0 && e.not_run === 2 && e.score === null, 'keyless eval is not_run with null score, never passed', JSON.stringify({ p: e.passed, n: e.not_run, s: e.score }));
  e = await evals.runAgent('senior_accountant_does_not_exist', OWNER);
  ok(e.success === false, 'eval for unknown agent refused');
  e = await evals.runAgent('sit_tester', OWNER);
  ok(e.code === 'no_evals', 'agent without cases reports no_evals rather than a score');

  /* ── 6. model path with an injected fake ────────────────────────────── */
  const seen = [];
  model._inject(async ({ model: m, system, user }) => {
    seen.push({ m, system, user });
    if (/Extract the fields invoice_number/.test(user)) {
      return { text: JSON.stringify({ document_id: 'd', doc_type: 'invoice', fields: [{ name: 'invoice_number', value: 'INV-20931' }, { name: 'total_amount', value: null }], unextracted_fields: ['total_amount'], notes: null }), usage: { input_tokens: 1000, output_tokens: 200 }, stop_reason: 'end_turn', model: m };
    }
    if (/invoice_date and payment_terms/.test(user)) {
      // Deliberately WRONG: normalised the date, so the verbatim check must fail.
      return { text: '{"invoice_date":"Aug 14 2026","payment_terms":"Net 30"}', usage: { input_tokens: 500, output_tokens: 50 }, stop_reason: 'end_turn', model: m };
    }
    return { text: 'ok', usage: { input_tokens: 10, output_tokens: 5 }, stop_reason: 'end_turn', model: m };
  });
  ok(model.available(), 'fake model available');

  r = await brain.callTool('field_extractor.run', { task: 'Extract the fields invoice_number', context: 'INV', tenant_id: 999 }, OWNER);
  ok(r.executed && r.success && r.model === 'claude-haiku-4-5-20251001', 'fast specialist runs on Haiku by default', r.model);
  ok(!seen[seen.length - 1].user.includes('999'), 'caller-supplied tenant_id never reaches the model');
  ok(r.cost_usd === 0.002, 'cost computed from usage at cited Haiku price', r.cost_usd);
  r = await brain.callTool('ai_specialist.run', { task: 'hello' }, OWNER);
  ok(r.model === 'claude-sonnet-5', 'deep agent runs on Sonnet 5 by default', r.model);
  ok(seen[seen.length - 1].system.includes('AI Specialist'), 'the compiled brief is the system prompt');

  e = await evals.runAgent('field_extractor', OWNER);
  ok(e.passed === 1 && e.failed === 1 && e.not_run === 0, 'eval grades one pass and one fail', JSON.stringify({ p: e.passed, f: e.failed }));
  ok(e.score === 0.5, 'score = passed / graded', e.score);
  const failed = e.results.find(x => x.status === 'failed');
  ok(failed && failed.failures.some(f => /2026-08-14/.test(f)), 'failure names the missing verbatim value');

  /* ── 7. grader unit checks ──────────────────────────────────────────── */
  ok(!sets.grade({ json_field_null: 'total_amount' }, '{"fields":[{"name":"total_amount","value":"$930.00"}]}').pass, 'computed total fails json_field_null');
  ok(sets.grade({ json_field_null: 'total_amount' }, '```json\n{"fields":[{"name":"total_amount","value":null}]}\n```').pass, 'fenced JSON with null total passes');
  ok(!sets.grade({ excludes: ['\\bwe guarantee\\b'] }, 'We guarantee a 40% saving.').pass, 'guarantee language fails');
  ok(!sets.grade({}, 'Great result \u{1F680}').pass, 'emoji fails by default');
  ok(sets.grade({ includes_any: ['S5', 'Knowledge'] }, 'This is an s5 knowledge assistant.').pass, 'includes_any is case-insensitive');

  /* ── 8. cost cap ────────────────────────────────────────────────────── */
  model._inject(async ({ model: m }) => ({ text: 'x', usage: { input_tokens: 0, output_tokens: 200000 }, stop_reason: 'end_turn', model: m }));
  await brain.callTool('ai_specialist.run', { task: 'spend' }, { ...OWNER, tenant_id: 55 });   // $2.00 on Sonnet
  r = await brain.callTool('ai_specialist.run', { task: 'again' }, { ...OWNER, tenant_id: 55 });
  ok(r.code === 'cost_cap', 'daily cost cap stops the next run', r.code);
  r = await brain.callTool('ai_specialist.run', { task: 'other tenant' }, { ...OWNER, tenant_id: 56 });
  ok(r.executed, 'cost cap is per tenant');

  /* ── 9. audit + stats ───────────────────────────────────────────────── */
  const runs = await store.listRuns(7, { limit: 200 });
  ok(runs.some(x => x.code === 'role_forbidden'), 'denials are audited');
  ok(runs.some(x => x.code === 'model_unavailable'), 'keyless attempts are audited');
  ok((await store.listRuns(55)).every(x => x.tenant_id === 55), 'runs are tenant-scoped');
  const st = await store.stats(7);
  ok(st.field_extractor && st.field_extractor.eval && st.field_extractor.eval.score === 0.5, 'stats carry the latest eval score');

  /* ── 10. HTTP surface: fails shut, then works ───────────────────────── */
  delete process.env.ARCHITECT_USER; delete process.env.ARCHITECT_PASSWORD; delete process.env.FACTORY_API_KEY;
  const app = express(); app.use('/factory', require('./src/index'));
  let h = await request(app).get('/factory/health');
  ok(h.status === 200 && h.body.counts.total === 102 && h.body.dashboard === 'closed' && h.body.mcp === 'closed', 'health is open and reports closed surfaces');
  h = await request(app).get('/factory/api/v1/roster');
  ok(h.status === 503, 'dashboard API closed without credentials', h.status);
  h = await request(app).post('/factory/mcp').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  ok(h.status === 503, 'MCP closed without FACTORY_API_KEY', h.status);

  process.env.ARCHITECT_USER = 'Owner@Example.com'; process.env.ARCHITECT_PASSWORD = 'correct-horse-battery';
  process.env.FACTORY_API_KEY = 'k_test_123456789';
  h = await request(app).get('/factory/api/v1/roster').auth('owner@example.com', 'wrong');
  ok(h.status === 401, 'wrong password refused', h.status);
  h = await request(app).get('/factory/api/v1/roster').auth('owner@example.com', 'correct-horse-battery');
  ok(h.status === 200 && h.body.agents.length === 102, 'roster served with credentials');
  ok(h.headers['cache-control'] === 'no-store' && /noindex/.test(h.headers['x-robots-tag'] || ''), 'no-store + noindex');
  h = await request(app).get('/factory/').auth('owner@example.com', 'correct-horse-battery');
  ok(h.status === 200 && /AI Factory Runtime/.test(h.text), 'dashboard page served');
  h = await request(app).post('/factory/mcp').set('Authorization', 'Bearer wrong').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  ok(h.status === 401, 'MCP wrong key refused');
  h = await request(app).post('/factory/mcp').set('Authorization', 'Bearer k_test_123456789').send({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  ok(h.status === 200 && h.body.result.tools.length === 204, 'MCP lists brief + run for every agent', h.body.result && h.body.result.tools.length);

  ok(!fs.existsSync(path.join(ROOT, 'public', 'factory')), 'dashboard is not under public/');
  const srcNoComments = fs.readdirSync(path.join(__dirname, 'src')).filter(f => f.endsWith('.js') && f !== 'model.js')
    .map(f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')).join('\n');
  ok(!/@anthropic-ai\/sdk|api\.anthropic\.com/.test(srcNoComments), 'model.js is the only file that reaches Anthropic');

  console.log(`\n${pass}/${pass + fail} ${fail ? 'FAILED' : 'passed'}`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
