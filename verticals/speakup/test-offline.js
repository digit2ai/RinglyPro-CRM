'use strict';

/**
 * SpeakUp AI Factory — offline tests. No database, no keys, no network.
 * Runs in the GitHub Actions factory workflow as the SpeakUp project's test command.
 *
 *   node verticals/speakup/test-offline.js
 */

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://offline:offline@127.0.0.1:1/offline';
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
process.env.SPEAKUP_FACTORY_POLLER = 'off';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('FAIL ' + msg); } }
function test(name, fn) { try { fn(); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } }

const ROOT = path.resolve(__dirname, '..', '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');

const security = require('./src/factory/security');
const intel = require('./src/factory/intel');
const intents = require('./src/factory/intents');
const context = require('./src/factory/context');
const projects = require('./src/factory/projects');
const jobs = require('./src/factory/jobs');
const prepare = require('./src/factory/prepare');
const { buildBrief } = require('./src/factory/brief');

// ── Private phrase ────────────────────────────────────────────────────────────
test('phrase', () => {
  delete process.env.SPEAKUP_EXEC_PHRASE; delete process.env.SPEAKUP_EXEC_PHRASE_SHA256;
  ok(!security.phraseConfigured(), 'no phrase configured = closed');
  ok(!security.phraseMatches('anything'), 'no phrase = nothing matches');
  process.env.SPEAKUP_EXEC_PHRASE = 'Cóndor azul sobre Tampa';
  ok(security.phraseMatches('condor azul sobre tampa'), 'typed phrase matches accent/case-insensitively');
  ok(!security.phraseMatches('condor azul'), 'partial phrase does not match');
  const spoken = 'RinglyPro Architect, cóndor azul sobre Tampa. Execute approved plan.';
  ok(security.containsPhrase(spoken), 'spoken phrase detected inside a sentence');
  const red = security.redactPhrase(spoken);
  ok(!/condor|cóndor|tampa/i.test(red) && red.includes(security.REDACTED), 'redaction removes the phrase words');
  ok(red.includes('Execute approved plan'), 'redaction keeps the rest of the command');
  const h = security.sha256(security.normalizeSpoken('Cóndor azul sobre Tampa'));
  delete process.env.SPEAKUP_EXEC_PHRASE; process.env.SPEAKUP_EXEC_PHRASE_SHA256 = h;
  ok(security.containsPhrase(spoken), 'hash-only configuration still detects the spoken phrase');
  process.env.SPEAKUP_EXEC_PHRASE = 'Cóndor azul sobre Tampa'; delete process.env.SPEAKUP_EXEC_PHRASE_SHA256;
});

test('confirm token', () => {
  process.env.SPEAKUP_FACTORY_SECRET = 'offline-secret-123456';
  const tok = security.signConfirm(7, 'a'.repeat(64), 3);
  ok(security.verifyConfirm(tok, 7, 'a'.repeat(64), 3), 'token verifies for its job, plan and user');
  ok(!security.verifyConfirm(tok, 8, 'a'.repeat(64), 3), 'token refused for another job');
  ok(!security.verifyConfirm(tok, 7, 'b'.repeat(64), 3), 'token refused for a changed plan');
  ok(!security.verifyConfirm(tok, 7, 'a'.repeat(64), 4), 'token refused for another user');
  ok(!security.verifyConfirm(security.signConfirm(7, 'a'.repeat(64), 3, -1000), 7, 'a'.repeat(64), 3), 'expired token refused');
  ok(!security.verifyConfirm(tok.replace(/.$/, c => (c === '0' ? '1' : '0')), 7, 'a'.repeat(64), 3), 'tampered token refused');
});

test('weak password + origin', () => {
  process.env.SPEAKUP_TEAM_PASSWORD = 'Palindrome@7';
  ok(security.teamPasswordWeak(), 'published default password is weak');
  process.env.SPEAKUP_TEAM_PASSWORD = 'a-private-long-password-xyz';
  ok(!security.teamPasswordWeak(), 'private 12+ password is not weak');
  const req = (h) => ({ headers: Object.assign({ host: 'aiagent.ringlypro.com' }, h) });
  ok(!security.sameOriginRequest(req({})), 'missing X-SpeakUp header refused');
  ok(security.sameOriginRequest(req({ 'x-speakup': '1' })), 'header without Origin accepted');
  ok(security.sameOriginRequest(req({ 'x-speakup': '1', origin: 'https://aiagent.ringlypro.com' })), 'same-host Origin accepted');
  ok(!security.sameOriginRequest(req({ 'x-speakup': '1', origin: 'https://evil.example' })), 'foreign Origin refused');
});

// ── Meeting intelligence gates ────────────────────────────────────────────────
const TRANSCRIPT = 'Buenos días Greg. Podríamos agregar un modo multilingüe para la recepción en el futuro. ' +
  'Queda aprobado: el SMS de confirmación de citas debe incluir el nombre del negocio. ' +
  'Los SMS de confirmación no llegan cuando el número tiene espacios, es un bug. ' +
  'Deberíamos revisar la plantilla de recordatorios. ¿Quién valida el formato del teléfono?';

