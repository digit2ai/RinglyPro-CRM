'use strict';

/**
 * SpeakUp AI Factory — HTTP surface. Mounted at /speakup/api/v1/factory.
 *
 * Session routes (cookie): command, jobs, trace, intel, projects, search.
 * Machine routes (HMAC, no session): GET /brief/:jobId, POST /callback — the
 * GitHub workflow's only way in. They are exempted from the cookie gate in
 * src/index.js and authenticate themselves.
 *
 * Every state-changing session route requires X-SpeakUp: 1 and a same-host Origin.
 */

const express = require('express');
const router = express.Router();
const { Job, JobEvent, Recording, Transcript, MeetingIntel, Command, Document, Upload, User } = require('../models');
const security = require('../factory/security');
const jobs = require('../factory/jobs');
const projects = require('../factory/projects');
const intents = require('../factory/intents');
const intel = require('../factory/intel');
const audit = require('../factory/audit');
const context = require('../factory/context');
const prepare = require('../factory/prepare');
const { buildBrief } = require('../factory/brief');
const github = require('../factory/github');
const llm = require('../factory/llm');
const research = require('../factory/research');
const memory = require('../factory/memory');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }
function lang(req) { return (req.body && req.body.lang) === 'en' || req.query.lang === 'en' ? 'en' : 'es'; }

function mutation(req, res, next) {
  if (!security.sameOriginRequest(req)) return res.status(403).json({ error: 'Cross-site request refused' });
  next();
}
function operator(req, res, next) {
  if (!security.isFactoryOperator(req.user)) return res.status(403).json({ error: 'AI Factory operator only' });
  next();
}
const wrap = (fn) => (req, res) => fn(req, res).catch(e => {
  console.error('SpeakUp factory route error', req.method, req.path, e.message);
  res.status(500).json({ error: e.message });
});

async function jobView(job, lng) {
  const project = await projects.get(job.tenant_id, job.project_key);
  const sources = await Recording.findAll({ where: { tenant_id: job.tenant_id, id: job.source_recording_ids || [] } });
  return {
    id: job.id, status: job.status, title: job.title, project_key: job.project_key, project_name: project ? project.name : job.project_key,
    repo: job.repo, base_branch: job.base_branch, branch: job.branch, commit_sha: job.commit_sha, pr_number: job.pr_number, pr_url: job.pr_url,
    pr_draft: job.pr_draft, run_url: job.run_url, files_changed: job.files_changed, tests: job.tests, deploy_status: job.deploy_status,
    changed_files: job.changed_files || [], suite_modified: job.suite_modified, outside_plan: jobs.changeScope(job).outside,
    error: job.error, plan_hash: job.plan_hash, plan_md: job.plan_md, plan: job.plan, spec: job.spec, plan_composed_by: job.plan_composed_by,
    revisions: (job.revisions || []).map(r => ({ text: r.text, at: r.at })),
    approved_by: job.approved_by, approved_at: job.approved_at, created_at: job.created_at, updated_at: job.updated_at,
    terminal: jobs.TERMINAL.includes(job.status),
    sources: sources.map(s => ({ id: s.id, title: s.title, created_at: s.created_at, mode: s.mode })),
    plain: jobs.describe(job, lng, project ? project.name : null)
  };
}

