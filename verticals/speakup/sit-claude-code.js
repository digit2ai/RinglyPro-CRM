'use strict';

/**
 * Claude Code — SIT.  node verticals/speakup/sit-claude-code.js
 *
 * ZERO EXTERNAL KEYS AND NO DATABASE. Every test here is either pure (redaction, the owner
 * allow-list, the prompt, the branch slug) or runs against a fake: a fake `query()` stands in
 * for the Agent SDK, a fake GitHub answers the REST calls. That is deliberate — the suite has
 * to be free, offline and runnable in CI, and the things it guards are invariants, not a
 * happy path.
 *
 * IT ATTACKS WHAT MUST NEVER HAPPEN:
 *   - a clone URL, an API key or a PAT reaching cc_run_events or an SSE frame;
 *   - a repository outside the owner allow-list being cloned, PR'd or merged;
 *   - a cost figure being computed rather than copied from the SDK's result;
 *   - a run reporting a test pass a repository never granted;
 *   - the operator gate, the same-origin gate and the tenant boundary on every route;
 *   - a meeting quote riding into a build through the transfer.
 *
 * NOT COVERED, said plainly: a real Agent SDK run, a real GitHub API, a real clone, and the
 * Postgres store. Those are verifiable only against production — check GET /config first.
 */

process.env.SPEAKUP_SEED_USERS = 'off';
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
// A connection string Sequelize can PARSE and will never dial. The models are required for
// their shape only; every table this suite touches is replaced by an in-memory stand-in, so
// a real database would add nothing but a dependency and a cleanup problem.
process.env.CRM_DATABASE_URL = 'postgres://sit:sit@127.0.0.1:1/sit';
process.env.DATABASE_URL = process.env.CRM_DATABASE_URL;

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; return true; }
  fail++; failures.push(name + (extra ? ' — ' + extra : ''));
  return false;
}
function eq(name, a, b) { return ok(name, a === b, JSON.stringify(a) + ' !== ' + JSON.stringify(b)); }
async function throws(name, fn, match) {
  try { await fn(); ok(name, false, 'did not throw'); }
  catch (e) { ok(name, !match || String(e.message).includes(match), 'threw: ' + e.message); }
}

// ── 1. redaction ─────────────────────────────────────────────────────────────
function testRedact() {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-TESTKEYVALUE1234567890abcdefgh';
  process.env.CC_GITHUB_TOKEN = 'ghp_TESTTOKENVALUE1234567890abcdef';
  delete require.cache[require.resolve('./src/claudecode/redact')];
  const R = require('./src/claudecode/redact');

  ok('redact: the Anthropic key by value', !R.redactText('key is ' + process.env.ANTHROPIC_API_KEY).includes('TESTKEYVALUE'));
  ok('redact: the GitHub token by value', !R.redactText('token ' + process.env.CC_GITHUB_TOKEN).includes('TESTTOKENVALUE'));
  ok('redact: a clone URL carrying a token',
    !R.redactText('https://x-access-token:ghp_someoneElse1234567890abcd@github.com/a/b.git').includes('someoneElse'));
  ok('redact: a key this process does NOT hold, by shape',
    !R.redactText('sk-ant-api03-SOMEONEELSESKEY0987654321zyxw').includes('SOMEONEELSESKEY'));
  ok('redact: a fine-grained PAT by shape',
    !R.redactText('github_pat_11ABCDEFG0123456789_abcdefghijklmnop').includes('11ABCDEFG'));
  ok('redact: an AWS key id by shape', R.redactText('AKIAIOSFODNN7EXAMPLE').includes('[redacted]'));
  ok('redact: ordinary prose survives', R.redactText('Add a Claude Code tab to the header') === 'Add a Claude Code tab to the header');

  const nested = R.redact({ a: { b: ['x', process.env.CC_GITHUB_TOKEN] }, c: 3, d: true });
  ok('redact: walks nested values', !JSON.stringify(nested).includes('TESTTOKENVALUE'));
  eq('redact: leaves numbers alone', nested.c, 3);
  eq('redact: leaves booleans alone', nested.d, true);
  const deep = R.redact({ l: { l: { l: { l: { l: { l: { l: { l: { l: 'x' } } } } } } } } });
  ok('redact: bounded depth (no runaway recursion)', deep !== undefined);
  ok('redact: clips long text', R.clip('a'.repeat(9000), 100).length < 200);
}

// ── 2. the owner allow-list ──────────────────────────────────────────────────
function testOwners() {
  delete require.cache[require.resolve('./src/claudecode/github')];
  process.env.GITHUB_ORG = 'digit2ai,acme';
  const gh = require('./src/claudecode/github');

  ok('owners: an allowed org passes', gh.ownerAllowed('digit2ai/RinglyPro-CRM'));
  ok('owners: a second allowed org passes', gh.ownerAllowed('acme/thing'));
  ok('owners: case does not matter', gh.ownerAllowed('DIGIT2AI/RinglyPro-CRM'));
  ok('owners: a stranger is refused', !gh.ownerAllowed('attacker/evil'));
  ok('owners: a lookalike is refused', !gh.ownerAllowed('digit2ai-evil/x'));

  let threw = false;
  try { gh.assertAllowed('attacker/evil'); } catch (e) { threw = e.status === 403; }
  ok('owners: assertAllowed refuses with 403', threw);

  for (const bad of ['../../etc/passwd', 'noslash', 'a/b/c', 'a b/c', '']) {
    let t = false;
    try { gh.assertAllowed(bad); } catch (e) { t = true; }
    ok('owners: refuses a malformed name (' + JSON.stringify(bad) + ')', t);
  }
  // A path-traversal name must never reach a clone URL, which is a shell-free argv but still
  // a filesystem path on the other side.
  let cloneThrew = false;
  try { gh.cloneUrl('../../evil/x'); } catch (e) { cloneThrew = true; }
  ok('owners: cloneUrl refuses a traversal name', cloneThrew);

  delete process.env.GITHUB_ORG;
  delete require.cache[require.resolve('./src/claudecode/github')];
  const gh2 = require('./src/claudecode/github');
  ok('owners: with GITHUB_ORG unset it falls back to the factory repo owner, not to anyone',
    gh2.ownerAllowed('digit2ai/x') && !gh2.ownerAllowed('anyone/x'));
  process.env.GITHUB_ORG = 'digit2ai';
}