test('intel verify', () => {
  const out = intel.verify({ items: [
    { kind: 'requirement', classification: 'APPROVED_REQUIREMENT', text: 'SMS includes business name', quote: 'Queda aprobado: el SMS de confirmación de citas debe incluir el nombre del negocio', confidence: 0.9 },
    { kind: 'feature', classification: 'APPROVED_REQUIREMENT', text: 'Multilingual intake', quote: 'Podríamos agregar un modo multilingüe para la recepción', confidence: 0.9 },
    { kind: 'bug', classification: 'APPROVED_REQUIREMENT', text: 'Fabricated', quote: 'we agreed to delete all customer data', confidence: 0.99 },
    { kind: 'requirement', classification: 'APPROVED_REQUIREMENT', text: 'Low confidence approval', quote: 'Queda aprobado: el SMS de confirmación de citas', confidence: 0.2 },
    { kind: 'wizardry', classification: 'IDEA', text: 'bad kind', quote: 'Buenos días Greg' },
    { kind: 'feature', classification: 'SUGGESTION', text: 'Promoted by a human', quote: 'Deberíamos revisar la plantilla de recordatorios', approved_by_human: true }
  ] }, TRANSCRIPT, { composed_by: 'test' });
  ok(out.requirements.length === 1 && /business name/.test(out.requirements[0].text), 'explicitly approved item with its quote is a requirement');
  ok(!out.features.some(f => /Multilingual/.test(f.text)) && out.suggestions.some(f => /Multilingual/.test(f.text)), 'brainstorm labelled approved without an approval cue is downgraded');
  ok(out.unverified.some(u => u.text === 'Fabricated') && !out.bugs.length, 'item whose quote is not in the transcript goes to unverified');
  ok(!out.requirements.some(r => /Low confidence/.test(r.text)), 'low-confidence approval is downgraded');
  ok(out.unverified.some(u => u.text === 'bad kind'), 'unknown kind is rejected');
  ok(!out.features.some(f => /Promoted/.test(f.text)), 'a SUGGESTION flagged approved_by_human is not approved unless its class says so');
  const promoted = intel.setClassification(out, out.items.find(i => /Promoted/.test(i.text)).id, 'APPROVED_REQUIREMENT', TRANSCRIPT);
  ok(promoted.features.some(f => /Promoted/.test(f.text) && f.approved_by_human), 'human promotion makes it an approved requirement');
});

test('intel heuristic', () => {
  const out = intel.verify(intel.heuristic(TRANSCRIPT), TRANSCRIPT, { composed_by: 'heuristic' });
  ok(out.is_simulated === true && out.composed_by === 'heuristic', 'heuristic path is labelled');
  ok(out.requirements.length + out.features.length >= 1, 'heuristic finds the approved item');
  ok(out.ideas.some(i => /multiling/i.test(i.text)), 'heuristic keeps the idea as an idea');
  ok(![...out.requirements, ...out.features, ...out.bugs].some(i => /multiling/i.test(i.text)), 'idea never becomes a requirement');
  ok(out.open_questions.length >= 1, 'question detected');
});

// ── Intent rules ──────────────────────────────────────────────────────────────
test('intent rules', () => {
  const cases = [
    ['RinglyPro Architect, analyze my latest RinglyPro meeting.', 'EXTRACT_REQUIREMENTS'],
    ['RinglyPro Architect, convert my meeting with Greg into a development prompt.', 'CREATE_DEVELOPMENT_PROMPT'],
    ['RinglyPro Architect, prepare the approved requirements from my meeting with Greg.', 'PREPARE_IMPLEMENTATION'],
    ['Execute approved plan.', 'EXECUTE_IMPLEMENTATION'],
    ['Ejecuta el plan aprobado', 'EXECUTE_IMPLEMENTATION'],
    ["RinglyPro Architect, what's the status of my last task?", 'CHECK_EXECUTION'],
    ['¿Ya se desplegó en producción?', 'CHECK_DEPLOYMENT'],
    ['Cancela la tarea', 'CANCEL_EXECUTION'],
    ['Search appointment SMS', 'SEARCH_MEMORY'],
    ['Resume la reunión de ayer', 'SUMMARIZE'],
    ['Genera el BRD de la reunión 184', 'CREATE_BRD'],
    ['RinglyPro Architect, inspect the appointment workflow and determine why confirmation SMS messages are failing.', 'ARCHITECT_REVIEW'],
    ['Fusiona el PR', 'APPROVE_MERGE']
  ];
  for (const [text, want] of cases) ok(intents.classifyRules(text) === want, `"${text}" -> ${want} (got ${intents.classifyRules(text)})`);
  const unsafe = intents.INTENTS.filter(i => ['EXECUTE_IMPLEMENTATION', 'APPROVE_MERGE', 'CANCEL_EXECUTION'].includes(i.name));
  ok(unsafe.length === 3 && unsafe.every(i => !i.modelSafe), 'a model can never choose execute, merge or cancel');
});