// ── Machine routes ────────────────────────────────────────────────────────────
// Two ways to fetch a brief: the trusted `prepare` GitHub job signs with the factory
// secret; the untrusted `build` job (which runs Claude) holds only a single-use brief token.
router.get('/brief/:jobId', wrap(async (req, res) => {
  const jobId = parseInt(req.params.jobId, 10);
  const token = req.headers['x-speakup-brief-token'];
  const signed = !token && jobs.verifyBriefRequest(jobId, req.headers['x-speakup-ts'], req.headers['x-speakup-sig']);
  const byToken = token && security.verifyWorkflowToken('brief', jobId, token);
  if (!signed && !byToken) return res.status(401).json({ error: 'unauthorized' });
  const job = await Job.findByPk(jobId);
  if (!job || !job.approved_at || !(signed ? ['QUEUED', 'CODING'] : ['CODING']).includes(job.status)) return res.status(409).json({ error: 'job not executable' });
  if (byToken) {
    const [used] = await Job.update({ brief_token_used_at: new Date() }, { where: { id: job.id, brief_token_used_at: null } });
    if (!used) return res.status(409).json({ error: 'brief token already used' });
  }
  const project = await projects.get(job.tenant_id, job.project_key);
  if (!project || !projects.allows(project, 'execute')) return res.status(403).json({ error: 'project not executable' });
  const recs = await Recording.findAll({ where: { tenant_id: job.tenant_id, id: job.source_recording_ids || [] } });
  const participants = [...new Set(recs.flatMap(r => r.participants || []))];
  await audit.record({ tenant_id: job.tenant_id, actor: 'github-actions', action: 'job.brief_fetched', entity: 'job', entity_id: job.id, detail: { plan_hash: job.plan_hash, via: signed ? 'hmac' : 'token' } });
  res.set('Cache-Control', 'no-store').json(buildBrief(job, project, { participants }));
}));

// A pasted screenshot, fetched by the build job with its progress token. Images only,
// served with a fixed content type and as an attachment, never inline HTML.
const IMAGE_MIME = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
router.get('/attachment/:id', wrap(async (req, res) => {
  const id = parseInt(req.params.id, 10) || 0;
  const up = await Upload.findByPk(id);
  if (!up || !up.job_id) return res.status(404).json({ error: 'not found' });
  if (!security.verifyWorkflowToken('progress', up.job_id, req.headers['x-speakup-progress'])) return res.status(401).json({ error: 'unauthorized' });
  res.set('Content-Type', IMAGE_MIME[up.mime] ? up.mime : 'application/octet-stream')
    .set('Content-Disposition', 'attachment; filename="' + String(up.name || 'image').replace(/[^A-Za-z0-9._-]/g, '_') + '"')
    .set('X-Content-Type-Options', 'nosniff').set('Cache-Control', 'no-store').send(up.bytes);
}));

router.post('/callback', wrap(async (req, res) => {
  const out = await jobs.applyCallback(req.body || {}, req.headers['x-speakup-sig'], req.headers['x-speakup-progress'] || null);
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error });
  res.json({ ok: true, status: out.job ? out.job.status : null, ignored: !!out.ignored });
}));

// Live activity from the build job (narrow progress token, never the factory secret).
router.post('/progress-log', wrap(async (req, res) => {
  const b = req.body || {};
  const jobId = parseInt(b.job_id, 10) || 0;
  if (!security.verifyWorkflowToken('progress', jobId, req.headers['x-speakup-progress'])) return res.status(401).json({ error: 'unauthorized' });
  const job = await Job.findByPk(jobId);
  if (!job) return res.status(404).json({ error: 'job not found' });
  if (b.plan_hash !== job.plan_hash) return res.status(409).json({ error: 'plan hash mismatch' });
  if (!['QUEUED', 'CODING', 'TESTING', 'FIXING'].includes(job.status)) return res.status(409).json({ error: 'job is not running' });
  const added = await jobs.addEvents(job, b.events);
  res.json({ ok: true, added });
}));

// ── Every session route: the role and email come from the database, not the token ──
router.use((req, res, next) => {
  (async () => {
    const u = req.user && await User.findByPk(req.user.id);
    if (!u || String(u.email).toLowerCase() !== String(req.user.email || '').toLowerCase()) return res.status(401).json({ error: 'No autorizado' });
    req.user = Object.assign({}, req.user, { role: u.role, email: u.email, tenant_id: u.tenant_id || u.id });
    next();
  })().catch(e => res.status(500).json({ error: e.message }));
});

