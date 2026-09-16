'use strict';

/**
 * SpeakUp AI Factory — persistent engineering jobs.
 *
 * TWO STAGES, AND ONLY ONE DOOR BETWEEN THEM.
 *   PREPARE  (ANALYZING -> PLANNING -> WAITING_APPROVAL) reads, never writes code.
 *   EXECUTE  (QUEUED -> CODING -> TESTING/FIXING -> PUSHING -> PR_CREATED -> READY_FOR_REVIEW)
 *            is reachable ONLY through approveAndDispatch(), which demands an allow-listed
 *            operator, the server-held private phrase, the exact plan hash that was shown,
 *            and a connected GitHub. A recording, a meeting, an intent or a model output
 *            cannot call it (SIT greps every other file).
 *
 * NOTHING SHIPS TO PRODUCTION UNREVIEWED. The workflow pushes only speakup/job-<id>
 * and a PR is opened. Merge is a separate, gated action; Render deploys main as before.
 *
 * NOTHING DISAPPEARS. Every transition is an atomic UPDATE ... WHERE status = <from>
 * with an audit row, and a watchdog fails any job that stops reporting, naming why.
 */

const { Op } = require('sequelize');
const { Job, JobEvent, sequelize } = require('../models');
const audit = require('./audit');
const security = require('./security');
const github = require('./github');
const projects = require('./projects');

const STATUSES = ['QUEUED', 'ANALYZING', 'PLANNING', 'WAITING_APPROVAL', 'CODING', 'TESTING', 'FIXING', 'PUSHING',
  'PR_CREATED', 'READY_FOR_REVIEW', 'DEPLOYING', 'DEPLOYED', 'FAILED', 'CANCELLED'];
const TERMINAL = ['DEPLOYED', 'FAILED', 'CANCELLED'];
const NEXT = {
  ANALYZING: ['PLANNING', 'FAILED', 'CANCELLED'],
  PLANNING: ['WAITING_APPROVAL', 'FAILED', 'CANCELLED'],
  WAITING_APPROVAL: ['QUEUED', 'FAILED', 'CANCELLED'],
  QUEUED: ['CODING', 'FAILED', 'CANCELLED'],
  CODING: ['TESTING', 'FIXING', 'PUSHING', 'FAILED', 'CANCELLED'],
  TESTING: ['FIXING', 'PUSHING', 'FAILED', 'CANCELLED'],
  FIXING: ['TESTING', 'FAILED', 'CANCELLED'],
  PUSHING: ['PR_CREATED', 'FAILED', 'CANCELLED'],
  PR_CREATED: ['READY_FOR_REVIEW', 'FAILED', 'CANCELLED'],
  READY_FOR_REVIEW: ['DEPLOYING', 'CANCELLED'],
  DEPLOYING: ['DEPLOYED', 'FAILED']
};
// The only statuses a GitHub callback may set by itself.
const CALLBACK_STATUSES = ['CODING', 'TESTING', 'FIXING', 'PUSHING'];

const EVENT_KINDS = ['status', 'say', 'read', 'edit', 'write', 'run', 'search', 'test', 'error', 'info', 'done', 'pr', 'todo', 'tool'];
const MAX_EVENTS_PER_JOB = Number(process.env.SPEAKUP_FACTORY_MAX_EVENTS || 4000);

// Append activity for the phone to watch. Untrusted text (it comes from the build
// job): capped, typed against a fixed list of kinds, and escaped by the UI.
async function addEvents(job, events) {
  const rows = [];
  for (const e of (Array.isArray(events) ? events : []).slice(0, 100)) {
    const kind = EVENT_KINDS.includes(String(e && e.kind || e && e.t)) ? String(e.kind || e.t) : 'info';
    let detail = {};
    try { detail = e && typeof e.detail === 'object' && e.detail ? JSON.parse(JSON.stringify(e.detail).slice(0, 6000)) : {}; } catch (x) { detail = {}; }
    rows.push({ tenant_id: job.tenant_id, job_id: job.id, kind, text: String((e && e.text) || '').slice(0, 2000), detail });
  }
  if (!rows.length) return 0;
  const existing = await JobEvent.count({ where: { job_id: job.id } });
  if (existing >= MAX_EVENTS_PER_JOB) return 0;
  await JobEvent.bulkCreate(rows.slice(0, MAX_EVENTS_PER_JOB - existing));
  return rows.length;
}

const BASE_URL = (process.env.SPEAKUP_PUBLIC_URL || 'https://aiagent.ringlypro.com/speakup').replace(/\/+$/, '');

function canMove(from, to) { return (NEXT[from] || []).includes(to); }
function branchFor(jobId) { return 'speakup/job-' + jobId; }