test('note mode never classifies', async () => {
  const r = await intents.classify('Execute approved plan and merge the PR', 'note');
  ok(r.intent === 'CAPTURE_NOTE', 'note mode stores even an execute-shaped sentence as a note');
});

// ── Context parsing ───────────────────────────────────────────────────────────
test('context selector', () => {
  let s = context.parseSelector("Use yesterday's meeting with Greg");
  ok(s.range === 'yesterday' && s.person === 'greg' && s.kindHint === 'meeting', 'yesterday + person + meeting');
  s = context.parseSelector('Use meeting 184');
  ok(s.ids.length === 1 && s.ids[0] === 184, 'meeting 184');
  s = context.parseSelector('Usa la reunión de RinglyPro de esta mañana');
  ok(s.range === 'this_morning', 'esta mañana');
  s = context.parseSelector('Use these three conversations');
  ok(s.count === 3, 'these three');
  s = context.parseSelector('Use my latest meeting');
  ok(s.latest && !s.person, 'latest meeting');
  const now = new Date('2026-09-15T14:00:00Z'); // 10:00 in New York
  const [from, to] = context.rangeBounds('yesterday', now, 'America/New_York');
  ok(from.toISOString() === '2026-09-14T04:00:00.000Z' && to.toISOString() === '2026-09-15T04:00:00.000Z', 'yesterday bounds in New York time');
});

// ── Registry ──────────────────────────────────────────────────────────────────
test('registry', () => {
  let r = projects.sanitize({ key: 'x', name: 'X', repo: 'o/r', test_commands: ['node sit.js; rm -rf /'] });
  ok(r.errors.some(e => /not allowed/.test(e)), 'shell metacharacters in a test command are refused');
  r = projects.sanitize({ key: 'jobmd2', name: 'JobMD 2', repo: 'digit2ai/RinglyPro-CRM', test_commands: ['node verticals/jobmd/sit.js'], allowed_actions: ['read', 'root'] });
  ok(!r.errors.length && r.value.allowed_actions.join() === 'read', 'valid project; unknown action dropped');
  r = projects.sanitize({ key: 'p', name: 'P', repo: 'o/r', path_scope: ['../etc', '/abs', 'verticals/ok'] });
  ok(r.value.path_scope.join() === 'verticals/ok', 'path scope cannot escape the repository');
  const list = projects.DEFAULT_PROJECTS.map(p => Object.assign({ enabled: true }, p));
  ok(projects.matchProject(list, 'analiza la reunión de cámara virtual').key === 'virtual-chamber', 'spoken alias routes to the project');
  ok(projects.matchProject(list, 'status of jobmd').key === 'jobmd', 'key routes to the project');
});