// ── Overview for the phone ────────────────────────────────────────────────────
router.get('/overview', wrap(async (req, res) => {
  const tenant_id = tenantOf(req);
  const isOp = security.isFactoryOperator(req.user);
  if (isOp) await projects.ensureDefaults(tenant_id);
  const list = await projects.list(tenant_id);
  const recent = await Job.findAll({ where: { tenant_id }, order: [['created_at', 'DESC']], limit: 10 });
  const views = [];
  for (const j of recent) views.push(await jobView(j, lang(req)));
  res.json({
    operator: isOp,
    readiness: isOp ? jobs.readiness() : null,
    model: llm.status(),
    projects: list.map(p => ({ key: p.key, name: p.name, enabled: p.enabled, repo: p.repo, allowed_actions: p.allowed_actions })),
    jobs: views.map(v => ({ ...v, plan: undefined, spec: undefined, plan_md: undefined }))
  });
}));

// ── Pasted screenshots ────────────────────────────────────────────────────────
const MAX_UPLOAD = 6 * 1024 * 1024;
router.post('/uploads', mutation, operator, wrap(async (req, res) => {
  const b = req.body || {};
  const mime = String(b.mime || '');
  if (!IMAGE_MIME[mime]) return res.status(400).json({ error: 'Only PNG, JPEG, WebP or GIF images' });
  if (!security.rateLimit('upload', String(req.user.id), 40, 15 * 60 * 1000)) return res.status(429).json({ error: 'Too many uploads. Wait a few minutes.' });
  let bytes;
  try { bytes = Buffer.from(String(b.data_base64 || ''), 'base64'); } catch (e) { bytes = null; }
  if (!bytes || !bytes.length) return res.status(400).json({ error: 'Empty image' });
  if (bytes.length > MAX_UPLOAD) return res.status(413).json({ error: 'Image over 6 MB' });
  const name = (String(b.name || 'screenshot').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'screenshot') + (/\.[a-z0-9]+$/i.test(String(b.name || '')) ? '' : '.' + IMAGE_MIME[mime]);
  const up = await Upload.create({ tenant_id: tenantOf(req), user_id: req.user.id, name, mime, size: bytes.length, bytes });
  await audit.record({ tenant_id: tenantOf(req), user_id: req.user.id, actor: req.user.email, action: 'upload.created', entity: 'upload', entity_id: up.id, detail: { name, size: bytes.length }, req });
  res.json({ id: up.id, name: up.name, size: up.size, mime: up.mime });
}));

