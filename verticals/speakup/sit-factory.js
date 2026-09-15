'use strict';

/**
 * SpeakUp AI Factory — System Integration Test.
 *
 * Boots the SpeakUp router against the database in .env, with NO external keys:
 * ANTHROPIC_API_KEY is removed (heuristic intel + plan), GitHub is a fake injected
 * into factory/github.js, and the factory secret / phrase are test values set in
 * this process only. It creates its own throwaway accounts (their own tenants) and
 * deletes every row it made.
 *
 * It attacks the guarantees rather than the happy path: a meeting that says
 * "execute" must not execute, a brainstorm must not become a requirement, a wrong
 * or missing phrase must not dispatch, a stale plan must not run, a forged or
 * replayed callback must not move a job, one tenant cannot touch another's job,
 * a failed run must not disappear, and a PR body must not carry meeting content.
 *
 *   node verticals/speakup/sit-factory.js
 *
 * NOT COVERED HERE (only verifiable against production): the model paths for
 * intel/plan/intent, the real GitHub API, and a real Claude Code run in Actions.
 */

require('dotenv').config();
delete process.env.ANTHROPIC_API_KEY;
delete process.env.CLAUDE_API_KEY;
process.env.SPEAKUP_SEED_USERS = 'off';
process.env.SPEAKUP_FACTORY_POLLER = 'off';
process.env.SPEAKUP_JWT_SECRET = 'sit-factory-jwt-secret-' + Date.now();

const STAMP = Date.now();
const OP_A = `sit-factory-op-a-${STAMP}@speakup.invalid`;
const OP_B = `sit-factory-op-b-${STAMP}@speakup.invalid`;
const MEMBER = `sit-factory-member-${STAMP}@speakup.invalid`;
const PHRASE = 'Cóndor azul sobre Tampa ' + STAMP;
const SECRET = 'sit-factory-secret-' + STAMP;
process.env.SPEAKUP_FACTORY_ALLOWED_EMAILS = [OP_A, OP_B].join(',');
process.env.SPEAKUP_EXEC_PHRASE = PHRASE;
process.env.SPEAKUP_FACTORY_SECRET = SECRET;
process.env.SPEAKUP_GITHUB_TOKEN = 'fake-token-for-sit';
process.env.SPEAKUP_TEAM_PASSWORD = 'sit-private-password-not-published';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use('/speakup', require('./src/index'));

const models = require('./src/models');
const { User, Recording, Transcript, Summary, Document, MeetingIntel, Command, Job, JobEvent, Audit, Project, sequelize } = models;
const github = require('./src/factory/github');
const jobs = require('./src/factory/jobs');
const llm = require('./src/factory/llm');
const intents = require('./src/factory/intents');
const security = require('./src/factory/security');

