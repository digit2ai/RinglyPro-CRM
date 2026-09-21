'use strict';

/**
 * Claude Code — the runner.
 *
 * clone -> branch -> code -> test -> commit -> push -> PR -> (merge -> deploy),
 * streaming every step into cc_run_events as it happens.
 *
 * WHY THE AGENT SDK AND NOT THE MESSAGES API. The work is "change this repository
 * until the tests pass": that is a tool loop over a filesystem, and `query()` already
 * owns the loop, the tool definitions, the session so a failing test can be handed back
 * with `resume`, and the cost accounting. Re-implementing it against the Messages API
 * would mean re-implementing all four, and the cost figure would become an estimate.
 *
 * THE MONEY AND THE TOKENS ARE COPIED, NEVER COMPUTED. cost_usd, tokens_in, tokens_out
 * and turns come from the SDK's own `result` message. A run that never reaches one
 * stores null — an honest "not measured" rather than a plausible number.
 *
 * THE WORKSPACE IS DISPOSABLE, WHICH IS WHAT LICENSES bypassPermissions. It is a fresh
 * shallow clone under CC_WORKSPACE_ROOT, removed on every terminal status including a
 * crash, and the only credential inside it is a clone URL for a repository the owner
 * allow-list already approved. Nothing the agent writes reaches main without a PR.
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const models = require('../models');   // resolved at call time (see store.js)
const store = require('./store');
const github = require('./github');
const { clip, redactText } = require('./redact');

const WORKSPACE_ROOT = process.env.CC_WORKSPACE_ROOT || '/tmp/cc-workspaces';
const MODEL = process.env.CC_MODEL || 'claude-sonnet-5';
const MAX_TURNS = Number(process.env.CC_MAX_TURNS || 200);
const COST_CAP_USD = Number(process.env.CC_COST_CAP_USD || 10);
const MAX_CONCURRENT = Number(process.env.CC_MAX_CONCURRENT || 3);
const MAX_FIX_CYCLES = Number(process.env.CC_MAX_FIX_CYCLES || 3);
const AUTO_MERGE = String(process.env.CC_AUTO_MERGE || 'false').toLowerCase() === 'true';

// run id -> { abort, tenant_id }. Per instance, like the workspace it guards.
const active = new Map();
// Live child processes per run, so a cancel reaches a running `npm test` instead of leaving it
// to its own timeout while the slot and the workspace stay held.
const children = new Map();

function activeForTenant(tenantId) {
  let n = 0;
  for (const v of active.values()) if (v.tenant_id === tenantId) n++;
  return n;
}
// Slots claimed by a request that has not yet reached `execute`. Counted alongside the live
// runs, so a burst cannot walk past the ceiling in the window between the two.
const reserved = new Map();
function reservedFor(tenantId) { return reserved.get(tenantId) || 0; }
function reserve(tenantId) {
  if (activeForTenant(tenantId) + reservedFor(tenantId) >= MAX_CONCURRENT) return false;
  reserved.set(tenantId, reservedFor(tenantId) + 1);
  return true;
}
function release(tenantId) {
  const n = reservedFor(tenantId) - 1;
  if (n > 0) reserved.set(tenantId, n); else reserved.delete(tenantId);
}
function atCapacity(tenantId) { return activeForTenant(tenantId) + reservedFor(tenantId) >= MAX_CONCURRENT; }
function isActive(runId) { return active.has(Number(runId)); }

// ── the environment, rebuilt from an allow-list ──────────────────────────────
// NOTHING SPAWNED BY A RUN SEES THIS SERVER'S ENVIRONMENT. The agent has Bash and runs with
// bypassPermissions, and the repository's own test script runs here too, so `env` in either
// of them would otherwise print ANTHROPIC_API_KEY, DATABASE_URL (the live CRM Postgres),
// GITHUB_TOKEN, SPEAKUP_FACTORY_SECRET, JWT_SECRET, STRIPE_SECRET_KEY and the rest — and a
// `curl` to somewhere else never passes through redact.js, which only guards what is STORED.
// The SDK is explicit that an omitted `env` inherits process.env and a supplied one REPLACES
// it, so it is supplied. Same allow-list shape as src/factory/claude-subscription.js.
// HOME is private per run: the real one holds this server's own Claude credentials.
function runEnv(home, extra) {
  return Object.assign({
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: home,
    LANG: 'C.UTF-8',
    TERM: 'dumb',
    CI: 'true',
    GIT_TERMINAL_PROMPT: '0',
    npm_config_yes: 'true'
  }, extra || {});
}
function homeFor(runId) { return path.join(WORKSPACE_ROOT, 'home-' + runId); }

// ── shell ────────────────────────────────────────────────────────────────────
// git only, by argument array — never a shell string, so a branch name derived from a
// brief can never become a command. Output is redacted before it is stored.
function sh(cmd, args, opts) {
  return new Promise((resolve) => {
    const runId = opts && opts.runId;
    const p = spawn(cmd, args, {
      cwd: (opts && opts.cwd) || undefined,
      env: (opts && opts.env) || runEnv(path.join(WORKSPACE_ROOT, 'home-shared')),
      shell: false,
      // A timeout must kill the whole tree. Killing the direct child alone leaves the real
      // work (npm's child, the test runner) alive and holding whatever it was given.
      detached: true
    });
    let out = '', err = '';
    p.stdout.on('data', d => { out += d.toString(); if (out.length > 200000) out = out.slice(-200000); });
    p.stderr.on('data', d => { err += d.toString(); if (err.length > 200000) err = err.slice(-200000); });
    const killTree = () => { try { process.kill(-p.pid, 'SIGKILL'); } catch (e) { try { p.kill('SIGKILL'); } catch (e2) {} } };
    if (runId) {
      const set = children.get(runId) || new Set();
      set.add(killTree); children.set(runId, set);
    }
    let timer = null;
    const done = (r) => {
      if (timer) clearTimeout(timer);
      if (runId && children.has(runId)) children.get(runId).delete(killTree);
      resolve(r);
    };
    p.on('error', e => done({ code: -1, out, err: err + e.message }));
    p.on('close', code => done({ code, out, err }));
    if (opts && opts.timeoutMs) timer = setTimeout(killTree, opts.timeoutMs);
  });
}

async function git(ws, args, runId, label) {
  const r = await sh('git', args, { cwd: ws, runId, timeoutMs: 10 * 60 * 1000 });
  if (runId && label) await store.log(runId, `${label}: exit ${r.code}\n${(r.out + r.err).trim().slice(0, 1200)}`);
  return r;
}

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'run';
}

// ── the prompt ───────────────────────────────────────────────────────────────
// The brief is the owner's own words and travels verbatim. Everything around it is the
// operating contract: unattended, commit as you go, and never ask a question, because
// there is nobody on the other end of this session to answer one.
function buildPrompt(run, priorTurns) {
  // A FOLLOW-UP IS A FOLLOW-UP ONLY IF THE EARLIER TURNS TRAVEL WITH IT. The workspace is
  // disposable, so nothing on disk remembers the last message; the thread's earlier turns are
  // replayed here, oldest first, capped so a long conversation cannot grow the prompt without
  // limit. The branch is already checked out with the earlier work on it, so the code state is
  // real — this is the talking, not the doing.
  const history = [];
  for (const t of (priorTurns || []).slice(-8)) {
    history.push('You were asked: ' + String(t.brief || '').slice(0, 1200));
    if (t.summary) history.push('You answered: ' + String(t.summary).slice(0, 1200));
  }
  if (history.length) {
    return [
      'You are continuing a conversation inside a disposable clone of ' + run.repo_full_name + '.',
      'You are on branch ' + run.work_branch + '. Your earlier work in this conversation is already committed on it.',
      '',
      'WHAT HAS HAPPENED SO FAR',
      history.join('\n'),
      '',
      'RULES',
      '- Never ask a question and never wait for confirmation. Nobody can answer you. Decide and act.',
      '- Follow the repository\'s own CLAUDE.md and its skills. They outrank your habits.',
      '- Commit as you go, in small commits with clear messages. Do not push; the pipeline pushes.',
      '- Run the repository\'s tests when there are any, and fix what you break.',
      '- Never write a secret, an API key or a token into a file.',
      '- If part of the request cannot be done, do the rest and say plainly at the end what you did not do.',
      '- No emojis anywhere.',
      '- If the message is a question rather than a change, just answer it and change nothing.',
      '',
      'THE NEW MESSAGE, WORD FOR WORD',
      run.brief
    ].join('\n');
  }
  return [
    'You are running unattended inside a disposable clone of ' + run.repo_full_name + '.',
    'You are on branch ' + run.work_branch + ', created from ' + run.base_branch + '.',
    '',
    'RULES',
    '- Never ask a question and never wait for confirmation. Nobody can answer you. Decide and act.',
    '- Follow the repository\'s own CLAUDE.md and its skills. They outrank your habits.',
    '- Commit as you go, in small commits with clear messages. Do not push; the pipeline pushes.',
    '- Run the repository\'s tests when there are any, and fix what you break.',
    '- Never write a secret, an API key or a token into a file.',
    '- If part of the brief cannot be done, do the rest and say plainly at the end what you did not do.',
    '- No emojis anywhere, in code, comments, commit messages or output.',
    '',
    'THE BRIEF, WORD FOR WORD',
    run.brief
  ].join('\n');
}

// ── the agent ────────────────────────────────────────────────────────────────
// LOADED BY dynamic import(), NOT require(). The package is ESM ("type":"module"), and
// require() of an ESM module only works from Node 22.12 onward — Render's Node version is
// not pinned by this repository (engines says >=16), so a require() here would work on a
// laptop and throw ERR_REQUIRE_ESM in production. import() works on every supported Node.
// It is also lazy, so the vertical loads and the SIT runs with the package absent; an
// absent package is then reported as itself rather than crashing the app on boot.
let queryCache = null;
async function loadQuery() {
  if (queryCache) return queryCache;
  try {
    const mod = await import('@anthropic-ai/claude-agent-sdk');
    queryCache = (mod && (mod.query || (mod.default && mod.default.query))) || null;
    if (typeof queryCache !== 'function') throw new Error('the package exports no query()');
    return queryCache;
  } catch (e) {
    throw new Error('@anthropic-ai/claude-agent-sdk is not installed or not loadable: ' + e.message);
  }
}
let queryImpl = null;                           // test seam
function __setQuery(fn) { queryImpl = fn; }
async function getQuery() { return queryImpl || loadQuery(); }

/**
 * One pass of the agent over the workspace. Returns the SDK's result fields.
 * `resume` continues the same session, which is how a failing test is handed back
 * with its output instead of starting the reasoning again from nothing.
 */