// ── Command interpreter ───────────────────────────────────────────────────────
router.post('/command', mutation, wrap(async (req, res) => {
  if (!security.rateLimit('command', String(req.user.id), 60, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many commands. Wait a few minutes.' });
  const b = req.body || {};
  const out = await intents.run({ tenant_id: tenantOf(req), user: req.user, text: b.text, mode: b.mode, lang: b.lang,
    recording_ids: Array.isArray(b.recording_ids) ? b.recording_ids.slice(0, 10) : [], project_key: b.project_key, engine: b.engine, auto_run: b.auto_run,
    upload_ids: Array.isArray(b.upload_ids) ? b.upload_ids.slice(0, 6) : [], req });
  if (out.status !== 200) return res.status(out.status).json(out);
  res.json(out);
}));

// ── Research: ask anything, answered live by the read-only agent ─────────────
// NDJSON: {type:'tool', kind, text} per file read or search, {type:'delta', text} as the answer
// arrives, then {type:'done', text} or {type:'error'}, then {type:'end'}. A ping every 15 s keeps
// Cloudflare's idle limit away while a tool runs. Closing the tab kills the agent.
router.post('/research', mutation, operator, wrap(async (req, res) => {
  const b = req.body || {};
  const text = String(b.text || '').trim().slice(0, 8000);
  if (!text) return res.status(400).json({ error: 'text required' });
  if (!research.available()) return res.status(503).json({ error: 'The Claude subscription is not set up on the server (CLAUDE_CODE_OAUTH_TOKEN).' });
  if (!security.rateLimit('research', String(req.user.id), 30, 10 * 60 * 1000)) return res.status(429).json({ error: 'Too many questions. Wait a few minutes.' });
  const lang = b.lang === 'en' ? 'en' : 'es';
  await audit.record({ tenant_id: tenantOf(req), user_id: req.user.id, actor: req.user.email, action: 'factory.research', entity: 'command', detail: { chars: text.length }, req });
  res.set({ 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
  res.flushHeaders && res.flushHeaders();
  const send = (obj) => { try { res.write(JSON.stringify(obj) + '\n'); } catch (e) {} };
  send({ type: 'start' });
  const ping = setInterval(() => send({ type: 'ping' }), 15000);
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    let remembered = '';
    try { remembered = await memory.contextBlock(tenantOf(req), {}); } catch (e) {}
    const r = await research.ask({ text, history: b.history, lang, remembered, signal: abort.signal,
      onText: (t) => send({ type: 'delta', text: t }), onTool: (l) => send(Object.assign({ type: 'tool' }, l)) });
    send({ type: 'done', text: r.text });
  } catch (e) {
    if (!abort.signal.aborted) send({ type: 'error', error: String(e.message || e).slice(0, 400) });
  } finally {
    clearInterval(ping);
    send({ type: 'end' });
    res.end();
  }
}));

// ── House rules: what the factory reads before every instruction ─────────────
router.get('/rules', operator, wrap(async (req, res) => {
  const r = await memory.rules(tenantOf(req));
  res.json({ rules: r.text, is_default: r.is_default, max: memory.RULES_MAX, default_rules: memory.DEFAULT_RULES });
}));
router.put('/rules', mutation, operator, wrap(async (req, res) => {
  const r = await memory.setRules(tenantOf(req), (req.body || {}).rules);
  await audit.record({ tenant_id: tenantOf(req), user_id: req.user.id, actor: req.user.email, action: 'factory.rules_saved', entity: 'settings', detail: { chars: r.text.length }, req });
  res.json({ rules: r.text, is_default: false });
}));
// What it remembers right now, so the owner can see it rather than trust it.
router.get('/memory', operator, wrap(async (req, res) => {
  res.json({ recent_work: await memory.recentWork(tenantOf(req), {}), rules: (await memory.rules(tenantOf(req))).text });
}));

// ── Jobs ──────────────────────────────────────────────────────────────────────
router.get('/jobs', operator, wrap(async (req, res) => {
  const rows = await Job.findAll({ where: { tenant_id: tenantOf(req) }, order: [['created_at', 'DESC']], limit: 50 });
  const out = [];
  for (const j of rows) { const v = await jobView(j, lang(req)); out.push({ ...v, plan: undefined, spec: undefined, plan_md: undefined }); }
  res.json({ jobs: out });
}));

async function ownJob(req, res) {
  const job = await Job.findOne({ where: { id: parseInt(req.params.id, 10) || 0, tenant_id: tenantOf(req) } });
  if (!job) { res.status(404).json({ error: 'Job not found' }); return null; }
  return job;
}

router.get('/jobs/:id', operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  res.json({ job: await jobView(job, lang(req)) });
}));

router.get('/jobs/:id/trace', operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  const command = job.command_id ? await Command.findOne({ where: { id: job.command_id, tenant_id: job.tenant_id } }) : null;
  const trail = await audit.forEntity(job.tenant_id, 'job', job.id);
  const texts = await context.loadTexts(job.tenant_id, job.source_recording_ids || []);
  res.json({
    job: await jobView(job, lang(req)),
    why: {
      command: command ? { id: command.id, transcript: command.transcript, intent: command.intent, classified_by: command.classified_by, mode: command.mode, created_at: command.created_at } : null,
      sources: texts.map(t => ({ id: t.recording.id, title: t.recording.title, created_at: t.recording.created_at, excerpt: t.text.slice(0, 1500) })),
      approved_requirements: (job.spec && job.spec.requirements) || [],
      approved_plan_hash: job.plan_hash, approved_by: job.approved_by, approved_at: job.approved_at
    },
    audit: trail.map(a => ({ at: a.created_at, actor: a.actor, action: a.action, from: a.from_status, to: a.to_status, detail: a.detail }))
  });
}));

router.get('/jobs/:id/events', operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  const after = parseInt(req.query.after, 10) || 0;
  const events = await JobEvent.findAll({ where: { tenant_id: job.tenant_id, job_id: job.id, id: { [jobs.Op.gt]: after } }, order: [['id', 'ASC']], limit: 400 });
  res.json({ status: job.status, terminal: jobs.TERMINAL.includes(job.status), pr_number: job.pr_number, pr_url: job.pr_url,
    events: events.map(e => ({ id: e.id, kind: e.kind, text: e.text, detail: e.detail, at: e.created_at })) });
}));