async function transition(job, to, { actor, user_id, detail, fields, req } = {}) {
  const from = job.status;
  if (!canMove(from, to)) return null;
  const values = Object.assign({}, fields || {}, { status: to, updated_at: new Date() });
  const [count, rows] = await Job.update(values, { where: { id: job.id, status: from }, returning: true });
  if (!count) return null;
  await audit.record({ tenant_id: job.tenant_id, user_id, actor: actor || 'system', action: 'job.transition',
    entity: 'job', entity_id: job.id, from_status: from, to_status: to, detail: detail || {}, req });
  try { await JobEvent.create({ tenant_id: job.tenant_id, job_id: job.id, kind: 'status', text: to, detail: { from } }); } catch (e) { /* never block a transition */ }
  return rows[0];
}

async function fail(job, message, meta = {}) {
  const fresh = await Job.findByPk(job.id);
  if (!fresh || TERMINAL.includes(fresh.status)) return fresh;
  const moved = await transition(fresh, 'FAILED', { actor: meta.actor || 'system', detail: { reason: String(message).slice(0, 500), ...(meta.detail || {}) },
    fields: { error: String(message).slice(0, 2000), ...(meta.fields || {}) } });
  return moved || fresh;
}

// ── Plain language for the phone ──────────────────────────────────────────────
const LABELS = {
  es: { QUEUED: 'EN COLA', ANALYZING: 'ANALIZANDO', PLANNING: 'PLANIFICANDO', WAITING_APPROVAL: 'ESPERANDO TU APROBACIÓN',
    CODING: 'PROGRAMANDO', TESTING: 'PROBANDO', FIXING: 'CORRIGIENDO', PUSHING: 'SUBIENDO LA RAMA', PR_CREATED: 'PR CREADO',
    READY_FOR_REVIEW: 'LISTO PARA REVISIÓN', DEPLOYING: 'DESPLEGANDO', DEPLOYED: 'DESPLEGADO', FAILED: 'FALLÓ', CANCELLED: 'CANCELADO' },
  en: { QUEUED: 'QUEUED', ANALYZING: 'ANALYZING', PLANNING: 'PLANNING', WAITING_APPROVAL: 'WAITING FOR YOUR APPROVAL',
    CODING: 'CODING', TESTING: 'TESTING', FIXING: 'FIXING', PUSHING: 'PUSHING THE BRANCH', PR_CREATED: 'PR CREATED',
    READY_FOR_REVIEW: 'READY FOR REVIEW', DEPLOYING: 'DEPLOYING', DEPLOYED: 'DEPLOYED', FAILED: 'FAILED', CANCELLED: 'CANCELLED' }
};

function testsLine(tests, lang) {
  const es = lang !== 'en';
  if (!tests || !tests.measured) return es ? 'Pruebas: aún no medidas' : 'Tests: not measured yet';
  return es ? `Pruebas: ${tests.passed} aprobadas, ${tests.failed} fallidas` : `Tests: ${tests.passed} passed, ${tests.failed} failed`;
}

function describe(job, lang, projectName) {
  const es = lang !== 'en';
  const L = LABELS[es ? 'es' : 'en'];
  const lines = [`${projectName || job.project_key || ''}${job.title ? ' · ' + job.title : ''}`.trim(), (es ? 'Estado: ' : 'Status: ') + (L[job.status] || job.status)];
  if (job.branch) lines.push((es ? 'Rama: ' : 'Branch: ') + job.branch);
  if (['CODING', 'TESTING', 'FIXING', 'PUSHING', 'PR_CREATED', 'READY_FOR_REVIEW', 'DEPLOYING', 'DEPLOYED', 'FAILED'].includes(job.status) && job.approved_at) lines.push(testsLine(job.tests, lang));
  if (job.files_changed != null) lines.push((es ? 'Archivos cambiados: ' : 'Files changed: ') + job.files_changed);
  if (job.pr_number) lines.push('PR: #' + job.pr_number + (job.pr_draft ? (es ? ' (borrador)' : ' (draft)') : ''));
  if (job.deploy_status) lines.push((es ? 'Despliegue: ' : 'Deployment: ') + job.deploy_status);
  if (job.status === 'FAILED' && job.error) lines.push((es ? 'Motivo: ' : 'Reason: ') + job.error);
  if (job.status === 'WAITING_APPROVAL') lines.push(es ? 'Revisa el plan y di "ejecuta el plan aprobado" con tu frase privada.' : 'Review the plan, then say "execute approved plan" with your private phrase.');
  return lines.join('\n');
}