async function runAgent(run, ws, prompt, resume, abortController, totals) {
  const query = await getQuery();
  const iterator = query({
    prompt,
    options: {
      cwd: ws,
      model: MODEL,
      permissionMode: 'bypassPermissions',
      maxTurns: MAX_TURNS,
      // The repository's own CLAUDE.md and skills are the point of this surface, so project
      // settings are loaded — but `disarmWorkspace()` has already deleted the parts of that
      // source that EXECUTE (settings.json hooks, .mcp.json). Loading instructions from a
      // repository is fine; letting a repository run a shell command on this server is not.
      settingSources: ['project'],
      allowedTools: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep'],
      // Supplied, never omitted: the SDK REPLACES the subprocess environment with this and
      // INHERITS process.env when it is absent. See runEnv().
      env: runEnv(homeFor(run.id), process.env.ANTHROPIC_API_KEY ? { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY } : {}),
      abortController,
      ...(resume ? { resume } : {})
    }
  });

  let result = null;
  for await (const msg of iterator) {
    if (!msg || typeof msg !== 'object') continue;
    if (msg.type === 'assistant' || msg.type === 'user') {
      for (const block of blocksOf(msg)) {
        if (block.type === 'text' && String(block.text || '').trim()) {
          await store.emit(run.id, 'assistant', { text: clip(block.text, 4000) });
        } else if (block.type === 'tool_use') {
          await store.emit(run.id, 'tool_use', { name: block.name, input: toolInput(block.input) });
        } else if (block.type === 'tool_result') {
          await store.emit(run.id, 'tool_result', {
            is_error: !!block.is_error,
            text: clip(textOf(block.content), 2500)
          });
        }
      }
      const usage = msg.message && msg.message.usage;
      if (usage) {
        totals.tokens_in = (totals.tokens_in || 0) + Number(usage.input_tokens || 0) + Number(usage.cache_read_input_tokens || 0);
        totals.tokens_out = (totals.tokens_out || 0) + Number(usage.output_tokens || 0);
      }
    } else if (msg.type === 'result') {
      result = {
        session_id: msg.session_id || null,
        cost_usd: typeof msg.total_cost_usd === 'number' ? msg.total_cost_usd : null,
        turns: typeof msg.num_turns === 'number' ? msg.num_turns : null,
        is_error: !!msg.is_error,
        subtype: msg.subtype || null,
        text: typeof msg.result === 'string' ? msg.result : null
      };
      if (result.cost_usd != null) totals.cost_usd = (totals.cost_usd || 0) + result.cost_usd;
      if (result.turns != null) totals.turns = (totals.turns || 0) + result.turns;
      await store.emit(run.id, 'result', {
        subtype: result.subtype, is_error: result.is_error,
        cost_usd: result.cost_usd, turns: result.turns, text: clip(result.text || '', 3000)
      });
      // The hard stop on money. The SDK reports cost only at the end of a pass, so this
      // is checked between passes: it caps a run, and never a single runaway turn.
      if ((totals.cost_usd || 0) >= COST_CAP_USD) {
        totals.capped = true;
        try { abortController.abort(); } catch (e) {}
      }
    }
  }
  if (!result) throw new Error('the agent produced no result message');
  return result;
}