// The change itself, once the PR exists: filenames and patches, read live from GitHub.
router.get('/jobs/:id/diff', operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  if (!job.pr_number) return res.status(409).json({ error: 'No pull request yet' });
  if (!github.configured()) return res.status(423).json({ error: 'GitHub is not connected' });
  try { res.json({ pr_number: job.pr_number, pr_url: job.pr_url, files: await github.listPRFiles(job.repo, job.pr_number) }); }
  catch (e) { res.status(502).json({ error: e.message }); }
}));

router.post('/jobs/:id/execute', mutation, operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  const out = await jobs.approveAndDispatch({ job, user: req.user, passphrase: req.body.passphrase, confirmToken: req.body.confirm_token, planHash: req.body.plan_hash, req });
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error, code: out.code, job: out.job ? await jobView(out.job, lang(req)) : undefined });
  res.json({ ok: true, job: await jobView(out.job, lang(req)) });
}));

// THE PLAN THE OWNER READ IS THE PLAN THAT RUNS. No phrase here — this is the owner typing
// "approved" into their own signed-in console against a plan on screen — but the plan hash
// is mandatory, so a revision that landed while they were reading cannot be approved blind.
router.post('/jobs/:id/approve', mutation, operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  const out = await jobs.approve({ job, user: req.user, planHash: req.body.plan_hash, req });
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error, job: await jobView(await Job.findByPk(job.id), lang(req)) });
  res.json({ ok: true, job: await jobView(out.job, lang(req)) });
}));

// Correct the plan and get a new one. Writes no code and never dispatches.
router.post('/jobs/:id/revise', mutation, operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  const out = await prepare.revise(job.id, req.body.text, { lang: lang(req), user: req.user });
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error });
  res.json({ ok: true, job: await jobView(out.job, lang(req)), diff: out.diff || null });
}));

// A QUESTION ABOUT THE PLAN. Answers; changes nothing, mints no new hash. Half of reviewing
// is asking why, and until this existed the box could only command.
router.post('/jobs/:id/ask', mutation, operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  const before = job.plan_hash;
  const out = await prepare.ask(job.id, req.body.text, { lang: lang(req), user: req.user });
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error });
  const after = (await Job.findByPk(job.id)).plan_hash;
  res.json({ ok: true, reply: out.reply, plan_changed: before !== after });
}));

// Remove a step, or one file from a step. No model: the commonest correction is "not that
// file" and it should cost a tap, not a regeneration of everything already read.
router.post('/jobs/:id/plan/drop', mutation, operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  const out = await prepare.drop(job.id, { step: req.body.step, path: req.body.path }, { user: req.user });
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error });
  res.json({ ok: true, job: await jobView(out.job, lang(req)), diff: out.diff || null });
}));

router.post('/jobs/:id/merge', mutation, operator, wrap(async (req, res) => {
  const job = await ownJob(req, res); if (!job) return;
  const out = await jobs.merge({ job, user: req.user, passphrase: req.body.passphrase, confirmToken: req.body.confirm_token, planHash: req.body.plan_hash, req });
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error, code: out.code });
  res.json({ ok: true, job: await jobView(out.job, lang(req)) });
}));

router.post('/jobs/:id/cancel', mutation, operator, wrap(async (req, res) => {
  if (req.body.confirm !== true) return res.status(400).json({ error: 'confirm:true required' });
  const job = await ownJob(req, res); if (!job) return;
  const out = await jobs.cancel({ job, user: req.user, req });
  if (!out.ok) return res.status(out.status || 400).json({ error: out.error });
  res.json({ ok: true, job: await jobView(out.job, lang(req)) });
}));

// ── Session metadata + meeting intelligence ───────────────────────────────────
async function ownRecording(req, res) {
  const rec = await Recording.findOne({ where: { id: parseInt(req.params.id, 10) || 0, tenant_id: tenantOf(req) } });
  if (!rec) { res.status(404).json({ error: 'Recording not found' }); return null; }
  return rec;
}