// ── Readiness of the execution door (reported, never guessed) ─────────────────
function readiness() {
  const blockers = [];
  if (security.authSecretIsDefault()) blockers.push({ code: 'auth_secret_default', fix: 'Set SPEAKUP_JWT_SECRET on Render to its own random value (not the shared JWT_SECRET).' });
  if (security.teamPasswordWeak()) blockers.push({ code: 'weak_password', fix: 'Set SPEAKUP_TEAM_PASSWORD on Render to a private password of 12+ characters. The default is published in the repository.' });
  if (!security.phraseConfigured()) blockers.push({ code: 'phrase_not_configured', fix: 'Set SPEAKUP_EXEC_PHRASE (or SPEAKUP_EXEC_PHRASE_SHA256) on Render.' });
  else if (security.phraseWeak()) blockers.push({ code: 'phrase_weak', fix: 'SPEAKUP_EXEC_PHRASE must be at least 4 words and 20 characters.' });
  if (!security.factorySecret()) blockers.push({ code: 'factory_secret_missing', fix: 'Set SPEAKUP_FACTORY_SECRET on Render and the same value as the GitHub Actions secret SPEAKUP_FACTORY_SECRET.' });
  if (!github.configured()) blockers.push({ code: 'github_not_connected', fix: 'Set SPEAKUP_GITHUB_TOKEN on Render (fine-grained PAT: Actions RW, Pull requests RW, Contents R).' });
  return { ready: blockers.length === 0, blockers };
}

// ── THE EXECUTION DOOR ────────────────────────────────────────────────────────
async function gate({ job, user, passphrase, confirmToken, planHash, action, req }) {
  const deny = async (status, code, message) => {
    await audit.record({ tenant_id: job ? job.tenant_id : (user && user.tenant_id) || 0, user_id: user && user.id,
      actor: (user && user.email) || 'unknown', action: action + '.denied', entity: 'job', entity_id: job && job.id,
      detail: { code }, req });
    return { ok: false, status, code, error: message };
  };
  if (!job) return { ok: false, status: 404, code: 'not_found', error: 'Job not found' };
  if (!security.isFactoryOperator(user)) return deny(403, 'not_operator', 'This account is not allowed to run the AI Factory.');
  const r = readiness();
  if (!r.ready) return deny(423, r.blockers[0].code, 'The AI Factory is not fully configured: ' + r.blockers.map(b => b.fix).join(' '));
  if (!security.rateLimit('exec', String(user.id), 6, 15 * 60 * 1000)) return deny(429, 'rate_limited', 'Too many attempts. Wait 15 minutes.');
  if (!planHash || planHash !== job.plan_hash) return deny(409, 'plan_changed', 'The plan changed since you reviewed it. Review it again.');
  const byToken = confirmToken && security.verifyConfirm(confirmToken, job.id, job.plan_hash, user.id);
  const byPhrase = passphrase && security.phraseMatches(passphrase);
  if (!byToken && !byPhrase) return deny(401, 'phrase_mismatch', 'Private phrase not recognized.');
  return { ok: true, via: byToken ? 'spoken_phrase_confirmed' : 'typed_phrase' };
}

async function approveAndDispatch({ job, user, passphrase, confirmToken, planHash, req }) {
  const g = await gate({ job, user, passphrase, confirmToken, planHash, action: 'job.execute', req });
  if (!g.ok) return g;
  if (job.status !== 'WAITING_APPROVAL') return { ok: false, status: 409, code: 'wrong_status', error: 'Only a plan waiting for approval can be executed (current: ' + job.status + ').' };
  const project = await projects.get(job.tenant_id, job.project_key);
  if (!projects.allows(project, 'execute')) return { ok: false, status: 403, code: 'action_not_allowed', error: 'Execution is not allowed for this project in the registry.' };

  // Dispatch from the snapshot the plan hash covers, never from the live registry row.
  const branch = branchFor(job.id);
  const workflow = job.workflow_file || project.workflow_file;
  const queued = await transition(job, 'QUEUED', { actor: user.email, user_id: user.id, req,
    detail: { via: g.via, plan_hash: job.plan_hash, repo: job.repo, ref: job.base_branch, branch },
    fields: { approved_by: user.email, approved_at: new Date(), branch } });
  if (!queued) return { ok: false, status: 409, code: 'already_moved', error: 'This plan was already executed or cancelled.' };

  try {
    await github.dispatchWorkflow(job.repo, workflow, job.base_branch, { job_id: String(job.id), branch });
    await audit.record({ tenant_id: job.tenant_id, user_id: user.id, actor: user.email, action: 'job.dispatched', entity: 'job', entity_id: job.id,
      detail: { repo: job.repo, workflow, ref: job.base_branch, branch }, req });
    return { ok: true, job: queued };
  } catch (e) {
    const failed = await fail(queued, 'Could not start the GitHub workflow: ' + e.message, { actor: 'system' });
    return { ok: false, status: 502, code: 'dispatch_failed', error: e.message, job: failed };
  }
}