// ── Job state machine + callbacks ─────────────────────────────────────────────
test('state machine', () => {
  ok(!jobs.canMove('WAITING_APPROVAL', 'CODING'), 'cannot skip approval into coding');
  ok(!jobs.canMove('ANALYZING', 'QUEUED'), 'cannot dispatch a plan still being prepared');
  ok(!jobs.canMove('READY_FOR_REVIEW', 'DEPLOYED'), 'cannot deploy without a merge');
  ok(!jobs.CALLBACK_STATUSES.includes('READY_FOR_REVIEW') && !jobs.CALLBACK_STATUSES.includes('DEPLOYED'), 'a callback cannot claim review-ready or deployed');
  ok(jobs.TERMINAL.every(s => !jobs.NEXT[s]), 'terminal statuses have no exits');
  const text = jobs.describe({ status: 'READY_FOR_REVIEW', project_key: 'ringlypro', title: 'Appointment Confirmation Upgrade', branch: 'speakup/job-9',
    tests: { measured: true, passed: 47, failed: 0 }, files_changed: 8, pr_number: 123, approved_at: new Date() }, 'en', 'RinglyPro');
  ok(/Status: READY FOR REVIEW/.test(text) && /47 passed, 0 failed/.test(text) && /Files changed: 8/.test(text) && /PR: #123/.test(text), 'plain-language status');
});

test('callback signature', () => {
  process.env.SPEAKUP_FACTORY_SECRET = 'offline-secret-123456';
  const p = { ts: Math.floor(Date.now() / 1000), job_id: '5', event: 'status', status: 'CODING', plan_hash: 'c'.repeat(64), nonce: 'ab'.repeat(16) };
  const sig = security.hmac('offline-secret-123456', jobs.canonical(p));
  const tampered = Object.assign({}, p, { status: 'PUSHING' });
  ok(security.hmac('offline-secret-123456', jobs.canonical(tampered)) !== sig, 'changing any field changes the signature');
  ok(jobs.canonical(p) === jobs.canonical(JSON.parse(JSON.stringify(p))), 'canonical form survives JSON transport');
});

// ── Plan verifier ─────────────────────────────────────────────────────────────
test('plan verifier', () => {
  const spec = { requirements: [{ id: 'R1', kind: 'bug', text: 'fix', quote: 'q' }, { id: 'R2', kind: 'feature', text: 'add', quote: 'q' }] };
  const project = { name: 'SpeakUp', path_scope: ['verticals/speakup'] };
  const plan = prepare.verifyPlan({ title: 'T', steps: [{ title: 'S1', covers: ['R1', 'R9'], files: [
    { path: 'verticals/speakup/src/index.js', change: 'modify' },
    { path: 'verticals/speakup/src/does-not-exist.js', change: 'modify' },
    { path: 'src/app-new-file.js', change: 'create' },
    { path: 'verticals/speakup/src/factory/new-thing.js', change: 'create' }
  ] }] }, spec, project, { files: [] });
  ok(plan.steps[0].files.some(f => f.path === 'verticals/speakup/src/index.js'), 'existing file kept');
  ok(plan.steps[0].files.some(f => f.path.endsWith('new-thing.js') && f.change === 'create'), 'new file inside scope kept');
  ok(plan.unverified_files.some(f => f.path.endsWith('does-not-exist.js')), 'invented file moved to unverified');
  ok(plan.unverified_files.some(f => f.path === 'src/app-new-file.js'), 'new file outside scope moved to unverified');
  ok(plan.steps[0].covers.join() === 'R1', 'unknown requirement id dropped from covers');
  ok(plan.uncovered_requirements.join() === 'R2', 'uncovered requirement is named');
});

test('brief', () => {
  const b = buildBrief({ id: 3, plan_hash: 'd'.repeat(64), plan_md: '# plan', branch: 'speakup/job-3', spec: { requirements: [{ id: 'R1', kind: 'bug', text: 'x' }] } },
    { key: 'speakup', name: 'SpeakUp', repo: 'digit2ai/RinglyPro-CRM', default_branch: 'main', path_scope: ['verticals/speakup'], test_commands: ['node verticals/speakup/test-offline.js'], knowledge_sources: ['CLAUDE.md'] });
  ok(/PUBLIC/.test(b.prompt) && /commit, push, merge or deploy: this run must not/.test(b.prompt), 'brief warns: public repo, no commit/push/deploy');
  ok(b.branch === 'speakup/job-3' && b.max_fix_rounds === 2, 'brief carries the review branch and fix budget');
});

// ── Structural promises the runtime cannot show ───────────────────────────────
test('structure', () => {
  const factoryDir = path.join(__dirname, 'src', 'factory');
  const files = fs.readdirSync(factoryDir).filter(f => f.endsWith('.js'));
  const src = Object.fromEntries(files.map(f => [f, stripComments(fs.readFileSync(path.join(factoryDir, f), 'utf8'))]));
  ok(Object.entries(src).filter(([, s]) => /require\('@anthropic-ai\/sdk'\)/.test(s)).map(([f]) => f).join() === 'llm.js', 'llm.js is the only factory file that reaches Anthropic');
  ok(Object.entries(src).filter(([f, s]) => f !== 'github.js' && /dispatchWorkflow\(/.test(s)).map(([f]) => f).join() === 'jobs.js', 'only jobs.js dispatches the workflow');
  ok(Object.entries(src).filter(([f, s]) => f !== 'jobs.js' && /approveAndDispatch\(/.test(s)).length === 0, 'nothing outside jobs.js calls approveAndDispatch');
  ok(!/writeFile|appendFile|createWriteStream|unlink|rmSync|mkdir/.test(src['repo.js']), 'repo.js cannot write to the repository');
  const others = ['src/routes/recordings.js', 'src/routes/ai.js', 'src/services/stt.js', 'src/services/ai-editor.js'].map(p => fs.readFileSync(path.join(__dirname, p), 'utf8'));
  ok(others.every(s => !/factory\//.test(s)), 'recording, transcription and editing code never reach the factory (a meeting cannot trigger execution)');
  const routes = stripComments(fs.readFileSync(path.join(__dirname, 'src/routes/factory.js'), 'utf8'));
  ok((routes.match(/approveAndDispatch\(/g) || []).length === 1 && /\/jobs\/:id\/execute', mutation, operator/.test(routes), 'one execute route, behind the same-origin and operator guards');
  const ui = ['public/factory.js', 'public/console.js', 'public/app.html', 'public/recorder.html'].map(function (p) { return fs.readFileSync(path.join(__dirname, p), 'utf8'); }).join(' ');
  ok(!/SPEAKUP_EXEC_PHRASE|SPEAKUP_GITHUB_TOKEN|SPEAKUP_FACTORY_SECRET|ANTHROPIC_API_KEY/.test(ui), 'no secret name or value in browser code');
  const wf = read('.github/workflows/speakup-factory.yml');
  const onBlock = wf.slice(wf.indexOf('\non:\n'), wf.indexOf('\npermissions:'));
  ok(/^\non:\n  workflow_dispatch:/.test(onBlock) && !/(push|pull_request|pull_request_target|issue_comment|schedule|workflow_run):/.test(onBlock), 'workflow runs only on dispatch');
  ok(/^permissions: \{\}$/m.test(wf), 'workflow default permissions are empty');
  // GitHub rejects the WHOLE file (0 jobs, dispatch refused) if runner.* is used outside steps.
  ok(!/^    env:\n(?:      .*\n)*?      [A-Z_]+: .*\$\{\{\s*runner\./m.test(wf) && !/^env:\n(?:  .*\n)*?  [A-Z_]+: .*\$\{\{\s*runner\./m.test(wf), 'no runner context in workflow- or job-level env (GitHub would reject the file)');
  ok(!/^    env:\n    (outputs|steps):/m.test(wf), 'no empty job-level env block');
  const jobsText = wf.slice(wf.indexOf('\njobs:\n'));
  const jobBlocks = {};
  jobsText.split(/\n(?=  [a-z-]+:\n)/).forEach(b => { const m = b.match(/^  ([a-z-]+):\n/); if (m) jobBlocks[m[1]] = b; });
  ok(['prepare', 'build', 'verify', 'push', 'report-failure'].every(j => jobBlocks[j]), 'workflow has prepare/build/verify/push/report-failure jobs');
  ok(!/SPEAKUP_FACTORY_SECRET|github\.token|GH_TOKEN|contents: write/.test(jobBlocks.build), 'the job that runs Claude holds no factory secret, no GitHub token, no write permission');
  ok(/CLAUDE_CODE_OAUTH_TOKEN/.test(jobBlocks.build) && /ANTHROPIC_API_KEY/.test(jobBlocks.build), 'the build job accepts either Claude credential: the subscription token or the API key');
  ok(!/secrets\.|github\.token|contents: write/.test(jobBlocks.verify), 'the job that runs the tests holds no secret at all');
  ok(!/claude|run-tests|npm (ci|install)|npx|npm test/.test(jobBlocks.push) && !/claude|run-tests|npm /.test(jobBlocks.prepare), 'jobs holding the secret or push token run no model, test or npm code');
  ok(/contents: write/.test(jobBlocks.push) && (wf.match(/contents: write/g) || []).length === 1, 'only the push job can write');
  ok((wf.match(/persist-credentials: false/g) || []).length === 5, 'every checkout leaves no git credentials');
  ok(/HEAD:refs\/heads\/\$\{BRANCH\}/.test(jobBlocks.push) && /speakup\/job-\*/.test(jobBlocks.push) && !/refs\/heads\/main/.test(wf), 'push job pushes only speakup/job-* and never main');
  ok(/core\.hooksPath=\/dev\/null/.test(jobBlocks.push) && /apply-patch\.js/.test(jobBlocks.push) && /guard\.js/.test(jobBlocks.push), 'push job applies the patch as data with git hooks disabled and runs the guard');
  ok(/@[0-9a-f]{40} # v/.test(wf) && !/uses: [^@\n]+@v\d/.test(wf) && /claude-code@\d+\.\d+\.\d+/.test(wf), 'actions pinned by SHA and Claude Code pinned by version');
  const claudeJs = stripComments(read('.github/speakup/claude.js'));
  ok(!/GITHUB_TOKEN|SPEAKUP_FACTORY_SECRET|process\.env\s*\)/.test(claudeJs) && /Bash\(git push:\*\)/.test(claudeJs), 'claude.js builds an allow-listed env and denies git push');
  const applyJs = read('.github/speakup/apply-patch.js');
  ok(/\\\.github/.test(applyJs) && /120000|1\(2\|6\)0000/.test(applyJs) && /hooksPath=\/dev\/null/.test(applyJs), 'apply-patch refuses .github, symlinks and runs git without hooks');
  const callback = read('.github/speakup/callback.js');
  ok(JSON.stringify(jobs.CALLBACK_FIELDS) === JSON.stringify(eval(callback.match(/const FIELDS = (\[[\s\S]*?\]);/)[1])), 'workflow and server sign the same canonical fields');
  ok(JSON.stringify(jobs.PROGRESS_TOKEN_STATUSES) === JSON.stringify(['TESTING', 'FIXING']), 'the progress token can only report TESTING or FIXING (or a failure)');
  const prBody = jobs.prBody({ id: 9, project_key: 'ringlypro', base_branch: 'main', repo_sha: 'abc1234' }, 'RinglyPro', { measured: true, passed: 3, failed: 0 }, 2, null);
  ok(/public/.test(prBody) && /sign-in required/.test(prBody), 'PR body points to the private trace and carries no meeting content');
});

test('claude stream to activity lines', () => {
  const { summarize } = require(path.join(ROOT, '.github/speakup/stream-events.js'));
  const say = summarize({ type: 'assistant', message: { content: [{ type: 'text', text: 'Looking at the login page now.' }] } });
  ok(say.length === 1 && say[0].kind === 'say' && /login page/.test(say[0].text), 'assistant text becomes a CLAUDE line');
  const edit = summarize({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '/home/runner/work/x/x/verticals/speakup/public/login.html', old_string: 'SpeakUp', new_string: 'SpeakUp Beta' } }] } });
  ok(edit[0].kind === 'edit' && edit[0].text.endsWith('public/login.html') && edit[0].detail.new === 'SpeakUp Beta', 'an edit carries the file and both sides of the change');
  ok(summarize({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'node --check x.js' } }] } })[0].kind === 'run', 'a command becomes a RUN line');
  ok(summarize({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true, content: 'File not found' }] } })[0].kind === 'error', 'a failed tool becomes an ERROR line');
  const done = summarize({ type: 'result', is_error: false, num_turns: 12, total_cost_usd: 0.42 });
  ok(done[0].kind === 'done' && /12 turns/.test(done[0].text) && /0\.42/.test(done[0].text), 'the result line carries turns and cost');
  ok(summarize({ type: 'assistant', message: { content: [{ type: 'text', text: 'x'.repeat(5000) }] } })[0].text.length < 1000, 'long output is clipped before it leaves the runner');
  const src = stripComments(fs.readFileSync(path.join(ROOT, '.github/speakup/stream-events.js'), 'utf8'));
  ok(!/console\.log/.test(src), 'the stream summariser prints nothing to the public Actions log');
});

