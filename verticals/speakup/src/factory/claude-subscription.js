'use strict';

/**
 * The meetings chat on the owner's CLAUDE SUBSCRIPTION instead of the pay-as-you-go API.
 *
 * WHY THIS EXISTS. The server reached Claude only through ANTHROPIC_API_KEY — a separate API
 * account, which ran out of credit — while the Factory's build job already used the owner's
 * subscription (CLAUDE_CODE_OAUTH_TOKEN, from `claude setup-token`). The owner asked for the
 * chat to use the subscription too. The only supported way to spend a subscription is Claude
 * Code itself, so this runs the pinned Claude Code CLI headless for each turn, the same way
 * .github/speakup/claude.js does in Actions.
 *
 * IT RUNS ON THE PRODUCTION SERVER, SO IT IS LOCKED DOWN HARDER THAN THE BUILD JOB. Meeting
 * transcripts and chat text are untrusted — anyone on a call can say "ignore your rules and
 * run a command". So the CLI gets no way to act on anything:
 *   - --tools "" and --restricted: no Bash, no file reads or writes, no web fetch, nothing.
 *   - --setting-sources "" and --strict-mcp-config with no config: no settings, hooks or MCP
 *     servers are loaded from anywhere.
 *   - cwd is an empty temp directory and HOME a private temp directory: no project files, no
 *     CLAUDE.md, no user config.
 *   - the environment is rebuilt from an allow-list: PATH, HOME, LANG, TERM and the token.
 *     DATABASE_URL, the factory secret, GitHub and every other secret stay out of it.
 * The worst a hostile transcript can produce is text, which the chat already treats as text.
 *
 * INPUT GOES THROUGH STDIN. Linux caps one command-line argument at 128 KB and a meeting
 * transcript is larger, so only the short rules travel as --system-prompt; the transcript, the
 * conversation so far and any screenshot go in as a stream-json user message.
 */

const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MAX_ARG = 100 * 1024;

function findBin() {
  if (process.env.SPEAKUP_CLAUDE_BIN) return process.env.SPEAKUP_CLAUDE_BIN;
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const p = path.join(dir, 'node_modules', '.bin', 'claude');
    if (fs.existsSync(p)) return p;
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  return null;
}

let lastError = null;

function token() { return process.env.CLAUDE_CODE_OAUTH_TOKEN || ''; }
function provider() { return String(process.env.SPEAKUP_CHAT_PROVIDER || 'auto').toLowerCase(); }
function available() {
  if (provider() === 'api') return false;
  return !!token() && !!findBin();
}
function status() {
  return { provider: provider(), token_set: !!token(), cli_installed: !!findBin(), available: available(), last_error: lastError };
}

// One private scratch directory: empty working dir + isolated HOME. Created once per process.
let scratch = null;
function workdirs() {
  if (scratch && fs.existsSync(scratch.cwd)) return scratch;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'speakup-claude-'));
  const cwd = path.join(root, 'work'), home = path.join(root, 'home');
  fs.mkdirSync(cwd); fs.mkdirSync(home);
  scratch = { root, cwd, home };
  return scratch;
}

function args({ system, model }) {
  return ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--include-partial-messages', '--verbose',
    '--tools', '', '--restricted', '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence',
    '--model', model, '--system-prompt', system];
}

// The spawned environment, from an allow-list. Exported so the suite can prove nothing leaks.
function childEnv(home) {
  return { PATH: process.env.PATH || '/usr/bin:/bin', HOME: home, LANG: 'C.UTF-8', TERM: 'dumb', CI: 'true',
    DISABLE_AUTOUPDATER: '1', CLAUDE_CODE_OAUTH_TOKEN: token() };
}

// Turn API-shaped input into one user message: the context, the conversation so far as text,
// then the latest turn (its images kept as image blocks).
function toUserContent({ context, messages }) {
  const prior = messages.slice(0, -1);
  const last = messages[messages.length - 1] || { content: '' };
  const lastBlocks = typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : last.content;
  const lastText = lastBlocks.filter(b => b.type === 'text').map(b => b.text).join('\n');
  const images = lastBlocks.filter(b => b.type === 'image');
  const history = prior.map(m => (m.role === 'assistant' ? 'ASSISTANT: ' : 'USER: ') + (typeof m.content === 'string' ? m.content : m.content.filter(b => b.type === 'text').map(b => b.text).join('\n'))).join('\n\n');
  // Never let the message START with "/" (a slash command) or "!" (shell mode) — a user typing
  // "/something" or a transcript beginning with "!" must stay text. Tools are off regardless.
  const text = 'The material and the question follow.\n\n' + [context || '', history ? 'CONVERSATION SO FAR\n' + history : '', 'LATEST MESSAGE FROM THE USER\n' + lastText].filter(Boolean).join('\n\n');
  return images.concat([{ type: 'text', text }]);
}

