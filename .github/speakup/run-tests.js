'use strict';

/**
 * Run the checks for an AI Factory job and write $WORK/tests.json.
 *
 *  1. node --check on every changed .js/.cjs/.mjs file (each file = one check).
 *  2. Each approved test command (env TEST_COMMANDS from the trusted prepare job, else
 *     the brief), run with spawnSync and NO shell, 10-minute cap, with the GitHub
 *     workflow-command files removed from its environment.
 *
 * Counts: the LAST "N passed, M failed" / jest "Tests:" / "N/M" line of each command; a
 * command with no count contributes 1 by exit code, and a non-zero exit always adds a failure.
 *
 * In the build job these numbers are only feedback for Claude. The authoritative run is
 * the verify job on a clean VM.
 *
 * THE BASELINE PASS IS WHAT MAKES "IT EDITED THE TESTS" MERGEABLE AGAIN.
 * A change that also writes tests for itself is normal and good — and it used to block the
 * merge for ever, because a suite the change wrote cannot vouch for the change. So each
 * approved test script that this change MODIFIED is restored to the base-branch version
 * (`git checkout -- <path>`, the patch is applied but not committed, so HEAD is the base) and
 * the commands are run again. Those counts come from tests the change did not author, over the
 * changed product code. `baseline_ok` is what the merge gate reads; the change's own suite is
 * still run and reported, it just does not decide anything on its own. The patched files are
 * restored afterwards, always, so the commit that gets pushed is untouched.
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { WORK, readJSON, writeJSON, setOutput } = require('./lib');

const TEST_CMD = /^(node|npx jest|npm test)(\s+[A-Za-z0-9_./:=@-]+)*$/;

function changedFiles() {
  const out = execFileSync('git', ['-c', 'core.quotepath=off', 'status', '--porcelain', '--untracked-files=all', '--no-renames'], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map(l => l.slice(3).trim()).filter(p => !p.startsWith('node_modules/'));
}

function lastMatch(re, text) { let m, last = null; const g = new RegExp(re.source, 'gi'); while ((m = g.exec(text))) last = m; return last; }
function parseCounts(text) {
  let m = lastMatch(/(\d+)\s+passed,\s*(\d+)\s+failed/, text);
  if (m) return { passed: +m[1], failed: +m[2] };
  m = lastMatch(/Tests:\s+(?:(\d+)\s+failed,\s*)?(\d+)\s+passed/, text);
  if (m) return { passed: +m[2], failed: +(m[1] || 0) };
  m = lastMatch(/\b(\d+)\/(\d+)\b/, text);
  if (m && +m[2] > 0 && +m[1] <= +m[2]) return { passed: +m[1], failed: +m[2] - +m[1] };
  return null;
}

let commandsList = [];
try { commandsList = process.env.TEST_COMMANDS ? JSON.parse(process.env.TEST_COMMANDS) : (readJSON('brief.json', {}).test_commands || []); } catch (e) { commandsList = []; }

const childEnv = Object.assign({}, process.env, { SPEAKUP_FACTORY_POLLER: 'off', INCENTIVA_AGENTS: 'off', PUPPETEER_SKIP_DOWNLOAD: '1' });
for (const k of Object.keys(childEnv)) if (/^(GITHUB_(OUTPUT|ENV|PATH|STEP_SUMMARY|STATE)|ACTIONS_)/.test(k)) delete childEnv[k];

let log = '', passed = 0, failed = 0, ran = 0;
const commands = [];

const files = changedFiles().filter(f => /\.(c|m)?js$/.test(f) && fs.existsSync(f));
let syntaxFailed = 0;
for (const f of files) {
  const r = spawnSync('node', ['--check', f], { encoding: 'utf8', env: childEnv });
  ran++;
  if (r.status === 0) passed++; else { failed++; syntaxFailed++; log += `\n[syntax] ${f}\n${r.stderr}`; }
}
commands.push({ cmd: 'node --check (changed files)', passed: files.length - syntaxFailed, failed: syntaxFailed });

for (const cmd of commandsList) {
  ran++;
  if (!TEST_CMD.test(cmd)) { log += `\n[refused] ${cmd}\n`; failed++; commands.push({ cmd, refused: true }); continue; }
  const parts = cmd.split(/\s+/);
  const r = spawnSync(parts[0], parts.slice(1), { encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, env: childEnv });
  const text = (r.stdout || '') + '\n' + (r.stderr || '');
  log += `\n[${cmd}] exit ${r.status}\n${text}`;
  const c = parseCounts(text);
  if (c) { passed += c.passed; failed += c.failed; if (r.status !== 0 && c.failed === 0) failed++; }
  else if (r.status === 0) passed++; else failed++;
  commands.push({ cmd, exit: r.status, counts: c });
}

// ── the baseline pass ────────────────────────────────────────────────────────
// Which approved commands name a script this change modified?
const changedSet = new Set(changedFiles());
const suiteFiles = [];
for (const cmd of commandsList) {
  if (!TEST_CMD.test(cmd)) continue;
  for (const tok of cmd.split(/\s+/).slice(1)) if (changedSet.has(tok) && /\.(c|m)?js$/.test(tok)) suiteFiles.push(tok);
}
let baseline = { measured: ran > 0, passed, failed, restored: [] };
if (suiteFiles.length) {
  const saved = [];
  try {
    for (const f of suiteFiles) {
      saved.push([f, fs.readFileSync(f)]);
      spawnSync('git', ['checkout', 'HEAD', '--', f], { encoding: 'utf8' });
    }
    let bPassed = 0, bFailed = 0, bRan = 0;
    for (const cmd of commandsList) {
      if (!TEST_CMD.test(cmd)) continue;
      bRan++;
      const parts = cmd.split(/\s+/);
      const r = spawnSync(parts[0], parts.slice(1), { encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 20 * 1024 * 1024, env: childEnv });
      const text = (r.stdout || '') + '\n' + (r.stderr || '');
      log += `\n[baseline ${cmd}] exit ${r.status}\n${text}`;
      const c = parseCounts(text);
      if (c) { bPassed += c.passed; bFailed += c.failed; if (r.status !== 0 && c.failed === 0) bFailed++; }
      else if (r.status === 0) bPassed++; else bFailed++;
    }
    baseline = { measured: bRan > 0, passed: bPassed, failed: bFailed, restored: suiteFiles };
  } finally {
    // Always put the change back: the branch that gets pushed must be exactly what Claude wrote.
    for (const [f, buf] of saved) fs.writeFileSync(f, buf);
  }
}
const baselineOk = baseline.measured && baseline.failed === 0;

fs.writeFileSync(path.join(WORK, 'tests.log'), log);
const summary = commands.map(c => c.refused ? `${c.cmd}: refused` : `${c.cmd}: ${c.counts ? c.counts.passed + '/' + (c.counts.passed + c.counts.failed) : (c.passed != null ? c.passed + '/' + (c.passed + c.failed) : 'exit ' + c.exit)}`).join('; ');
const result = { measured: ran > 0, passed, failed, changed_files: files.length, summary, baseline, baseline_ok: baselineOk };
writeJSON('tests.json', result);
setOutput('failed', failed);
setOutput('baseline_ok', baselineOk ? 'true' : 'false');
setOutput('tests', JSON.stringify(result));
console.log(`tests: measured=${ran > 0} passed=${passed} failed=${failed} baseline_ok=${baselineOk}${suiteFiles.length ? ' (suite files restored: ' + suiteFiles.join(', ') + ')' : ''}`);