test('pasted prompts are instructions, not commands', () => {
  const long = 'Add a Beta tag to the login page. Then update the service worker version and make sure the tests still pass. ' +
    'Check the status of the deploy afterwards and search for any other place that shows the title.';
  ok(intents.isPastedPrompt(long) && intents.isPastedPrompt('line one\nline two') && intents.isPastedPrompt('/ringlypro-architect do the thing'), 'long, multi-line or slash-prefixed text is a pasted prompt');
  ok(!intents.isPastedPrompt('what is the status of my last task?'), 'a short question is not');
  ok(intents.classifyRules(long) === 'CHECK_DEPLOYMENT', 'the command rules would have misread that prompt');
  ok(intents.firstLine('/ringlypro-architect Add a Beta tag\nsecond line') === 'Add a Beta tag', 'the slash command is stripped from the label');
  ['/ringlypro-architect', 'ringlypro architect', 'RinglyPro Architect', 'arquitecto', 'Hey architect'].forEach(function (w) {
    ok(intents.isWakeOnly(w), 'the wake word alone wakes the agent instead of starting a job: ' + w);
  });
  ['/ringlypro-architect add a beta tag', 'fix the login page', 'ringlypro-architect, add a beta tag'].forEach(function (w) {
    ok(!intents.isWakeOnly(w), 'the wake word with an instruction after it is work: ' + w);
  });
});