router.patch('/recordings/:id/session', mutation, wrap(async (req, res) => {
  const rec = await ownRecording(req, res); if (!rec) return;
  const b = req.body || {};
  if (b.mode !== undefined) { if (!['meeting', 'note', 'command', 'architect', null].includes(b.mode)) return res.status(400).json({ error: 'invalid mode' }); rec.mode = b.mode; }
  if (b.project_key !== undefined) {
    if (b.project_key && !(await projects.get(tenantOf(req), b.project_key))) return res.status(400).json({ error: 'unknown project' });
    rec.project_key = b.project_key || null;
  }
  if (b.participants !== undefined) rec.participants = (Array.isArray(b.participants) ? b.participants : []).map(p => String(p).trim().slice(0, 60)).filter(Boolean).slice(0, 20);
  await rec.save();
  res.json({ ok: true, recording: rec });
}));

router.get('/recordings/:id/intel', wrap(async (req, res) => {
  const rec = await ownRecording(req, res); if (!rec) return;
  const row = await MeetingIntel.findOne({ where: { tenant_id: rec.tenant_id, recording_id: rec.id }, order: [['id', 'DESC']] });
  res.json({ intel: row ? row.data : null, composed_by: row ? row.composed_by : null });
}));

router.post('/recordings/:id/intel', mutation, wrap(async (req, res) => {
  const rec = await ownRecording(req, res); if (!rec) return;
  const tr = await Transcript.findOne({ where: { tenant_id: rec.tenant_id, recording_id: rec.id } });
  if (!tr || !String(tr.text || '').trim()) return res.status(400).json({ error: 'No transcript' });
  const data = await intel.extract(tr.text, { lang: lang(req), project_key: rec.project_key });
  if (data.participants.length && !(rec.participants || []).length) { rec.participants = data.participants; await rec.save(); }
  const row = await MeetingIntel.create({ tenant_id: rec.tenant_id, recording_id: rec.id, project_key: rec.project_key, data, composed_by: data.composed_by, is_simulated: data.is_simulated });
  await audit.record({ tenant_id: rec.tenant_id, user_id: req.user.id, actor: req.user.email, action: 'intel.extracted', entity: 'intel', entity_id: row.id, detail: { recording_id: rec.id, composed_by: data.composed_by }, req });
  res.json({ intel: data });
}));

// A human promotes an idea to an approved requirement (or demotes one).
router.patch('/recordings/:id/intel/items/:itemId', mutation, wrap(async (req, res) => {
  const rec = await ownRecording(req, res); if (!rec) return;
  const row = await MeetingIntel.findOne({ where: { tenant_id: rec.tenant_id, recording_id: rec.id }, order: [['id', 'DESC']] });
  if (!row) return res.status(404).json({ error: 'No intelligence yet' });
  const tr = await Transcript.findOne({ where: { tenant_id: rec.tenant_id, recording_id: rec.id } });
  let data;
  try { data = intel.setClassification(row.data, String(req.params.itemId), String(req.body.classification || ''), tr ? tr.text : ''); }
  catch (e) { return res.status(400).json({ error: e.message }); }
  row.data = data; row.updated_at = new Date(); row.changed('data', true); await row.save();
  await audit.record({ tenant_id: rec.tenant_id, user_id: req.user.id, actor: req.user.email, action: 'intel.classified_by_human', entity: 'intel', entity_id: row.id,
    detail: { recording_id: rec.id, item: req.params.itemId, classification: req.body.classification }, req });
  res.json({ intel: data });
}));

/**
 * THE BRIDGE: ticked items become a prompt, and nothing else does.
 *
 * TICKING IS THE APPROVAL, and the box is what the owner sees. A row reaches this prompt
 * only if it sits in an approved bucket — either because the owner ticked it (the existing
 * human promotion, PATCH .../items/:itemId -> APPROVED_REQUIREMENT) or because someone said
 * an explicit approval cue out loud in the meeting and the verifier let it stand. BOTH
 * render pre-ticked on the checklist and both can be unticked, so what travels is always
 * what the owner left ticked — but note the second case is not a click they made. A quote
 * that is not in the transcript never became an item at all, by either route.
 *
 * It returns TEXT. It opens no job and dispatches nothing — the prompt lands in the Factory
 * box as editable text, where the owner can fix it before sending.
 */