function blocksOf(msg) {
  const c = msg.message && msg.message.content;
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') return [{ type: 'text', text: c }];
  return [];
}
function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(b => (b && b.type === 'text' ? b.text : '')).join('\n');
  return '';
}
// A tool's arguments are shown so the console reads like a terminal, but a Write's whole
// file body would drown it — every value is clipped, and the whole object is redacted
// again by store.emit on its way to the database.
function toolInput(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  let n = 0;
  for (const k of Object.keys(input)) {
    if (++n > 12) break;
    const v = input[k];
    out[k] = typeof v === 'string' ? clip(v, 600) : (typeof v === 'object' ? '[object]' : v);
  }
  return out;
}

// ── tests ────────────────────────────────────────────────────────────────────
// The repository's own test script, and only if it declares one. Inventing a command
// would report a pass the repository never granted.
async function repoTestCommand(ws) {
  try {
    const pkg = JSON.parse(await fsp.readFile(path.join(ws, 'package.json'), 'utf8'));
    if (pkg && pkg.scripts && pkg.scripts.test) return ['npm', ['test']];
  } catch (e) { /* no package.json, or unreadable */ }
  return null;
}

// A FRESH CLONE HAS NO node_modules, AND WITHOUT THIS EVERY RUN WENT RED. `npm test` in a
// shallow clone of this repository is `jest`, which exits 127 "command not found" — which the
// old code reported as a FAILING SUITE, so the agent was handed "the tests failed, fix it"
// three times, paid for each pass, and could not possibly fix a missing install. The PR then
// opened as a draft that the merge button refuses. So: install first, with scripts DISABLED
// (a lockfile's postinstall is arbitrary code from the cloned repository), and treat a failed
// install as NOT MEASURED — never as a red suite, which is what starts the fix loop.
async function installDeps(run, ws) {
  if (fs.existsSync(path.join(ws, 'node_modules'))) return { ok: true, skipped: true };
  if (!fs.existsSync(path.join(ws, 'package.json'))) return { ok: true, skipped: true };
  const env = runEnv(homeFor(run.id));
  const lock = fs.existsSync(path.join(ws, 'package-lock.json'));
  await store.log(run.id, 'Installing dependencies (' + (lock ? 'npm ci' : 'npm install') + ', install scripts disabled)…');
  let r = await sh('npm', [lock ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund'],
    { cwd: ws, env, runId: run.id, timeoutMs: 15 * 60 * 1000 });
  if (r.code !== 0 && lock) {
    // A lockfile out of step with package.json fails `ci` and succeeds with `install`.
    r = await sh('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { cwd: ws, env, runId: run.id, timeoutMs: 15 * 60 * 1000 });
  }
  const out = (r.out + '\n' + r.err).trim();
  if (r.code !== 0) await store.log(run.id, 'The install failed, so the suite is reported as NOT MEASURED rather than as red:\n' + out.slice(-1500));
  return { ok: r.code === 0, output: out.slice(-4000) };
}

async function runTests(run, ws) {
  const cmd = await repoTestCommand(ws);
  if (!cmd) {
    await store.log(run.id, 'No test script in package.json — nothing to run. Reported as not measured, not as a pass.');
    return { measured: false, ok: true, output: '', why: 'no test script' };
  }
  const install = await installDeps(run, ws);
  if (!install.ok) return { measured: false, ok: true, output: install.output, why: 'the dependencies could not be installed' };
  const r = await sh(cmd[0], cmd[1], { cwd: ws, env: runEnv(homeFor(run.id)), runId: run.id, timeoutMs: 20 * 60 * 1000 });
  const output = (r.out + '\n' + r.err).trim();
  await store.emit(run.id, 'log', { text: clip('npm test: exit ' + r.code + '\n' + output.slice(-4000), 4200) });
  return { measured: true, ok: r.code === 0, output: output.slice(-8000) };
}

// ── disarming the clone ──────────────────────────────────────────────────────
// A repository is a source of INSTRUCTIONS here, never of EXECUTION. `settingSources:['project']`
// makes the SDK read `.claude/settings.json`, which can declare `hooks` — a SessionStart hook in
// any repository the allow-list permits would run a shell command on this production server
// before the first model turn, with whatever environment it was given. `.mcp.json` is the same
// hole through a different door. Both are removed from the workspace after the clone and before
// the agent starts; CLAUDE.md, skills and the code itself are untouched, because reading those
// is the whole feature.
const DISARM = ['.claude/settings.json', '.claude/settings.local.json', '.mcp.json',
  '.claude/hooks', '.claude/settings.json.local'];
async function disarmWorkspace(ws, run) {
  const removed = [];
  for (const rel of DISARM) {
    const target = path.join(ws, rel);
    if (!target.startsWith(ws + path.sep)) continue;
    if (fs.existsSync(target)) { await fsp.rm(target, { recursive: true, force: true }); removed.push(rel); }
  }
  if (removed.length) await store.log(run.id, 'Removed from the workspace before the agent started (they execute, they do not instruct): ' + removed.join(', '));
  return removed;
}

// ── the house skill ──────────────────────────────────────────────────────────
// A repository that does not carry ringlypro-architect gets ours copied into the
// workspace, so the run follows the same conventions as everything else here. It is a
// copy into a throwaway directory; it is never committed unless the agent chooses to.
async function ensureArchitectSkill(ws, run) {
  const dest = path.join(ws, '.claude', 'skills', 'ringlypro-architect');
  if (fs.existsSync(path.join(dest, 'SKILL.md'))) return 'present';
  const candidates = [
    path.join(__dirname, '..', '..', '..', '..', '.claude', 'skills', 'ringlypro-architect', 'SKILL.md'),
    path.join(__dirname, '..', '..', '..', '..', '.claude', 'commands', 'ringlypro-architect.md')
  ];
  const src = candidates.find(p => fs.existsSync(p));
  if (!src) { await store.log(run.id, 'Architect skill not found on this server — the run proceeds without it.'); return 'absent'; }
  await fsp.mkdir(dest, { recursive: true });
  // The source on this server is the /ringlypro-architect COMMAND file, whose frontmatter has no
  // `name:` — a SKILL.md needs one, so it is added rather than copied byte for byte.
  const body = await fsp.readFile(src, 'utf8');
  const withName = /^---\s*[\s\S]*?\bname:/m.test(body.slice(0, 400))
    ? body
    : (/^---/.test(body) ? body.replace(/^---\n/, '---\nname: ringlypro-architect\n')
      : '---\nname: ringlypro-architect\ndescription: House conventions for this estate.\n---\n\n' + body);
  await fsp.writeFile(path.join(dest, 'SKILL.md'), withName);
  // IT IS FOR THIS RUN, NOT FOR THE REPOSITORY. `.gitignore` here does not cover `.claude/`, and
  // the commit is `git add -A`, so without this every pull request against a skill-less
  // repository would carry a ~98 KB SKILL.md nobody asked for. `.git/info/exclude` is local to
  // the clone and is never itself committed.
  try {
    await fsp.mkdir(path.join(ws, '.git', 'info'), { recursive: true });
    await fsp.appendFile(path.join(ws, '.git', 'info', 'exclude'), '\n.claude/skills/ringlypro-architect/\n');
  } catch (e) { await store.log(run.id, 'Could not exclude the copied skill from the commit: ' + e.message); }
  await store.log(run.id, 'Copied the ringlypro-architect skill into the workspace, excluded from the commit (the repository does not carry one).');
  return 'copied';
}

// ── the staged diff is scanned before anything is committed ──────────────────
// The only other control on this is a sentence in the prompt, and a sentence is not a control.
// A CLAUDE.md in the cloned repository saying "write the build environment to debug.txt" would
// otherwise produce a commit on a PUBLIC branch carrying whatever the process holds. The
// Factory path refuses exactly this in apply-patch.js; this pipeline had no equivalent.
const FORBIDDEN_PATHS = [/(^|\/)\.env($|\.)/i, /(^|\/)\.git\//, /(^|\/)id_rsa($|\.)/i, /\.pem$/i, /\.p12$/i, /(^|\/)\.npmrc$/i];
async function scanStagedDiff(run, ws) {
  const d = await sh('git', ['diff', '--cached', '--unified=0'], { cwd: ws, timeoutMs: 3 * 60 * 1000 });
  if (d.code !== 0) return { ok: false, why: 'the staged diff could not be read: ' + (d.err || '').slice(0, 200) };
  const added = String(d.out).split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));
  const hit = added.find(l => redactText(l) !== l);          // redactText masks exactly the shapes and values we refuse
  if (hit) return { ok: false, why: 'the commit contains something shaped like a credential' };
  const names = await sh('git', ['diff', '--cached', '--name-only'], { cwd: ws, timeoutMs: 60 * 1000 });
  const badPath = String(names.out).split('\n').map(x => x.trim()).filter(Boolean)
    .find(f => FORBIDDEN_PATHS.some(re => re.test(f)));
  if (badPath) return { ok: false, why: 'the commit touches ' + badPath + ', which this pipeline never commits' };
  return { ok: true };
}

// ── the pipeline ─────────────────────────────────────────────────────────────
async function execute(runId, onRegistered) {
  const run = await models.CcRun.findByPk(runId);
  if (!run) { if (onRegistered) onRegistered(); return; }
  if (run.status !== 'queued') { if (onRegistered) onRegistered(); return; }

  const thread = run.thread_id ? await models.CcThread.findByPk(run.thread_id) : null;
  const priorTurns = thread
    ? (await models.CcRun.findAll({ where: { thread_id: thread.id, tenant_id: run.tenant_id }, order: [['id', 'ASC']] }))
      .filter(r => r.id !== run.id).map(r => ({ brief: r.brief, summary: r.summary }))
    : [];
  const abortController = new AbortController();
  active.set(run.id, { abort: () => abortController.abort(), tenant_id: run.tenant_id });
  // The request's reservation becomes this run's slot: counted as active from here, so the
  // reservation is handed back in the same breath and the ceiling never double-counts.
  if (onRegistered) onRegistered();
  const ws = path.join(WORKSPACE_ROOT, 'run-' + run.id);
  // null until the SDK says otherwise: 0 is a measurement, absent is not.
  const totals = { cost_usd: null, turns: null, tokens_in: null, tokens_out: null, capped: false };
  let cancelled = false;

  // A cancel can land between any check and the next write. `store.setStatus` refuses to leave a
  // terminal status and reports whether the row actually moved, so `step()` is the real guard and
  // these polls are only a fast path. Without it a cancel arriving during the push window walked
  // the run cancelled -> pushing -> pr_open, and with auto-merge on, into main.
  const step = async (status, fields) => {
    const moved = await store.setStatus(run, status, fields);
    if (!moved) { cancelled = true; throw new Error('cancelled'); }
    return moved;
  };
  const cancelledNow = async () => {
    const fresh = await models.CcRun.findByPk(run.id);
    return !fresh || store.isTerminal(fresh.status);
  };

  try {
    github.assertAllowed(run.repo_full_name);
    if (!github.configured()) throw new Error('GITHUB_TOKEN is not set — cloning is closed, not open.');

    // 1. clone + branch
    await step('cloning');
    await fsp.rm(ws, { recursive: true, force: true });
    await fsp.mkdir(path.dirname(ws), { recursive: true });
    const clone = await sh('git', ['clone', '--depth', '50', '--branch', run.base_branch, github.cloneUrl(run.repo_full_name), ws],
      { runId: run.id, timeoutMs: 10 * 60 * 1000 });
    if (clone.code !== 0) throw new Error('clone failed: ' + redactText((clone.err || clone.out)).slice(0, 400));
    // THE CLONE URL CARRIES THE TOKEN AND git WRITES IT INTO .git/config VERBATIM. The agent
    // has Bash in this directory, so one `cat .git/config` would hand it an org-wide write
    // token — no environment access needed, which is why this survives the env allow-list.
    // The push supplies the credentialed URL explicitly, so nothing needs it in the tree.
    await git(ws, ['remote', 'set-url', 'origin', 'https://github.com/' + run.repo_full_name + '.git']);
    await store.log(run.id, 'Cloned ' + run.repo_full_name + ' at ' + run.base_branch + ' (shallow, 50 commits). The push credential is not left in the workspace.');

    // A THREAD KEEPS ITS BRANCH. The first turn creates it; every later turn checks the same one
    // out, so the conversation accumulates on one branch behind one pull request instead of
    // scattering a branch per message.
    let branch = thread && thread.work_branch;
    if (branch) {
      const fetched = await git(ws, ['fetch', '--depth', '50', github.cloneUrl(run.repo_full_name), branch], run.id, 'fetch');
      if (fetched.code === 0) await git(ws, ['checkout', '-B', branch, 'FETCH_HEAD'], run.id, 'branch');
      else { await store.log(run.id, 'The conversation branch was not on GitHub any more; starting it again from ' + run.base_branch + '.'); await git(ws, ['checkout', '-B', branch], run.id, 'branch'); }
    } else {
      branch = 'cc/' + run.id + '-' + slug(run.brief);
      await git(ws, ['checkout', '-b', branch], run.id, 'branch');
    }
    await git(ws, ['config', 'user.name', 'AutoDev Claude Code']);
    await git(ws, ['config', 'user.email', 'autodev@digit2ai.com']);
    await run.update({ work_branch: branch });
    await fsp.mkdir(homeFor(run.id), { recursive: true });
    await disarmWorkspace(ws, run);
    const skill = await ensureArchitectSkill(ws, run);

    if (await cancelledNow()) { cancelled = true; throw new Error('cancelled');}

    // 2. the agent
    await step('running', { work_branch: branch });
    await store.log(run.id, 'Model ' + MODEL + ', up to ' + MAX_TURNS + ' turns, cost cap $' + COST_CAP_USD.toFixed(2) + '. Architect skill: ' + skill + '.');
    let result = await runAgent(run, ws, buildPrompt(run, priorTurns), thread && thread.session_id, abortController, totals);
    if (totals.capped) throw new Error('stopped at the $' + COST_CAP_USD.toFixed(2) + ' cost cap for one run');
    if (abortController.signal.aborted) { cancelled = true; throw new Error('cancelled'); }
    await run.update(persistTotals(totals, { session_id: result.session_id, summary: result.text || null }));

    // 3. tests, with up to MAX_FIX_CYCLES hand-backs into the same session
    await step('testing');
    let tests = await runTests(run, ws);
    if (await cancelledNow()) { cancelled = true; throw new Error('cancelled'); }
    for (let cycle = 1; !tests.ok && cycle <= MAX_FIX_CYCLES; cycle++) {
      if (await cancelledNow()) { cancelled = true; throw new Error('cancelled'); }
      await store.log(run.id, 'Tests failed. Fix cycle ' + cycle + ' of ' + MAX_FIX_CYCLES + '.');
      const fixPrompt = 'The test suite failed. Fix the code so it passes. Do not change a test to make it pass unless the test itself is wrong, and say so if you do.\n\nTest output:\n' + tests.output;
      result = await runAgent(run, ws, fixPrompt, result.session_id || run.session_id, abortController, totals);
      if (totals.capped) throw new Error('stopped at the $' + COST_CAP_USD.toFixed(2) + ' cost cap for one run');
      if (abortController.signal.aborted) { cancelled = true; throw new Error('cancelled'); }
      await run.update(persistTotals(totals, { session_id: result.session_id || run.session_id, summary: result.text || run.summary }));
      tests = await runTests(run, ws);
      if (await cancelledNow()) { cancelled = true; throw new Error('cancelled'); }
    }

    // 4. is there anything to push?
    await git(ws, ['add', '-A']);
    const dirty = await git(ws, ['status', '--porcelain']);
    if (dirty.out.trim()) {
      const scan = await scanStagedDiff(run, ws);
      if (!scan.ok) throw new Error('refused to commit: ' + scan.why);
      const msg = 'AutoDev run ' + run.id + ': ' + firstLine(run.brief);
      await git(ws, ['commit', '-m', msg, '-m', 'Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>'], run.id, 'commit');
    }
    const ahead = await git(ws, ['rev-list', '--count', 'origin/' + run.base_branch + '..HEAD']);
    // A failed rev-list prints nothing, which read as "zero commits" and hid the real git error
    // behind "the agent produced no commits".
    if (ahead.code !== 0) throw new Error('could not count commits: ' + redactText(ahead.err || ahead.out).slice(0, 300));
    const commits = Number(String(ahead.out).trim() || '0');
    if (!commits) throw new Error('the agent produced no commits — nothing to push');

    const head = await git(ws, ['rev-parse', 'HEAD']);
    const sha = String(head.out).trim();

    // 5. push + PR
    if (await cancelledNow()) { cancelled = true; throw new Error('cancelled'); }
    await step('pushing', { commit_sha: sha });
    const push = await sh('git', ['push', '-u', github.cloneUrl(run.repo_full_name), branch], { cwd: ws, runId: run.id, timeoutMs: 10 * 60 * 1000 });
    if (push.code !== 0) throw new Error('push failed: ' + redactText(push.err || push.out).slice(0, 400));
    await store.log(run.id, 'Pushed ' + commits + ' commit(s) to ' + branch + '.');

    const wantDraft = (tests.measured && !tests.ok) || (result && result.is_error);
    let pr = null;
    if (thread && thread.pr_number) {
      // The conversation already has one. A second pull request for the same branch is not
      // possible on GitHub anyway, and the owner should keep reading the one they opened.
      try {
        const existing = await github.getPR(run.repo_full_name, thread.pr_number);
        if (existing && existing.state === 'open') pr = existing;
      } catch (e) { /* it was closed or deleted; a new one is opened below */ }
    }
    if (pr) {
      await store.log(run.id, 'Added to the existing pull request.');
    } else
    try {
      pr = await github.createPR(run.repo_full_name, { title: prTitle(run, result), head: branch, base: run.base_branch, body: prBody(run, result, tests), draft: wantDraft });
    } catch (e) {
      // Some repositories and plans refuse draft pull requests with a 422 — and by here the
      // branch is already pushed, so failing would leave a branch with no pull request at all.
      if (!wantDraft) throw e;
      await store.log(run.id, 'This repository does not accept draft pull requests; opening a normal one and saying in the body why it is not ready.');
      pr = await github.createPR(run.repo_full_name, { title: prTitle(run, result), head: branch, base: run.base_branch, body: prBody(run, result, tests), draft: false });
    }
    await step('pr_open', Object.assign(persistTotals(totals, {}), { pr_url: pr.html_url, commit_sha: sha }));
    if (thread) {
      await thread.update({
        work_branch: branch, pr_url: pr.html_url, pr_number: pr.number,
        session_id: result.session_id || thread.session_id, last_run_at: new Date()
      });
    }

    // 6. AUTO-MERGE FAILS SHUT. It used to merge on 'unknown', which is exactly what
    // combinedStatus returns when the GitHub call ERRORS — so a transient 502 merged unreviewed
    // agent output into a public main. Now: green measured tests AND a CI verdict that is either
    // success or a documented absence of CI, never an error. A run that came from a meeting is
    // never merged automatically whatever the setting: the person who typed into a chat did not
    // read a diff, and that is the only human step left on that path.
    if (AUTO_MERGE && run.source === 'speakup') {
      await store.log(run.id, 'Automatic merge is not offered for a run transferred from a meeting. Read the pull request and merge it yourself.');
    } else if (AUTO_MERGE) {
      const state = await github.combinedStatus(run.repo_full_name, sha);
      const greenLocally = tests.measured && tests.ok;
      if (!greenLocally) {
        await store.log(run.id, 'Automatic merge refused: the test suite is ' + (tests.measured ? 'red' : 'not measured (' + (tests.why || 'no suite') + ')') + '. The pull request is open for a person.');
      } else if (result && result.is_error) {
        await store.log(run.id, 'Automatic merge refused: the agent itself reported an error (' + (result.subtype || 'is_error') + ').');
      } else if (state === 'success' || state === 'none') {
        if (state === 'none') await store.log(run.id, 'GitHub reports no CI on this commit; merging on the green local suite.');
        await github.mergePR(run.repo_full_name, pr.number, sha, prTitle(run, result));
        await store.setStatus(run, 'merged');
        // THE DEPLOY HOOK BELONGS TO ONE SERVICE. Firing it after merging a PR in any repository
        // would redeploy this CRM from whatever happened to be on that other repo's main.
        const hook = process.env.RENDER_DEPLOY_HOOK_URL;
        const hookRepo = process.env.CC_DEPLOY_REPO || process.env.SPEAKUP_FACTORY_REPO || 'digit2ai/RinglyPro-CRM';
        if (hook && run.repo_full_name.toLowerCase() === String(hookRepo).toLowerCase()) {
          try {
            await fetch(hook, { method: 'POST' });
            await store.setStatus(run, 'deployed', { deploy_url: process.env.CC_DEPLOY_URL || null });
          } catch (e) {
            await store.log(run.id, 'Merged, but the deploy hook did not answer: ' + e.message);
          }
        } else if (hook) {
          await store.log(run.id, 'Merged. The deploy hook was not fired: it belongs to ' + hookRepo + ', not to this repository.');
        }
      } else {
        await store.log(run.id, 'Automatic merge refused: CI is ' + state + '. The pull request is open for a person.');
      }
    }
  } catch (e) {
    // The cap aborts the controller from inside the iterator, so the SDK throws its own abort
    // error and the honest message never reached the operator. It is restored here, and it wins
    // over the cancelled branch: a run stopped by the cap was not cancelled by anyone.
    let msg = totals.capped
      ? 'stopped at the $' + COST_CAP_USD.toFixed(2) + ' cost cap for one run'
      : redactText(e && e.message ? e.message : String(e));
    if (totals.capped) cancelled = false;
    const fresh = await models.CcRun.findByPk(runId);
    if (fresh) {
      if (cancelled || msg === 'cancelled' || fresh.status === 'cancelled') {
        if (fresh.status !== 'cancelled') await store.setStatus(fresh, 'cancelled', persistTotals(totals, { error: null }));
        else await fresh.update(persistTotals(totals, {}));
        await store.log(runId, 'Cancelled. The workspace was removed.');
      } else if (!store.isTerminal(fresh.status)) {
        await store.setStatus(fresh, 'failed', persistTotals(totals, { error: msg.slice(0, 2000) }));
      }
    }
  } finally {
    // The slot is released AFTER the tree is gone: releasing it first let a cancel arriving in
    // the gap start a second recursive remove of the same directory, which can throw ENOTEMPTY.
    children.delete(runId);
    try { await fsp.rm(ws, { recursive: true, force: true }); } catch (e) { /* best effort */ }
    try { await fsp.rm(homeFor(runId), { recursive: true, force: true }); } catch (e) { /* best effort */ }
    active.delete(runId);
  }
}

// `|| null` turned a measured ZERO into "not measured" — and zero is exactly what a run billed
// against a subscription reports for cost. The file's own promise is that null means nothing was
// measured, so only null may mean that.
function persistTotals(t, extra) {
  const num = (v) => (v == null ? null : Number(v));
  return Object.assign({
    cost_usd: t.cost_usd == null ? null : Number(Number(t.cost_usd).toFixed(4)),
    turns: num(t.turns), tokens_in: num(t.tokens_in), tokens_out: num(t.tokens_out)
  }, extra || {});
}

function firstLine(s) {
  const t = String(s || '').split('\n').find(l => l.trim()) || 'change';
  return t.trim().slice(0, 72);
}
function prTitle(run, result) {
  const summary = result && result.text ? String(result.text).split('\n').find(l => l.trim()) : null;
  return ('AutoDev ' + run.id + ': ' + (summary || firstLine(run.brief))).slice(0, 110);
}
function prBody(run, result, tests) {
  const lines = [
    'Opened by the AutoDev Claude Code tab, run ' + run.id + ' (source: ' + run.source + ').',
    '',
    '## Brief',
    run.brief,
    '',
    '## Tests',
    tests.measured ? (tests.ok ? 'The repository test suite passed.' : 'The repository test suite FAILED — this pull request is not ready.')
      : 'Nothing was measured: ' + (tests.why || 'the repository declares no test script') + '.',
    ''
  ];
  if (result && result.is_error) {
    lines.push('## The agent reported an error', 'The run ended with `' + (result.subtype || 'is_error') +
      '`, so the change may be incomplete. Read it before merging.', '');
  }
  if (result && result.text) lines.push('## What the agent reported', clip(result.text, 4000));
  return lines.join('\n');
}

// ── entry points ─────────────────────────────────────────────────────────────
// Fire and forget: the HTTP request that created the run returns immediately and the
// browser follows the SSE stream. A throw here is caught and recorded on the run.
// The caller reserved a slot synchronously; the runner owns it from here. It is released the
// moment `execute` registers the run as active (so it is counted once, never twice) and on any
// path where that never happens — otherwise a crash would leak a slot until the process restarts.
function start(runId, tenantId) {
  let released = false;
  const handOver = () => { if (!released) { released = true; if (tenantId != null) release(tenantId); } };
  setImmediate(() => {
    execute(runId, handOver).catch(e => { handOver(); console.error('CLAUDE CODE runner crashed', runId, e.message); });
  });
}

async function cancel(run) {
  const entry = active.get(run.id);
  // forceStatus, not setStatus: this is the write that MAKES the row terminal, and setStatus now
  // refuses to leave one. Every other writer is refused from this moment on.
  await store.forceStatus(run, 'cancelled', { error: null });
  if (entry) entry.abort();
  // Kill what is running right now. Without this a cancel during `npm test` returned at once
  // while the suite ran on to its twenty-minute timeout, holding the slot and the workspace.
  for (const kill of children.get(run.id) || []) { try { kill(); } catch (e) {} }
  if (!entry) {
    try { await fsp.rm(path.join(WORKSPACE_ROOT, 'run-' + run.id), { recursive: true, force: true }); } catch (e) {}
    try { await fsp.rm(homeFor(run.id), { recursive: true, force: true }); } catch (e) {}
  }
  return true;
}

// ── the watchdog ─────────────────────────────────────────────────────────────
// `active` and the workspace are per instance, so a Render deploy mid-run leaves the row in
// `running` or `pushing` FOR EVER: the SSE stream never sees a terminal event and every watching
// browser holds a ping interval and a bus listener indefinitely, the duration ticks up without
// bound, and the workspace is never removed. The AI Factory has jobs.startWatchdog() for exactly
// this; this surface had nothing. It runs once on boot — a run cannot survive the process that
// was running it, so anything non-terminal at startup was interrupted, by definition.
async function sweepInterrupted() {
  const models_ = require('../models');
  const { Op } = require('sequelize');
  let swept = 0;
  try {
    const rows = await models_.CcRun.findAll({ where: { status: { [Op.notIn]: store.TERMINAL } }, limit: 200 });
    for (const row of rows) {
      if (active.has(row.id)) continue;                       // this process owns it
      await store.forceStatus(row, 'failed', { error: 'Interrupted by a server restart. Nothing was merged; any branch already pushed is still on GitHub.' });
      try { await fsp.rm(path.join(WORKSPACE_ROOT, 'run-' + row.id), { recursive: true, force: true }); } catch (e) {}
      try { await fsp.rm(homeFor(row.id), { recursive: true, force: true }); } catch (e) {}
      swept++;
    }
  } catch (e) {
    console.error('CLAUDE CODE sweep failed', e.message);
  }
  if (swept) console.log('  CLAUDE CODE swept ' + swept + ' run(s) interrupted by a restart');
  return swept;
}

function config() {
  return {
    model: MODEL, max_turns: MAX_TURNS, cost_cap_usd: COST_CAP_USD, auto_merge: AUTO_MERGE,
    max_concurrent: MAX_CONCURRENT, workspace_root: WORKSPACE_ROOT,
    github: github.configured(), allowed_owners: github.allowedOwners(),
    // Either credential pays for a run; reporting only one made the page warn falsely on a
    // server configured the way the rest of this vertical is.
    anthropic_key: !!(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_CODE_OAUTH_TOKEN),
    deploy_hook: !!process.env.RENDER_DEPLOY_HOOK_URL,
    sdk: sdkPresent()
  };
}
function sdkPresent() {
  if (queryImpl) return true;
  try { require.resolve('@anthropic-ai/claude-agent-sdk'); return true; } catch (e) { return false; }
}

module.exports = {
  start, execute, cancel, atCapacity, reserve, release, activeForTenant, isActive, config, sdkPresent, sweepInterrupted,
  buildPrompt, slug, runTests, ensureArchitectSkill, MAX_CONCURRENT, COST_CAP_USD,
  // Test seams. runAgent is one pass of the agent over a workspace: the SIT drives it with a
  // fake query() to prove the cost is copied and a secret in a tool result never lands.
  __setQuery, __runAgent: runAgent, __disarmWorkspace: disarmWorkspace, __persistTotals: persistTotals, __scanStagedDiff: scanStagedDiff
};
