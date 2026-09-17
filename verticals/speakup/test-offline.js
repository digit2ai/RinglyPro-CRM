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
// An async test starts after every synchronous one has run, and the summary waits for it.
const pendingTests = [];
function testAsync(name, fn) { pendingTests.push(Promise.resolve().then(fn).catch((e) => { fail++; console.log('FAIL ' + name + ': ' + e.message); })); }

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
  const others = ['src/routes/recordings.js', 'src/services/stt.js', 'src/services/ai-editor.js'].map(p => fs.readFileSync(path.join(__dirname, p), 'utf8'));
  ok(others.every(s => !/factory\//.test(s)), 'recording, transcription and editing code never reach the factory (a meeting cannot trigger execution)');
  const routes = stripComments(fs.readFileSync(path.join(__dirname, 'src/routes/factory.js'), 'utf8'));
  ok((routes.match(/approveAndDispatch\(/g) || []).length === 1 && /\/jobs\/:id\/execute', mutation, operator/.test(routes), 'one execute route, behind the same-origin and operator guards');
  const ui = ['public/console.js', 'public/app.html', 'public/meetings.js', 'public/meetings.html'].map(function (p) { return fs.readFileSync(path.join(__dirname, p), 'utf8'); }).join(' ');
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
  // EVERY JOB THAT CAN FAIL MUST BE ABLE TO SAY WHY. verify had no reporter, so a patch
  // that would not apply reached the phone as the shared message about the PUSH job — which
  // had not run. The reason is written on the failing VM and dies there without this.
  ['prepare', 'build', 'verify', 'push'].forEach(function (j) {
    ok(/if: failure\(\)/.test(jobBlocks[j]), 'the ' + j + ' job reports its own failure');
  });
  // ...and the untrusted ones report with the NARROW progress token, never the secret.
  ['build', 'verify'].forEach(function (j) {
    ok(/PROGRESS_TOKEN: \$\{\{ needs\.prepare\.outputs\.progress_token \}\}/.test(jobBlocks[j]) && /progress\.js" failed/.test(jobBlocks[j]),
      'the ' + j + ' job reports with the narrow progress token');
  });
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
   'explain the four jobs in the workflow', '¿cómo funciona el auto merge?', 'que hace la fabrica',
   // An information cue wins outright: "update me" is not a request to update anything,
   // and "give me" is informational only in front of an information noun.
   'tell me about the merge gate', 'update me on the status', 'give me a summary of the auto merge',
   'cuéntame sobre el auto merge', 'resúmeme el flujo',
   // -ed / -ing forms describe a state or a hypothesis, never a command. Matching them
   // turned "is it deployed" into a request to build something.
   'is it deployed', 'why is the build failing', 'what if you removed the banner?'].forEach(function (q) {
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
   'make the header smaller',
   // The past-tense strip must not swallow a live instruction: an infinitive is not a past
   // form, and an imperative after a past clause is still an imperative. A modal in front
   // of a passive IS a request, unlike the same participle in a state question.
   'can the header be changed?', 'should the banner be removed?',
   'I did not add the tag, please add it',
   // ...and one that merely MENTIONS a command word. This matched the SUMMARIZE rule and
   // went looking for a meeting to summarise instead of building anything.
   'add a summary line to the header'].forEach(function (i) {
    ok(!intents.isQuestion(i), 'an instruction is not a question, however it is phrased: ' + i);
    ok(intents.isInstruction(i), 'a command verb makes it an instruction: ' + i);
  });
  // No command verb, so isInstruction is false — these still build, by the other paths
  // (a pasted /command, and Architect mode's default). What matters is where they land.
  ['/ringlypro-architect why is this slow?', 'give me a Clear button in the header'].forEach(async function (i) {
    ok(!intents.isQuestion(i), 'not read as a question: ' + i);
  });
  // A question must never reach an action, whatever words it happens to contain.
  ok(!intents.isInstruction('merge the PR') && !intents.isInstruction('cancel the job'),
    'merge and cancel carry no change verb, so they still reach their own intents');
  // The whole point, asserted end to end: an information request never reaches an action,
  // and an instruction never gets answered instead of built.
  const table = [
    ['tell me about the merge gate', 'ASK'], ['update me on the status', 'CHECK_EXECUTION'],
    ['is it deployed', 'CHECK_DEPLOYMENT'], ['why is the build failing', 'ASK'],
    ['give me a summary of the auto merge', 'SUMMARIZE'], ['summarize the factory workflow', 'SUMMARIZE'],
    ['add a summary line to the header', 'PREPARE_IMPLEMENTATION'],
    ['give me a Clear button in the header', 'PREPARE_IMPLEMENTATION'],
    ['/ringlypro-architect why is this slow?', 'PREPARE_IMPLEMENTATION'],
    ['merge the PR', 'APPROVE_MERGE'], ['cancel the job', 'CANCEL_EXECUTION']
  ];
  for (const [text, want] of table) {
    const got = (await intents.classify(text, 'architect')).intent;
    ok(got === want, 'routes to ' + want + ' (got ' + got + '): ' + text);
  }
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

// EVERY VERSIONED ASSET, NOT JUST console.js. app.html and sw.js drifted to v4 and v3
// once and the installed app went on serving the cached file, so a deployed fix looked
// like it had never shipped. theme.css is now asked for by THREE pages and the worker,
// which is the same trap with more places to get it wrong — so the check walks them all
// instead of naming one file.
test('every page and the worker agree on every asset version', () => {
  const files = ['app.html', 'meetings.html', 'login.html', 'sw.js']
    .map((f) => [f, read('verticals/speakup/public/' + f)]);
  const seen = new Map(); // asset -> Map(version -> [files])
  for (const [name, src] of files) {
    for (const m of src.matchAll(/\/speakup\/([A-Za-z0-9._-]+)\?v=(\d+)/g)) {
      if (!seen.has(m[1])) seen.set(m[1], new Map());
      const byVer = seen.get(m[1]);
      if (!byVer.has(m[2])) byVer.set(m[2], []);
      byVer.get(m[2]).push(name);
    }
  }
  ok(seen.size > 0, 'there are versioned assets to check');
  for (const [asset, byVer] of seen) {
    const detail = [...byVer].map(([v, fs_]) => `v${v} in ${fs_.join('+')}`).join(', ');
    ok(byVer.size === 1, `${asset} has one version everywhere (${detail})`);
  }
  // A shell file changing without the cache version moving is the same failure by
  // another route: the worker hands back the old copy from its own store.
  ok(/const CACHE = 'speakup-v(\d+)'/.test(read('verticals/speakup/public/sw.js')),
     'the worker still names a cache version');
});

// THERE IS NO EMPTY PAGE, AND CLEAR CANNOT STRAND A LIVE PLAN (owner request 2026-09-17).
// The owner kept landing on five grey steps, a Clear button with nothing to clear and a
// dark pane holding one sentence — while a plan waited for them on the server. Clear was
// drawn on every screen, including beside Cancel on a live plan, where it hid the plan AND
// nulled planJob, so the next message started a second job underneath the unread plan.
// This runs in CI; test-console-flow.js proves the same thing in a real browser.
test('there is no empty page, and Clear cannot strand a live plan', () => {
  const con = read('verticals/speakup/public/console.js');
  const html = read('verticals/speakup/public/app.html');
  ok(/function clearPane\(\) \{\s*if \(jobId && !jobTerminal\) return;/.test(con),
     'clearPane refuses a job that is still in progress');
  ok(/if \(job && job\.terminal\) html \+= '<button class="lnk" id="clearBtn">'/.test(con),
     'Clear is drawn only for a finished job');
  ok(/if \(\$\('clearBtn'\)\) \$\('clearBtn'\)\.addEventListener/.test(con),
     'wiring Clear tolerates it being absent, which is now the common case');
  // The empty page itself is gone rather than restyled.
  ok(!/idleHint|t: 'idle'/.test(con), 'the INFO paragraph and its message are gone');
  ok(/function showIdle\(\)/.test(con) && /function leaveIdle\(\)/.test(con), 'an idle state replaces it');
  ok(/body\.idle #bar, body\.idle #out\{display:none\}/.test(html), 'idle draws no step bar and no work pane');
  // Every door INTO work must leave idle, or a job would render into a hidden pane.
  const writeFn = con.slice(con.indexOf('function write('), con.indexOf('function write(') + 200);
  ok(/leaveIdle\(\)/.test(writeFn), 'writing to the pane leaves idle');
  // Sliced up to a landmark inside the function, not a fixed character count: showPlan
  // opens with a comment long enough to push leaveIdle() past a 200-character window, and
  // that reported a missing call that was there — the second fixed-window slip today.
  const spAt = con.indexOf('function showPlan(');
  const showPlanFn = con.slice(spAt, con.indexOf('planJob = job.id', spAt));
  ok(/leaveIdle\(\)/.test(showPlanFn), 'showing a plan leaves idle');
  const barFn = con.slice(con.indexOf('function renderBar('), con.indexOf('function renderBar(') + 120);
  ok(/if \(job\) leaveIdle\(\)/.test(barFn), 'drawing a job on the bar leaves idle');
  // Startup goes straight to anything in progress; idle is only for when nothing is.
  ok(/if \(running\) follow\(running\.id, true\);[\s\S]{0,120}else \{ renderBar\(null\); showIdle\(\); \}/.test(con),
     'startup lands on work in progress first, and on idle only when there is none');
});

// WHISPER'S REPETITION LOOPS ARE STOPPED WHILE THEY FORM AND COLLAPSED IF THEY GET THROUGH.
// A real meeting came back 88% loop: one phrase 86 times in a row, another 65 times, each
// about one 30-second window decoded to Whisper's 448-token ceiling. OpenAI's reference
// implementation re-decodes any window whose text compresses above 2.4; the loops measured
// 28-32 and the real speech 1.42, and transformers.js implements none of those checks.
//
// THE FIXTURE IS INVENTED ON PURPOSE. The repository is public, so no meeting wording goes
// in it. It reproduces the SHAPE that failed — real sentences either side of an 86-copy loop
// and a 65-copy loop, one of them sharing words with a real sentence beside it.
test('Whisper repetition loops are stopped and collapsed', () => {
  const zlib = require('zlib');
  const { collapseRepeats } = require('./public/transcript-clean');
  const ratio = (s) => { const b = Buffer.from(s); return b.length / zlib.gzipSync(b).length; };

  const before = 'Welcome everyone. The quarterly figures are in the shared folder. ' +
    'We need the vendor list... '.repeat(86) +
    'That part is settled. The review moved to Tuesday. ' +
    'The review moved to Tuesday. '.repeat(64) +
    'Then the budget line. Any other questions? No.';
  const out = collapseRepeats(before);
  const count = (s, p) => s.split(p).length - 1;

  ok(ratio(before) > 2.4, `the fixture reproduces the defect (compression ${ratio(before).toFixed(2)} above 2.4)`);
  ok(ratio(out.text) < 2.4, `after cleaning it compresses like speech (${ratio(out.text).toFixed(2)} below 2.4)`);
  ok(count(out.text, 'We need the vendor list...') === 1, 'the 86-copy loop is left as one copy');
  ok(count(out.text, 'The review moved to Tuesday.') === 1, 'the 64-copy loop is left as one copy, including the real one beside it');
  ok(out.loops === 2, `exactly two loops were found (${out.loops})`);
  // Every real sentence survives, verbatim and in order.
  let at = 0, inOrder = true;
  for (const s of ['Welcome everyone.', 'The quarterly figures are in the shared folder.', 'That part is settled.',
    'Then the budget line.', 'Any other questions?', 'No.']) {
    const i = out.text.indexOf(s, at); if (i < 0) { inOrder = false; break; } at = i + s.length;
  }
  ok(inOrder, 'every real sentence survives, verbatim and in order');
  // NOTHING IS INVENTED: the output is the input with words taken out, never added or moved.
  const inW = before.split(/\s+/).filter(Boolean), outW = out.text.split(/\s+/).filter(Boolean);
  let j = 0; for (const w of inW) { if (j < outW.length && w === outW[j]) j++; }
  ok(j === outW.length, 'the output is a subsequence of the input: nothing added, nothing reordered');
  ok(out.removed === inW.length - outW.length, `the count of removed words is honest (${out.removed})`);

  // People do repeat themselves. Two copies are speech; three in a row is the decoder.
  const twice = 'I agree with that. I agree with that. Moving on.';
  ok(collapseRepeats(twice).text === twice, 'a sentence said twice is left alone');
  ok(collapseRepeats('go go go now').text === 'go now', 'three in a row is collapsed');
  // The same phrase comes back with different capitals and trailing punctuation.
  ok(collapseRepeats('The plan. the plan... THE PLAN. done').text === 'The plan. done', 'matching ignores case and punctuation');
  // THE SHORTEST REPEATING UNIT WINS: an 8-word window over a 4-word loop also "repeats",
  // and collapsing to it would leave two copies of the phrase behind.
  ok(collapseRepeats('a b c d '.repeat(6).trim()).text === 'a b c d', 'the shortest repeating unit is the one collapsed');
  ok(collapseRepeats(out.text).text === out.text, 'cleaning is idempotent');
  ok(collapseRepeats('').text === '' && collapseRepeats(null).text === '' && collapseRepeats('hi').text === 'hi', 'empty and short input are safe');

  // THE DECODER GUARD. Traced through transformers.js 3.3.3: the pipeline spreads these into
  // generation_config and Whisper's generate() adds NoRepeatNGramLogitsProcessor from it.
  const eng = stripComments(read('verticals/speakup/public/record-engine.js'));
  ok(/no_repeat_ngram_size:\s*8/.test(eng), 'the recorder asks Whisper not to repeat an 8-token sequence');
  // repetition_penalty taxes every word already said, "the" and "and" included.
  ok(!/repetition_penalty/.test(eng), 'repetition_penalty is deliberately not used');
  ok(/SpeakUpTranscript\.collapseRepeats\(text\)/.test(eng), 'the recorder collapses whatever still gets through');
  const mt = read('verticals/speakup/public/meetings.html');
  ok(mt.indexOf('transcript-clean.js') > 0 && mt.indexOf('transcript-clean.js') < mt.indexOf('record-engine.js'),
     'the page loads the cleaner before the recorder that calls it');

  // THE SERVER CLEANS TOO, WITH THE SAME FILE. The phone is not the only writer and not always
  // a current one: an installed app can serve a cached recorder for days.
  const rt = stripComments(read('verticals/speakup/src/routes/recordings.js'));
  ok(/require\('\.\.\/\.\.\/public\/transcript-clean'\)/.test(rt), 'the server requires the same file the browser loads');
  ok(/const text = collapseRepeats\(String\(req\.body\.text \|\| ''\)\.trim\(\)\)\.text;/.test(rt), 'creating a recording cleans the text');
  // Cleaned BEFORE the cap: a loop must not spend the 800,000-character limit and truncate the
  // real speech that came after it.
  ok(/collapseRepeats\(String\(req\.body\.text \|\| ''\)\)\.text\.slice\(0, 800000\)/.test(rt), 'autosave cleans before the length cap');
  ok(/if \(result && !result\.is_simulated && result\.text\) result\.text = collapseRepeats/.test(rt),
     'the server engine\'s output is cleaned, and the stub\'s labelled placeholder is not');
  ok(/'\/speakup\/transcript-clean\.js\?v=\d+'/.test(read('verticals/speakup/public/sw.js')), 'the worker caches the cleaner for offline use');
});

// THE CHAT RUNS ON THE OWNER'S CLAUDE SUBSCRIPTION, AND THE CLI IT RUNS CAN DO NOTHING BUT WRITE TEXT.
// The server's API account ran out of credit while the Factory already used the subscription, so
// the chat runs the pinned Claude Code CLI headless with CLAUDE_CODE_OAUTH_TOKEN. It runs on the
// production server with untrusted meeting text as input, so every tool, setting and MCP server
// is off and the environment is an allow-list. Proven here with a FAKE claude binary that records
// exactly what it was given — no token, no network.
testAsync('the chat on the Claude subscription: locked down, streamed, and honest about failures', async () => {
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speakup-fakeclaude-'));
  const dump = path.join(dir, 'dump.json');
  const bin = path.join(dir, 'claude');
  fs.writeFileSync(bin, '#!' + process.execPath + '\n' + `
    const fs = require('fs'); let input = '';
    if (process.argv.includes('--version')) { process.stdout.write('2.1.272 (Claude Code)\\n'); process.exit(0); }
    process.stdin.on('data', d => input += d);
    process.stdin.on('end', () => {
      fs.writeFileSync(${JSON.stringify(dump)}, JSON.stringify({ argv: process.argv.slice(2), env: process.env, cwd: process.cwd(), input }));
      const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
      out({ type: 'system', subtype: 'init', tools: [] });
      if (/FAIL401/.test(input)) { out({ type: 'result', subtype: 'success', is_error: true, result: 'Failed to authenticate. API Error: 401 Invalid bearer token' }); process.exit(1); }
      if (/SLEEP/.test(input)) { setTimeout(() => {}, 60000); return; }
      const text = 'Summary: three short points.';
      if (!/NODELTA/.test(input)) for (const p of text.match(/.{1,6}/g)) out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: p } } });
      out({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
      out({ type: 'result', subtype: 'success', is_error: false, result: text });
    });`);
  fs.chmodSync(bin, 0o755);

  const saved = { bin: process.env.SPEAKUP_CLAUDE_BIN, tok: process.env.CLAUDE_CODE_OAUTH_TOKEN, prov: process.env.SPEAKUP_CHAT_PROVIDER,
    db: process.env.DATABASE_URL, fs_: process.env.SPEAKUP_FACTORY_SECRET, ak: process.env.ANTHROPIC_API_KEY };
  process.env.SPEAKUP_CLAUDE_BIN = bin;
  process.env.CLAUDE_CODE_OAUTH_TOKEN = 'sit-subscription-token';
  process.env.DATABASE_URL = 'postgres://must-not-leak';
  process.env.SPEAKUP_FACTORY_SECRET = 'must-not-leak-either';
  process.env.ANTHROPIC_API_KEY = 'sk-must-not-leak';
  delete process.env.SPEAKUP_CHAT_PROVIDER;
  const sub = require('./src/factory/claude-subscription');
  const chat = require('./src/factory/meeting-chat');
  const read_ = () => JSON.parse(fs.readFileSync(dump, 'utf8'));
  try {
    ok(sub.available(), 'with a token and the CLI present, the subscription is used');

    const meeting = { id: 9, title: 'Weekly', created_at: new Date('2026-09-17T15:00:00Z') };
    const big = 'palabra '.repeat(40000);                              // ~320 KB: over the 128 KB argument cap
    const deltas = [];
    const r = await sub.run({ system: chat.systemRules({ meeting }), context: chat.transcriptContext(big), model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'Dame las minutas' }, { role: 'assistant', content: 'Acta...' }, { role: 'user', content: 'mas corto' }],
      onText: (x) => deltas.push(x) });
    const d = read_();
    ok(r.text === 'Summary: three short points.' && deltas.length > 1 && deltas.join('') === r.text, 'the reply streams in pieces and the whole text comes back');
    ok(r.model === 'subscription:claude-sonnet-5', 'the stored model says it came from the subscription');

    // LOCKED DOWN.
    const at = (f) => d.argv.indexOf(f);
    ok(at('--tools') >= 0 && d.argv[at('--tools') + 1] === '', 'every tool is switched off (--tools "")');
    ok(at('--restricted') >= 0, 'and --restricted removes the tools that run commands, belt and braces');
    ok(at('--setting-sources') >= 0 && d.argv[at('--setting-sources') + 1] === '' && at('--strict-mcp-config') >= 0, 'no settings, hooks or MCP servers are loaded');
    ok(at('--no-session-persistence') >= 0 && at('-p') === 0, 'headless, and nothing is saved between turns');
    // macOS adds __CF_USER_TEXT_ENCODING to every process by itself; it is not ours and Render is Linux.
    const envKeys = Object.keys(d.env).filter(k => !/^__CF_/.test(k)).sort();
    ok(envKeys.join(',') === ['CI', 'CLAUDE_CODE_OAUTH_TOKEN', 'DISABLE_AUTOUPDATER', 'HOME', 'LANG', 'PATH', 'TERM'].sort().join(','), 'the environment is an allow-list: ' + envKeys.join(','));
    ok(!JSON.stringify(d.env).includes('must-not-leak') && !JSON.stringify(d.env).includes('sk-must-not-leak'), 'no database URL, factory secret or API key reaches the CLI');
    ok(fs.readdirSync(d.cwd).length === 0 && d.env.HOME !== os.homedir(), 'it runs in an empty directory with a private HOME, so no project file or user config is read');

    // INPUT THROUGH STDIN.
    const sys = d.argv[at('--system-prompt') + 1];
    ok(Buffer.byteLength(sys) < 100 * 1024 && !sys.includes('palabra palabra'), 'only the short rules travel as an argument');
    const msg = JSON.parse(d.input.trim());
    const text = msg.message.content.filter(b => b.type === 'text').map(b => b.text).join('');
    ok(msg.type === 'user' && text.includes('palabra palabra') && text.includes('CONVERSATION SO FAR') && /LATEST MESSAGE FROM THE USER\nmas corto$/.test(text),
      'the transcript, the conversation so far and the latest message go in through stdin');

    const leading = require('./src/factory/claude-subscription').toUserContent({ context: '', messages: [{ role: 'user', content: '/bash rm -rf /' }] });
    ok(!/^[\/!]/.test(leading[leading.length - 1].text), 'a message can never start with "/" or "!", so it is never read as a command');

    // A screenshot stays an image block.
    await sub.run({ system: 'r', context: 'c', model: 'claude-sonnet-5', messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } }, { type: 'text', text: 'what is this' }] }] });
    const m2 = JSON.parse(read_().input.trim());
    ok(m2.message.content[0].type === 'image' && m2.message.content[0].source.media_type === 'image/png', 'a screenshot reaches the model as an image');

    // An older CLI that does not stream still hands over the whole text.
    const once = [];
    const r3 = await sub.run({ system: 'r', context: 'NODELTA', model: 'm', messages: [{ role: 'user', content: 'x' }], onText: (x) => once.push(x) });
    ok(once.length === 1 && once[0] === r3.text, 'with no streamed pieces the whole answer is sent once');

    // HONEST FAILURES.
    let e401 = null; try { await sub.run({ system: 'r', context: 'FAIL401', model: 'm', messages: [{ role: 'user', content: 'x' }] }); } catch (e) { e401 = e; }
    ok(e401 && /401 Invalid bearer token/.test(e401.message), "a bad token fails with Claude's own words");
    ok(/invalid or expired/.test(chat.reasonOf(e401)), 'and the chat names it: the subscription token is invalid or expired');
    ok(/usage limit/.test(chat.reasonOf(new Error('Claude subscription: usage limit reached'))), 'a usage limit is named as a usage limit');

    const ac = new AbortController();
    const t0 = Date.now();
    const pAbort = sub.run({ system: 'r', context: 'SLEEP', model: 'm', messages: [{ role: 'user', content: 'x' }], signal: ac.signal }).catch(e => e);
    setTimeout(() => ac.abort(), 300);
    const eAbort = await pAbort;
    ok(eAbort && eAbort.name === 'AbortError' && Date.now() - t0 < 3000, 'closing the tab kills the CLI at once');
    const eTime = await sub.run({ system: 'r', context: 'SLEEP', model: 'm', messages: [{ role: 'user', content: 'x' }], timeoutMs: 400 }).catch(e => e);
    ok(eTime && /timed out/.test(eTime.message), 'a stuck CLI is killed by a timeout, not left hanging a request');

    // The chat prefers the subscription over the API client, and says so in the status.
    const llm = require('./src/factory/llm');
    let apiCalled = false;
    llm.__setClient({ messages: { stream() { apiCalled = true; throw new Error('api'); }, create() { apiCalled = true; throw new Error('api'); } } });
    const viaLlm = await llm.streamText('chat', { system: 'r', context: 'c', messages: [{ role: 'user', content: 'x' }] }, () => {});
    ok(viaLlm.model === 'subscription:claude-sonnet-5' && !apiCalled, 'llm.streamText sends the chat to the subscription, not the API account');
    ok(llm.status().subscription.available === true, 'the status reports the subscription as in use');
    llm.__setClient(null);
    process.env.SPEAKUP_CHAT_PROVIDER = 'api';
    ok(!sub.available(), 'SPEAKUP_CHAT_PROVIDER=api turns the subscription off');
    delete process.env.SPEAKUP_CHAT_PROVIDER;

    // /health is public: it says which Claude the chat uses, in yes/no answers only.
    const healthSrc = stripComments(read('verticals/speakup/src/routes/health.js'));
    ok(/subscription_token_set: s\.token_set/.test(healthSrc) && !/CLAUDE_CODE_OAUTH_TOKEN|token\(\)|last_error/.test(healthSrc), 'the public health check reports whether a token is set, never the token or an error body');
    const pr = await sub.probe();
    ok(pr.runs === true && /2\.1\.272/.test(pr.version || ''), 'the probe confirms the CLI actually starts and reports its version');

    // One door, one pinned version.
    ok(/require\('\.\/claude-subscription'\)/.test(read('verticals/speakup/src/factory/llm.js')), 'llm.js is the only place the subscription is reached from');
    ok(fs.readdirSync(path.join(__dirname, 'src')).length && !/claude-subscription/.test(read('verticals/speakup/src/routes/meetings.js')), 'the routes do not call it directly');
    const pkg = JSON.parse(read('package.json'));
    const wfVer = (read('.github/workflows/speakup-factory.yml').match(/claude-code@([0-9.]+)/) || [])[1];
    ok(pkg.dependencies['@anthropic-ai/claude-code'] === wfVer, 'the server pins the same Claude Code version as the build job (' + wfVer + ')');
  } finally {
    const put = (k, v) => { if (v === undefined) delete process.env[k]; else process.env[k] = v; };
    put('SPEAKUP_CLAUDE_BIN', saved.bin); put('CLAUDE_CODE_OAUTH_TOKEN', saved.tok); put('SPEAKUP_CHAT_PROVIDER', saved.prov);
    put('DATABASE_URL', saved.db); put('SPEAKUP_FACTORY_SECRET', saved.fs_); put('ANTHROPIC_API_KEY', saved.ak);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// THE REPOSITORY NAME IS NOT SHOWN TO THE OPERATOR (owner request 2026-09-17).
// The console only ever talks to one repository, so printing "digit2ai/RinglyPro-CRM" in
// the header chip, in the idle message and again in the wake-word greeting was noise on
// every screen. It is still sent to the MODEL as context and still stored on the job — the
// rule is about display, not about forgetting which repository this is.
test('the operator is not shown the repository name', () => {
  ['app.html', 'meetings.html', 'login.html', 'console.js', 'meetings.js'].forEach((f) => {
    const src = read('verticals/speakup/public/' + f).replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    ok(!/digit2ai\/RinglyPro-CRM/.test(src), f + ' does not print the repository');
  });
  const intents = stripComments(read('verticals/speakup/src/factory/intents.js'));
  // The window opens BEFORE the marker: the flag is read on the line above the return,
  // so a slice starting at the marker misses it and reports a fix that is actually there.
  const at = intents.indexOf("intent: 'WAKE'");
  const wake = intents.slice(Math.max(0, at - 400), at + 700);
  ok(!/p0 \? p0\.repo/.test(wake), 'the wake greeting names no repository');
  // AND IT NO LONGER PROMISES THE OPPOSITE OF WHAT HAPPENS. It used to say the change
  // "runs straight away", which stopped being true when auto-run went off by default and
  // the plan step returned; it reads the flag now instead of asserting either behaviour.
  ok(/jobs\.autoRunEnabled\(\)/.test(wake), 'the greeting reads the auto-run flag rather than asserting one');
  ok(/type approved|escribas aprobado/i.test(wake), 'and says the plan comes first when auto-run is off');
  // The slot itself stays: meetings fills it with the screen name, and an empty one must
  // collapse or the mobile drawer shows a blank bordered row.
  ok(/id="ctx"/.test(read('verticals/speakup/public/app.html')), 'the slot is still in the markup');
  ok(/\.hdrmenu \.where:empty\{display:none\}/.test(read('verticals/speakup/public/theme.css').replace(/\n\s*/g, '')),
     'an empty slot collapses in the drawer');
});

// THE LOGIN IS THE FIRST SCREEN ANYONE SEES AND IT WAS THE LAST ONE ON THE OLD THEME.
// It carried its own palette inline (a purple on navy) and never linked theme.css, so it
// looked like a different product from the app behind it. A second palette inside a page
// is how two screens drift apart, which is why the rule is asserted rather than trusted.
test('the login wears the same theme as the app', () => {
  const login = read('verticals/speakup/public/login.html');
  const body = login.replace(/<!--[\s\S]*?-->/g, ''); // the file EXPLAINS the old palette
  ok(/<link rel="stylesheet" href="\/speakup\/theme\.css\?v=\d+">/.test(login),
     'it loads the shared stylesheet');
  ok(!/:root\s*\{/.test(body), 'it declares no palette of its own');
  ok(!/#7b6bff|#5a3fe0|#0a0e18|#131b2b/i.test(body), 'not one of the old theme colours survives');
  // Page-local rules are fine — theme.css has no form styles — but they must read the
  // shared tokens, so a change to the theme reaches this screen too.
  const styleBlock = (body.match(/<style>([\s\S]*?)<\/style>/) || ['', ''])[1];
  ok(/var\(--/.test(styleBlock), 'its own rules read the shared tokens');
  const literals = (styleBlock.match(/#[0-9a-f]{3,8}\b/gi) || []);
  ok(literals.length === 0, `no hard-coded colour in the page block (found ${literals.join(', ') || 'none'})`);
  ok(/theme-color" content="#1f2937"/.test(login), 'the browser chrome matches the dark ground');
  // theme.css hides .product under 560px, where the app's tabs name the screen instead.
  // There are no tabs here, so without this the card reads only DIGIT2AI on a phone.
  ok(/\.brand \.product\{display:inline-block/.test(styleBlock),
     'the product name survives the 560px rule that hides it in the app header');
});

// WHITE ON THE BRAND CLAY IS 3.12:1 — under AA — so every filled control was failing it,
// and the login's old purple button was actually better. --accent stays the brand for
// borders, focus rings and washes; anything carrying white text uses the darker
// --accent-solid instead. Keep them separate.
test('a filled control carries its label at AA', () => {
  const css = read('verticals/speakup/public/theme.css');
  const lum = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
      .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => { const L = lum(a), M = lum(b); return (Math.max(L, M) + 0.05) / (Math.min(L, M) + 0.05); };
  const token = (n) => (css.match(new RegExp('--' + n + ':\\s*(#[0-9a-f]{6})', 'i')) || [])[1];
  const solid = token('accent-solid'), ink = token('accent-ink'), dark = token('accent-solid-dark');
  ok(solid && ink && dark, 'the solid-clay tokens exist');
  ok(ratio(solid, ink) >= 4.5, `--accent-solid carries --accent-ink at AA (${ratio(solid, ink).toFixed(2)}:1)`);
  ok(ratio(dark, ink) >= 4.5, `and so does its hover (${ratio(dark, ink).toFixed(2)}:1)`);
  ok(lum(dark) < lum(solid), 'the hover is darker, not lighter');
  // Every surface that puts white text on clay must use the accessible token.
  for (const rule of ['.btn.primary', '.icon.send', '.step.on']) {
    const line = css.split('\n').find((l) => l.startsWith(rule + '{')) || '';
    ok(/background:var\(--accent-solid\)/.test(line), `${rule} fills with --accent-solid, not the brand clay`);
  }
});

test('the plan is read before anything runs', () => {
  const con = read('verticals/speakup/public/console.js');
  const jobsSrc = stripComments(read('verticals/speakup/src/factory/jobs.js'));
  const prepSrc = stripComments(read('verticals/speakup/src/factory/prepare.js'));
  const routes = stripComments(read('verticals/speakup/src/routes/factory.js'));

  // AUTO-RUN IS OFF BY DEFAULT. An instruction now stops at the plan; the old default sent
  // it straight to GitHub, which is exactly the review step this rebuild restores.
  ok(/SPEAKUP_AUTO_RUN \|\| 'off'\)\.toLowerCase\(\) === 'on'/.test(jobsSrc), 'auto-run is off unless explicitly turned on');
  ok(!/auto_run: true/.test(con), 'the console no longer asks for auto-run');

  // ONLY "approved" DISPATCHES. Not ok, not yes, not go.
  // The regex is LIFTED OUT OF THE SOURCE and exercised. Re-declaring it here would test a
  // copy, so loosening the real one would go unnoticed — which is what happened first.
  const src = (con.match(/var APPROVED = (\/[^\n]+\/i);/) || [])[1];
  ok(src, 'the approval word is defined where the test can find it');
  const APPROVED = eval(src); // eslint-disable-line no-eval
  ['ok', 'yes', 'sí', 'si', 'go', 'dale', 'run it', 'approve it later', 'not approved'].forEach(function (w) {
    ok(!APPROVED.test(w), '"' + w + '" does not dispatch');
  });
  ['approved', 'Approved.', ' aprobado ', 'APROBADA'].forEach(function (w) {
    ok(APPROVED.test(w), '"' + w.trim() + '" dispatches');
  });
  ok(/if \(APPROVED\.test\(text\.trim\(\)\)\) return approvePlan\(\);/.test(con) && /return revisePlan\(text\)/.test(con),
    'with a plan on screen the box approves or corrects, and cannot start a second job underneath it');

  // APPROVAL IS BOUND TO THE PLAN THAT WAS SHOWN.
  ok(/String\(planHash \|\| ''\) !== String\(job\.plan_hash\)/.test(jobsSrc), 'approve refuses a stale plan hash');
  ok(/job\.status !== 'WAITING_APPROVAL'/.test(jobsSrc), 'approve only acts on a job that is waiting');
  ok(/corrections: \(corrections \|\| \[\]\)\.map\(c => c\.text\)/.test(prepSrc), 'the corrections are inside the plan hash, so a revision always mints a new one');
  ok(/WAITING_APPROVAL: \['QUEUED', 'PLANNING'/.test(jobsSrc), 'the revise loop is a declared transition, not an ad-hoc write');

  // THE REVISE LOOP WRITES NO CODE AND DISPATCHES NOTHING.
  const revise = prepSrc.slice(prepSrc.indexOf('async function revise('), prepSrc.indexOf('async function runPrepare('));
  ok(revise.length > 200 && !/dispatchWorkflow|autoDispatch|approve\(/.test(revise), 'revising never starts a run');
  ok(/router\.post\('\/jobs\/:id\/approve', mutation, operator/.test(routes) && /router\.post\('\/jobs\/:id\/revise', mutation, operator/.test(routes),
    'both new routes are operator-only and same-origin');
});

test('what a security review found, and what now holds it', () => {
  const jobsSrc = stripComments(read('verticals/speakup/src/factory/jobs.js'));
  const prepSrc = stripComments(read('verticals/speakup/src/factory/prepare.js'));
  const con = read('verticals/speakup/public/console.js');

  // COMPARE-AND-SWAP, NOT READ-THEN-WRITE. approve() read the hash off a row fetched moments
  // earlier; a revision landing in that window satisfied the status predicate again, so
  // GitHub could receive a plan the owner never read.
  ok(/if \(expectPlanHash\) where\.plan_hash = expectPlanHash;/.test(jobsSrc), 'the plan hash can be part of the atomic update');
  ok(/expectPlanHash: job\.plan_hash/.test(jobsSrc), 'approve pins the update to the hash it checked');
  ok(/expectPlanHash: job\.plan_hash, detail: \{ revision/.test(prepSrc), 'a revision also pins its own starting plan');

  // THE REGISTRY SNAPSHOT IS REFRESHED ON A REVISION. The new hash attests the live project
  // row, so a stale snapshot made the approved hash and what actually runs disagree.
  const revise = prepSrc.slice(prepSrc.indexOf('async function revise('), prepSrc.indexOf('async function runPrepare('));
  ['repo: project.repo', 'base_branch: project.default_branch', 'workflow_file: project.workflow_file',
   'test_commands: projects.commandsFor(project)', 'path_scope: project.path_scope'].forEach(function (f) {
    ok(revise.includes(f), 'revise refreshes ' + f.split(':')[0] + ' in the snapshot');
  });

  // A TRANSIENT MODEL ERROR MUST NOT DESTROY A PLAN THE OWNER READ. FAILED is terminal and
  // callJSON does not retry a credit or rate-limit error.
  ok(!/jobs\.fail\(job, 'Revision failed/.test(revise), 'a failed revision no longer terminally fails the job');
  ok(/const back = await jobs\.transition\(job, 'WAITING_APPROVAL'.*fields: before/s.test(revise), 'it puts the previous plan back');
  ok(/const before = \{ plan: job\.plan/.test(revise), 'the previous plan is captured before the rebuild starts');

  // The corrections are re-sent in every later prompt, so the list cannot grow forever.
  ok(/MAX_REVISIONS/.test(prepSrc) && /slice\(-\(MAX_REVISIONS - 1\)\)/.test(revise), 'only the last few corrections travel');

  // THE CARD SAYS WHAT APPROVING ACTUALLY DOES. With auto-merge on, "run it" was true of the
  // branch and false of the rest: a green run merges itself and deploys.
  ok(/merges itself into main and deploys to production/.test(con) && /se fusiona en main y se despliega/.test(con),
    'the plan card states that approving reaches production, in both languages');

  // A dead request must not leave a stale plan on screen collecting corrections.
  const revFn = con.slice(con.indexOf('async function revisePlan('), con.indexOf('function takeIncomingPrompt('));
  ok(/\/factory\/jobs\/' \+ id \+ '\?lang='/.test(revFn), 'a failed revision re-syncs from the server');

  // The review claimed ai-editor.js was dead. It is not: summarising still uses it.
  ok(/require\('\.\.\/services\/ai-editor'\)/.test(read('verticals/speakup/src/factory/intents.js')), 'the summariser is still wired');
});

test('the meeting bridge carries only what was ticked', () => {
  const routes = stripComments(read('verticals/speakup/src/routes/factory.js'));
  const bridge = routes.slice(routes.indexOf("router.post('/recordings/:id/prompt'"), routes.indexOf("router.get('/search'"));
  ok(bridge.length > 200, 'the bridge endpoint exists');
  // TICKING IS THE APPROVAL: the prompt is built from collectSpec, which only sees items a
  // human promoted into an approved bucket. An unticked idea has no path into it.
  ok(/collectSpec/.test(bridge), 'the prompt is built from the approved spec, not from the raw transcript');
  ok(/spec\.requirements\.length/.test(bridge) && /Nothing is ticked yet/.test(bridge), 'nothing ticked is refused, and says so');
  // IT RETURNS TEXT. No job, no dispatch — the prompt lands in the box editable.
  ok(!/createPrepareJob|dispatchWorkflow|autoDispatch/.test(bridge), 'the bridge opens no job and dispatches nothing');
  const con = read('verticals/speakup/public/console.js');
  ok(/speakup_incoming_prompt/.test(con), 'the console picks the prompt up from the agreed key');
  ok(/sessionStorage\.removeItem\('speakup_incoming_prompt'\)/.test(con), 'and clears it, so a refresh cannot resurrect it');
  // The meetings screen no longer hands a prompt over on this key: it talks to the meeting and
  // transfers through its own server route (below). The console still reads the key.
  ok(!/speakup_incoming_prompt/.test(read('verticals/speakup/public/meetings.js')), 'the meetings screen no longer uses the hand-off key');
});

// THE MEETINGS SCREEN IS A CONVERSATION, AND TRANSFERRING STOPS AT A PLAN (2026-09-17).
// The Decisions / Other checklist was replaced by a chat over the transcript. What must hold:
// no model is never dressed up as an answer, every query is tenant-scoped, and "Transfer to
// Factory" reaches the same door as typing into the console — without auto_run, so nothing
// runs until the owner reads the plan and types "approved".
test('the meetings chat: honest without a model, tenant-scoped, and transfer stops at a plan', () => {
  const chat = require('./src/factory/meeting-chat');
  const routes = stripComments(read('verticals/speakup/src/routes/meetings.js'));
  const svc = stripComments(read('verticals/speakup/src/factory/meeting-chat.js'));

  // The checklist is gone from the screen, and so is the history list.
  const html = read('verticals/speakup/public/meetings.html');
  const mjs = read('verticals/speakup/public/meetings.js');
  ok(!/intelCard|promptBtn|Lo que se dijo|What was said/.test(html + mjs), 'the Decisions / Other checklist is gone');
  ok(!/id="listCard"|id="meets"/.test(html), 'the meeting list moved off this screen');
  ok(/id="thread"/.test(html) && /id="msg"/.test(html) && /id="mic"/.test(html) && /id="shots"/.test(html), 'a thread with the same input: text, mic, screenshot');
  ok(/router\.get\('\/history'/.test(read('verticals/speakup/src/index.js')), 'history is its own page');
  ['meetings.html', 'history.html', 'settings.html', 'app.html'].forEach((f) => {
    const h = read('verticals/speakup/public/' + f);
    ok(/id="navHistory"/.test(h) && /id="navNew"/.test(h) && /id="navSettings"/.test(h), f + ' carries History, New meeting and Settings in the menu');
  });

  // Starter chips are optional shortcuts, not the only way in.
  ok(/var CHIPS = \[/.test(mjs) && /\$\('msg'\)/.test(mjs), 'chips exist and the free-form box stays');

  // TRANSFER INTENT: typed or dictated, short, and never a question.
  ['transfer to Factory', 'send to Factory', 'enviar a Factory', 'mandar a Factory', 'Envíalo a la fábrica'].forEach((t) => ok(chat.isTransfer(t), 'detects: ' + t));
  ['what did we say about sending it to the factory?', 'Give me a summary', 'we should send the invoices to the factory next week']
    .forEach((t) => ok(!chat.isTransfer(t), 'ignores: ' + t));

  // TRANSFER STOPS AT A PLAN. Same door as the console, architect mode, no auto_run, and
  // nothing here approves, dispatches or merges.
  const tr = routes.slice(routes.indexOf('async function transfer('));
  ok(/intents\.run\(/.test(tr) && /mode: 'architect'/.test(tr), 'transfer goes through intents.run in architect mode');
  ok(!/auto_run/.test(tr), 'transfer never asks for auto_run');
  ok(!/approve|dispatch|merge\(/i.test(routes.replace(/approved/g, '')), 'the meetings routes cannot approve, dispatch or merge');
  ok(/isFactoryOperator\(req\.user\)/.test(tr), 'only the Factory operator can transfer');
  ok(/^\/ringlypro-architect\n/.test(chat.factoryText({ prompt: 'BUILD PROMPT:\nDo x', meeting: { id: 7, title: 'T', created_at: new Date() } })),
    'the handed-over text opens with the slash command, so the console reads it as an instruction, never a question');
  const intents = require('./src/factory/intents');
  ok(intents.isQuestion(chat.factoryText({ prompt: 'BUILD PROMPT:\nWhy is the header blue?', meeting: { id: 7, title: 'T' } })) === false,
    'even a prompt that ends in a question mark is not routed as a question');
  ok(/source\.kind === 'prompt' \|\| chat\.isBuildPrompt\(source\.content\)/.test(tr) && /callText\('chat'/.test(tr),
    'an answer that is not a prompt yet is converted first, in the same step');

  // NO MODEL IS NEVER DRESSED UP AS AN ANSWER.
  const off = chat.offlineReply({ message: 'Dame un resumen', meeting: { id: 1 }, transcript: 'hola mundo', reason: 'the Anthropic account is out of credit' });
  ok(/Sin modelo/.test(off.text) && /out of credit/.test(off.text) && /hola mundo/.test(off.text), 'offline: labelled, gives the reason, offers the transcript');
  ok(!/resumen:/i.test(off.text), 'offline: it does not pretend to have summarised');
  const offP = chat.offlineReply({ message: 'convert this to a build prompt', meeting: { id: 1 }, transcript: 'SECRET MEETING WORDS', reason: 'r' });
  ok(offP.kind === 'text' && !chat.isBuildPrompt(offP.text) && /needs the model/.test(offP.text), 'offline: no build prompt is assembled, and it says why');
  ok(!/SECRET MEETING WORDS/.test(offP.text), 'offline: a prompt request never gets the transcript pasted into it');
  ok(!chat.wantsPrompt('what did we say about the build server?') && chat.wantsPrompt('convert this to a build prompt') && chat.wantsPrompt('convierte esto en un prompt'),
    'a prompt is recognised by the request, not by any mention of "build"');
  ok(typeof chat.offlinePrompt === 'undefined', 'there is no path that assembles a prompt from the transcript');

  // THE MEETING DOES NOT RIDE ALONG INTO THE FACTORY — checked in code, since the push guard
  // skips instruction text.
  const T = 'We agreed to add a page that lists the open tasks for the weekly review with Juan Perez.';
  ok(chat.meetingLeaks({ prompt: 'Add a page that lists the open tasks for the weekly review.', transcript: T }).some(l => l.type === 'quote'), 'a prompt quoting 8 words from the meeting is caught');
  ok(chat.meetingLeaks({ prompt: 'Add a task page. Owner: Juan Perez.', transcript: T, participants: ['Juan Perez'] }).some(l => l.type === 'name'), 'a prompt naming a participant is caught');
  ok(chat.meetingLeaks({ prompt: 'Add a page listing open tasks. Check it loads. Do not change login.', transcript: T, participants: ['Juan Perez'] }).length === 0, 'a prompt that describes functionality passes');
  ok(!chat.factoryText({ prompt: 'BUILD PROMPT:\nDo x', meeting: { id: 7, title: 'Call with Acme and Juan', created_at: new Date() } }).includes('Acme'), 'the meeting title is left out of the hand-off');
  ok(/meetingLeaks\(/.test(tr) && tr.indexOf('meetingLeaks(') < tr.indexOf('intents.run('), 'the leak check runs before anything reaches the Factory');
  ok(/source\.factory_ref/.test(tr) && /status: 409/.test(tr), 'a transferred answer cannot be transferred twice');
  ok(/status: 503/.test(tr) && !/offlinePrompt/.test(tr), 'transfer without a model stops rather than improvising a prompt');

  // Cost: the long prefix is cacheable, the tab closing stops the model, and there is a daily cap.
  const blocks = chat.systemBlocks({ meeting: { id: 1 }, transcript: 'x' });
  ok(blocks.length === 2 && !blocks[0].cache_control && blocks[1].cache_control.type === 'ephemeral' && /TRANSCRIPT/.test(blocks[1].text), 'the transcript block is the cacheable one; the rules are separate');
  ok(/abort\.abort\(\)/.test(routes) && /signal: abort\.signal/.test(routes), 'closing the tab stops the model');
  ok(/meeting-chat-day/.test(routes) && routes.indexOf("'meeting-chat-day'") < routes.indexOf('readAttachment(req.body'), 'a daily cap, checked before any image is decoded');
  ok(/magicMatches\(mime, bytes\)/.test(routes), 'an image must be what its type claims, byte for byte');
  // CLEAR deletes on the server — a screen-only clear would keep feeding old turns to the model.
  ok(/router\.delete\('\/:id\/chat', mutation,/.test(routes) && /MeetingChat\.destroy\(\{ where: \{ tenant_id: rec\.tenant_id, meeting_id: rec\.id \} \}\)/.test(routes),
    'clear is a same-origin DELETE, scoped to the tenant and the meeting');
  ok(/Upload\.destroy\(\{ where: \{ tenant_id: rec\.tenant_id, id: uploadIds, job_id: null \} \}\)/.test(routes), 'it removes its screenshots, never an upload attached to a Factory job');
  ok(/if \(!armed\)/.test(mjs) && /setTimeout\(disarm, 4000\)/.test(mjs), 'one tap only arms Clear; it disarms itself');
  ok(/composed_by = 'offline'/.test(routes), 'an offline reply is stored as offline, so the screen can label it');
  ok(/Sin modelo: respuesta de respaldo/.test(mjs) && /No model: fallback reply/.test(mjs), 'and the screen labels it in both languages');

  // TENANCY: every read and write of a meeting or its chat is scoped to the session tenant.
  ok(/tenant_id: tenantOf\(req\)/.test(routes) && !/req\.body\.tenant_id|req\.query\.tenant_id/.test(routes), 'tenant comes from the session, never the request');
  ok((routes.match(/MeetingChat\.(findAll|findOne|create)\(\{ where: \{ tenant_id|MeetingChat\.create\(\{ tenant_id/g) || []).length >= 5, 'every chat query carries tenant_id');
  ok(/linked = await MeetingChat\.findOne/.test(routes), 'a screenshot is served only when a message in this meeting points at it');
  ok(/r\.tenant_id = :tenant_id/.test(routes) && /mode IS NULL OR r\.mode = 'meeting'/.test(routes), 'history is tenant-scoped and lists meetings only');
  ok(/\\\\'\s*\+\s*c/.test(routes) || /\(c\) => '\\\\' \+ c/.test(routes), 'search escapes LIKE wildcards');

  // The model: one door, the system prompt holds the rules, and the transcript is cleaned.
  ok(!/require\('@anthropic-ai\/sdk'\)/.test(svc + routes), 'the chat reaches Anthropic only through llm.js');
  const sys = chat.systemPrompt({ meeting: { id: 3, title: 'Weekly', created_at: new Date('2026-09-17T15:00:00Z') }, transcript: 'hello' });
  ok(/language of the user's latest message/.test(sys) && /No emojis/.test(sys) && /Plain text only/.test(sys), 'reply in the user language, plain text, no emojis');
  ok(/Never invent a name, owner, date/.test(sys) && /not stated/.test(sys), 'an absent fact is said to be absent');
  ok(/"Weekly"/.test(sys) && /meeting #3/.test(sys) && /2026/.test(sys), 'the title, id and date are injected');
  ok(/collapseRepeats/.test(svc), 'the transcript sent to the model has Whisper loops removed');
  const hist = chat.messagesFor([{ role: 'user', content: 'a' }, { role: 'assistant', content: 'b' }, { role: 'assistant', kind: 'transfer', content: 'receipt' }], 'shorter');
  ok(hist.length === 3 && hist[2].content === 'shorter' && !JSON.stringify(hist).includes('receipt'), 'refinements carry the prior turns, but not transfer receipts');
  ok(/stream\.on\('text'/.test(read('verticals/speakup/src/factory/llm.js')) && /if \(started \|\| \(signal && signal\.aborted\) \|\| !isModelRefusal\(e\)\) break;/.test(read('verticals/speakup/src/factory/llm.js')),
    'streaming never switches model after the first token');
});

test('two screens and nothing else', () => {
  const idx = stripComments(read('verticals/speakup/src/index.js'));
  ok(/router\.get\('\/meetings'/.test(idx), 'the meetings screen is routed');
  ok(!/require\('\.\/routes\/ai'\)/.test(idx), 'the translate/rewrite router is gone');
  ok(/router\.get\('\/recorder', \(req, res\) => res\.redirect/.test(idx), 'the old screen redirects rather than 404ing a bookmark');
  ['public/recorder.html', 'public/factory.js', 'src/routes/ai.js'].forEach(function (f) {
    ok(!fs.existsSync(path.join(__dirname, f)), f + ' was removed');
  });
  const recs = stripComments(read('verticals/speakup/src/routes/recordings.js'));
  ["'/import'", "'/:id/summarize'", "'/:id/generate'", "'/:id/export'"].forEach(function (r) {
    ok(!recs.includes('router.post(' + r) && !recs.includes('router.get(' + r), 'the removed feature ' + r + ' has no endpoint left');
  });
  // The recording engine itself was NOT rewritten, only relocated.
  const eng = read('verticals/speakup/public/record-engine.js');
  ok(/MediaRecorder/.test(eng) && /getDisplayMedia/.test(eng) && /whisper/i.test(eng), 'the engine kept its mixing and on-device transcription');
  ok(/window\.SpeakUpRecorder/.test(eng), 'it exposes the documented API');
});

test('the plan is written for the person deciding', () => {
  const repo = require('./src/factory/repo');
  const prep = require('./src/factory/prepare');

  // THE CANDIDATE FILES WERE THE ROOT CAUSE. Scoring by "how many of these words does the
  // file contain" put CLAUDE.md first for every request, because a 30,000-word document
  // contains every word — and an unrelated vertical second.
  const terms = repo.terms(['I need a different font for the SpeakUp title only']);
  const files = repo.candidateFiles([], terms, 8).files.map(f => f.path);
  ok(files.length > 0, 'the search still finds candidates');
  ok(files[0] !== 'CLAUDE.md', 'CLAUDE.md is no longer the top answer to every question');
  ok(!files.includes('verticals/jobmd/src/index.js'), 'an unrelated vertical is no longer proposed');
  const inSpeakup = files.filter(p => /(^|\/)speakup(\/|$)/.test(p)).length;
  ok(inSpeakup >= Math.ceil(files.length / 2), 'most candidates are inside the vertical the request names (' + inSpeakup + '/' + files.length + ')');

  // The plain sections are what the owner reads, and a file name must never appear in them.
  const spec = { requirements: [{ id: 'R1', kind: 'requirement', text: 'The title uses a different typeface', quote: 'q', approved_by_human: true }],
    decisions: [], acceptance_criteria: [], open_questions: [], technical_considerations: [],
    held_back: { ideas: 0, suggestions: 0, discussion: 0, unverified: 0 }, sources: [{ recording_id: 1, title: 't', created_at: new Date() }], instruction: 'the title font' };
  const project = { key: 'ringlypro', name: 'RinglyPro', repo: 'o/r', default_branch: 'main', path_scope: [], test_commands: [], workflow_file: 'w.yml', deployment: 'Render' };
  const cands = repo.candidateFiles([], terms, 5);
  const leaky = prep.verifyPlan({
    what_changes: ['The wordmark is set in a different typeface', 'Edit verticals/speakup/public/theme.css'],
    what_stays: ['Nothing else moves'], how_you_know: ['The wordmark looks different'],
    decisions: [{ choice: 'Used a typeface already on the device', why: 'it works offline', tradeoff: 'looks slightly different per device' },
                { choice: 'Changed theme.css', why: 'that is where it lives', tradeoff: null }],
    watch_out: [], scope_plain: 'Only the SpeakUp screens.', steps: []
  }, spec, project, cands);
  ok(leaky.what_changes.length === 1 && !/theme\.css/.test(leaky.what_changes.join(' ')),
    'a sentence naming a file is dropped from what the owner reads');
  ok(leaky.decisions.length === 1 && !/theme\.css/.test(JSON.stringify(leaky.decisions)), 'and from the decisions');
  ok(leaky.scope_plain === 'Only the SpeakUp screens.', 'scope is kept as one plain sentence');

  // WITHOUT A MODEL THE PLAN SAYS SO. It must not dress a keyword guess up as a considered plan.
  const heur = prep.verifyPlan(prep.heuristicPlan(spec, project, cands), spec, project, cands);
  heur.is_simulated = true; heur.composed_by = 'heuristic';
  ok(heur.what_changes.length >= 1, 'the keyless plan still says what changes, in the owner words');
  ok(/without a model/i.test(heur.watch_out.join(' ')), 'and admits it did not reason about the code');
  const md = prep.renderMarkdown({ id: 1 }, project, spec, heur);
  const owner = md.split('## Technical detail')[0];
  ok(/## What changes/.test(owner) && /## How you will know/.test(owner), 'the owner half leads the document');
  ok(!/\.js\b|\.css\b|candidate/i.test(owner), 'no file name reaches the owner half');
  ok(/## Technical detail/.test(md) && /Candidate files/.test(md), 'the technical half still exists, below, for the fold');
  ok(md.indexOf('## What changes') < md.indexOf('## Technical detail'), 'owner first, machine second');

  // The diff is what stops a review becoming a re-read.
  const a = { what_changes: ['one', 'two'], steps: [{ n: 1, title: 's1', files: [] }], scope_plain: 'x' };
  const b = { what_changes: ['one', 'three'], steps: [], scope_plain: 'y' };
  const d = prep.planDiff(a, b);
  ok(d.added.some(x => /three/.test(x)) && d.removed.some(x => /two/.test(x)), 'the diff names what was added and removed');
  ok(d.removed.some(x => /step: s1/.test(x)) && d.changed.some(x => /scope/.test(x)), 'it covers steps and scope too');
});

test('asking never changes the plan', () => {
  const routes = stripComments(read('verticals/speakup/src/routes/factory.js'));
  const prep = stripComments(read('verticals/speakup/src/factory/prepare.js'));
  ok(/router\.post\('\/jobs\/:id\/ask', mutation, operator/.test(routes), 'ask is operator-only and same-origin');
  ok(/plan_changed: before !== after/.test(routes), 'the route reports whether the plan moved, rather than asserting it did not');
  const ask = prep.slice(prep.indexOf('async function ask('), prep.indexOf('async function drop('));
  ok(ask.length > 200 && !/Job\.update|transition\(|planHash\(/.test(ask), 'ask writes nothing and mints no hash');
  ok(/llm\.configured\(\)/.test(ask) && /ANTHROPIC_API_KEY/.test(ask), 'with no model it says why it cannot answer instead of guessing');
  // Dropping a step is a tap, not a regeneration — and it is still pinned to the plan shown.
  const drop = prep.slice(prep.indexOf('async function drop('), prep.indexOf('function planDiff') > 0 ? prep.length : prep.length);
  ok(/plan_hash: job\.plan_hash/.test(drop), 'drop is pinned to the plan the owner was reading');
  ok(/uncovered_requirements/.test(drop), 'and reports a requirement left with no step covering it');
  ok(!/llm\.callJSON/.test(drop.slice(0, drop.indexOf('async function revise('))), 'dropping a step costs no model call');
  // A CONTROL THAT DOES NOTHING IS WORSE THAN NO CONTROL. The fold offers a remove on
  // candidate files as well as step files; a path in neither must be refused out loud
  // rather than redrawing an unchanged plan under the finger.
  ok(/candidate_files/.test(drop) && /not in this plan/.test(drop), 'removing a candidate file works, and an unknown path is refused');
  ok(/There is no step/.test(drop), 'and so is a step number that is not there');

  // The console must route a question to ask, never to revise.
  const con = read('verticals/speakup/public/console.js');
  ok(/\/ask'/.test(con) && /plan\/drop'/.test(con), 'the console calls both new endpoints');
  // Bound the slice at the NEXT function, or it reads into approvePlan and reports on that.
  const askStart = con.indexOf('async function askPlan(');
  const askFn = con.slice(askStart, con.indexOf('async function ', askStart + 10));
  ok(askStart > 0 && askFn.length > 100 && askFn.length < 2000, 'askPlan was located and bounded');
  ok(!/planShown\s*=|planHash\s*=|planDiff\s*=|showPlan\(|hidePlan\(/.test(askFn), 'asking leaves the plan card untouched');
});

test('the screen speaks plain words, not GitHub vocabulary', () => {
  const con = read('verticals/speakup/public/console.js');
  // Only the strings the OWNER READS. The machine states keep their real names in the
  // database and on the wire — renaming those would be a different and much worse change.
  const dicts = con.slice(con.indexOf('var STATUS_TEXT = {'), con.indexOf('var SRV = {'));
  const labels = [];
  const re = /\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g;
  let m;
  while ((m = re.exec(dicts))) { labels.push(m[1], m[2]); }
  ok(labels.length > 20, 'the visible labels were found (' + labels.length + ')');
  // "PR" and "branch" are what GitHub calls things, not what they are.
  [/\bPR\b/, /\bpull request\b/i, /\brama\b/, /\bbranch\b/i].forEach(function (bad) {
    const hit = labels.filter(function (s) { return bad.test(s); });
    ok(!hit.length, 'no label says ' + bad + ' (' + hit.join(' | ') + ')');
  });
  ok(/es: 'Revisión', en: 'Review'/.test(con), 'the fourth step reads Review, not PR');
  ok(/'Saving the change'/.test(con) && /'Proposing the change'/.test(con), 'the pane says what happened, not how');
  // The link still opens a page GitHub calls a pull request, so the real word survives
  // where it is true — in the tooltip — rather than being scrubbed everywhere.
  ok(/title="' \+\s*\n?\s*L\('Pull request en GitHub', 'Pull request on GitHub'\)/.test(con) || /Pull request on GitHub/.test(con),
    'the link keeps the real word in its tooltip');
  ok(/L\('Cambio #', 'Change #'\)/.test(con), 'and reads plainly on the chip');
  // "Cambio #5" beside a button labelled "Cambios" was two different things one letter apart.
  ok(!/L\('Cambios', 'Changes'\)/.test(con), 'the diff button no longer collides with the change link');
});

test('one language on the whole screen', () => {
  const con = read('verticals/speakup/public/console.js');
  // A line is a KEY plus arguments, never a finished string, or it keeps the language it
  // was written in: an English console listed "Probando / Subiendo la rama / Desplegado".
  ok(/var shown = \[\]/.test(con) && /function paint\(\)/.test(con), 'the pane keeps its raw lines and can repaint them');
  ok(/paint\(\);\s*\n\s*renderBar\(lastJob\);/.test(con), 'switching language repaints the pane AND redraws the step bar');
  ok(/if \(planJob && planShown\) showPlan\(planShown\)/.test(con), 'and a plan on screen gets its instructions back in the new language');
  // No client-authored line may be pushed as pre-translated text.
  const authored = con.match(/write\(\[\{ kind: '[a-z]+', text: L\(/g) || [];
  ok(!authored.length, 'no console line is written as an already-translated string (' + authored.length + ' found)');

  // THE SERVER AND THE RUNNER MUST KEEP SENDING THE KEY. The browser test supplies the key
  // itself, so only this can catch it being dropped at the source.
  const jobsSrc = stripComments(read('verticals/speakup/src/factory/jobs.js'));
  [["i18n: 'merged'", 'the auto-merge line'], ["i18n: 'suite_modified'", 'the suite-was-edited line'], ["i18n: 'merge_failed'", 'the merge-failure line']]
    .forEach(function (p) { ok(jobsSrc.includes(p[0]), p[1] + ' carries a translation key'); });
  const stream = stripComments(fs.readFileSync(path.join(ROOT, '.github/speakup/stream-events.js'), 'utf8'));
  ok(/i18n: 'claude_started'/.test(stream) && /i18n: ev\.is_error \? 'claude_stopped' : 'claude_done'/.test(stream),
    'the runner labels its start and finish lines');
  ok(/turns: ev\.num_turns/.test(stream), 'it sends the turn count as a number, so the joining words can be translated');
  const prog = stripComments(fs.readFileSync(path.join(ROOT, '.github/speakup/progress.js'), 'utf8'));
  ok(/i18n: 'tests'/.test(prog) && /i18n: 'tests_unmeasured'/.test(prog), 'the runner labels its test line');

  // Every key either side sends must exist in the console, or the line silently falls back
  // to whatever language the sender happened to use.
  const known = (con.match(/^\s{4}(\w+): \[/gm) || []).map(function (m) { return m.trim().split(':')[0]; });
  ["merged", "suite_modified", "merge_failed", "claude_started", "claude_done", "claude_stopped", "tests", "tests_unmeasured"]
    .forEach(function (k) { ok(known.indexOf(k) >= 0, 'the console can translate "' + k + '"'); });
});

test('the icon is generated from one source and survives being small', () => {
  const master = read('verticals/speakup/public/icon-master.svg');
  const fav = read('verticals/speakup/public/favicon.svg');
  const gen = read('verticals/speakup/scripts/make-icons.js');

  // The old mark was a purple gradient microphone on a near-black plate: the wrong palette
  // for the paper theme, and a microphone describes half an app whose other half builds code.
  [master, fav].forEach(function (svg) {
    ok(!/5a3fe0|8b7bff|0d1320|linearGradient|url\(#/.test(svg), 'no leftover purple or gradient in the mark');
    ok(!/opacity/.test(svg), 'no opacity: a faded stroke is the first thing to vanish at 32px');
    ok(/#0d1117/.test(svg) && /#4fc3e3/.test(svg), 'it wears the Digit2AI ink and cyan');
  });
  // FULL BLEED for the app icon, ROUNDED only for the browser tab: iOS rounds
  // apple-touch-icon itself and a pre-rounded source gets double-rounded.
  ok(!/<rect width="512" height="512" rx=/.test(master), 'the app icon is full-bleed, not pre-rounded');
  ok(/rx="108"/.test(fav), 'the tab variant is the rounded one');

  ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'favicon-32.png'].forEach(function (f) {
    const p = path.join(__dirname, 'public', f);
    ok(fs.existsSync(p) && fs.statSync(p).size > 200, f + ' exists and is a real image');
  });

  // EVERY SIZE COMES FROM ONE FILE. Hand-editing a 32px icon is how a mark drifts.
  ok(/--check/.test(gen) && /maskable safe box/.test(gen), 'the generator can verify itself and guards the maskable safe zone');
  ok(/icon-master\.svg/.test(gen) && /favicon\.svg/.test(gen) && /apple-touch-icon\.png/.test(gen), 'it writes every asset');
  // THE SAFE ZONE IS MEASURED, NOT COMPUTED FROM COORDINATES. The first version derived the
  // box from the shape's own numbers, which works only while the mark is made of numbers —
  // it cannot see where a glyph lands. The guard now renders the real icon and finds the
  // bounding box of every non-background pixel, so it stays true for a letterform too.
  ok(/async function safeZoneViolations\(sharp\)/.test(gen), 'the guard renders the icon rather than trusting the maths');
  ok(/raw\(\)\.toBuffer/.test(gen) && /minX/.test(gen), 'it measures the ink it can actually see');
  ok(/size \* 0\.1/.test(gen) && /size \* 0\.9/.test(gen), 'against the central 80%');
  ok(!/const RAYS/.test(gen), 'the old coordinate guard went with the shape it guarded');
});

test('the header controls are one node, not two copies', () => {
  const css = read('verticals/speakup/public/theme.css');
  const js = read('verticals/speakup/public/header-menu.js');
  ok(/\.burger\{[^}]*display:none/.test(css) && /@media\(max-width:700px\)\{\s*\.burger\{display:block\}/.test(css.replace(/\n\s*/g, '')),
    'the burger appears only below the breakpoint');
  ok(/\.hdrmenu:not\(\.open\)\{display:none\}/.test(css), 'the panel is hidden until it is opened');
  ok(/\.burger\[aria-expanded="true"\]/.test(css), 'the open state draws itself as an X');
  ['app.html', 'meetings.html'].forEach(function (f) {
    const html = read('verticals/speakup/public/' + f);
    // ONE set of controls. A drawer built from duplicate markup is how the two eventually
    // offer different things; here the same node is a row on a desktop and a panel on a phone.
    ok((html.match(/id="langBtn"/g) || []).length === 1 && (html.match(/id="outBtn"/g) || []).length === 1,
      f + ' has exactly one language toggle and one sign out');
    ok(/<div class="hdrmenu" id="hdrMenu">[\s\S]*id="ctx"[\s\S]*id="langBtn"[\s\S]*id="outBtn"[\s\S]*<\/div>/.test(html),
      f + ' keeps all three inside the one menu node');
    ok(/id="burger"[^>]*aria-expanded="false"[^>]*aria-controls="hdrMenu"/.test(html), f + ' wires the burger to the menu for a screen reader');
    ok(/header-menu\.js/.test(html), f + ' loads the shared behaviour rather than its own copy');
  });
  // Behaviour lives in one file for the same reason the markup does.
  ['Escape', 'resize', 'aria-expanded'].forEach(function (k) { ok(js.includes(k), 'the shared script handles ' + k); });
  ok(/window\.innerWidth > 700/.test(js), 'growing past the breakpoint closes it, so no X is stranded on a desktop');
  const sw = read('verticals/speakup/public/sw.js');
  ok(/header-menu\.js\?v=\d+/.test(sw), 'the worker caches the shared script');
});

// EVERY SCREEN WEARS THE RinglyPro CRM PALETTE, READ FROM THE LIVE PAGE.
// aiagent.ringlypro.com signs in on Tailwind: ground #1f2937, a light panel, blue-600
// buttons, gray-400 subtitles. This replaced the warm paper theme at the owner's request.
test('every screen wears the CRM palette', () => {
  const css = read('verticals/speakup/public/theme.css');
  const manifest = JSON.parse(read('verticals/speakup/public/manifest.webmanifest'));
  const token = (n) => (css.match(new RegExp('--' + n + ':\\s*(#[0-9a-f]{3,8})', 'i')) || [])[1];
  ok(/^#1f2937$/i.test(token('paper') || ''), 'the ground is the CRM gray-800');
  ok(/^#2563eb$/i.test(token('accent') || ''), 'the accent is blue-600');
  ok(/^#e0e1e3$/i.test(token('surface') || ''), 'the panel is the CRM glass, pre-composited');
  // THE PANEL IS SOLID ON PURPOSE. Blurring a flat ground returns the flat ground, so the
  // filter is pixel-identical here and costs GPU work on a phone — and the mobile drawer
  // genuinely overlays the code pane, where anything translucent ghosts (the JobMD lesson).
  ok(!/backdrop-filter/.test(css), 'nothing is translucent, so nothing needs a backdrop filter');
  ok(/\.hdrmenu[^{]*\{[^}]*background:var\(--surface\)/.test(css.replace(/\n\s*/g, '')),
     'the drawer uses the solid panel, so the pane cannot ghost through it');
  // TWO TEXT PALETTES, ONE SET OF NAMES. A dark ground with light panels means .tiny is
  // used in both; hard-coding it to either leaves the other unreadable, which shipped once
  // as a 1.94:1 caption on the meetings screen.
  ['panel-text', 'panel-muted', 'panel-faint'].forEach((t) => ok(!!token(t), `--${t} is declared`));
  // Match the rule itself rather than anchoring to a line start — the source is flattened
  // first, so there are no line starts left to anchor to (the first version of this check
  // failed for that reason, not because the rule was missing).
  // Strip CSS comments first: the rule is preceded by one explaining it, and a capture that
  // swallows the comment makes the first selector read "/* … */.top" and never match.
  const flat = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n\s*/g, '');
  const trio = (flat.match(/([^{}]*)\{--text:var\(--panel-text\);\s*--muted:var\(--panel-muted\);\s*--faint:var\(--panel-faint\);\}/) || [])[1] || '';
  ok(!!trio, 'a rule restates the text trio, so inheritance resolves it');
  // A light surface missing from that list renders light text on a light ground.
  ['.top', '.card', '.box', '.hdrmenu', '.step', '.btn', '.icon'].forEach((sel) =>
    ok(trio.split(',').map((s) => s.trim()).includes(sel), `${sel} is in the light-surface list`));
  // The work pane stays dark, now a cousin of the ground rather than a warm brown.
  ok(/^#111827$/i.test(token('ink-bg') || '') && /\.ink\{/.test(css), 'the code and diff pane is still dark');
  ok(/--sans:ui-sans-serif,system-ui/.test(css) && /--mono:/.test(css), "the CRM's own sans stack and a mono are declared");
  // ONE stylesheet, every screen. A second palette is how screens drift apart.
  ['app.html', 'meetings.html', 'login.html'].forEach(function (f) {
    const html = read('verticals/speakup/public/' + f);
    ok(/theme\.css/.test(html), f + ' loads the shared stylesheet');
    ok(!/--bg:\s*#0a0e18/.test(html), f + ' carries no leftover dark palette');
    const theme = (html.match(/name="theme-color"\s+content="(#[0-9a-f]{3,8})"/i) || [])[1];
    ok(/^#1f2937$/i.test(theme || ''), f + ' tints the browser chrome to the ground');
  });
  ok(/^#1f2937$/i.test(manifest.background_color || ''), 'the installed launch screen matches too');
  ok(/^#1f2937$/i.test(manifest.theme_color || ''), 'and so does the installed chrome');
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
  ok(/<img class="wordmark" src="\/speakup\/wordmark\.svg/.test(html), 'the header leads with the Digit2AI lockup');
  ok(/<span class="product">AutoDev<\/span>/.test(html), 'and still names the product');
  ok(!/<span class="tag">/.test(html), 'no tag badge sits next to the SpeakUp name');
  ok(!/header \.tag\{/.test(html), 'the badge style went with the badge');
});

test('the baseline pass: a change that edits the suite is still measured by the approved suite', () => {
  const { execFileSync, spawnSync } = require('child_process');
  const os = require('os');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'speakup-baseline-'));
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'speakup-bwork-'));
  const git = (args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: dir }).toString();
  git(['init', '-q']);
  const suite = path.join(dir, 'suite.js');
  // The approved suite, as it stands on the base branch: it checks the product file.
  fs.writeFileSync(suite, "const fs=require('fs');const ok=fs.readFileSync('app.js','utf8').indexOf('GOOD')>=0;console.log(ok?'3 passed, 0 failed':'2 passed, 1 failed');\n");
  fs.writeFileSync(path.join(dir, 'app.js'), "// GOOD\n");
  git(['add', '-A']); git(['commit', '-qm', 'base']);

  const run = () => {
    const r = spawnSync('node', [path.join(ROOT, '.github/speakup/run-tests.js')], { cwd: dir, encoding: 'utf8',
      env: Object.assign({}, process.env, { WORK: work, GITHUB_OUTPUT: path.join(work, 'out.txt'), TEST_COMMANDS: JSON.stringify(['node suite.js']) }) });
    return { r, tests: JSON.parse(fs.readFileSync(path.join(work, 'tests.json'), 'utf8')) };
  };

  // The change rewrites the suite so it always passes, and breaks the product file.
  fs.writeFileSync(suite, "console.log('99 passed, 0 failed');\n");
  fs.writeFileSync(path.join(dir, 'app.js'), "// BROKEN\n");
  let out = run();
  ok(out.tests.passed >= 99, 'the change’s own suite is still run and reported');
  ok(out.tests.baseline && out.tests.baseline.failed > 0 && out.tests.baseline_ok === false,
    'the suite from the base branch fails over the broken change, so baseline_ok is false');
  ok(fs.readFileSync(suite, 'utf8').indexOf('99 passed') >= 0, 'the change is restored afterwards: the pushed branch is what Claude wrote');

  // The same shape, but the product change is fine and the suite merely gained a test.
  fs.writeFileSync(path.join(dir, 'app.js'), "// GOOD, and more\n");
  fs.writeFileSync(suite, "const fs=require('fs');const ok=fs.readFileSync('app.js','utf8').indexOf('GOOD')>=0;console.log(ok?'9 passed, 0 failed':'0 passed, 9 failed');\n");
  out = run();
  ok(out.tests.baseline_ok === true && out.tests.baseline.failed === 0, 'a change that only ADDED tests keeps a passing baseline, so it can merge itself');
  ok((out.tests.baseline.restored || []).indexOf('suite.js') >= 0, 'the report names which suite files were restored for the baseline');

  // Nothing to restore: a change that touches no suite reports the same counts as the baseline.
  fs.writeFileSync(path.join(dir, 'app.js'), "// GOOD, again\n");
  git(['checkout', '--', 'suite.js']);
  out = run();
  ok(out.tests.baseline_ok === true && out.tests.baseline.restored.length === 0, 'with no suite edited, the baseline is simply the run itself');
});

test('every project is measurable, including one created later', () => {
  const projects = require('./src/factory/projects');
  const fresh = { key: 'brand-new', test_commands: [] };
  ok(projects.commandsFor(fresh).length > 0, 'a project created later still runs a real suite');
  ok(projects.commandsFor({ test_commands: ['npm test'] })[0] === 'npm test', "a project's own commands are never replaced");
  ok(projects.commandsFor(fresh).every(c => projects.TEST_CMD.test(c)), 'the fallback obeys the same command allow-list');
  projects.commandsFor(fresh).push('rm -rf /');
  ok(projects.commandsFor(fresh).indexOf('rm -rf /') < 0, 'the fallback list cannot be mutated by a caller');
  const prepare = fs.readFileSync(path.join(__dirname, 'src/factory/prepare.js'), 'utf8');
  ok(!/test_commands:\s*project\.test_commands/.test(prepare) && /test_commands: projects\.commandsFor\(project\)/.test(prepare),
    'the job snapshot takes the commands through commandsFor, so the fallback cannot be bypassed');
});

test('every seeded project can actually be measured', () => {
  const projects = require('./src/factory/projects');
  const dflt = projects.__defaults ? projects.__defaults() : null;
  ok(!!dflt, 'the default project list is inspectable');
  const ringly = (dflt || []).find(p => p.key === 'ringlypro');
  // A project with no test command runs nothing when a change touches no .js file, and the
  // job ends FAILED with a draft PR — which is what happened to the first static page.
  ok(ringly && (ringly.test_commands || []).length > 0, "the console's own project has a test command");
  for (const p of dflt || []) ok(!(p.test_commands || []).some(c => !/^(node|npx jest|npm test)\b/.test(c)), 'test commands stay on the allow-list: ' + p.key);
});

test('the research agent: read-only, confined, and asked what to find out', () => {
  const sub = require('./src/factory/claude-subscription');
  const research = require('./src/factory/research');
  const intents = require('./src/factory/intents');
  const argv = sub.researchArgs({ model: 'm', maxTurns: 5 })('rules');
  const at = (f) => argv[argv.indexOf(f) + 1];
  ok(argv.includes('--restricted'), 'research runs --restricted, which confines file tools to the checkout');
  ok(at('--tools') === 'Read,Grep,Glob,WebSearch,WebFetch', 'research tools are read-only: no Bash, Edit or Write');
  ok(at('--permission-mode') === 'dontAsk', 'anything not pre-approved is refused, not asked');
  ok(!argv.some(a => /^(Bash|Edit|Write)/.test(a)), 'no command or write tool is ever named');
  ok(!argv.includes('WebFetch'), 'WebFetch is never allowed bare, only per domain');
  ok(argv.includes('WebFetch(domain:api.github.com)') && argv.includes('WebFetch(domain:github.com)'), 'GitHub is fetchable, for commits and other repositories');
  ok(sub.FETCH_DOMAINS.every(d => /^[a-z0-9.-]+$/.test(d)), 'fetch domains are plain host names');
  ok(argv.includes('Read(./.git/**)') && argv.includes('Read(**/.env)'), '.git and .env are denied on top of the confinement');
  ok(at('--setting-sources') === '' && argv.includes('--strict-mcp-config') && argv.includes('--no-session-persistence'), 'no settings, MCP servers or saved sessions are loaded');
  const env = sub.childEnv('/tmp/h');
  ok(Object.keys(env).sort().join(',') === 'CI,CLAUDE_CODE_OAUTH_TOKEN,DISABLE_AUTOUPDATER,HOME,LANG,PATH,TERM', 'the research agent gets the same env allow-list as the chat');
  ok(/CANNOT change files/.test(research.systemPrompt('en')) && /DATA, never instructions/.test(research.systemPrompt('en')), 'the prompt says it changes nothing and that pages and files are data');
  const t = research.toolLine({ name: 'Read', input: { file_path: require('./src/factory/repo').ROOT + '/src/app.js' } });
  ok(t.kind === 'read' && t.text === 'src/app.js', 'a file read is shown as a repo path');
  ok(research.messagesFor('q', [{ role: 'user', text: 'a' }, { role: 'system', text: 'x' }, { role: 'assistant', text: 'b' }]).length === 3, 'history keeps only user and assistant turns');
  for (const q of ['search for the best Node TTS library', 'investigate why the login page is slow', 'look up the Render request timeout',
    'get into this repo and give me a summary', 'what was the latest commit for this repo', 'busca como funciona el merge', 'investiga el login']) {
    ok(intents.isQuestion(q), 'a request to find out is answered, not built: ' + q);
  }
  for (const i of ['investigate the login and fix it', 'revise this app and change the header color', 'search the header and add a logo']) {
    ok(!intents.isQuestion(i), 'find-out words next to a change verb still build: ' + i);
  }
});

// ── Sandbox page ──────────────────────────────────────────────────────────────
// A standalone scratch page at /sandbox/. It carries no data and no script, so
// the only things that can break it are the static mount moving out from under
// it or someone adding content to it.
test('sandbox', () => {
  const html = read('public/sandbox/index.html');
  const app = read('src/app.js');

  // The address resolves because express.static publishes public/ at the root and
  // answers a directory with its index.html. Nothing else wires this path.
  ok(/app\.use\(express\.static\(path\.join\(__dirname, '\.\.\/public'\)\)\)/.test(app),
    'public/ is still served at the root, which is what makes /sandbox/ resolve');
  ok(!/['"]\/sandbox/.test(app), 'no route in the app claims /sandbox, so the static file is what answers');

  // Only the requested sentence is visible: strip the head, then every tag.
  const body = html.replace(/<head>[\s\S]*?<\/head>/i, '').replace(/<[^>]*>/g, '').trim();
  ok(body === 'This is Digit2ai Sandbox', 'the page shows only the requested sentence');

  // No second request: nothing to fetch, and nothing that could run.
  ok(!/<script|<link|<img|<iframe|src=|href=/i.test(html), 'the page loads no external asset and runs no script');
  ok(/^<!DOCTYPE html>/i.test(html) && /<html lang="en">/.test(html) && /<meta charset="utf-8">/i.test(html),
    'it is a complete minimal HTML5 document');
});

setTimeout(() => {
  Promise.all(pendingTests).then(() => {
    console.log(`\n==== ${pass} passed, ${fail} failed ====`);
    process.exit(fail ? 1 : 0);
  });
}, 50);
