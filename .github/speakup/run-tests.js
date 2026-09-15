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
 * the verify job on a clean VM. The code under test can still print what it likes, which
 * is why a change that edits the suite itself cannot be merged from the phone.
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

fs.writeFileSync(path.join(WORK, 'tests.log'), log);
const summary = commands.map(c => c.refused ? `${c.cmd}: refused` : `${c.cmd}: ${c.counts ? c.counts.passed + '/' + (c.counts.passed + c.counts.failed) : (c.passed != null ? c.passed + '/' + (c.passed + c.failed) : 'exit ' + c.exit)}`).join('; ');
const result = { measured: ran > 0, passed, failed, changed_files: files.length, summary };
writeJSON('tests.json', result);
setOutput('failed', failed);
setOutput('tests', JSON.stringify(result));
console.log(`tests: measured=${ran > 0} passed=${passed} failed=${failed}`);