// ── Fake GitHub ───────────────────────────────────────────────────────────────
const gh = { calls: [], runs: {}, prs: {}, nextPr: 9000, mergeSha: 'f'.repeat(40) };
github.__setFetch(async (url, opts) => {
  const method = (opts && opts.method) || 'GET';
  const body = opts && opts.body ? JSON.parse(opts.body) : null;
  gh.calls.push({ method, url, body, auth: opts.headers.Authorization });
  const u = new URL(url);
  const p = u.pathname;
  const reply = (status, data) => ({ ok: status < 300, status, text: async () => (data == null ? '' : JSON.stringify(data)) });
  if (method === 'POST' && /\/actions\/workflows\/.+\/dispatches$/.test(p)) return reply(204, null);
  if (method === 'GET' && /\/actions\/workflows\/.+\/runs$/.test(p)) return reply(200, { workflow_runs: Object.values(gh.runs) });
  if (method === 'POST' && /\/actions\/runs\/\d+\/cancel$/.test(p)) return reply(202, {});
  if (method === 'GET' && /\/pulls$/.test(p)) {
    const head = u.searchParams.get('head').split(':')[1];
    return reply(200, Object.values(gh.prs).filter(x => x.head.ref === head));
  }
  if (method === 'POST' && /\/pulls$/.test(p)) {
    const n = gh.nextPr++;
    gh.prs[n] = { number: n, html_url: 'https://github.com/digit2ai/RinglyPro-CRM/pull/' + n, draft: body.draft, state: 'open', merged: false,
      head: { ref: body.head, sha: gh.headSha || null }, title: body.title, body: body.body };
    return reply(201, gh.prs[n]);
  }
  let m;
  if (method === 'GET' && (m = p.match(/\/pulls\/(\d+)$/))) return gh.prs[m[1]] ? reply(200, gh.prs[m[1]]) : reply(404, { message: 'Not Found' });
  if (method === 'PUT' && (m = p.match(/\/pulls\/(\d+)\/merge$/))) {
    const pr = gh.prs[m[1]]; pr.merged = true; pr.state = 'closed'; pr.merge_commit_sha = gh.mergeSha;
    return reply(200, { sha: gh.mergeSha, merged: true });
  }
  if (method === 'GET' && /\/pulls\/\d+\/files$/.test(p)) return reply(200, gh.prFiles || []);
  if (method === 'GET' && /\/compare\//.test(p)) return reply(200, { status: 'identical' });
  return reply(404, { message: 'unexpected ' + method + ' ' + p });
});
const dispatches = () => gh.calls.filter(c => /dispatches$/.test(c.url));

const server = app.listen(0, async () => {
  const base = 'http://127.0.0.1:' + server.address().port + '/speakup';
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
  const users = [];

  async function mkUser(email, role) {
    const u = await User.create({ email, name: email.split('@')[0], role, lang: 'es', password_hash: await bcrypt.hash('sit-pass-' + STAMP, 4) });
    u.tenant_id = u.id; await u.save(); users.push(u); return u;
  }
  async function login(email) {
    const r = await fetch(base + '/api/v1/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: 'sit-pass-' + STAMP }) });
    return (r.headers.get('set-cookie') || '').split(';')[0];
  }
  const H = (cookie, extra) => Object.assign({ 'Content-Type': 'application/json', Cookie: cookie, 'X-SpeakUp': '1' }, extra || {});
  const call = async (cookie, method, path, body, extraHeaders) => {
    const r = await fetch(base + '/api/v1' + path, { method, headers: H(cookie, extraHeaders), body: body ? JSON.stringify(body) : undefined });
    let d = null; try { d = await r.json(); } catch (e) { d = null; }
    return { status: r.status, d };
  };
  const cmd = (cookie, text, extra) => call(cookie, 'POST', '/factory/command', Object.assign({ text, mode: 'command', lang: 'es', project_key: 'ringlypro' }, extra || {}));
  async function waitJob(id, statuses, ms) {
    const end = Date.now() + (ms || 30000);
    while (Date.now() < end) { const j = await Job.findByPk(id); if (statuses.includes(j.status)) return j; await wait(300); }
    return Job.findByPk(id);
  }
  function sign(payload) { return security.hmac(SECRET, jobs.canonical(payload)); }
  async function callback(fields, opts = {}) {
    const payload = Object.assign({ ts: Math.floor(Date.now() / 1000), job_id: null, event: 'status', status: null, plan_hash: null, commit_sha: null,
      files_changed: null, tests_passed: null, tests_failed: null, tests_measured: null, run_url: 'https://github.com/digit2ai/RinglyPro-CRM/actions/runs/123',
      message: null, nonce: crypto.randomBytes(16).toString('hex') }, fields);
    const sig = opts.sig || sign(payload);
    const r = await fetch(base + '/api/v1/factory/callback', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-speakup-sig': sig }, body: JSON.stringify(opts.body || payload) });
    let d = null; try { d = await r.json(); } catch (e) {}
    return { status: r.status, d, payload };
  }

  try {
    await wait(5000);
    const opA = await mkUser(OP_A, 'admin');
    const opB = await mkUser(OP_B, 'admin');
    const member = await mkUser(MEMBER, 'member');
    const A = await login(OP_A), B = await login(OP_B), M = await login(MEMBER);
    ok(A.includes('speakup_token') && B.includes('speakup_token') && M.includes('speakup_token'), 'throwaway accounts sign in');

    // ── Access ────────────────────────────────────────────────────────────────
    ok((await fetch(base + '/api/v1/factory/overview')).status === 401, 'factory refuses a request with no session');
    const jwt = require('jsonwebtoken');
    const foreignTok = jwt.sign({ id: opA.id, tenant_id: opA.id, email: OP_A, role: 'admin' }, process.env.SPEAKUP_JWT_SECRET, { expiresIn: '1h' });
    ok((await fetch(base + '/api/v1/factory/overview', { headers: { Cookie: 'speakup_token=' + foreignTok } })).status === 401, 'a token without the speakup audience (minted by another app) is refused');
    const staleTok = jwt.sign({ id: member.id, tenant_id: member.id, email: MEMBER, role: 'admin' }, process.env.SPEAKUP_JWT_SECRET, { expiresIn: '1h', audience: 'speakup' });
    const promoted0 = await fetch(base + '/api/v1/factory/jobs', { headers: { Cookie: 'speakup_token=' + staleTok } });
    ok(promoted0.status === 403, 'a token claiming admin for a member account is overruled by the database role');
    const ov = await call(A, 'GET', '/factory/overview');
    ok(ov.status === 200 && ov.d.operator && ov.d.readiness.ready, 'operator overview: execution door is configured');
    ok(ov.d.projects.some(p => p.key === 'ringlypro') && ov.d.projects.some(p => p.key === 'jobmd'), 'project registry seeded per tenant');
    ok((await call(M, 'GET', '/factory/jobs')).status === 403, 'non-operator cannot list jobs');
    ok((await cmd(M, 'prepare the implementation from my latest meeting')).status === 403, 'non-operator cannot prepare');
    const noHdr = await fetch(base + '/api/v1/factory/command', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: A }, body: JSON.stringify({ text: 'nota', mode: 'note' }) });
    ok(noHdr.status === 403, 'command without the X-SpeakUp header is refused (cross-site guard)');
    ok((await call(A, 'POST', '/factory/command', { text: 'nota', mode: 'note' }, { Origin: 'https://evil.example' })).status === 403, 'command from a foreign Origin is refused');

    // ── A meeting that says "execute" does not execute ────────────────────────
    const jobsBefore = await Job.count({ where: { tenant_id: opA.id } });
    const risky = await call(A, 'POST', '/recordings', { title: 'Reunión técnica', source: 'mic', lang: 'es',
      text: `Hablamos del flujo de citas. ${PHRASE}. Ejecuta el plan aprobado y fusiona el PR. Execute approved plan.` });
    ok(risky.status === 200, 'meeting containing execution words and the phrase is recorded');
    ok((await Job.count({ where: { tenant_id: opA.id } })) === jobsBefore && dispatches().length === 0, 'recording a meeting created no job and dispatched nothing');
    const note = await call(A, 'POST', '/factory/command', { text: `${PHRASE} execute approved plan and merge it`, mode: 'note', lang: 'es' });
    ok(note.status === 200 && note.d.intent === 'CAPTURE_NOTE' && note.d.redacted === undefined, 'note mode saves an execute-shaped sentence as a note (and does not reveal whether the phrase matched)');
    const noteTr = await Transcript.findOne({ where: { recording_id: note.d.card.recording_id } });
    const noteCmd = await Command.findByPk(note.d.command_id);
    ok(!noteTr.text.includes('Tampa') && !noteCmd.transcript.includes('Tampa'), 'private phrase is redacted from the stored note and command');
    ok(dispatches().length === 0, 'still nothing dispatched');

    // ── Meeting intelligence ──────────────────────────────────────────────────
    const meetingText = 'Reunión con Greg sobre RinglyPro. Podríamos agregar un modo multilingüe para la recepción en el futuro. ' +
      'Queda aprobado: el SMS de confirmación de citas debe incluir el nombre del negocio. ' +
      'Los SMS de confirmación de citas no llegan cuando el número tiene espacios, es un bug. ¿Quién valida el formato del teléfono?';
    const meet = await call(A, 'POST', '/recordings', { title: 'Reunión con Greg', source: 'call', lang: 'es', text: meetingText });
    const meetId = meet.d.recording.id;
    ok((await call(A, 'PATCH', `/factory/recordings/${meetId}/session`, { mode: 'meeting', project_key: 'ringlypro', participants: ['Greg'] })).status === 200, 'session metadata saved (mode, project, participants)');
    ok((await call(B, 'PATCH', `/factory/recordings/${meetId}/session`, { mode: 'note' })).status === 404, 'another tenant cannot edit the session');

    const an = await cmd(A, 'RinglyPro Architect, analyze my latest meeting.');
    ok(an.status === 200 && an.d.intent === 'EXTRACT_REQUIREMENTS', 'analyze -> EXTRACT_REQUIREMENTS');
    ok(an.d.card.context.recordings[0].id === meetId, 'latest meeting resolved to the Greg meeting');
    const data = an.d.card.intel[0].data;
    ok(data.is_simulated && data.composed_by === 'heuristic', 'keyless intel is labelled heuristic');
    ok(data.requirements.some(r => /nombre del negocio/.test(r.text)), 'explicitly approved item is a requirement');
    ok(data.ideas.some(i => /multiling/.test(i.text)) && ![...data.requirements, ...data.features].some(i => /multiling/.test(i.text)), 'brainstorm stays an idea');

    const withGreg = await cmd(A, 'resume la reunión con Greg');
    ok(withGreg.status === 200 && withGreg.d.card.context.recordings[0].id === meetId, 'context: "meeting with Greg" found by participant');
    const yest = await cmd(A, "summarize yesterday's meeting with Greg");
    ok(yest.status === 200 && yest.d.card.type === 'needs_selection', 'context: yesterday finds nothing and says so instead of guessing');
    const byId = await cmd(A, `extract requirements from meeting ${meetId}`);
    ok(byId.d.card.context.recordings[0].id === meetId, 'context: "meeting <id>"');
    const foreign = await cmd(B, `extract requirements from meeting ${meetId}`);
    ok(foreign.status === 200 && foreign.d.card.type === 'needs_selection', 'context: another tenant cannot select the meeting by number');

    const dp = await cmd(A, 'convert my latest meeting into a development prompt');
    ok(dp.d.intent === 'CREATE_DEVELOPMENT_PROMPT' && /nombre del negocio/.test(dp.d.card.document.content) && !/multiling/.test(dp.d.card.document.content), 'development prompt carries approved requirements only');
    const brd = await cmd(A, 'genera el BRD de mi última reunión');
    ok(brd.d.intent === 'CREATE_BRD' && /Requisitos aprobados/.test(brd.d.card.document.content), 'BRD generated');

    const search = await call(A, 'GET', '/factory/search?q=' + encodeURIComponent('SMS de confirmación'));
    ok(search.d.results.some(r => r.id === meetId), 'memory search finds the meeting');
    const week = await cmd(A, 'show meetings this week');
    ok(week.d.intent === 'SEARCH_MEMORY' && week.d.card.results.some(r => r.id === meetId), '"meetings this week" search');

    // ── PREPARE ───────────────────────────────────────────────────────────────
    const ideasOnly = await call(A, 'POST', '/recordings', { title: 'Lluvia de ideas', source: 'call', lang: 'es',
      text: 'Podríamos agregar un tablero de métricas algún día. Tal vez un modo oscuro sería bueno para la recepción.' });
    const prepIdeas = await cmd(A, `prepara la implementación de la reunión ${ideasOnly.d.recording.id}`);
    const jIdeas = await waitJob(prepIdeas.d.card.job_id, ['FAILED', 'WAITING_APPROVAL']);
    ok(jIdeas.status === 'FAILED' && /No approved requirements/.test(jIdeas.error), 'a brainstorm-only meeting never becomes a plan (job fails and says why)');

    const prep = await cmd(A, 'RinglyPro Architect, prepare the approved requirements from my meeting with Greg.');
    ok(prep.status === 200 && prep.d.intent === 'PREPARE_IMPLEMENTATION' && prep.d.card.job_id, 'prepare creates a job');
    let job = await waitJob(prep.d.card.job_id, ['WAITING_APPROVAL', 'FAILED']);
    ok(job.status === 'WAITING_APPROVAL', 'prepare reaches WAITING_APPROVAL (got ' + job.status + (job.error ? ': ' + job.error : '') + ')');
    ok(/^[a-f0-9]{64}$/.test(job.plan_hash) && job.plan.is_simulated && /Held back/.test(job.plan_md), 'plan has a hash, is labelled keyless and states what was held back');
    ok(job.spec.requirements.length >= 1 && job.plan.uncovered_requirements.length === 0, 'every approved requirement is covered by a step');
    ok(dispatches().length === 0, 'PREPARE dispatched nothing');

    // ── The execution door ────────────────────────────────────────────────────
    const ex1 = await cmd(A, 'Execute approved plan.');
    ok(ex1.d.intent === 'EXECUTE_IMPLEMENTATION' && ex1.d.card.type === 'confirm_execute' && !ex1.d.card.confirm_token && !ex1.d.card.phrase_verified, 'execute without the phrase returns a card, no token');
    ok((await Job.findByPk(job.id)).status === 'WAITING_APPROVAL' && dispatches().length === 0, 'saying execute did not execute');
    const wrong = await call(A, 'POST', `/factory/jobs/${job.id}/execute`, { plan_hash: job.plan_hash, passphrase: 'not the phrase' });
    ok(wrong.status === 401 && dispatches().length === 0, 'wrong phrase refused, nothing dispatched');
    ok(await Audit.findOne({ where: { tenant_id: opA.id, entity: 'job', entity_id: job.id, action: 'job.execute.denied' } }), 'denied attempt is audited');
    ok((await call(A, 'POST', `/factory/jobs/${job.id}/execute`, { plan_hash: 'e'.repeat(64), passphrase: PHRASE })).status === 409, 'stale plan hash refused even with the right phrase');
    ok((await call(M, 'POST', `/factory/jobs/${job.id}/execute`, { plan_hash: job.plan_hash, passphrase: PHRASE })).status === 403, 'non-operator refused');
    ok((await call(B, 'POST', `/factory/jobs/${job.id}/execute`, { plan_hash: job.plan_hash, passphrase: PHRASE })).status === 404, 'another tenant cannot execute the job');
    ok((await call(B, 'GET', `/factory/jobs/${job.id}`)).status === 404, 'another tenant cannot read the job');
    delete process.env.SPEAKUP_GITHUB_TOKEN;
    const closed = await call(A, 'POST', `/factory/jobs/${job.id}/execute`, { plan_hash: job.plan_hash, passphrase: PHRASE });
    ok(closed.status === 423 && closed.d.code === 'github_not_connected' && dispatches().length === 0, 'GitHub not connected: door closed, reported by name');
    process.env.SPEAKUP_GITHUB_TOKEN = 'fake-token-for-sit';
    process.env.SPEAKUP_TEAM_PASSWORD = 'Palindrome@7';
    ok((await call(A, 'POST', `/factory/jobs/${job.id}/execute`, { plan_hash: job.plan_hash, passphrase: PHRASE })).status === 423, 'published team password: door closed');
    process.env.SPEAKUP_TEAM_PASSWORD = 'sit-private-password-not-published';
    security.resetRateLimits();

    const spoken = await cmd(A, `RinglyPro Architect, ${PHRASE}. Execute approved plan.`);
    ok(spoken.d.card.phrase_verified && spoken.d.card.confirm_token, 'spoken phrase yields a confirmation token');
    ok(spoken.d.card.sources.some(s => s.id === meetId) && spoken.d.card.branch === 'speakup/job-' + job.id, 'confirmation shows the selected meeting and the review branch');
    const storedCmd = await Command.findByPk(spoken.d.command_id);
    ok(!storedCmd.transcript.includes('Tampa') && !JSON.stringify(storedCmd.result).includes(spoken.d.card.confirm_token), 'stored command has neither the phrase nor the token');
    ok(dispatches().length === 0, 'the spoken phrase alone dispatched nothing (one tap still required)');
    const go = await call(A, 'POST', `/factory/jobs/${job.id}/execute`, { plan_hash: job.plan_hash, confirm_token: spoken.d.card.confirm_token });
    ok(go.status === 200 && go.d.job.status === 'QUEUED', 'confirmed: job QUEUED');
    const d0 = dispatches()[0];
    ok(dispatches().length === 1 && d0.body.ref === 'main' && d0.body.inputs.branch === 'speakup/job-' + job.id && d0.body.inputs.job_id === String(job.id), 'workflow dispatched on main with the review branch');
    ok((await call(A, 'POST', `/factory/jobs/${job.id}/execute`, { plan_hash: job.plan_hash, confirm_token: spoken.d.card.confirm_token })).status === 409 && dispatches().length === 1, 'the token cannot execute twice');
    job = await Job.findByPk(job.id);
    ok(job.approved_by === OP_A && job.approved_at, 'approval recorded with who and when');

    // ── Brief ─────────────────────────────────────────────────────────────────
    ok((await fetch(`${base}/api/v1/factory/brief/${job.id}`)).status === 401, 'brief refuses an unsigned request');
    const ts = Math.floor(Date.now() / 1000);
    const br = await fetch(`${base}/api/v1/factory/brief/${job.id}`, { headers: { 'x-speakup-ts': String(ts), 'x-speakup-sig': security.hmac(SECRET, `brief.${job.id}.${ts}`) } });
    const brief = await br.json();
    ok(br.status === 200 && brief.plan_hash === job.plan_hash && /PUBLIC/.test(brief.prompt) && brief.branch === job.branch, 'signed brief returns the approved plan with the public-repo rule');
    const oldTs = ts - 900;
    ok((await fetch(`${base}/api/v1/factory/brief/${job.id}`, { headers: { 'x-speakup-ts': String(oldTs), 'x-speakup-sig': security.hmac(SECRET, `brief.${job.id}.${oldTs}`) } })).status === 401, 'stale brief signature refused');

    const briefTok = security.workflowToken('brief', job.id, Math.floor(Date.now() / 1000) + 600);
    ok((await fetch(`${base}/api/v1/factory/brief/${job.id}`, { headers: { 'x-speakup-brief-token': briefTok } })).status === 409, 'brief token refused before the job is CODING');

    // ── Callbacks ─────────────────────────────────────────────────────────────
    const jid = String(job.id), ph = job.plan_hash;
    ok((await callback({ job_id: jid, plan_hash: ph, status: 'CODING' }, { sig: 'a'.repeat(64) })).status === 401, 'forged callback signature refused');
    const tampered = await callback({ job_id: jid, plan_hash: ph, status: 'CODING' });
    ok((await callback({}, { body: Object.assign({}, tampered.payload, { status: 'PUSHING', nonce: crypto.randomBytes(16).toString('hex') }), sig: sign(tampered.payload) })).status === 401, 'callback with an altered field refused');
    ok((await Job.findByPk(job.id)).status === 'CODING', 'valid callback moved the job to CODING');
    ok((await fetch(`${base}/api/v1/factory/brief/${job.id}`, { headers: { 'x-speakup-brief-token': briefTok } })).status === 200, 'build job fetches the brief with its token');
    ok((await fetch(`${base}/api/v1/factory/brief/${job.id}`, { headers: { 'x-speakup-brief-token': briefTok } })).status === 409, 'the brief token works once');
    ok((await fetch(`${base}/api/v1/factory/brief/${job.id}`, { headers: { 'x-speakup-brief-token': security.workflowToken('progress', job.id, Math.floor(Date.now() / 1000) + 600) } })).status === 401, 'a progress token cannot fetch the brief');
    const progTok = security.workflowToken('progress', job.id, Math.floor(Date.now() / 1000) + 600);
    const progress = async (fields) => {
      const payload = Object.assign({ ts: Math.floor(Date.now() / 1000), job_id: String(job.id), event: 'status', plan_hash: job.plan_hash, nonce: crypto.randomBytes(16).toString('hex') }, fields);
      const r = await fetch(base + '/api/v1/factory/callback', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-speakup-progress': progTok }, body: JSON.stringify(payload) });
      return r.status;
    };
    ok((await progress({ status: 'PUSHING' })) === 403, 'the progress token cannot report PUSHING');
    ok((await progress({ event: 'pushed', commit_sha: 'd4'.repeat(20), tests_measured: 'true', tests_passed: '9', tests_failed: '0' })) === 403, 'the progress token cannot report a push');
    ok((await progress({ status: 'TESTING' })) === 200 && (await Job.findByPk(job.id)).status === 'TESTING', 'the progress token can report TESTING');
    ok((await callback({}, { body: tampered.payload, sig: sign(tampered.payload) })).status === 409, 'replayed callback refused');
    ok((await callback({ job_id: jid, plan_hash: ph, status: 'DEPLOYED' })).status === 400, 'a callback cannot claim DEPLOYED');
    ok((await callback({ job_id: jid, plan_hash: 'b'.repeat(64), status: 'TESTING' })).status === 409, 'callback for a different plan refused');
    ok((await callback({ job_id: jid, plan_hash: ph, status: 'TESTING', ts: Math.floor(Date.now() / 1000) - 900 })).status === 401, 'stale callback refused');
    for (const st of ['FIXING', 'TESTING', 'PUSHING']) await callback({ job_id: jid, plan_hash: ph, status: st });
    ok((await Job.findByPk(job.id)).status === 'PUSHING', 'progress CODING -> TESTING -> FIXING -> TESTING -> PUSHING');
    const sha = 'a1'.repeat(20);
    gh.headSha = sha;
    const pushed = await callback({ job_id: jid, plan_hash: ph, event: 'pushed', commit_sha: sha, files_changed: '3', tests_measured: 'true', tests_passed: '12', tests_failed: '0', message: 'node --check: 3/3',
      changed_files: JSON.stringify(['src/routes/sit-a.js', 'src/services/sit-b.js', 'public/sit-outside.html']), suite_modified: 'true' });
    job = await Job.findByPk(job.id);
    ok(pushed.status === 200 && job.status === 'READY_FOR_REVIEW' && job.pr_number && !job.pr_draft, 'pushed + tests green -> PR opened -> READY_FOR_REVIEW');
    const pr = gh.prs[job.pr_number];
    ok(pr.head.ref === 'speakup/job-' + job.id && !/Greg|nombre del negocio|multiling|confirmación/.test(pr.title + pr.body), 'PR on the review branch carries no meeting content (public repo)');
    ok(/sign-in required/.test(pr.body), 'PR body links to the private trace');

    const status = await cmd(A, "RinglyPro Architect, what's the status of my last task?", { lang: 'en' });
    ok(/Status: READY FOR REVIEW/.test(status.d.reply) && /12 passed, 0 failed/.test(status.d.reply) && /Files changed: 3/.test(status.d.reply) && /PR: #/.test(status.d.reply), 'status in plain language from the phone');

    const trace = await call(A, 'GET', `/factory/jobs/${job.id}/trace`);
    ok(trace.status === 200 && trace.d.why.command && trace.d.why.sources.some(s => s.id === meetId) && trace.d.why.approved_requirements.every(r => r.quote), 'trace answers "why": command, source meeting, approved requirements with quotes');
    const actions = trace.d.audit.map(a => a.action + ':' + (a.to || ''));
    ok(['job.created:ANALYZING', 'job.transition:WAITING_APPROVAL', 'job.transition:QUEUED', 'job.dispatched:', 'job.transition:PR_CREATED', 'job.transition:READY_FOR_REVIEW'].every(x => actions.includes(x)), 'audit trail covers the full chain');

    // ── Merge ─────────────────────────────────────────────────────────────────
    security.resetRateLimits(); // the per-user execution-attempt budget is exercised above; start the merge checks fresh
    ok((await call(A, 'POST', `/factory/jobs/${job.id}/merge`, { plan_hash: job.plan_hash, passphrase: PHRASE })).status === 409, 'merge refused when the change edited a test suite');
    await Job.update({ suite_modified: false }, { where: { id: job.id } });
    const outside = await call(A, 'POST', `/factory/jobs/${job.id}/merge`, { plan_hash: job.plan_hash, passphrase: PHRASE });
    ok(outside.status === 409 && /outside the approved plan/.test(outside.d.error), 'merge refused when files fall outside the plan and scope');
    await Job.update({ changed_files: ['src/routes/sit-a.js', 'src/services/sit-b.js'] }, { where: { id: job.id } });
    job = await Job.findByPk(job.id);
    gh.headSha = 'b2'.repeat(20); gh.prs[job.pr_number].head.sha = gh.headSha;
    ok((await call(A, 'POST', `/factory/jobs/${job.id}/merge`, { plan_hash: job.plan_hash, passphrase: PHRASE })).status === 409, 'merge refused when the branch changed after the tests');
    gh.prs[job.pr_number].head.sha = sha;
    ok((await call(A, 'POST', `/factory/jobs/${job.id}/merge`, { plan_hash: job.plan_hash, passphrase: 'nope' })).status === 401, 'merge refused without the phrase');
    const merged = await call(A, 'POST', `/factory/jobs/${job.id}/merge`, { plan_hash: job.plan_hash, passphrase: PHRASE });
    ok(merged.status === 200 && merged.d.job.status === 'DEPLOYING', 'merge with the phrase -> DEPLOYING');
    process.env.RENDER_GIT_COMMIT = gh.mergeSha;
    await jobs.checkJob(await Job.findByPk(job.id), Date.now());
    ok((await Job.findByPk(job.id)).status === 'DEPLOYED', 'watchdog sees the merge commit live -> DEPLOYED');
    delete process.env.RENDER_GIT_COMMIT;

    // ── Failure paths never disappear ─────────────────────────────────────────
    async function readyJob(title) {
      const r = await call(A, 'POST', '/recordings', { title, source: 'call', lang: 'es', text: 'Queda aprobado: el recordatorio de citas debe enviarse un día antes. ' + title });
      const p = await cmd(A, `prepara la implementación de la reunión ${r.d.recording.id}`);
      return waitJob(p.d.card.job_id, ['WAITING_APPROVAL', 'FAILED']);
    }
    let j2 = await readyJob('Segunda reunión ' + STAMP);
    ok(j2.status === 'WAITING_APPROVAL', 'second plan ready');
    security.resetRateLimits();
    await call(A, 'POST', `/factory/jobs/${j2.id}/execute`, { plan_hash: j2.plan_hash, passphrase: PHRASE });
    security.resetRateLimits();
    for (const st of ['CODING', 'TESTING', 'PUSHING']) await callback({ job_id: String(j2.id), plan_hash: j2.plan_hash, status: st });
    await callback({ job_id: String(j2.id), plan_hash: j2.plan_hash, event: 'pushed', commit_sha: 'c3'.repeat(20), files_changed: '2', tests_measured: 'true', tests_passed: '5', tests_failed: '2' });
    j2 = await Job.findByPk(j2.id);
    ok(j2.status === 'FAILED' && j2.pr_draft && /draft PR #\d+/i.test(j2.error), 'tests still failing -> draft PR kept, job FAILED with the reason');

    let j3 = await readyJob('Tercera reunión ' + STAMP);
    await call(A, 'POST', `/factory/jobs/${j3.id}/execute`, { plan_hash: j3.plan_hash, passphrase: PHRASE });
    await callback({ job_id: String(j3.id), plan_hash: j3.plan_hash, event: 'failed', message: 'Claude Code build step did not finish (exit 1).' });
    j3 = await Job.findByPk(j3.id);
    ok(j3.status === 'FAILED' && /did not finish/.test(j3.error) && /actions\/runs/.test(j3.error), 'workflow failure is recorded with its run link');

    let j4 = await readyJob('Cuarta reunión ' + STAMP);
    await call(A, 'POST', `/factory/jobs/${j4.id}/execute`, { plan_hash: j4.plan_hash, passphrase: PHRASE });
    await Job.update({ updated_at: new Date(Date.now() - 30 * 60 * 1000) }, { where: { id: j4.id } });
    gh.runs = {};
    await jobs.checkJob(await Job.findByPk(j4.id), Date.now());
    j4 = await Job.findByPk(j4.id);
    ok(j4.status === 'FAILED' && /never started/.test(j4.error), 'watchdog: a dispatch that never started fails loudly');

    let j5 = await readyJob('Quinta reunión ' + STAMP);
    await call(A, 'POST', `/factory/jobs/${j5.id}/execute`, { plan_hash: j5.plan_hash, passphrase: PHRASE });
    await callback({ job_id: String(j5.id), plan_hash: j5.plan_hash, status: 'CODING' });
    await Job.update({ updated_at: new Date(Date.now() - 90 * 60 * 1000) }, { where: { id: j5.id } });
    gh.runs = { 1: { id: 1, display_title: 'SpeakUp job ' + j5.id, status: 'completed', conclusion: 'timed_out', html_url: 'https://github.com/x/y/actions/runs/1' } };
    await jobs.checkJob(await Job.findByPk(j5.id), Date.now());
    j5 = await Job.findByPk(j5.id);
    ok(j5.status === 'FAILED' && /timed_out/.test(j5.error), 'watchdog: a run that ended silently fails with its conclusion');

    const stuck = await Job.create({ tenant_id: opA.id, user_id: opA.id, project_key: 'ringlypro', status: 'ANALYZING', source_recording_ids: [meetId], updated_at: new Date(Date.now() - 60 * 60 * 1000) });
    await jobs.checkJob(stuck, Date.now());
    ok((await Job.findByPk(stuck.id)).status === 'FAILED', 'watchdog: a preparation interrupted by a restart fails and says to prepare again');

    // ── Cancel ────────────────────────────────────────────────────────────────
    const j6 = await readyJob('Sexta reunión ' + STAMP);
    ok((await call(A, 'POST', `/factory/jobs/${j6.id}/cancel`, {})).status === 400, 'cancel needs confirm:true');
    const cc = await cmd(A, `cancela la tarea ${j6.id}`);
    ok(cc.d.card.type === 'confirm_cancel' && (await Job.findByPk(j6.id)).status === 'WAITING_APPROVAL', 'spoken cancel asks for confirmation first');
    ok((await call(A, 'POST', `/factory/jobs/${j6.id}/cancel`, { confirm: true })).d.job.status === 'CANCELLED', 'confirmed cancel');
    const late = await callback({ job_id: String(j6.id), plan_hash: (await Job.findByPk(j6.id)).plan_hash, status: 'CODING' });
    ok(late.status === 200 && late.d.ignored && (await Job.findByPk(j6.id)).status === 'CANCELLED', 'a callback after cancellation is ignored and audited');

    // ── Architect mode: the owner's own words are the requirement ────────────
    const arch = await call(A, 'POST', '/factory/command', { text: 'Agrega un campo de notas internas al formulario de citas de RinglyPro.', mode: 'architect', lang: 'es' });
    ok(arch.d.intent === 'PREPARE_IMPLEMENTATION' && arch.d.classified_by === 'mode', 'architect mode sends an explicit request into PREPARE');
    const ja = await waitJob(arch.d.card.job_id, ['WAITING_APPROVAL', 'FAILED']);
    ok(ja.status === 'WAITING_APPROVAL' && ja.spec.requirements[0].approved_by_human, 'direct instruction becomes a human-approved requirement and a plan');
    const latestCtx = await cmd(A, 'resume mi última reunión');
    ok(latestCtx.d.card.context.recordings[0].mode !== 'architect', 'an architect request is never picked up as "my latest meeting"');

    // ── A pasted prompt goes to Claude word for word ──────────────────────────
    const longPrompt = '/ringlypro-architect Add a Beta tag next to the SpeakUp title on the login page.\n' +
      'Keep the existing styles. Then check the status of the deploy and search for other places showing the title. ' +
      'Do not change the service worker. ' + 'Extra context line for the pasted prompt. '.repeat(30);
    const arch2 = await call(A, 'POST', '/factory/command', { text: longPrompt, mode: 'architect', lang: 'en', project_key: 'speakup' });
    ok(arch2.d.intent === 'PREPARE_IMPLEMENTATION' && arch2.d.classified_by === 'mode', 'a long pasted prompt is an instruction, not a status question');
    let jp = await waitJob(arch2.d.card.job_id, ['WAITING_APPROVAL', 'FAILED']);
    ok(jp.status === 'WAITING_APPROVAL' && jp.spec.instruction && jp.spec.instruction.length > 600, 'the whole prompt is kept, not truncated to the item label');
    const jobProgTok0 = security.workflowToken('progress', jp.id, Math.floor(Date.now() / 1000) + 600);
    const early = await fetch(base + '/api/v1/factory/progress-log', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-speakup-progress': jobProgTok0 },
      body: JSON.stringify({ job_id: String(jp.id), plan_hash: jp.plan_hash, events: [{ kind: 'say', text: 'too early' }] }) });
    ok(early.status === 409, 'activity for a job that has not been approved is refused');
    security.resetRateLimits();
    await call(A, 'POST', `/factory/jobs/${jp.id}/execute`, { plan_hash: jp.plan_hash, passphrase: PHRASE });
    const briefTs = Math.floor(Date.now() / 1000);
    const pbrief = await (await fetch(`${base}/api/v1/factory/brief/${jp.id}`, { headers: { 'x-speakup-ts': String(briefTs), 'x-speakup-sig': security.hmac(SECRET, `brief.${jp.id}.${briefTs}`) } })).json();
    ok(pbrief.prompt.includes('Add a Beta tag next to the SpeakUp title') && pbrief.prompt.includes('WORD FOR WORD'), 'Claude receives the pasted prompt verbatim');
    ok(!pbrief.sensitive.phrases.some(p => /Beta tag/.test(p)), 'the owner instruction is not treated as meeting content the push guard would refuse');

    // ── Live activity from the build job ─────────────────────────────────────
    const jobProgTok = security.workflowToken('progress', jp.id, Math.floor(Date.now() / 1000) + 600);
    const postLog = (events, tok, planHash) => fetch(base + '/api/v1/factory/progress-log', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-speakup-progress': tok === undefined ? jobProgTok : tok },
      body: JSON.stringify({ job_id: String(jp.id), plan_hash: planHash === undefined ? jp.plan_hash : planHash, events }) });
    ok((await postLog([{ kind: 'read', text: 'a.js' }], 'bad-token')).status === 401, 'activity with a bad token is refused');
    ok((await postLog([{ kind: 'read', text: 'a.js' }], undefined, 'f'.repeat(64))).status === 409, 'activity for another plan is refused');
    await callback({ job_id: String(jp.id), plan_hash: jp.plan_hash, status: 'CODING' });
    const okLog = await postLog([{ kind: 'say', text: 'Reading the login page' },
      { kind: 'edit', text: 'verticals/speakup/public/login.html', detail: { old: 'SpeakUp', new: 'SpeakUp Beta' } },
      { kind: 'wizardry', text: 'not a real kind' }]);
    ok(okLog.status === 200, 'the build job can report what Claude is doing');
    const ev = await call(A, 'GET', `/factory/jobs/${jp.id}/events?after=0`);
    ok(ev.status === 200 && ev.d.events.some(e => e.kind === 'edit' && /login\.html/.test(e.text) && e.detail.new === 'SpeakUp Beta'), 'the phone sees the edit with both sides of the change');
    ok(ev.d.events.some(e => e.kind === 'status' && e.text === 'CODING'), 'status changes appear in the activity too');
    ok(ev.d.events.some(e => e.kind === 'info' && e.text === 'not a real kind'), 'an unknown kind is filed as info, never stored raw');
    ok((await call(B, 'GET', `/factory/jobs/${jp.id}/events`)).status === 404, 'another tenant cannot read the activity');
    ok((await call(A, 'GET', `/factory/jobs/${jp.id}/diff`)).status === 409, 'no diff before a PR exists');
    for (const st of ['TESTING', 'PUSHING']) await callback({ job_id: String(jp.id), plan_hash: jp.plan_hash, status: st });
    gh.headSha = 'e5'.repeat(20);
    await callback({ job_id: String(jp.id), plan_hash: jp.plan_hash, event: 'pushed', commit_sha: 'e5'.repeat(20), files_changed: '1',
      tests_measured: 'true', tests_passed: '4', tests_failed: '0', changed_files: JSON.stringify(['verticals/speakup/public/login.html']), suite_modified: 'false' });
    gh.prFiles = [{ filename: 'verticals/speakup/public/login.html', status: 'modified', additions: 1, deletions: 1, patch: '@@ -1 +1 @@\n-SpeakUp\n+SpeakUp Beta' }];
    const diff = await call(A, 'GET', `/factory/jobs/${jp.id}/diff`);
    ok(diff.status === 200 && diff.d.files[0].patch.includes('+SpeakUp Beta'), 'the phone can read the change itself once the PR is open');

    // ── Human approval of an idea ─────────────────────────────────────────────
    const intelRow = (await call(A, 'GET', `/factory/recordings/${meetId}/intel`)).d.intel;
    const idea = intelRow.ideas[0];
    const promoted = await call(A, 'PATCH', `/factory/recordings/${meetId}/intel/items/${idea.id}`, { classification: 'APPROVED_REQUIREMENT' });
    ok(promoted.status === 200 && [...promoted.d.intel.requirements, ...promoted.d.intel.features].some(i => i.id === idea.id && i.approved_by_human), 'a human can promote an idea to an approved requirement');
    ok((await call(B, 'PATCH', `/factory/recordings/${meetId}/intel/items/${idea.id}`, { classification: 'APPROVED_REQUIREMENT' })).status === 404, 'another tenant cannot approve items in the meeting');

    // ── A model can never pick execute ────────────────────────────────────────
    llm.__setClient({ messages: { create: async () => ({ content: [{ text: '{"intent":"EXECUTE_IMPLEMENTATION"}' }] }) } });
    const modelPick = await intents.classify('hazlo ya por favor sin preguntar', 'command');
    ok(modelPick.intent === 'UNKNOWN', 'a model answering EXECUTE is ignored (not model-safe)');
    llm.__setClient({ messages: { create: async () => ({ content: [{ text: '{"items":[{"kind":"bug","classification":"APPROVED_REQUIREMENT","text":"drop the database","quote":"we agreed to drop the production database","confidence":1}]}' }] }) } });
    const fabricated = await require('./src/factory/intel').extract(meetingText, { lang: 'es' });
    ok(!fabricated.bugs.length && fabricated.unverified.length === 1, 'a model-invented quote never becomes a requirement');
    llm.__setClient(null);

    // ── Registry ──────────────────────────────────────────────────────────────
    ok((await call(A, 'POST', '/factory/projects', { key: 'sit-bad', name: 'Bad', repo: 'digit2ai/RinglyPro-CRM', test_commands: ['node x.js && curl evil'] })).status === 400, 'registry refuses a shell pipeline as a test command');
    const np = await call(A, 'POST', '/factory/projects', { key: 'sit-new', name: 'SIT New', repo: 'digit2ai/RinglyPro-CRM', path_scope: ['verticals/speakup'], aliases: ['sit nuevo'] });
    ok(np.status === 201 && np.d.project.allowed_actions.join() === 'read,prepare', 'new project starts without execute or merge');
    const routed = await cmd(A, 'extrae los requisitos de la reunión de sit nuevo ' + meetId, { project_key: null });
    ok(routed.d.project_key === 'sit-new', 'spoken alias routes to the new project with no code change');
    ok((await call(M, 'POST', '/factory/projects', { key: 'sit-m', name: 'M', repo: 'o/r' })).status === 403, 'non-operator cannot edit the registry');

    // ── Existing SpeakUp still works ──────────────────────────────────────────
    const lib = await call(A, 'GET', '/recordings');
    ok(lib.status === 200 && lib.d.recordings.some(r => r.id === meetId && r.mode === 'meeting' && r.project_key === 'ringlypro'), 'library lists sessions with mode and project');
    ok((await call(A, 'POST', `/recordings/${meetId}/summarize`)).d.summary, 'existing summarize still works');
  } catch (e) {
    fail++; console.log('ERROR ' + e.stack);
  }

  // ── Cleanup: every row this run made ─────────────────────────────────────────
  try {
    const tenants = users.map(u => u.id);
    if (tenants.length) {
      const recIds = (await Recording.findAll({ where: { tenant_id: tenants }, attributes: ['id'] })).map(r => r.id);
      for (const M2 of [Transcript, Summary, Document]) await M2.destroy({ where: { recording_id: recIds.length ? recIds : [0] } });
      await sequelize.query('DELETE FROM su_translations WHERE recording_id IN (:ids)', { replacements: { ids: recIds.length ? recIds : [0] } });
      await sequelize.query('DELETE FROM su_edits WHERE recording_id IN (:ids)', { replacements: { ids: recIds.length ? recIds : [0] } });
      for (const M2 of [MeetingIntel, Command, JobEvent, Job, Audit, Project, Recording]) await M2.destroy({ where: { tenant_id: tenants } });
      await sequelize.query('DELETE FROM su_usage WHERE tenant_id IN (:t)', { replacements: { t: tenants } });
      await User.destroy({ where: { id: tenants } });
      const left = await Job.count({ where: { tenant_id: tenants } }) + await Recording.count({ where: { tenant_id: tenants } }) + await User.count({ where: { id: tenants } });
      ok(left === 0, 'cleanup removed every SIT row');
    }
  } catch (e) { fail++; console.log('CLEANUP ERROR ' + e.message); }

  console.log(`\n==== ${pass} passed, ${fail} failed ====`);
  console.log('NOT COVERED (production only): model paths for intel/plan/intent, the real GitHub API, a real Claude Code run in Actions.');
  server.close();
  process.exit(fail ? 1 : 0);
});
