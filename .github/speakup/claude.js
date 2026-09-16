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
    WORK, NODE_OPTIONS: '--max-old-space-size=4096',
    PUPPETEER_SKIP_DOWNLOAD: '1', SPEAKUP_FACTORY_POLLER: 'off', INCENTIVA_AGENTS: 'off'
  };
  // CLAUDE_CODE_OAUTH_TOKEN = the Claude subscription, the same account VS Code uses.
  // ANTHROPIC_API_KEY = the pay-as-you-go API balance. Either is enough; the
  // subscription is preferred when both are present, so a run costs no API credit.
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) {
    env.CLAUDE_CODE_OAUTH_TOKEN = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    console.log('signing in with the Claude subscription token');
  } else if (process.env.ANTHROPIC_API_KEY) {
    env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    console.log('signing in with the Anthropic API key');
  } else {
    fs.writeFileSync(path.join(WORK, 'error.txt'),
      'Claude has no way to sign in on GitHub: add the repository secret CLAUDE_CODE_OAUTH_TOKEN (your Claude subscription, run "claude setup-token" on your Mac) or ANTHROPIC_API_KEY with credit.');
    throw new Error('no Claude credential in GitHub Actions');
  }
  // The configured model may not be available to this key: fall back rather than
  // reporting a failure the owner cannot act on.
  const models = [brief.model, 'claude-sonnet-5', 'claude-haiku-4-5-20251001'].filter((m, i, a) => m && a.indexOf(m) === i);
  const argsFor = (model) => ['-p', '--model', model, '--max-turns', String(brief.max_turns || 80), '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'acceptEdits', '--add-dir', WORK,
    '--allowedTools', ALLOWED.join(','), '--disallowedTools', DENIED.join(',')];
  const outFile = path.join(WORK, `claude-${MODE}${ROUND ? '-' + ROUND : ''}.jsonl`);
  const errPath = path.join(WORK, 'claude-stderr.log');
  const poster = Poster(base(), jobId(), brief.plan_hash, process.env.PROGRESS_TOKEN);
  let result = {};
  let code = 127;
  let billing = false;
  for (const model of models) {
  const raw = fs.createWriteStream(outFile);
  const errFile = fs.openSync(errPath, 'a');
  result = {};
  let buf = '';
  code = await new Promise((resolve) => {
    const child = spawn('claude', argsFor(model), { env, stdio: ['pipe', 'pipe', errFile] });
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
        // An account with no credit is not a code problem and must say so plainly.
        try {
          const txt = JSON.stringify(ev);
          if (/credit balance is too low|insufficient_quota|billing/i.test(txt)) billing = true;
        } catch (x) { /* ignore */ }
        try { poster.push(summarize(ev)); } catch (e) { /* activity is never load-bearing */ }
      }
    });
    child.stdin.end(prompt(brief));
    child.on('close', resolve);
    child.on('error', () => resolve(127));
  });
  raw.end();
  fs.closeSync(errFile);
  // Only non-private facts reach the public log.
  console.log(`claude ${MODE}${ROUND ? ' round ' + ROUND : ''} with ${model}: exit ${code}, turns ${result.num_turns == null ? '?' : result.num_turns}, ` +
    `error ${result.is_error ? 'yes' : 'no'}, cost_usd ${result.total_cost_usd == null ? '?' : result.total_cost_usd}`);
  const stderr = (() => { try { return fs.readFileSync(errPath, 'utf8').slice(-1500); } catch (e) { return ''; } })();
  const modelProblem = /model|not_found|404|does not exist|permission/i.test(stderr + JSON.stringify(result.subtype || ''));
  if (code === 0 && !result.is_error) break;
  if (billing) {
    await poster.done();
    fs.writeFileSync(path.join(WORK, 'error.txt'),
      (process.env.CLAUDE_CODE_OAUTH_TOKEN
        ? 'Your Claude subscription refused the run (limit reached or the token expired). Run "claude setup-token" on your Mac and update the GitHub secret CLAUDE_CODE_OAUTH_TOKEN.'
        : 'The Anthropic API account has no credit left, so Claude stopped before writing anything. Either add credit at console.anthropic.com (Billing), or use your Claude subscription: run "claude setup-token" on your Mac and add the result as the GitHub secret CLAUDE_CODE_OAUTH_TOKEN.'));
    console.log('stopped: the Anthropic account has no credit');
    process.exit(1);
  }
  if (!modelProblem || model === models[models.length - 1]) {
    await poster.done();
    const why = stderr.split('\n').filter(Boolean).slice(-3).join(' ').replace(/[^\x20-\x7E]/g, ' ').slice(0, 300);
    fs.writeFileSync(path.join(WORK, 'error.txt'),
      `Claude Code ${MODE} step did not finish (exit ${code}${result.subtype ? ', ' + result.subtype : ''}). ${why}`);
    process.exit(1);
  }
  console.log(`model ${model} was refused; trying the next one`);
  }
  await poster.done();
})().catch(e => {
  fs.writeFileSync(path.join(WORK, 'error.txt'), 'Claude step failed: ' + e.message);
  console.error('claude step failed');
  process.exit(1);
});