// The console runs a prepared plan straight away. It is the SAME door as
// approveAndDispatch — operator allow-list, readiness, project permission, atomic
// WAITING_APPROVAL -> QUEUED — with the phrase step dropped, because the owner
// typed the instruction into their own signed-in console seconds earlier and the
// result is still only a branch and a PR. SPEAKUP_AUTO_RUN=off restores the tap.
function autoRunEnabled() { return String(process.env.SPEAKUP_AUTO_RUN || 'on').toLowerCase() !== 'off'; }
// Voice or typing straight to the live site: a console job whose tests passed merges
// itself, and Render deploys main as it always has. SPEAKUP_AUTO_MERGE=off stops it.
// The ONE case it still leaves for a person: a change that edited a test suite the
// factory runs, because then the green result cannot vouch for itself.
function autoMergeEnabled() { return String(process.env.SPEAKUP_AUTO_MERGE || 'on').toLowerCase() !== 'off'; }

async function autoMerge(job) {
  if (!autoMergeEnabled() || !job.auto_run || !job.pr_number) return job;
  const project = await projects.get(job.tenant_id, job.project_key);
  if (!projects.allows(project, 'merge')) return job;
  if (!job.tests || !job.tests.measured || job.tests.failed !== 0) return job;
  if (job.suite_modified !== false) {
    await addEvents(job, [{ kind: 'info', text: 'Left for you to review: this change edited a test suite the factory runs, so its green result cannot vouch for itself.' }]);
    return job;
  }
  try {
    const res = await github.mergePR(job.repo, job.pr_number, job.commit_sha, `SpeakUp AI Factory job #${job.id}`);
    await addEvents(job, [{ kind: 'pr', text: 'Merged into ' + job.base_branch + '. Render is deploying.' }]);
    await audit.record({ tenant_id: job.tenant_id, actor: 'system', action: 'job.auto_merged', entity: 'job', entity_id: job.id, detail: { pr: job.pr_number, sha: res.sha } });
    return await transition(job, 'DEPLOYING', { detail: { merged_via: 'auto' }, fields: { merge_sha: res.sha, deploy_status: 'merged; waiting for Render' } }) || job;
  } catch (e) {
    const hint = e.status === 403
      ? ' The GitHub token needs Contents: Read and write to merge; give it that on the token page, or merge this PR yourself.'
      : '';
    await addEvents(job, [{ kind: 'error', text: 'Could not merge automatically: ' + e.message + hint }]);
    await audit.record({ tenant_id: job.tenant_id, actor: 'system', action: 'job.auto_merge_failed', entity: 'job', entity_id: job.id, detail: { error: e.message } });
    return job;
  }
}

async function autoDispatch(job, user) {
  if (!autoRunEnabled()) return null;
  if (!security.isFactoryOperator(user)) return null;
  const r = readiness();
  if (!r.ready) { await fail(job, 'The AI Factory is not fully configured: ' + r.blockers.map(b => b.code).join(', ')); return null; }
  const project = await projects.get(job.tenant_id, job.project_key);
  if (!projects.allows(project, 'execute')) { await fail(job, 'Execution is not allowed for this project in the registry.'); return null; }
  const branch = branchFor(job.id);
  const queued = await transition(job, 'QUEUED', { actor: user.email, user_id: user.id,
    detail: { via: 'console_auto_run', plan_hash: job.plan_hash, branch },
    fields: { approved_by: user.email, approved_at: new Date(), branch } });
  if (!queued) return null;
  try {
    await github.dispatchWorkflow(job.repo, job.workflow_file || project.workflow_file, job.base_branch, { job_id: String(job.id), branch });
    await audit.record({ tenant_id: job.tenant_id, user_id: user.id, actor: user.email, action: 'job.auto_dispatched', entity: 'job', entity_id: job.id,
      detail: { repo: job.repo, branch } });
    return queued;
  } catch (e) {
    return fail(queued, 'Could not start the GitHub workflow: ' + e.message);
  }
}

async function cancel({ job, user, req }) {
  if (!security.isFactoryOperator(user)) return { ok: false, status: 403, error: 'Not allowed' };
  if (TERMINAL.includes(job.status) || job.status === 'DEPLOYING') return { ok: false, status: 409, error: 'This job can no longer be cancelled (' + job.status + ').' };
  const cancelled = await transition(job, 'CANCELLED', { actor: user.email, user_id: user.id, req, detail: { requested_by: user.email } });
  if (!cancelled) return { ok: false, status: 409, error: 'The job changed state; try again.' };
  if (github.configured() && job.repo && ['QUEUED', 'CODING', 'TESTING', 'FIXING', 'PUSHING'].includes(job.status)) {
    try {
      const project = await projects.get(job.tenant_id, job.project_key);
      const run = await github.findRun(job.repo, job.workflow_file || (project && project.workflow_file) || 'speakup-factory.yml', job.id);
      if (run && run.status !== 'completed') await github.cancelRun(job.repo, run.id);
      await audit.record({ tenant_id: job.tenant_id, actor: 'system', action: 'job.run_cancel', entity: 'job', entity_id: job.id, detail: { run_id: run && run.id } });
    } catch (e) {
      await audit.record({ tenant_id: job.tenant_id, actor: 'system', action: 'job.run_cancel_failed', entity: 'job', entity_id: job.id, detail: { error: e.message } });
    }
  }
  return { ok: true, job: cancelled };
}