test('a question is answered, an instruction is built', async () => {
  ['how does the merge gate work?', 'What is the private phrase for?', 'why did the last job fail',
   'explain the four jobs in the workflow', '¿cómo funciona el auto merge?', 'que hace la fabrica'].forEach(function (q) {
    ok(intents.isQuestion(q), 'a question is a question: ' + q);
  });
  // A change verb in the PAST reports on work already done. These asked about a finished
  // job, carried a change verb, and so opened a build job that had nothing to edit.
  ['why was nothing changed in the last run?', 'why was no code changed?', 'what did you change?',
   'why were the files deleted?', 'has anything been deployed?', 'what did the last job update?',
   'why was nothing added to the branch?'].forEach(function (q) {
    ok(intents.isQuestion(q), 'a past-tense report is a question, not a job: ' + q);
  });
  // The trap: an instruction phrased politely. These must still build.
  ['can you add a TEST tag to the header?', 'could you fix the login page?', '¿puedes cambiar el título?',
   'what if you removed the banner?', '/ringlypro-architect why is this slow?', 'make the header smaller',
   // The past-tense strip must not swallow a live instruction: an infinitive is not a past
   // form, and an imperative after a past clause is still an imperative.
   'can the header be changed?', 'should the banner be removed?',
   'I did not add the tag, please add it'].forEach(function (i) {
    ok(!intents.isQuestion(i), 'an instruction is not a question, however it is phrased: ' + i);
  });
  const asked = await intents.classify('how does the merge gate decide to stop?', 'architect');
  ok(asked.intent === 'ASK' && !asked.architectRequest, 'Architect mode answers a question instead of opening a job');
  const built = await intents.classify('add a TEST tag to the header', 'architect');
  ok(built.intent === 'PREPARE_IMPLEMENTATION', 'Architect mode still builds an instruction');
  const polite = await intents.classify('can you add a TEST tag to the header?', 'architect');
  ok(polite.intent === 'PREPARE_IMPLEMENTATION', 'a politely phrased instruction still builds');
  const past = await intents.classify('why was no code changed?', 'architect');
  ok(past.intent === 'ASK' && !past.architectRequest, 'asking about a finished job opens no job');
  const stillBuilds = await intents.classify('can the header be changed?', 'architect');
  ok(stillBuilds.intent === 'PREPARE_IMPLEMENTATION', 'an infinitive is not a past report and still builds');
  // A long question is still a question; a pasted slash prompt never is.
  const longQ = 'How does the factory decide that a change is safe to merge on its own, and what exactly ' +
    'stops it when the change touched one of the test suites that the same run then reports as passing?';
  ok(intents.isPastedPrompt(longQ), 'the long question is over the pasted-prompt length');
  ok((await intents.classify(longQ, 'architect')).intent === 'ASK', 'length alone does not turn a question into a job');
  const ask = intents.INTENTS.find(function (i) { return i.name === 'ASK'; });
  ok(ask && ask.operator === true && ask.modelSafe === false, 'ASK is operator-only and never chosen by the model');
  ok(intents.classifyRules('how does the merge gate work') !== 'ASK', 'ASK is routed on the raw text, never by a rule');
  const src = stripComments(fs.readFileSync(path.join(ROOT, 'verticals/speakup/src/factory/intents.js'), 'utf8'));
  const body = src.slice(src.indexOf('async ASK(ctx)'), src.indexOf('async PREPARE_IMPLEMENTATION'));
  ok(body.length > 100 && !/Job\.create|approveAndDispatch|autoDispatch|saveNote|Document\.create/.test(body),
    'the answer handler opens no job and writes no document');
});