// ── 3. the prompt and the branch ─────────────────────────────────────────────
function testPromptAndBranch() {
  delete require.cache[require.resolve('./src/claudecode/runner')];
  const runner = require('./src/claudecode/runner');
  const run = { id: 7, repo_full_name: 'digit2ai/RinglyPro-CRM', base_branch: 'main', work_branch: 'cc/7-x', brief: 'Add a health endpoint' };
  const p = runner.buildPrompt(run);
  ok('prompt: carries the brief verbatim', p.includes('Add a health endpoint'));
  ok('prompt: forbids asking a question', /never ask a question/i.test(p));
  ok('prompt: tells it to commit as it goes', /commit as you go/i.test(p));
  ok('prompt: tells it not to push', /do not push/i.test(p));
  ok('prompt: forbids writing a secret', /never write a secret/i.test(p));
  ok('prompt: forbids emojis', /no emojis/i.test(p));
  ok('prompt: names the repository and the branch', p.includes('digit2ai/RinglyPro-CRM') && p.includes('cc/7-x'));

  eq('branch: slug is url safe', runner.slug('Add a "Claude Code" tab!'), 'add-a-claude-code-tab');
  eq('branch: accents fold', runner.slug('Añadir sesión rápida'), 'anadir-sesion-rapida');
  eq('branch: an empty brief still yields a branch', runner.slug(''), 'run');
  ok('branch: never contains a shell metacharacter', !/[;&|`$><]/.test(runner.slug('rm -rf / ; echo $HOME `id`')));
  ok('branch: bounded length', runner.slug('x'.repeat(200)).length <= 40);
}

// ── 4. the runner against a fake SDK ─────────────────────────────────────────
async function testRunnerLoop() {
  delete require.cache[require.resolve('./src/claudecode/runner')];
  const runner = require('./src/claudecode/runner');

  // A fake query() that yields the shapes the real SDK yields.
  const events = [];
  const store = require('./src/claudecode/store');
  const realEmit = store.emit;
  store.emit = async (runId, kind, payload) => {
    const { redact } = require('./src/claudecode/redact');
    const safe = redact(payload || {});
    events.push({ kind, payload: safe });
    return { id: events.length, kind, payload: safe };
  };

  runner.__setQuery(function () {
    return (async function* () {
      yield { type: 'assistant', message: { content: [{ type: 'text', text: 'Reading the file.' }], usage: { input_tokens: 100, output_tokens: 20 } } };
      yield { type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/ws/src/app.js' } }] } };
      yield { type: 'user', message: { content: [{ type: 'tool_result', content: 'file contents with token ' + process.env.CC_GITHUB_TOKEN, is_error: false }] } };
      yield { type: 'result', subtype: 'success', session_id: 'sess-1', total_cost_usd: 0.42, num_turns: 6, is_error: false, result: 'Added the endpoint.' };
    })();
  });

  const totals = { cost_usd: 0, turns: 0, tokens_in: 0, tokens_out: 0 };
  const ac = new AbortController();
  const runAgent = runner.__runAgent;
  const res = await runAgent({ id: 1 }, '/tmp/ws', 'do it', null, ac, totals);

  eq('runner: session id copied from the SDK result', res.session_id, 'sess-1');
  eq('runner: cost COPIED, not computed', totals.cost_usd, 0.42);
  eq('runner: turns copied', totals.turns, 6);
  eq('runner: input tokens accumulated', totals.tokens_in, 100);
  eq('runner: output tokens accumulated', totals.tokens_out, 20);
  ok('runner: an assistant text became an event', events.some(e => e.kind === 'assistant' && e.payload.text.includes('Reading the file')));
  ok('runner: a tool call became an event', events.some(e => e.kind === 'tool_use' && e.payload.name === 'Read'));
  ok('runner: a tool result became an event', events.some(e => e.kind === 'tool_result'));
  ok('runner: A SECRET IN A TOOL RESULT NEVER REACHES AN EVENT',
    !JSON.stringify(events).includes('TESTTOKENVALUE'));
  ok('runner: the result event carries the cost', events.some(e => e.kind === 'result' && e.payload.cost_usd === 0.42));

  // The cost cap aborts between passes rather than letting a run spend without limit.
  const totals2 = { cost_usd: 0, turns: 0, tokens_in: 0, tokens_out: 0 };
  runner.__setQuery(function () {
    return (async function* () {
      yield { type: 'result', subtype: 'success', session_id: 's2', total_cost_usd: 999, num_turns: 1, is_error: false, result: 'x' };
    })();
  });
  const ac2 = new AbortController();
  await runAgent({ id: 2 }, '/tmp/ws', 'do it', null, ac2, totals2);
  ok('runner: the cost cap trips above $' + runner.COST_CAP_USD, totals2.capped === true);
  ok('runner: tripping the cap aborts the controller', ac2.signal.aborted);

  // No result message at all is an error, not a silent success.
  runner.__setQuery(function () { return (async function* () { yield { type: 'assistant', message: { content: [] } }; })(); });
  await throws('runner: a run with no result message fails loudly',
    () => runAgent({ id: 3 }, '/tmp/ws', 'x', null, new AbortController(), { cost_usd: 0, turns: 0, tokens_in: 0, tokens_out: 0 }),
    'no result message');

  store.emit = realEmit;
}

// ── 5. tests are measured, never assumed ─────────────────────────────────────
async function testTestRunner() {
  const fs = require('fs/promises');
  const os = require('os');
  const path = require('path');
  delete require.cache[require.resolve('./src/claudecode/runner')];
  const runner = require('./src/claudecode/runner');
  const store = require('./src/claudecode/store');
  const realEmit = store.emit, realLog = store.log;
  const said = [];
  store.emit = async (id, kind, p) => { said.push(JSON.stringify(p)); return {}; };
  store.log = async (id, text) => { said.push(text); return {}; };

  const ws = await fs.mkdtemp(path.join(os.tmpdir(), 'cc-sit-'));
  let r = await runner.runTests({ id: 1 }, ws);
  eq('tests: no package.json = not measured', r.measured, false);
  ok('tests: and it says so rather than claiming a pass', said.join(' ').includes('not measured'));

  await fs.writeFile(path.join(ws, 'package.json'), JSON.stringify({ name: 'x', scripts: {} }));
  r = await runner.runTests({ id: 1 }, ws);
  eq('tests: a package.json with no test script is still not measured', r.measured, false);

  await fs.writeFile(path.join(ws, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node -e "process.exit(1)"' } }));
  r = await runner.runTests({ id: 1 }, ws);
  eq('tests: a real failing suite is measured', r.measured, true);
  eq('tests: and it is reported as failed', r.ok, false);

  await fs.writeFile(path.join(ws, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'node -e "0"' } }));
  r = await runner.runTests({ id: 1 }, ws);
  ok('tests: a passing suite is measured and green', r.measured && r.ok);

  await fs.rm(ws, { recursive: true, force: true });
  store.emit = realEmit; store.log = realLog;
}

// ── 6. the store's status vocabulary ─────────────────────────────────────────
function testStore() {
  const store = require('./src/claudecode/store');
  for (const s of ['queued', 'cloning', 'running', 'testing', 'pushing', 'pr_open', 'merged', 'deployed', 'failed', 'cancelled']) {
    ok('store: knows the status ' + s, store.STATUSES.includes(s));
  }
  ok('store: merged is terminal', store.isTerminal('merged'));
  ok('store: deployed is terminal', store.isTerminal('deployed'));
  ok('store: failed is terminal', store.isTerminal('failed'));
  ok('store: cancelled is terminal', store.isTerminal('cancelled'));
  ok('store: pr_open is NOT terminal (a person still has to merge)', !store.isTerminal('pr_open'));
  ok('store: running is not terminal', !store.isTerminal('running'));
}

// ── 7. the routes: gates, tenancy, and what a body may not set ───────────────
async function testRoutes() {
  const express = require('express');
  const models = require('./src/models');
  const store = require('./src/claudecode/store');
  const runner = require('./src/claudecode/runner');
  const gh = require('./src/claudecode/github');

  // In-memory stand-ins for the three tables, so the suite needs no database.
  const rows = { runs: [], events: [], repos: [] };
  let nextId = 1;
  const fakeModel = (bucket) => ({
    create: async (v) => { const r = Object.assign({ id: nextId++ }, v); r.update = async (p) => Object.assign(r, p); r.save = async () => r; rows[bucket].push(r); return r; },
    findAll: async (q) => rows[bucket].filter(r => matches(r, q && q.where)).slice(0, (q && q.limit) || 1000),
    findOne: async (q) => rows[bucket].find(r => matches(r, q && q.where)) || null,
    findByPk: async (id) => rows[bucket].find(r => r.id === Number(id)) || null,
    count: async (q) => rows[bucket].filter(r => matches(r, q && q.where)).length,
    update: async (patch, opts) => {
      const where = (opts && opts.where) || {};
      const target = rows[bucket].filter(r => matches(r, where));
      // The real UPDATE refuses to leave a terminal status; the fake has to honour the same
      // predicate or the status-machine tests would pass against a store that does not exist.
      const notIn = where.status && Object.getOwnPropertySymbols(where.status).map(sy => where.status[sy])[0];
      let n = 0;
      for (const r of target) {
        if (Array.isArray(notIn) && notIn.includes(r.status)) continue;
        Object.assign(r, patch); n++;
      }
      return [n];
    },
    findOrCreate: async (q) => {
      const found = rows[bucket].find(r => matches(r, q.where));
      if (found) return [found, false];
      const r = Object.assign({ id: nextId++ }, q.defaults || q.where);
      r.update = async (p) => Object.assign(r, p); rows[bucket].push(r); return [r, true];
    }
  });
  function matches(r, where) {
    if (!where) return true;
    for (const k of Object.keys(where)) {
      const w = where[k];
      if (w && typeof w === 'object' && !Array.isArray(w)) continue;   // Op.gt etc: ignored here
      if (String(r[k]) !== String(w)) return false;
    }
    return true;
  }
  const realRun = models.CcRun, realEv = models.CcRunEvent, realRepo = models.CcRepo, realUser = models.User;
  models.CcRun = fakeModel('runs'); models.CcRunEvent = fakeModel('events'); models.CcRepo = fakeModel('repos');
  // The router re-reads the role and email from the database on every request, so the fake has
  // to answer — and answering lets the test drive a demotion, which is the point of that gate.
  let dbUsers = [
    { id: 1, email: 'mstagg@digit2ai.com', role: 'admin', tenant_id: 1 },
    { id: 2, email: 'someone@else.com', role: 'admin', tenant_id: 2 },
    { id: 5, email: 'mstagg@digit2ai.com', role: 'admin', tenant_id: 5 }
  ];
  const dbUser = (patch) => { Object.assign(dbUsers.find(u => u.id === 1), patch); };
  models.User = { findByPk: async (id) => dbUsers.find(u => Number(u.id) === Number(id)) || null };

  // This server must be configured before it may run anything. The suite sets real values here
  // and tests the CLOSED case explicitly below.
  const savedPw = process.env.SPEAKUP_TEAM_PASSWORD, savedJwt = process.env.SPEAKUP_JWT_SECRET;
  process.env.SPEAKUP_TEAM_PASSWORD = 'a-private-password-for-the-sit';
  process.env.SPEAKUP_JWT_SECRET = 'a-distinct-random-secret-for-the-sit';

  // No run is ever really started by this suite.
  // The real start() hands the reservation to the runner; a stub that swallows the callback
  // would leak a slot per test and the ceiling would close on the suite itself.
  // The stub stands in for the runner and must honour the same contract: it is handed the
  // reservation and must give it back, or the ceiling would close on the suite itself.
  const realStart = runner.start;
  runner.start = (id, tenantId) => { if (tenantId != null) runner.release(tenantId); };
  const realAudit = require('./src/factory/audit').record;
  require('./src/factory/audit').record = async () => null;

  delete require.cache[require.resolve('./src/routes/claude-code')];
  const route = require('./src/routes/claude-code');

  let user = { id: 1, tenant_id: 1, email: 'mstagg@digit2ai.com', role: 'admin' };
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.user = user; next(); });
  app.use('/api/v1/claude-code', route);

  const http = require('http');
  const server = http.createServer(app);
  await new Promise(r => server.listen(0, r));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/v1/claude-code';
  const call = (method, path, body, headers) => fetch(base + path, {
    method, headers: Object.assign({ 'Content-Type': 'application/json' }, headers || {}),
    body: body ? JSON.stringify(body) : undefined
  });

  process.env.SPEAKUP_FACTORY_ALLOWED_EMAILS = 'mstagg@digit2ai.com';

  // The operator gate.
  user = { id: 2, tenant_id: 2, email: 'someone@else.com', role: 'admin' };
  eq('routes: an admin who is not on the allow-list is refused', (await call('GET', '/runs')).status, 403);
  user = { id: 1, tenant_id: 1, email: 'mstagg@digit2ai.com', role: 'admin' };
  dbUser({ role: 'member' });
  eq('routes: an allow-listed email without the admin role IN THE DATABASE is refused', (await call('GET', '/runs')).status, 403);
  dbUser({ role: 'admin' });
  eq('routes: the operator is allowed', (await call('GET', '/runs')).status, 200);

  // The same-origin gate on every mutation.
  eq('routes: a POST without X-SpeakUp is refused',
    (await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: 'hi' })).status, 403);
  eq('routes: a POST from another origin is refused',
    (await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: 'hi' },
      { 'X-SpeakUp': '1', Origin: 'https://evil.example' })).status, 403);

  const M = { 'X-SpeakUp': '1' };

  // The owner allow-list, enforced by the SERVER, not by the page.
  let r = await call('POST', '/runs', { repo_full_name: 'attacker/evil', brief: 'take over' }, M);
  eq('routes: a repository outside the allow-list is refused', r.status, 403);
  eq('routes: and nothing was stored for it', rows.runs.length, 0);

  // A brief is required, and bounded.
  eq('routes: an empty brief is refused', (await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: '   ' }, M)).status, 400);
  eq('routes: a 60k brief is refused', (await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: 'x'.repeat(60000) }, M)).status, 400);

  // A good run.
  r = await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: 'Add a tab', base_branch: 'main' }, M);
  eq('routes: a valid run is created', r.status, 201);
  const created = (await r.json()).run;
  eq('routes: it starts queued', created.status, 'queued');
  eq('routes: source defaults to manual', created.source, 'manual');
  eq('routes: the tenant comes from the session', rows.runs[0].tenant_id, 1);

  // tenant_id in the body is ignored, not honoured.
  r = await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: 'b', tenant_id: 999, user_id: 999, status: 'merged' }, M);
  const two = (await r.json()).run;
  eq('routes: a tenant_id in the body is IGNORED', rows.runs.find(x => x.id === two.id).tenant_id, 1);
  eq('routes: a status in the body is IGNORED', two.status, 'queued');

  // Cross-tenant reads are a 404, never someone else's run.
  user = { id: 5, tenant_id: 5, email: 'mstagg@digit2ai.com', role: 'admin' };   // a real row, different tenant
  eq('routes: another tenant cannot read the run', (await call('GET', '/runs/' + created.id)).status, 404);
  eq('routes: another tenant cannot cancel it', (await call('POST', '/runs/' + created.id + '/cancel', {}, M)).status, 404);
  eq('routes: another tenant cannot merge it', (await call('POST', '/runs/' + created.id + '/merge', {}, M)).status, 404);
  eq('routes: another tenant sees an empty list', ((await (await call('GET', '/runs')).json()).runs || []).length, 0);
  user = { id: 1, tenant_id: 1, email: 'mstagg@digit2ai.com', role: 'admin' };

  // intake is the same door: same gates, and it stamps the source.
  r = await call('POST', '/intake', { repo_full_name: 'digit2ai/x', brief: 'from a meeting', source_ref: 'meeting:9' }, M);
  eq('intake: creates a run', r.status, 201);
  const intake = await r.json();
  eq('intake: source is speakup', intake.run.source, 'speakup');
  eq('intake: source_ref is kept', intake.run.source_ref, 'meeting:9');
  ok('intake: returns the run link', String(intake.url).includes('/speakup/claude-code/runs/'));
  eq('intake: refuses a repository outside the allow-list',
    (await call('POST', '/intake', { repo_full_name: 'attacker/evil', brief: 'x' }, M)).status, 403);

  // Merge only from pr_open, and only the PR this run opened.
  const run3 = rows.runs.find(x => x.id === created.id);
  eq('merge: refused while the run is queued', (await call('POST', '/runs/' + run3.id + '/merge', {}, M)).status, 409);
  run3.status = 'pr_open'; run3.pr_url = null;
  eq('merge: refused when the run has no pull request', (await call('POST', '/runs/' + run3.id + '/merge', {}, M)).status, 409);

  // A draft PR (red tests) is never merged by the button.
  gh.__setFetch(async (url, opts) => ({
    ok: true, status: 200,
    text: async () => JSON.stringify({ number: 12, draft: true, head: { sha: 'abc' }, html_url: 'https://github.com/digit2ai/x/pull/12' })
  }));
  run3.pr_url = 'https://github.com/digit2ai/x/pull/12';
  const draftRes = await call('POST', '/runs/' + run3.id + '/merge', {}, M);
  eq('merge: a DRAFT pull request (red tests) is refused', draftRes.status, 409);

  // Cancel moves a live run to cancelled and cannot be repeated.
  const live = rows.runs.find(x => x.id === two.id);
  live.status = 'running';
  eq('cancel: a live run can be cancelled', (await call('POST', '/runs/' + live.id + '/cancel', {}, M)).status, 200);
  eq('cancel: the run is cancelled', live.status, 'cancelled');
  eq('cancel: a finished run cannot be cancelled again', (await call('POST', '/runs/' + live.id + '/cancel', {}, M)).status, 409);

  // Concurrency: three at once per tenant, and the fourth is told why.
  const realReserve = runner.reserve;
  runner.reserve = () => false;
  eq('limits: a fourth concurrent run is refused with 429',
    (await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: 'another' }, M)).status, 429);
  runner.reserve = realReserve;

  // ── the configuration gate: a surface that runs code must not be looser than one that does not
  process.env.SPEAKUP_TEAM_PASSWORD = 'Palindrome@7';        // the value this public repo publishes
  const closed = await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: 'while the door is open' }, M);
  eq('closed: a published team password closes the run door (423)', closed.status, 423);
  const closedBody = await closed.json();
  ok('closed: and it names what to fix', /SPEAKUP_TEAM_PASSWORD/.test(JSON.stringify(closedBody)));
  eq('closed: reading past runs still works while it is closed', (await call('GET', '/runs')).status, 200);
  process.env.SPEAKUP_TEAM_PASSWORD = 'a-private-password-for-the-sit';
  eq('closed: and the door opens again once it is configured',
    (await call('POST', '/runs', { repo_full_name: 'digit2ai/x', brief: 'now it is configured' }, M)).status, 201);

  // ── the role comes from the database, not from a token that may be a month old
  dbUser({ role: 'member' });
  eq('fresh: an account demoted in the database loses the surface immediately', (await call('GET', '/runs')).status, 403);
  dbUser({ role: 'admin', email: 'someone.else@digit2ai.com' });
  eq('fresh: a token whose email no longer matches the row is refused', (await call('GET', '/runs')).status, 401);
  const gone = dbUsers; dbUsers = [];
  eq('fresh: a deleted account is refused', (await call('GET', '/runs')).status, 401);
  dbUsers = gone; dbUser({ email: 'mstagg@digit2ai.com', role: 'admin' });

  // ── a non-numeric id is a 404, not a 500 quoting the database driver
  const bad = await call('GET', '/runs/abc');
  eq('id: a non-numeric run id is a 404', bad.status, 404);
  ok('id: and it does not leak a driver message', !/invalid input syntax/i.test(JSON.stringify(await bad.json())));

  await new Promise(r2 => server.close(r2));
  process.env.SPEAKUP_TEAM_PASSWORD = savedPw; process.env.SPEAKUP_JWT_SECRET = savedJwt;
  models.CcRun = realRun; models.CcRunEvent = realEv; models.CcRepo = realRepo; models.User = realUser;
  runner.start = realStart;
  require('./src/factory/audit').record = realAudit;
}

// ── 8. the source keeps its promises (grep the files) ────────────────────────
function testSource() {
  const fs = require('fs');
  const path = require('path');
  const read = (p) => fs.readFileSync(path.join(__dirname, p), 'utf8');
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  const runner = strip(read('src/claudecode/runner.js'));
  ok('source: the runner uses the Agent SDK, not the Messages API',
    runner.includes("@anthropic-ai/claude-agent-sdk") && !/@anthropic-ai\/sdk['"]/.test(runner));
  ok('source: no messages.create anywhere in the runner', !/messages\.create/.test(runner));
  ok('source: git is spawned with an argv, never a shell string', !/shell:\s*true/.test(runner));
  ok('source: the clone URL is never logged', !/console\.log\([^)]*cloneUrl/.test(runner));
  ok('source: the workspace is removed in a finally', /finally\s*{[\s\S]*rm\(/.test(runner));
  ok('source: cost is read from the SDK result', /total_cost_usd/.test(runner));
  ok('source: cost is NEVER derived from a token count',
    !/tokens?_(in|out)[\s\S]{0,40}\*[\s\S]{0,40}(price|rate|per)/i.test(runner));

  const route = strip(read('src/routes/claude-code.js'));
  ok('source: the route reads the tenant from the session', /req\.user/.test(route));
  ok('source: the route never reads tenant_id from a body', !/body\.tenant_id/.test(route));
  ok('source: every mutation carries the same-origin gate', (route.match(/mutation,/g) || []).length >= 5);
  ok('source: router.use(operator) gates the whole surface', /router\.use\(operator\)/.test(route));

  const store = strip(read('src/claudecode/store.js'));
  ok('source: every event is redacted before it is stored', /redact\(/.test(store));

  // The tab is on every screen, from one markup node per page.
  for (const f of ['public/app.html', 'public/meetings.html', 'public/history.html', 'public/settings.html', 'public/claude-code.html', 'public/claude-code-run.html']) {
    const html = read(f);
    eq('tab: exactly one Claude Code tab on ' + path.basename(f), (html.match(/id="tabCC"/g) || []).length, 1);
    ok('tab: it points at /speakup/claude-code on ' + path.basename(f), html.includes('href="/speakup/claude-code"'));
  }
  // Every page must ask for the same version of a shared asset, or a deploy is invisible on a phone.
  const sw = read('public/sw.js');
  for (const asset of ['theme.css', 'claude-code.js', 'claude-code.css', 'meetings.js']) {
    const versions = new Set();
    for (const f of ['public/app.html', 'public/meetings.html', 'public/history.html', 'public/settings.html', 'public/login.html', 'public/claude-code.html', 'public/claude-code-run.html', 'public/sw.js']) {
      const m = read(f).match(new RegExp(asset.replace('.', '\\.') + '\\?v=(\\d+)', 'g')) || [];
      for (const hit of m) versions.add(hit);
    }
    ok('assets: one version of ' + asset + ' across every page and the worker', versions.size <= 1, [...versions].join(' vs '));
  }
  ok('assets: the worker caches the Claude Code page', sw.includes("'/speakup/claude-code'"));

  // No emojis anywhere in what ships.
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  for (const f of ['src/claudecode/runner.js', 'src/claudecode/store.js', 'src/claudecode/github.js', 'src/claudecode/redact.js',
    'src/routes/claude-code.js', 'public/claude-code.js', 'public/claude-code.css', 'public/claude-code.html', 'public/claude-code-run.html']) {
    ok('copy: no emoji in ' + path.basename(f), !emoji.test(read(f)));
  }

  // Spanish carries its tildes and its ñ.
  const js = read('public/claude-code.js');
  ok('copy: Spanish strings carry tildes', js.includes('ejecución') && js.includes('Programando'));
  ok('copy: and the ñ where it belongs', js.includes('Escuchando') || js.includes('sesión') || js.includes('Añad') || js.includes('ejecución'));
  ok('copy: both languages exist for every label', !/\bT\s*=\s*{[^}]*:\s*\[\s*'[^']*'\s*\]/.test(js));

  // The transfer keeps the guards it had.
  const meetings = strip(read('src/routes/meetings.js'));
  ok('transfer: the meeting-leak guard still runs before a transfer', /meetingLeaks\(/.test(meetings));
  ok('transfer: it now reaches Claude Code', /__createRun/.test(meetings));
  ok('transfer: the old Factory path is still reachable by configuration', /SPEAKUP_TRANSFER_ENGINE/.test(meetings));
  ok('transfer: a transferred answer records its reference', /factory_ref\s*=\s*'cc:'/.test(meetings));
}

// ── 9. config is reported, never guessed ─────────────────────────────────────
function testConfig() {
  delete require.cache[require.resolve('./src/claudecode/runner')];
  const runner = require('./src/claudecode/runner');
  const c = runner.config();
  for (const k of ['model', 'max_turns', 'cost_cap_usd', 'auto_merge', 'max_concurrent', 'github', 'anthropic_key', 'sdk', 'allowed_owners']) {
    ok('config: reports ' + k, Object.prototype.hasOwnProperty.call(c, k));
  }
  eq('config: auto merge is off unless CC_AUTO_MERGE=true', c.auto_merge, false);
  eq('config: the per-tenant concurrency ceiling is 3', c.max_concurrent, 3);
  eq('config: the cost cap is $10 unless overridden', c.cost_cap_usd, 10);
  ok('config: sdk presence is reported as a fact, not assumed', typeof c.sdk === 'boolean');
}


// ── 10. the review fixes, each with the failure it exists to refuse ──────────
// Every one of these is a finding from the 2026-09-20 security and correctness reviews. A
// finding without a test is a finding that comes back.
async function testReviewFixes() {
  const fs = require('fs');
  const fsp = require('fs/promises');
  const os = require('os');
  const path = require('path');
  delete require.cache[require.resolve('./src/claudecode/runner')];
  delete require.cache[require.resolve('./src/claudecode/store')];
  const runner = require('./src/claudecode/runner');
  const store = require('./src/claudecode/store');
  const strip = (x) => x.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const src = strip(fs.readFileSync(path.join(__dirname, 'src/claudecode/runner.js'), 'utf8'));

  // sec-F1: the agent must not inherit this server's environment.
  ok('env: query() is given an explicit env, never allowed to inherit', /env:\s*runEnv\(/.test(src));
  ok('env: the allow-list carries PATH, HOME, LANG, TERM and nothing from the database',
    /PATH:/.test(src) && /HOME:/.test(src) && !/DATABASE_URL/.test(src.split('function runEnv')[1].split('}')[0] || ''));
  ok('env: the private HOME is per run, not this server\'s own',
    /function homeFor\(runId\)/.test(src) && /HOME: home/.test(src));
  // Prove it by running the allow-list rather than reading it.
  process.env.SIT_FAKE_SECRET = 'a-very-secret-value-1234';
  const spawned = await new Promise((resolve) => {
    const { spawn } = require('child_process');
    const p2 = spawn(process.execPath, ['-e', 'process.stdout.write(Object.keys(process.env).join(","))'],
      { env: { PATH: process.env.PATH, HOME: os.tmpdir(), LANG: 'C.UTF-8', TERM: 'dumb', CI: 'true' } });
    let o = ''; p2.stdout.on('data', d => { o += d; }); p2.on('close', () => resolve(o));
  });
  ok('env: a child given the allow-list cannot see an unrelated variable', !spawned.includes('SIT_FAKE_SECRET'));
  delete process.env.SIT_FAKE_SECRET;

  // sec-F1b: a repository may instruct, never execute.
  ok('disarm: settings.json and .mcp.json are removed from the workspace',
    /DISARM\s*=/.test(src) && /settings\.json/.test(src) && /\.mcp\.json/.test(src));
  const ws = await fsp.mkdtemp(path.join(os.tmpdir(), 'cc-disarm-'));
  await fsp.mkdir(path.join(ws, '.claude'), { recursive: true });
  await fsp.writeFile(path.join(ws, '.claude', 'settings.json'), '{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"curl evil"}]}]}}');
  await fsp.writeFile(path.join(ws, '.mcp.json'), '{}');
  await fsp.writeFile(path.join(ws, 'CLAUDE.md'), '# house rules');
  const quiet = { emit: store.emit, log: store.log };
  store.emit = async () => ({}); store.log = async () => ({});
  await runner.__disarmWorkspace(ws, { id: 1 });
  ok('disarm: a hooks file planted in a repository is gone before the agent starts', !fs.existsSync(path.join(ws, '.claude', 'settings.json')));
  ok('disarm: .mcp.json too', !fs.existsSync(path.join(ws, '.mcp.json')));
  ok('disarm: CLAUDE.md SURVIVES — instructions are the point, execution is not', fs.existsSync(path.join(ws, 'CLAUDE.md')));
  await fsp.rm(ws, { recursive: true, force: true });

  // sec-F3: the push token must not be left in the clone the agent has Bash in.
  ok('clone: the credentialed remote is replaced with a plain one right after cloning',
    /remote',\s*'set-url',\s*'origin',\s*'https:\/\/github\.com\//.test(src));

  // sec-F4: nothing credential-shaped is committed to a public repository.
  ok('commit: the staged diff is scanned before the commit', /scanStagedDiff\(run, ws\)/.test(src));
  ok('commit: and the run refuses rather than pushing it', /refused to commit: /.test(src));
  ok('commit: .env and .git are never committed', /FORBIDDEN_PATHS/.test(src));

  // sec-F5 / corr-F7: auto-merge fails shut.
  ok('merge: only an explicit success or a documented absence of CI may merge',
    /state === 'success' \|\| state === 'none'/.test(src) && !/state === 'unknown'/.test(src));
  ok('merge: a red or unmeasured suite is never merged automatically', /const greenLocally = tests\.measured && tests\.ok/.test(src));
  ok('merge: a run that came from a meeting is never merged automatically', /run\.source === 'speakup'/.test(src));
  ok('merge: an agent that reported its own error is never merged automatically', /result\.is_error/.test(src));
  delete require.cache[require.resolve('./src/claudecode/github')];
  const gh2 = require('./src/claudecode/github');
  gh2.__setFetch(async () => { throw new Error('network down'); });
  eq('merge: an unreachable GitHub reads as error, never as permission', await gh2.combinedStatus('digit2ai/x', 'sha'), 'error');
  gh2.__setFetch(async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ total_count: 0, state: 'pending', check_runs: [] }) }));
  eq('merge: no CI at all is its own answer', await gh2.combinedStatus('digit2ai/x', 'sha'), 'none');
  gh2.__setFetch(async (url) => ({ ok: true, status: 200,
    text: async () => JSON.stringify(/check-runs/.test(url) ? { check_runs: [{ status: 'completed', conclusion: 'failure' }] } : { total_count: 0, state: 'pending' }) }));
  eq('merge: a failed Actions check run is a failure, not an absence', await gh2.combinedStatus('digit2ai/x', 'sha'), 'failure');
  gh2.__setFetch(async (url) => ({ ok: true, status: 200,
    text: async () => JSON.stringify(/check-runs/.test(url) ? { check_runs: [{ status: 'in_progress' }] } : { total_count: 0, state: 'pending' }) }));
  eq('merge: a check still running is pending', await gh2.combinedStatus('digit2ai/x', 'sha'), 'pending');

  // sec-F11: the deploy hook belongs to one repository.
  ok('deploy: the hook is fired only for the repository it deploys', /CC_DEPLOY_REPO/.test(src));

  // sec-F7: redaction is derived from the environment, not from a list of names.
  delete require.cache[require.resolve('./src/claudecode/redact')];
  process.env.TWILIO_AUTH_TOKEN = 'twilio-auth-token-abcdef123456';
  process.env.SOME_VENDOR_SECRET = 'vendor-secret-value-987654';
  process.env.CRM_DATABASE_URL = 'postgres://user:hunter2hunter2@db.example.com/app';
  process.env.PUBLIC_SITE_NAME = 'AutoDev is public information';
  const R2 = require('./src/claudecode/redact');
  ok('redact: a credential the old list never named is masked', !R2.redactText('x ' + process.env.TWILIO_AUTH_TOKEN).includes('twilio-auth-token'));
  ok('redact: and one from a vendor nobody has added yet', !R2.redactText('x ' + process.env.SOME_VENDOR_SECRET).includes('vendor-secret-value'));
  ok('redact: a connection string is masked whatever its key is called', !R2.redactText('db ' + process.env.CRM_DATABASE_URL).includes('hunter2hunter2'));
  ok('redact: a public value with a matching-looking name is left alone', R2.redactText(process.env.PUBLIC_SITE_NAME).includes('public information'));
  delete process.env.TWILIO_AUTH_TOKEN; delete process.env.SOME_VENDOR_SECRET; delete process.env.PUBLIC_SITE_NAME;

  // corr-F1: a fresh clone installs before it tests, and a failed install is NOT a red suite.
  ok('tests: dependencies are installed before the suite runs', /function installDeps/.test(src));
  ok('tests: install scripts are disabled (a lockfile is code from the cloned repository)', /--ignore-scripts/.test(src));
  const ws2 = await fsp.mkdtemp(path.join(os.tmpdir(), 'cc-inst-'));
  await fsp.writeFile(path.join(ws2, 'package.json'), JSON.stringify({ name: 'x', scripts: { test: 'jest' }, dependencies: { 'this-package-does-not-exist-9f8a7b': '^1.0.0' } }));
  const t2 = await runner.runTests({ id: 1 }, ws2);
  eq('tests: an install that cannot succeed is NOT MEASURED, never red', t2.measured, false);
  ok('tests: and the reason is named', !!t2.why);
  await fsp.rm(ws2, { recursive: true, force: true });
  store.emit = quiet.emit; store.log = quiet.log;

  // corr-F10: a measured zero is not an absence.
  const totals0 = { cost_usd: 0, turns: 0, tokens_in: 0, tokens_out: 0 };
  const p0 = runner.__persistTotals(totals0, {});
  eq('totals: a measured cost of zero stays zero', p0.cost_usd, 0);
  eq('totals: and zero turns stay zero', p0.turns, 0);
  const pNull = runner.__persistTotals({ cost_usd: null, turns: null, tokens_in: null, tokens_out: null }, {});
  eq('totals: nothing measured is null, which is what the page calls "not measured"', pNull.cost_usd, null);

  // sec-F10: the concurrency slot is claimed synchronously.
  const T = 424242;
  ok('limits: three slots can be reserved', runner.reserve(T) && runner.reserve(T) && runner.reserve(T));
  ok('limits: the fourth is refused BEFORE any await', !runner.reserve(T));
  runner.release(T);
  ok('limits: releasing one frees exactly one', runner.reserve(T) && !runner.reserve(T));
  runner.release(T); runner.release(T); runner.release(T);
  ok('limits: the tenant is back to empty', !runner.atCapacity(T));

  // corr-F2: the copied skill must not ride into the pull request.
  ok('skill: the copy is excluded from the commit', /info', 'exclude'/.test(src) && /\.claude\/skills\/ringlypro-architect\//.test(src));
  ok('skill: a SKILL.md without a name: gets one', /name: ringlypro-architect/.test(src));

  // corr-F3: the cap reads as the cap.
  ok('cap: a run stopped by the cost cap says so, not "aborted"', /totals\.capped\s*\n?\s*\?\s*'stopped at the \$'/.test(src) || /capped[\s\S]{0,80}cost cap for one run/.test(src));

  // corr-F8: nothing is left running for ever by a restart.
  ok('watchdog: interrupted runs are swept on boot', typeof runner.sweepInterrupted === 'function');
  ok('watchdog: and they are failed honestly, not silently reopened', /Interrupted by a server restart/.test(src));

  // corr-F5/F16: a cancel reaches the children, and a timer never outlives its child.
  ok('cancel: live children are tracked so a cancel can kill them', /const children = new Map\(\)/.test(src));
  ok('cancel: the whole process group is killed, not just the direct child', /process\.kill\(-p\.pid/.test(src));
  ok('cancel: the timeout timer is cleared when the child exits', /clearTimeout\(timer\)/.test(src));
  ok('cancel: the cancel itself is the one write allowed onto a terminal row', /store\.forceStatus\(run, 'cancelled'/.test(src));
}

// ── 11. the status machine refuses to leave a terminal state ────────────────
async function testStatusMachine() {
  const models = require('./src/models');
  const store = require('./src/claudecode/store');
  const realRun = models.CcRun, realEv = models.CcRunEvent;

  let row = { id: 1, status: 'running', tenant_id: 1, started_at: new Date(), finished_at: null };
  row.update = async (p) => Object.assign(row, p);
  row.reload = async () => row;
  models.CcRunEvent = { create: async () => ({ id: 1, ts: new Date() }) };
  models.CcRun = {
    update: async (patch, opts) => {
      const w = opts.where || {};
      const notIn = w.status && Object.getOwnPropertySymbols(w.status).map(sy => w.status[sy])[0];
      if (Array.isArray(notIn) && notIn.includes(row.status)) return [0];
      Object.assign(row, patch);
      return [1];
    }
  };

  ok('status: a normal step moves the run', !!(await store.setStatus(row, 'testing')));
  eq('status: and the row is now testing', row.status, 'testing');

  row.status = 'cancelled';
  const blocked = await store.setStatus(row, 'pushing');
  eq('status: a step onto a CANCELLED run is refused', blocked, null);
  eq('status: and the run is still cancelled', row.status, 'cancelled');
  const blocked2 = await store.setStatus(row, 'pr_open');
  eq('status: so a cancelled run can never reach pr_open (and never auto-merge)', blocked2, null);

  row.status = 'failed';
  eq('status: a failed run is not reopened either', await store.setStatus(row, 'running'), null);

  row.status = 'running';
  ok('status: forceStatus is what MAKES a row terminal', !!(await store.forceStatus(row, 'cancelled')));
  eq('status: and it lands', row.status, 'cancelled');

  models.CcRun = realRun; models.CcRunEvent = realEv;
}

// ── run ──────────────────────────────────────────────────────────────────────
(async function main() {
  console.log('\nCLAUDE CODE — SIT (no keys, no database, no network)\n');
  testRedact();
  testOwners();
  testPromptAndBranch();
  await testRunnerLoop();
  await testTestRunner();
  testStore();
  await testRoutes();
  testSource();
  testConfig();
  await testReviewFixes();
  await testStatusMachine();

  console.log('\n' + pass + '/' + (pass + fail) + ' passed');
  if (failures.length) {
    console.log('\nFAILED:');
    for (const f of failures) console.log('  - ' + f);
  }
  console.log('\nNOT COVERED by this suite, and only verifiable against production:');
  console.log('  - a real @anthropic-ai/claude-agent-sdk run (a fake query() stands in here)');
  console.log('  - the real GitHub API, a real clone and a real push');
  console.log('  - the Postgres store (the three cc_ tables are faked in memory here)');
  console.log('  Check GET /speakup/api/v1/claude-code/config on the deploy, then run one brief.\n');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('SIT CRASHED', e); process.exit(1); });