async function merge({ job, user, passphrase, confirmToken, planHash, req }) {
  const g = await gate({ job, user, passphrase, confirmToken, planHash, action: 'job.merge', req });
  if (!g.ok) return g;
  if (job.status !== 'READY_FOR_REVIEW') return { ok: false, status: 409, error: 'Only a job READY FOR REVIEW can be merged.' };
  const project = await projects.get(job.tenant_id, job.project_key);
  if (!projects.allows(project, 'merge')) return { ok: false, status: 403, error: 'Merging from SpeakUp is not allowed for this project. Merge on GitHub.' };
  if (!job.tests || !job.tests.measured || job.tests.failed !== 0) return { ok: false, status: 409, error: 'Tests were not measured as passing; merge on GitHub after reviewing.' };
  const scope = changeScope(job);
  if (job.suite_modified !== false) return { ok: false, status: 409, error: 'This change edited a test suite the factory runs, so the passing result cannot vouch for it. Review and merge on GitHub.' };
  if (scope.outside.length) return { ok: false, status: 409, error: 'The change touched files outside the approved plan (' + scope.outside.slice(0, 5).join(', ') + '). Review and merge on GitHub.' };
  let pr;
  try { pr = await github.getPR(job.repo, job.pr_number); } catch (e) { return { ok: false, status: 502, error: e.message }; }
  if (pr.state !== 'open' || pr.draft) return { ok: false, status: 409, error: 'The PR is not open and ready (state ' + pr.state + (pr.draft ? ', draft' : '') + ').' };
  if (pr.head && pr.head.sha !== job.commit_sha) return { ok: false, status: 409, error: 'The branch changed after the tests ran. Review it on GitHub.' };
  try {
    const res = await github.mergePR(job.repo, job.pr_number, job.commit_sha, `SpeakUp AI Factory job #${job.id}`);
    const moved = await transition(job, 'DEPLOYING', { actor: user.email, user_id: user.id, req, detail: { merged_via: 'speakup', sha: res.sha },
      fields: { merge_sha: res.sha, deploy_status: 'merged; waiting for Render' } });
    return { ok: true, job: moved || job };
  } catch (e) {
    await audit.record({ tenant_id: job.tenant_id, user_id: user.id, actor: user.email, action: 'job.merge_failed', entity: 'job', entity_id: job.id, detail: { error: e.message }, req });
    const hint = e.status === 403 ? ' The token cannot merge (needs Contents: write); merge on GitHub.' : '';
    return { ok: false, status: 502, error: e.message + hint };
  }
}

// ── Callbacks from the GitHub workflow (HMAC-signed, replay-guarded) ──────────
const CALLBACK_FIELDS = ['ts', 'job_id', 'event', 'status', 'plan_hash', 'commit_sha', 'files_changed',
  'tests_passed', 'tests_failed', 'tests_measured', 'run_url', 'message', 'nonce', 'changed_files', 'suite_modified'];
// What the job that runs Claude may report with its narrow progress token.
const PROGRESS_TOKEN_STATUSES = ['TESTING', 'FIXING'];

// Files a change touched vs files the approved plan named (or its path scope).
function changeScope(job) {
  const planned = new Set(((job.plan && job.plan.steps) || []).flatMap(s => (s.files || []).map(f => f.path)));
  const scope = (job.path_scope || []).map(s => String(s).replace(/\/+$/, ''));
  const files = Array.isArray(job.changed_files) ? job.changed_files : [];
  // No scope configured = the whole repository is in scope (same rule the planner uses).
  const inside = (p) => !scope.length || planned.has(p) || scope.some(s => p === s || p.startsWith(s + '/'));
  return { files, outside: files.filter(p => !inside(p)) };
}

function canonical(p) {
  return JSON.stringify(CALLBACK_FIELDS.map(k => (p[k] === undefined || p[k] === '' ? null : p[k])));
}