test('the console can be cleared, and the shell versions agree', () => {
  const con = read('verticals/speakup/public/console.js');
  const html = read('verticals/speakup/public/app.html');
  const sw = read('verticals/speakup/public/sw.js');
  // The page and the worker must ask for the SAME console.js, or the installed app keeps
  // serving the cached one and a fix looks like it never deployed.
  const inPage = (html.match(/console\.js\?v=(\d+)/) || [])[1];
  const inWorker = (sw.match(/console\.js\?v=(\d+)/) || [])[1];
  ok(inPage && inWorker && inPage === inWorker, 'app.html and sw.js request the same console.js version');
  ok(/const CACHE = 'speakup-v(\d+)'/.test(sw), 'the worker names a cache version');
  ok(/id="clearBtn"/.test(con) && /function clearPane\(/.test(con), 'the console has a Clear control');
  const body = con.slice(con.indexOf('function clearPane('), con.indexOf('function clearPane(') + 500);
  ok(!/cancel|\/cancel/i.test(body), 'clearing the pane never cancels the job running on GitHub');
  // A finished job is dismissed for good; a running one is always restored.
  ok(/last\.id > dismissed\(\)/.test(con), 'boot restores a finished job only when it is newer than the dismissed one');
  ok(/if \(running\) follow\(running\.id/.test(con), 'a job still running is always restored');
  ok(/if \(jobId && jobTerminal\) dismiss\(jobId\)/.test(con), 'only a terminal job is remembered as dismissed');
});

test('the console screen is black', () => {
  const html = read('verticals/speakup/public/app.html');
  const manifest = JSON.parse(read('verticals/speakup/public/manifest.webmanifest'));
  const black = /^#(000|000000)$/i;
  // The page background comes from --bg, and the footer and header inherit it, so one token
  // decides the whole screen. A near-black navy here is the thing this asserts against.
  const bg = (html.match(/--bg:\s*(#[0-9a-f]{3,8})/i) || [])[1];
  ok(bg && black.test(bg), 'the app shell paints the screen black');
  ok(/background:var\(--bg\)/.test(html), 'the body background still reads the token');
  // The browser chrome and the installed launch screen must not flash a different colour.
  const theme = (html.match(/name="theme-color"\s+content="(#[0-9a-f]{3,8})"/i) || [])[1];
  ok(theme && black.test(theme), 'the theme colour matches the black screen');
  ok(black.test(manifest.background_color), 'the installed launch screen is black too');
});

test('patch and guard scripts', () => {
  const { execFileSync, spawnSync } = require('child_process');
  const os = require('os');
  const zlib = require('zlib');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speakup-factory-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'speakup-work-'));
  const git = (args, cwd) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: cwd || dir }).toString();
  git(['init', '-q']);
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'src', 'a.js'), 'module.exports = 1;\n');
  git(['add', '-A']); git(['commit', '-qm', 'base']);
  const makePatch = (mutate) => {
    const clone = fs.mkdtempSync(path.join(os.tmpdir(), 'speakup-clone-'));
    git(['clone', '-q', dir, clone], os.tmpdir());
    mutate(clone);
    git(['add', '-A'], clone);
    const patch = execFileSync('git', ['diff', '--cached', '--binary', '--no-renames', '--full-index'], { cwd: clone });
    return zlib.gzipSync(patch).toString('base64');
  };
  const script = (name, env) => spawnSync('node', [path.join(ROOT, '.github/speakup', name)], { cwd: dir, encoding: 'utf8',
    env: Object.assign({}, process.env, { WORK: work, GITHUB_OUTPUT: path.join(work, 'out.txt') }, env) });
  const reset = () => { git(['reset', '-q', '--hard']); git(['clean', '-qfd']); };

  let r = script('apply-patch.js', { PATCH_B64: makePatch(c => fs.writeFileSync(path.join(c, 'src', 'a.js'), 'module.exports = 2;\n')) });
  ok(r.status === 0 && JSON.parse(fs.readFileSync(path.join(work, 'changed_files.json'), 'utf8')).join() === 'src/a.js', 'apply-patch applies a normal change');
  reset();
  r = script('apply-patch.js', { PATCH_B64: makePatch(c => { fs.mkdirSync(path.join(c, '.github', 'workflows'), { recursive: true }); fs.writeFileSync(path.join(c, '.github', 'workflows', 'x.yml'), 'on: push'); }) });
  ok(r.status !== 0 && !fs.existsSync(path.join(dir, '.github')), 'apply-patch refuses a change to .github/');
  reset();
  r = script('apply-patch.js', { PATCH_B64: makePatch(c => fs.symlinkSync('/etc/passwd', path.join(c, 'src', 'link'))) });
  ok(r.status !== 0, 'apply-patch refuses a symlink');
  reset();
  r = script('apply-patch.js', { PATCH_B64: makePatch(c => fs.writeFileSync(path.join(c, '.env'), 'X=1')) });
  ok(r.status !== 0, 'apply-patch refuses a .env file');
  reset();

  const lib = require(path.join(ROOT, '.github/speakup/lib.js'));
  const quote = 'Queda aprobado: el SMS de confirmación de citas debe incluir el nombre del negocio';
  const hashes = [...new Set([...lib.shingles(lib.words(quote)).map(x => 'p:' + lib.sha16(x)), 'n:' + lib.sha16('greg')])];
  const guard = (content, tests) => {
    reset();
    const b64 = makePatch(c => fs.writeFileSync(path.join(c, 'src', 'a.js'), content));
    const a = script('apply-patch.js', { PATCH_B64: b64 });
    return a.status === 0 ? script('guard.js', { SENSITIVE: JSON.stringify(hashes), TEST_COMMANDS: JSON.stringify(tests || []) }) : a;
  };
  ok(guard('// el SMS de confirmación de citas debe incluir\nmodule.exports = 3;\n').status !== 0, 'guard refuses a diff that copies a meeting quote');
  ok(guard('// requested by Greg\nmodule.exports = 3;\n').status !== 0, 'guard refuses a diff that names a participant');
  ok(guard('const k = "sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAAAAAA";\n').status !== 0, 'guard refuses a credential');
  r = guard('function businessName(c) { return c.business_name; }\nmodule.exports = businessName;\n', ['node src/a.js']);
  ok(r.status === 0 && /suite_modified=true/.test(fs.readFileSync(path.join(work, 'out.txt'), 'utf8')), 'guard passes clean code and flags an edited test suite');
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(work, { recursive: true, force: true });
});