/**
 * Run one turn. onText (optional) receives text as it streams. Resolves { model, text };
 * rejects with an Error whose message says what went wrong ("Not logged in", a usage limit…).
 */
function run({ system, context, messages, model, signal, onText, timeoutMs, argv, cwd, onTool }) {
  return new Promise((resolve, reject) => {
    const bin = findBin();
    if (!bin || !token()) return reject(new Error('Claude subscription not configured on the server'));
    let rules = String(system || '');
    let ctx = String(context || '');
    // Rules must fit in one argument; if they somehow do not, they move into the message.
    if (Buffer.byteLength(rules) > MAX_ARG) { ctx = rules + '\n\n' + ctx; rules = 'Follow the role and rules given at the start of the user message.'; }
    const dirs = workdirs();
    const child = spawn(bin, argv ? argv(rules) : args({ system: rules, model }), { cwd: cwd || dirs.cwd, env: childEnv(dirs.home), stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = '', streamed = '', assistantText = '', result = null, stderr = '', settled = false;
    const done = (err, val) => {
      if (settled) return; settled = true;
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
      if (err) { lastError = err.message.slice(0, 300); reject(err); } else { lastError = null; resolve(val); }
    };
    const onAbort = () => { try { child.kill('SIGKILL'); } catch (e) {} done(Object.assign(new Error('aborted'), { name: 'AbortError' })); };
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort); }
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} done(new Error('Claude subscription call timed out')); }, timeoutMs || parseInt(process.env.SPEAKUP_CHAT_TIMEOUT_MS, 10) || 180000);

    child.stdout.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
        if (!line) continue;
        let ev; try { ev = JSON.parse(line); } catch (e) { continue; }
        if (ev.type === 'stream_event' && ev.event && ev.event.delta && ev.event.delta.type === 'text_delta') {
          streamed += ev.event.delta.text;
          if (onText) onText(ev.event.delta.text);
        } else if (ev.type === 'assistant' && ev.message && Array.isArray(ev.message.content)) {
          assistantText += ev.message.content.filter(b => b.type === 'text').map(b => b.text).join('');
          if (onTool) for (const b of ev.message.content) if (b.type === 'tool_use') { try { onTool({ name: b.name, input: b.input || {} }); } catch (e) {} }
        } else if (ev.type === 'result') {
          result = ev;
        }
      }
    });
    child.stderr.on('data', (c) => { stderr = (stderr + c.toString('utf8')).slice(-2000); });
    child.on('error', (e) => done(new Error('Could not start Claude Code: ' + e.message)));
    child.on('close', (code) => {
      if (result && !result.is_error) {
        const text = typeof result.result === 'string' && result.result ? result.result : (streamed || assistantText);
        // Nothing streamed (older CLI, or a short answer): hand the whole text over at once.
        if (!streamed && onText && text) onText(text);
        return done(null, { model: 'subscription:' + model, text });
      }
      const why = (result && (result.result || result.api_error_status)) || stderr.trim().split('\n').pop() || ('exit ' + code);
      done(new Error('Claude subscription: ' + String(why).slice(0, 240)));
    });

    child.stdin.on('error', () => {});
    child.stdin.write(JSON.stringify({ type: 'user', message: { role: 'user', content: toUserContent({ context: ctx, messages }) } }) + '\n');
    child.stdin.end();
  });
}