function verifySignature(payload, signature, progressToken) {
  const secret = security.factorySecret();
  if (!secret) return { ok: false, status: 423, error: 'factory secret not configured' };
  const ts = Number(payload.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return { ok: false, status: 401, error: 'stale or missing timestamp' };
  if (progressToken) {
    // The untrusted build job: only TESTING/FIXING progress or a failure report, for its own job.
    if (!security.verifyWorkflowToken('progress', toInt(payload.job_id), progressToken)) return { ok: false, status: 401, error: 'bad progress token' };
    const allowed = (payload.event === 'status' && PROGRESS_TOKEN_STATUSES.includes(payload.status)) || payload.event === 'failed';
    if (!allowed) return { ok: false, status: 403, error: 'a progress token cannot report this event' };
  } else if (!security.safeEqualHex(security.hmac(secret, canonical(payload)), String(signature || ''))) return { ok: false, status: 401, error: 'bad signature' };
  if (!/^[a-f0-9]{16,64}$/.test(String(payload.nonce || ''))) return { ok: false, status: 400, error: 'bad nonce' };
  return { ok: true };
}

function toInt(v) { const n = parseInt(v, 10); return Number.isFinite(n) && n >= 0 ? n : null; }

async function applyCallback(payload, signature, progressToken) {
  const v = verifySignature(payload, signature, progressToken);
  if (!v.ok) return v;
  const job = await Job.findByPk(toInt(payload.job_id));
  if (!job) return { ok: false, status: 404, error: 'job not found' };
  if (payload.plan_hash !== job.plan_hash) {
    await audit.record({ tenant_id: job.tenant_id, actor: 'github-actions', action: 'callback.rejected', entity: 'job', entity_id: job.id, detail: { reason: 'plan_hash mismatch' } });
    return { ok: false, status: 409, error: 'plan hash mismatch' };
  }
  const nonces = Array.isArray(job.callback_nonces) ? job.callback_nonces : [];
  if (nonces.includes(payload.nonce)) return { ok: false, status: 409, error: 'replayed callback' };
  await Job.update({ callback_nonces: [...nonces, payload.nonce].slice(-40) }, { where: { id: job.id } });
  if (TERMINAL.includes(job.status)) {
    await audit.record({ tenant_id: job.tenant_id, actor: 'github-actions', action: 'callback.after_terminal', entity: 'job', entity_id: job.id, detail: { event: payload.event, status: payload.status } });
    return { ok: true, ignored: true };
  }
  const runUrl = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/actions\/runs\/\d+$/.test(String(payload.run_url || '')) ? payload.run_url : job.run_url;
  const actor = 'github-actions';

  if (payload.event === 'status') {
    const to = String(payload.status || '');
    if (!CALLBACK_STATUSES.includes(to)) return { ok: false, status: 400, error: 'status not settable by a callback' };
    if (job.status === to) { await Job.update({ updated_at: new Date(), run_url: runUrl }, { where: { id: job.id } }); return { ok: true, job }; }
    const moved = await transition(job, to, { actor, detail: { run_url: runUrl }, fields: { run_url: runUrl } });
    if (!moved) return { ok: false, status: 409, error: `cannot move ${job.status} -> ${to}` };
    return { ok: true, job: moved };
  }

  if (payload.event === 'failed') {
    const msg = String(payload.message || 'The workflow failed').replace(/[\r\n]+/g, ' ').slice(0, 400);
    const failed = await fail(job, msg + (runUrl ? ' (run: ' + runUrl + ')' : ''), { actor, fields: { run_url: runUrl } });
    return { ok: true, job: failed };
  }

  if (payload.event === 'pushed') {
    if (job.status !== 'PUSHING') return { ok: false, status: 409, error: 'pushed callback while ' + job.status };
    if (!/^[a-f0-9]{40}$/.test(String(payload.commit_sha || ''))) return { ok: false, status: 400, error: 'bad commit sha' };
    const measured = String(payload.tests_measured) === 'true';
    const tests = { measured, passed: measured ? toInt(payload.tests_passed) : null, failed: measured ? toInt(payload.tests_failed) : null,
      summary: String(payload.message || '').slice(0, 300) };
    const testsOk = measured && tests.failed === 0;
    let changed = [];
    try { changed = JSON.parse(String(payload.changed_files || '[]')); } catch (e) { changed = []; }
    changed = (Array.isArray(changed) ? changed : []).map(String).filter(p => p.length <= 300).slice(0, 500);
    const suiteModified = String(payload.suite_modified) === 'false' ? false : true;
    return openPullRequest(job, { commit_sha: payload.commit_sha, files_changed: toInt(payload.files_changed), tests, run_url: runUrl, testsOk,
      changed_files: changed, suite_modified: suiteModified });
  }
  return { ok: false, status: 400, error: 'unknown event' };
}

function prBody(job, projectName, tests, filesChanged, runUrl, extra) {
  extra = extra || {};
  const t = tests && tests.measured ? `${tests.passed} passed, ${tests.failed} failed` : 'not measured';
  return [
    `Opened by the SpeakUp AI Factory for job #${job.id}.`,
    '',
    `- Project: ${projectName} (registry key \`${job.project_key}\`)`,
    `- Base: \`${job.base_branch}\`${job.repo_sha ? ' (plan prepared against ' + String(job.repo_sha).slice(0, 7) + ')' : ''}`,
    `- Tests in CI: ${t}`,
    `- Files changed: ${filesChanged == null ? 'unknown' : filesChanged}`,
    extra.suite_modified != null ? `- Edited a test suite the factory runs: ${extra.suite_modified ? 'YES, review the tests themselves' : 'no'}` : null,
    extra.outside != null ? `- Files outside the approved plan: ${extra.outside}` : null,
    runUrl ? `- Workflow run: ${runUrl}` : null,
    '',
    'The approved requirements, their source conversations and the plan are kept private in SpeakUp:',
    `${BASE_URL}/?job=${job.id} (sign-in required).`,
    'This repository is public, so no meeting content is written into this PR.',
    '',
    'Merging to the default branch triggers the normal Render deployment.'
  ].filter(l => l !== null).join('\n');
}

async function openPullRequest(job, { commit_sha, files_changed, tests, run_url, testsOk, changed_files, suite_modified }) {
  const project = await projects.get(job.tenant_id, job.project_key);
  const name = project ? project.name : job.project_key;
  const outside = changeScope(Object.assign({}, job.get ? job.get({ plain: true }) : job, { changed_files })).outside.length;
  let pr;
  try {
    pr = await github.findOpenPR(job.repo, job.branch);
    if (!pr) {
      pr = await github.createPR(job.repo, { title: `SpeakUp AI Factory · job #${job.id} (${name})`, head: job.branch,
        base: job.base_branch, body: prBody(job, name, tests, files_changed, run_url, { suite_modified, outside }), draft: !testsOk });
    }
  } catch (e) {
    const failed = await fail(job, `The branch ${job.branch} was pushed but the PR could not be opened: ${e.message}`,
      { actor: 'system', fields: { commit_sha, files_changed, tests, run_url, changed_files, suite_modified } });
    return { ok: true, job: failed };
  }
  const created = await transition(job, 'PR_CREATED', { actor: 'system', detail: { pr: pr.number, draft: !!pr.draft },
    fields: { commit_sha, files_changed, tests, run_url, changed_files, suite_modified, pr_number: pr.number, pr_url: pr.html_url, pr_draft: !!pr.draft } });
  if (!created) return { ok: false, status: 409, error: 'job moved while opening the PR' };
  if (testsOk) {
    const ready = await transition(created, 'READY_FOR_REVIEW', { actor: 'system', detail: { tests } }) || created;
    return { ok: true, job: await autoMerge(ready) };
  }
  const why = tests.measured ? `Tests still failing after the fix rounds (${tests.failed} failed). Draft PR #${pr.number} kept for review.`
    : `Tests could not be measured. Draft PR #${pr.number} kept for review.`;
  return { ok: true, job: await fail(created, why, { actor: 'system' }) };
}

// ── Brief for the workflow (HMAC over "brief.<job>.<ts>") ─────────────────────
function verifyBriefRequest(jobId, ts, sig) {
  const secret = security.factorySecret();
  if (!secret) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(Date.now() / 1000 - t) > 300) return false;
  return security.safeEqualHex(security.hmac(secret, `brief.${jobId}.${t}`), String(sig || ''));
}