test('workflow tokens + merge scope', () => {
  process.env.SPEAKUP_FACTORY_SECRET = 'offline-secret-123456';
  const exp = Math.floor(Date.now() / 1000) + 600;
  const tok = security.workflowToken('progress', 5, exp);
  ok(security.verifyWorkflowToken('progress', 5, tok), 'progress token verifies for its job');
  ok(!security.verifyWorkflowToken('progress', 6, tok) && !security.verifyWorkflowToken('brief', 5, tok), 'token refused for another job or another purpose');
  ok(!security.verifyWorkflowToken('progress', 5, security.workflowToken('progress', 5, Math.floor(Date.now() / 1000) - 5)), 'expired token refused');
  const scope = jobs.changeScope({ plan: { steps: [{ files: [{ path: 'src/routes/x.js' }] }] }, path_scope: ['verticals/speakup'], changed_files: ['src/routes/x.js', 'verticals/speakup/a.js', 'src/app.js'] });
  ok(scope.outside.join() === 'src/app.js', 'files outside the plan and scope are named');
  process.env.SPEAKUP_JWT_SECRET = process.env.JWT_SECRET = 'same';
  ok(security.authSecretIsDefault(), 'a SpeakUp secret equal to the shared JWT_SECRET is not accepted');
  process.env.SPEAKUP_JWT_SECRET = 'own-secret'; delete process.env.JWT_SECRET;
  ok(!security.authSecretIsDefault(), 'SpeakUp own secret accepted');
  process.env.SPEAKUP_EXEC_PHRASE = 'abrete sesamo';
  ok(security.phraseWeak(), 'a short phrase is weak');
  process.env.SPEAKUP_EXEC_PHRASE = 'Cóndor azul sobre Tampa';
  ok(!security.phraseWeak(), 'a four-word phrase is accepted');
});

test('console header', () => {
  const html = fs.readFileSync(path.join(__dirname, 'public/app.html'), 'utf8');
  ok(/<span class="name">SpeakUp<\/span>/.test(html), 'the console header carries the SpeakUp name');
  ok(!/<span class="tag">/.test(html), 'no tag badge sits next to the SpeakUp name');
  ok(!/header \.tag\{/.test(html), 'the badge style went with the badge');
});

setTimeout(() => {
  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  process.exit(fail ? 1 : 0);
}, 50);