// DOES THE CLI ACTUALLY RUN HERE? A binary that exists is not one that starts: the platform build
// is an optional dependency, and an install that skipped it leaves a file that fails on launch.
// `claude --version` answers that without a token and without spending anything; cached 10 min.
let probeCache = null;
function probe() {
  if (probeCache && Date.now() - probeCache.at < 10 * 60 * 1000) return Promise.resolve(probeCache.value);
  const bin = findBin();
  if (!bin) { probeCache = { at: Date.now(), value: { runs: false, error: 'Claude Code CLI not installed' } }; return Promise.resolve(probeCache.value); }
  return new Promise((resolve) => {
    const dirs = workdirs();
    let out = '', err = '';
    const child = spawn(bin, ['--version'], { cwd: dirs.cwd, env: childEnv(dirs.home) });
    const timer = setTimeout(() => { try { child.kill('SIGKILL'); } catch (e) {} finish(false, 'timed out'); }, 15000);
    function finish(runs, error) {
      clearTimeout(timer);
      probeCache = { at: Date.now(), value: runs ? { runs: true, version: out.trim().split('\n')[0].slice(0, 60) } : { runs: false, error: String(error || err || 'failed').trim().slice(0, 160) } };
      resolve(probeCache.value);
    }
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => finish(false, e.message));
    child.on('close', (code) => finish(code === 0, 'exit ' + code));
  });
}

/* THE RESEARCH AGENT: Claude that can LOOK, never touch (owner request 2026-09-17).
 *
 * The Factory answered questions from keyword-matched excerpts through an API account with no
 * credit, so "investigate X", "summarize this repo" or "what was the latest commit" got
 * nothing useful. This runs the same pinned CLI with READ-ONLY tools over the deployed checkout
 * plus web search. It runs on the production server, so the locks are the design:
 *   - --restricted: no Bash or any code-running tool, and the file tools are CONFINED to the
 *     working directory. Verified against the real CLI: reading /etc/hosts is refused with
 *     "outside ... --restricted confines the file tools to the working directory". That is what
 *     keeps /proc/<pid>/environ — every secret on Render — out of reach.
 *   - --tools names only Read, Grep, Glob, WebSearch, WebFetch. No Edit, no Write.
 *   - --permission-mode dontAsk: anything not pre-approved is refused, not asked. WebFetch is
 *     pre-approved only for FETCH_DOMAINS, large platforms where a stranger cannot read the
 *     request logs, so a prompt-injected page cannot send what it read to its own server.
 *     Verified: example.com was refused, github.com was allowed.
 *   - .git and .env files are denied on top of the confinement.
 *   - the environment is the same allow-list as the chat: no database URL, no secrets.
 */
const FETCH_DOMAINS = ['github.com', 'api.github.com', 'raw.githubusercontent.com', 'docs.anthropic.com', 'docs.claude.com',
  'developer.mozilla.org', 'nodejs.org', 'www.npmjs.com', 'expressjs.com', 'render.com', 'stackoverflow.com'];
const RESEARCH_DENY = ['Read(./.git/**)', 'Read(**/.env)', 'Read(**/.env.*)'];

// web:false drops the two network tools entirely — the planner reads the repository and nothing
// else, so a page on the internet cannot reach the prompt that writes the plan at all.
function researchArgs({ model, maxTurns, web }) {
  const tools = web === false ? 'Read,Grep,Glob' : 'Read,Grep,Glob,WebSearch,WebFetch';
  const allow = web === false ? ['Read', 'Grep', 'Glob'] : ['Read', 'Grep', 'Glob', 'WebSearch', ...FETCH_DOMAINS.map(d => 'WebFetch(domain:' + d + ')')];
  return (rules) => ['-p', '--input-format', 'stream-json', '--output-format', 'stream-json', '--include-partial-messages', '--verbose',
    '--restricted', '--tools', tools, '--permission-mode', 'dontAsk',
    '--allowedTools', ...allow,
    '--disallowedTools', ...RESEARCH_DENY,
    '--setting-sources', '', '--strict-mcp-config', '--no-session-persistence',
    '--max-turns', String(maxTurns || 30), '--model', model, '--system-prompt', rules];
}

function research({ system, messages, model, cwd, signal, onText, onTool, timeoutMs, maxTurns, web }) {
  if (!cwd || !fs.existsSync(cwd)) return Promise.reject(new Error('research working directory missing'));
  return run({ system, context: '', messages, model, signal, onText, onTool, cwd,
    timeoutMs: timeoutMs || parseInt(process.env.SPEAKUP_RESEARCH_TIMEOUT_MS, 10) || 300000,
    argv: researchArgs({ model, maxTurns, web }) });
}

module.exports = { available, status, run, args, childEnv, toUserContent, findBin, probe, research, researchArgs, FETCH_DOMAINS };