router.post('/recordings/:id/prompt', mutation, operator, wrap(async (req, res) => {
  const rec = await ownRecording(req, res); if (!rec) return;
  const row = await MeetingIntel.findOne({ where: { tenant_id: rec.tenant_id, recording_id: rec.id }, order: [['id', 'DESC']] });
  if (!row) return res.status(409).json({ error: 'This meeting has not been read yet.' });
  const spec = prepare.collectSpec([{ recording: rec, data: row.data }]);
  if (!spec.requirements.length) {
    const hb = spec.held_back;
    return res.status(409).json({ error: 'Nothing is ticked yet. Tick the items you want built.', held_back: hb });
  }
  const list = await projects.list(tenantOf(req));
  const project = list.find(p => p.key === (rec.project_key || process.env.SPEAKUP_DEFAULT_PROJECT || 'ringlypro')) || list[0] || null;
  const prompt = intents.devPrompt(spec, project);
  await audit.record({ tenant_id: rec.tenant_id, user_id: req.user.id, actor: req.user.email, action: 'meeting.prompt_built', entity: 'recording', entity_id: rec.id,
    detail: { requirements: spec.requirements.length, held_back: spec.held_back }, req });
  res.json({ prompt, recording_id: rec.id, project_key: project ? project.key : null,
    requirements: spec.requirements.map(r => ({ id: r.id, kind: r.kind, text: r.text })), held_back: spec.held_back });
}));

router.get('/search', wrap(async (req, res) => {
  const q = String(req.query.q || '').slice(0, 300);
  const list = await projects.list(tenantOf(req));
  const project = req.query.project ? list.find(p => p.key === req.query.project) : projects.matchProject(list, q);
  res.json({ results: await intents.search(tenantOf(req), q, project || null) });
}));

router.get('/documents/:id', wrap(async (req, res) => {
  const doc = await Document.findOne({ where: { id: parseInt(req.params.id, 10) || 0, tenant_id: tenantOf(req) } });
  if (!doc) return res.status(404).json({ error: 'Not found' });
  res.json({ document: doc });
}));

// ── Project registry ──────────────────────────────────────────────────────────
router.get('/projects', operator, wrap(async (req, res) => {
  await projects.ensureDefaults(tenantOf(req));
  res.json({ projects: await projects.list(tenantOf(req)), actions: projects.ACTIONS });
}));

router.post('/projects', mutation, operator, wrap(async (req, res) => {
  const { value, errors } = projects.sanitize(req.body || {});
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  if (await projects.get(tenantOf(req), value.key)) return res.status(409).json({ error: 'key already exists' });
  const { Project } = require('../models');
  const row = await Project.create(Object.assign({ tenant_id: tenantOf(req), allowed_actions: ['read', 'prepare'] }, value));
  await audit.record({ tenant_id: tenantOf(req), user_id: req.user.id, actor: req.user.email, action: 'project.created', entity: 'project', entity_id: row.id, detail: value, req });
  res.status(201).json({ project: row });
}));

router.patch('/projects/:key', mutation, operator, wrap(async (req, res) => {
  const row = await projects.get(tenantOf(req), req.params.key);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const body = Object.assign({}, req.body || {}); delete body.key; delete body.tenant_id;
  const { value, errors } = projects.sanitize(body, { partial: true });
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  await row.update(value);
  await audit.record({ tenant_id: tenantOf(req), user_id: req.user.id, actor: req.user.email, action: 'project.updated', entity: 'project', entity_id: row.id, detail: value, req });
  res.json({ project: row });
}));

router.get('/health', (req, res) => {
  res.json({ github: github.configured(), model: llm.status(), readiness_blockers: jobs.readiness().blockers.map(b => b.code),
    factory_secret_fingerprint: security.secretFingerprint() });
});

module.exports = router;