// ── Watchdog: no job may silently disappear ───────────────────────────────────
const MIN = 60 * 1000;
const LIMITS = {
  prepare: Number(process.env.SPEAKUP_FACTORY_PREPARE_TIMEOUT_MIN || 20) * MIN,
  dispatch: Number(process.env.SPEAKUP_FACTORY_DISPATCH_TIMEOUT_MIN || 15) * MIN,
  progress: Number(process.env.SPEAKUP_FACTORY_PROGRESS_TIMEOUT_MIN || 75) * MIN,
  deploy: Number(process.env.SPEAKUP_FACTORY_DEPLOY_TIMEOUT_MIN || 60) * MIN
};

async function claimBatch() {
  const [rows] = await sequelize.query(
    `UPDATE su_jobs SET poll_claimed_at = NOW()
      WHERE id IN (SELECT id FROM su_jobs
                    WHERE status IN ('ANALYZING','PLANNING','QUEUED','CODING','TESTING','FIXING','PUSHING','PR_CREATED','READY_FOR_REVIEW','DEPLOYING')
                      AND (poll_claimed_at IS NULL OR poll_claimed_at < NOW() - INTERVAL '3 minutes')
                    ORDER BY updated_at ASC LIMIT 20 FOR UPDATE SKIP LOCKED)
      RETURNING id`);
  return Job.findAll({ where: { id: rows.map(r => r.id) } });
}

