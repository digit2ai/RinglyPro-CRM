'use strict';

/**
 * Claude Code — the run store and the live event bus.
 *
 * ONE PLACE WRITES AN EVENT. Every event is redacted, persisted to cc_run_events and
 * pushed to whoever is watching the run over SSE, in that order — so the console and the
 * database can never disagree about what happened, and a browser that connects late
 * replays the stored rows and then joins the live stream.
 *
 * The bus is in memory, per instance, and says so: a second Render instance would not
 * see this one's events live. That is acceptable because the runner is also per instance
 * (it holds the workspace on local disk), and the page falls back to polling the stored
 * rows — but it is a real limit, not an oversight.
 */

const { EventEmitter } = require('events');
const { Op } = require('sequelize');
// Resolved at CALL time, not at require time: destructuring here would bind this module to
// the exact objects that existed on first load, which is what makes the store untestable
// without a database and would silently ignore any later swap.
const models = require('../models');
const { redact, clip } = require('./redact');

const bus = new EventEmitter();
bus.setMaxListeners(0);

const TERMINAL = ['merged', 'deployed', 'failed', 'cancelled'];
const STATUSES = ['queued', 'cloning', 'running', 'testing', 'pushing', 'pr_open', ...TERMINAL];

function isTerminal(status) { return TERMINAL.includes(String(status)); }

async function emit(runId, kind, payload) {
  const safe = redact(payload || {});
  let row = null;
  try {
    row = await models.CcRunEvent.create({ run_id: runId, kind: String(kind || 'log').slice(0, 20), payload: safe });
  } catch (e) {
    // A failed event write must never kill a run that is otherwise working.
    console.error('CLAUDE CODE event write failed', runId, kind, e.message);
  }
  const out = { id: row ? row.id : 0, run_id: runId, ts: row ? row.ts : new Date(), kind, payload: safe };
  bus.emit('run:' + runId, out);
  return out;
}

/**
 * A status change is itself an event, so the console needs no second channel to learn it.
 *
 * IT IS A COMPARE-AND-SWAP, AND THAT IS THE CANCEL FIX. A plain update wrote any status over
 * any status, so a cancel landing between the pipeline's check and its next write was simply
 * overwritten: cancelled -> running (the operator then saw "Failed"), or worse, during the
 * push window, cancelled -> pushing -> pr_open and, with auto-merge on, into main. The UPDATE
 * now refuses to leave a terminal status, and returns whether the row actually moved so the
 * caller can abandon the pipeline instead of carrying on against a run somebody stopped.
 */
async function setStatus(run, status, fields) {
  if (!STATUSES.includes(status)) throw new Error('unknown status ' + status);
  const patch = Object.assign({ status }, fields || {});
  if (status === 'cloning' && !run.started_at) patch.started_at = new Date();
  if (isTerminal(status) && !run.finished_at) patch.finished_at = new Date();

  const [count] = await models.CcRun.update(patch, {
    where: { id: run.id, status: { [Op.notIn]: TERMINAL } }
  });
  if (!count) {
    // Somebody reached a terminal status first. Refresh the instance so the caller reports the
    // truth, and say plainly that nothing moved.
    try { await run.reload(); } catch (e) { /* the row may be gone */ }
    return null;
  }
  Object.assign(run, patch);
  await emit(run.id, 'system', { status, ...publicFields(fields) });
  bus.emit('status:' + run.id, status);
  return run;
}

// The one write that is ALLOWED to land on a terminal row, because it is the one making it
// terminal: the cancel itself. Everything else goes through setStatus.
async function forceStatus(run, status, fields) {
  const patch = Object.assign({ status }, fields || {});
  if (isTerminal(status) && !run.finished_at) patch.finished_at = new Date();
  await models.CcRun.update(patch, { where: { id: run.id } });
  Object.assign(run, patch);
  await emit(run.id, 'system', { status, ...publicFields(fields) });
  bus.emit('status:' + run.id, status);
  return run;
}

// Only the fields a browser may see travel with the status event.
function publicFields(f) {
  if (!f) return {};
  const allow = ['work_branch', 'pr_url', 'commit_sha', 'deploy_url', 'error', 'cost_usd', 'turns', 'tokens_in', 'tokens_out', 'session_id'];
  const out = {};
  for (const k of allow) if (f[k] !== undefined) out[k] = f[k];
  return out;
}

/**
 * TRANSIENT: streamed to whoever is watching, never written down.
 *
 * A text delta is one fragment of one sentence. Persisting them would put thousands of rows in
 * cc_run_events for every run, to reconstruct a message the finished assistant event already
 * carries in full. So they go to the bus only — the stream is how an answer gets to the screen,
 * and the stored message remains the single truth about what was said.
 */
function push(runId, kind, payload) {
  const safe = redact(payload || {});
  bus.emit('run:' + runId, { id: 0, run_id: runId, ts: new Date(), kind, payload: safe });
}

async function log(runId, text) {
  return emit(runId, 'log', { text: clip(text, 2000) });
}

function subscribe(runId, fn) {
  const ch = 'run:' + runId;
  bus.on(ch, fn);
  return () => bus.off(ch, fn);
}

function view(run) {
  return {
    id: run.id, repo_full_name: run.repo_full_name, base_branch: run.base_branch, work_branch: run.work_branch,
    thread_id: run.thread_id, brief: run.brief, summary: run.summary, source: run.source, source_ref: run.source_ref, status: run.status,
    pr_url: run.pr_url, commit_sha: run.commit_sha, deploy_url: run.deploy_url,
    cost_usd: run.cost_usd == null ? null : Number(run.cost_usd),
    tokens_in: run.tokens_in, tokens_out: run.tokens_out, turns: run.turns,
    error: run.error, started_at: run.started_at, finished_at: run.finished_at, created_at: run.created_at,
    terminal: isTerminal(run.status)
  };
}

async function own(tenantId, id) {
  return models.CcRun.findOne({ where: { tenant_id: tenantId, id } });
}

module.exports = { bus, emit, push, setStatus, forceStatus, log, subscribe, view, own, isTerminal, TERMINAL, STATUSES };
