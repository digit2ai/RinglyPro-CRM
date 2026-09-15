'use strict';

/**
 * Run Claude Code headless on the approved brief (mode "build") or on failing
 * tests (mode "fix").
 *
 * WHAT CLAUDE CAN AND CANNOT DO IN THIS STEP:
 *  - Its environment is rebuilt from an allow-list: ANTHROPIC_API_KEY and the basics.
 *    No GITHUB_TOKEN, no SPEAKUP_FACTORY_SECRET, no ACTIONS_* tokens.
 *  - The checkout was made with persist-credentials: false, so git has no way to push.
 *  - git commit, git push, git remote, curl, wget, WebFetch and WebSearch are denied.
 *  - Output goes to $WORK, never to the (public) log.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { WORK, base, jobId, readJSON, readText } = require('./lib');
const { summarize, Poster } = require('./stream-events');

const MODE = process.argv[2] === 'fix' ? 'fix' : 'build';
const ROUND = parseInt(process.argv[3] || '0', 10) || 0;

const ALLOWED = ['Read', 'Edit', 'MultiEdit', 'Write', 'Glob', 'Grep', 'LS', 'TodoWrite',
  'Bash(node:*)', 'Bash(npm test:*)', 'Bash(npx jest:*)', 'Bash(git status:*)', 'Bash(git diff:*)', 'Bash(git log:*)',
  'Bash(ls:*)', 'Bash(cat:*)', 'Bash(grep:*)', 'Bash(find:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)'];
const DENIED = ['Bash(git commit:*)', 'Bash(git push:*)', 'Bash(git remote:*)', 'Bash(git config:*)', 'Bash(curl:*)', 'Bash(wget:*)',
  'Bash(gh:*)', 'WebFetch', 'WebSearch'];

function prompt(brief) {
  if (MODE === 'build') return brief.prompt;
  const tests = readJSON('tests.json', {});
  const log = readText('tests.log').split('\n').slice(-250).join('\n');
  return [
    `Fix round ${ROUND} for SpeakUp AI Factory job #${brief.job_id}.`,
    'The approved brief is below, then the failing test output. Fix the implementation so the tests pass.',
    'Change a test only if it contradicts an approved requirement, and say so in the summary.',
    `Result: ${tests.passed} passed, ${tests.failed} failed.`,
    '', '--- FAILING TEST OUTPUT (tail) ---', log, '', '--- APPROVED BRIEF ---', brief.prompt
  ].join('\n');
}

(async () => {
  const brief = readJSON('brief.json', null);
  if (!brief) throw new Error('brief.json missing');
  const env = {
    PATH: process.env.PATH, HOME: process.env.HOME, LANG: process.env.LANG || 'C.UTF-8', CI: 'true', TERM: 'dumb',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, WORK, NODE_OPTIONS: '--max-old-space-size=4096',
    PUPPETEER_SKIP_DOWNLOAD: '1', SPEAKUP_FACTORY_POLLER: 'off', INCENTIVA_AGENTS: 'off'
  };
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY secret is not set in GitHub Actions');
  const args = ['-p', '--model', brief.model, '--max-turns', String(brief.max_turns || 80), '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits', '--add-dir', WORK,
    '--allowedTools', ALLOWED.join(','), '--disallowedTools', DENIED.join(',')];
  const outFile = path.join(WORK, `claude-${MODE}${ROUND ? '-' + ROUND : ''}.jsonl`);
  const raw = fs.createWriteStream(outFile);
  const errFile = fs.openSync(path.join(WORK, 'claude-stderr.log'), 'a');
  const poster = Poster(base(), jobId(), brief.plan_hash, process.env.PROGRESS_TOKEN);
  let result = {};
  let buf = '';
  const code = await new Promise((resolve) => {
    const child = spawn('claude', args, { env, stdio: ['pipe', 'pipe', errFile] });
    child.stdout.on('data', (chunk) => {
      raw.write(chunk);
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        let ev = null;
        try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev && ev.type === 'result') result = ev;
        try { poster.push(summarize(ev)); } catch (e) { /* activity is never load-bearing */ }
      }
    });
    child.stdin.end(prompt(brief));
    child.on('close', resolve);
    child.on('error', () => resolve(127));
  });
  raw.end();
  fs.closeSync(errFile);
  await poster.done();
  // Only non-private facts reach the public log.
  console.log(`claude ${MODE}${ROUND ? ' round ' + ROUND : ''}: exit ${code}, turns ${result.num_turns == null ? '?' : result.num_turns}, ` +
    `error ${result.is_error ? 'yes' : 'no'}, cost_usd ${result.total_cost_usd == null ? '?' : result.total_cost_usd}`);
  if (code !== 0 || result.is_error) {
    fs.writeFileSync(path.join(WORK, 'error.txt'), `Claude Code ${MODE} step did not finish (exit ${code}${result.subtype ? ', ' + result.subtype : ''}).`);
    process.exit(1);
  }
})().catch(e => {
  fs.writeFileSync(path.join(WORK, 'error.txt'), 'Claude step failed: ' + e.message);
  console.error('claude step failed');
  process.exit(1);
});