async function checkJob(job, now) {
  const age = now - new Date(job.updated_at).getTime();
  const project = await projects.get(job.tenant_id, job.project_key);
  const wf = job.workflow_file || (project && project.workflow_file) || 'speakup-factory.yml';

  if (['ANALYZING', 'PLANNING'].includes(job.status) && age > LIMITS.prepare) {
    return fail(job, 'Preparation was interrupted (the server restarted or the model did not answer). Say "prepare" again.');
  }
  if (['QUEUED', 'CODING', 'TESTING', 'FIXING', 'PUSHING'].includes(job.status)) {
    const limit = job.status === 'QUEUED' ? LIMITS.dispatch : LIMITS.progress;
    if (age <= limit) return job;
    if (!github.configured()) return fail(job, `No progress for ${Math.round(age / MIN)} minutes and GitHub is not connected to check the run.`);
    let run = null;
    try { run = await github.findRun(job.repo, wf, job.id); } catch (e) {
      return fail(job, `No progress for ${Math.round(age / MIN)} minutes and the run could not be checked: ${e.message}`);
    }
    if (!run) return fail(job, job.status === 'QUEUED' ? 'The GitHub workflow never started.' : 'The GitHub run could not be found.');
    if (run.status !== 'completed') return job;
    // QUEUED means not one callback arrived: the run could not talk to SpeakUp at all,
    // which is what a missing or mistyped GitHub secret looks like from here.
    const hint = job.status === 'QUEUED'
      ? ' The run never reported back at all, which usually means the GitHub Actions secret SPEAKUP_FACTORY_SECRET is missing or does not match the value on Render.'
      : '';
    return fail(job, `The GitHub run ended (${run.conclusion}) without reporting back.` + hint, { fields: { run_url: run.html_url } });
  }
  if (job.status === 'PR_CREATED' && age > 10 * MIN) {
    if (job.tests && job.tests.measured && job.tests.failed === 0) return transition(job, 'READY_FOR_REVIEW', { detail: { recovered: true } });
    return fail(job, 'Tests were not measured as passing. Draft PR kept for review.');
  }
  if (job.status === 'READY_FOR_REVIEW' && github.configured() && job.pr_number) {
    const pr = await github.getPR(job.repo, job.pr_number);
    if (pr.merged) return transition(job, 'DEPLOYING', { detail: { merged_on: 'github' }, fields: { merge_sha: pr.merge_commit_sha, deploy_status: 'merged; waiting for Render' } });
    if (pr.state === 'closed') return transition(job, 'CANCELLED', { detail: { reason: 'PR closed without merging' }, fields: { error: 'PR closed without merging' } });
    return job;
  }
  if (job.status === 'DEPLOYING' && job.merge_sha) {
    const deployed = process.env.RENDER_GIT_COMMIT;
    if (deployed) {
      let live = deployed === job.merge_sha;
      if (!live && github.configured()) {
        try { live = ['identical', 'ahead'].includes(await github.compare(job.repo, job.merge_sha, deployed)); } catch (e) { live = false; }
      }
      if (live) return transition(job, 'DEPLOYED', { detail: { deployed_sha: deployed }, fields: { deploy_status: 'live on Render (' + deployed.slice(0, 7) + ')' } });
    }
    if (age > LIMITS.deploy && job.deploy_status !== 'not seen live after 60 min') {
      await Job.update({ deploy_status: 'not seen live after 60 min' }, { where: { id: job.id } });
      await audit.record({ tenant_id: job.tenant_id, action: 'job.deploy_not_seen', entity: 'job', entity_id: job.id, detail: { deployed: deployed || null } });
    }
  }
  return job;
}

async function tick() {
  const now = Date.now();
  const batch = await claimBatch();
  for (const job of batch) {
    try { await checkJob(job, now); } catch (e) {
      console.error('SpeakUp factory watchdog error for job', job.id, e.message);
      await audit.record({ tenant_id: job.tenant_id, action: 'job.watchdog_error', entity: 'job', entity_id: job.id, detail: { error: e.message } });
    }
  }
  return batch.length;
}

let timer = null;
function startWatchdog() {
  const flag = process.env.SPEAKUP_FACTORY_POLLER;
  if (flag === 'off') return false;
  if (process.env.NODE_ENV !== 'production' && flag !== 'on') return false;
  if (timer) return true;
  timer = setInterval(() => { tick().catch(e => console.error('SpeakUp factory watchdog tick failed:', e.message)); }, 60 * 1000);
  if (timer.unref) timer.unref();
  return true;
}

async function latestFor(tenant_id, filter) {
  return Job.findOne({ where: Object.assign({ tenant_id }, filter || {}), order: [['created_at', 'DESC']] });
}

module.exports = {
  STATUSES, TERMINAL, NEXT, CALLBACK_STATUSES, CALLBACK_FIELDS, PROGRESS_TOKEN_STATUSES, EVENT_KINDS, changeScope, addEvents, BASE_URL, branchFor, canMove, transition, fail,
  describe, readiness, approveAndDispatch, autoDispatch, autoRunEnabled, autoMerge, autoMergeEnabled, cancel, merge, canonical, applyCallback, verifyBriefRequest,
  checkJob, tick, startWatchdog, latestFor, prBody, Op
};
