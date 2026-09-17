'use strict';

/**
 * WHAT THE FACTORY REMEMBERS BETWEEN INSTRUCTIONS (owner request 2026-09-17).
 *
 * Every instruction used to start from nothing: the planner saw one sentence plus the code, so
 * "no, put it on the existing page" read as a brand new request and it planned a new page. VS
 * Code feels smarter for one unglamorous reason — the whole conversation travels with every
 * turn. This is that, in the cheapest form that keeps a job reproducible:
 *
 *   - HOUSE RULES: a short text the owner writes once, read on every instruction (the same idea
 *     as CLAUDE.md in the editor). Capped, so it can never crowd out the instruction itself.
 *   - RECENT WORK: the last few instructions with what the plan decided and how it ended,
 *     rendered DETERMINISTICALLY from rows that already exist (su_commands + su_jobs). No model
 *     call, no second store to keep in step, and a hard character cap instead of a summariser.
 *
 * What it deliberately does NOT do: it never changes what is approved. The plan hash still
 * covers the plan alone, and the memory is context for writing it, not permission to widen it.
 */

const { Op } = require('sequelize');
const { Command, Job, Setting } = require('../models');

// A WORKSPACE IS A PROJECT (owner request 2026-09-17). Rules and remembered work are kept per
// project as well as globally: the global rules always apply, a project's rules are added on
// top, and a project only ever remembers its own instructions.
/* A NEW CONVERSATION (owner request 2026-09-17). Remembering the last eight instructions is
 * what makes a follow-up work; it is the wrong thing when the owner turns to something else.
 * "New conversation" writes a mark — the last instruction so far — and the remembered work
 * starts after it. Nothing is deleted: the history, the jobs and the audit are untouched, so
 * the mark can never destroy a record. It is per project, like the rest of the memory. */
const THREAD_KEY = 'thread_start';
const RULES_KEY = 'house_rules';
const projectKey = (k) => 'house_rules:' + String(k || '').slice(0, 60);
const RULES_MAX = 4000;
const THREAD_MAX = 2500;
const DEFAULT_RULES = [
  'Change what already exists. Never create a new page, screen or file when an existing one can carry the change, unless I ask for a new one.',
  'When I say show, display or add text, I mean something a visitor can SEE on the page.',
  'Keep every existing screen working. Do not rename or move things I did not mention.',
  'Write plainly in the plan: what I will see, and where.'
].join('\n');

async function rules(tenant_id, project_key) {
  const key = project_key ? projectKey(project_key) : RULES_KEY;
  const row = await Setting.findOne({ where: { tenant_id, key } });
  if (!row) return { text: project_key ? '' : DEFAULT_RULES, is_default: !project_key, project_key: project_key || null };
  return { text: String(row.value || '').slice(0, RULES_MAX), is_default: false, project_key: project_key || null };
}

async function setRules(tenant_id, text, project_key) {
  const key = project_key ? projectKey(project_key) : RULES_KEY;
  const value = String(text == null ? '' : text).replace(/\r/g, '').slice(0, RULES_MAX);
  const row = await Setting.findOne({ where: { tenant_id, key } });
  if (row) await row.update({ value, updated_at: new Date() });
  else await Setting.create({ tenant_id, key, value });
  return { text: value, is_default: false, project_key: project_key || null };
}

function line(cmd, job) {
  const asked = String(cmd.transcript || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  if (!asked) return '';
  const bits = [`you asked: "${asked}"`];
  if (job) {
    const flow = job.plan && Array.isArray(job.plan.workflow) ? job.plan.workflow.slice(0, 3).join('; ') : '';
    if (job.title) bits.push(`plan: ${String(job.title).slice(0, 80)}`);
    if (flow) bits.push(`steps: ${flow.slice(0, 200)}`);
    const revs = Array.isArray(job.revisions) ? job.revisions : [];
    if (revs.length) bits.push(`you corrected it: "${String(revs[revs.length - 1].text || '').replace(/\s+/g, ' ').slice(0, 120)}"`);
    bits.push(`ended ${job.status}`);
    const files = Array.isArray(job.changed_files) ? job.changed_files.slice(0, 4) : [];
    if (files.length) bits.push(`files: ${files.join(', ')}`);
  } else if (cmd.intent === 'ASK') bits.push('answered as a question, nothing was built');
  return '- ' + bits.join(' — ');
}

/**
 * The last few console instructions, oldest first, as plain lines. Capped by characters, so a
 * long history costs the same as a short one — the oldest lines are dropped, never summarised
 * by a model that could invent what happened.
 */
function threadKey(project_key) { return THREAD_KEY + (project_key ? ':' + String(project_key).slice(0, 60) : ''); }

// Start fresh: remember the newest instruction id, and only look after it from now on.
async function startNewThread(tenant_id, project_key) {
  const where = { tenant_id, mode: 'architect' };
  if (project_key) where.project_key = String(project_key).slice(0, 60);
  const last = await Command.findOne({ where, order: [['id', 'DESC']] });
  const value = String(last ? last.id : 0);
  const key = threadKey(project_key);
  const row = await Setting.findOne({ where: { tenant_id, key } });
  if (row) await row.update({ value, updated_at: new Date() }); else await Setting.create({ tenant_id, key, value });
  return { after_command_id: Number(value), project_key: project_key || null };
}
async function threadStart(tenant_id, project_key) {
  const row = await Setting.findOne({ where: { tenant_id, key: threadKey(project_key) } });
  return row ? (parseInt(row.value, 10) || 0) : 0;
}

async function recentWork(tenant_id, { limit = 8, exclude_command_id = null, project_key = null } = {}) {
  const where = { tenant_id, mode: 'architect' };
  if (project_key) where.project_key = String(project_key).slice(0, 60);
  const after = await threadStart(tenant_id, project_key);
  if (after) where.id = { [Op.gt]: after };
  if (exclude_command_id) where.id = Object.assign({}, where.id, { [Op.ne]: exclude_command_id });
  const cmds = await Command.findAll({ where, order: [['id', 'DESC']], limit: Math.min(limit, 20) });
  if (!cmds.length) return '';
  const jobIds = cmds.map(c => c.job_id).filter(Boolean);
  const jobs = jobIds.length ? await Job.findAll({ where: { tenant_id, id: jobIds } }) : [];
  const byId = new Map(jobs.map(j => [j.id, j]));
  const rows = cmds.reverse().map(c => ({ cmd: c, job: c.job_id ? byId.get(c.job_id) : null, text: line(c, c.job_id ? byId.get(c.job_id) : null) }))
    .filter(r => r.text);
  // COMPACTION, THE HONEST KIND. What does not fit is not dropped in silence and not handed to
  // a model that could invent what happened: the older instructions are counted, deterministically,
  // into one line — how many, and how they ended — so the planner still knows work came before.
  const kept = [];
  let size = 0, cut = 0;
  for (const r of rows.slice().reverse()) {           // newest first while filling…
    if (size + r.text.length > THREAD_MAX) { cut++; continue; }
    kept.unshift(r); size += r.text.length + 1;       // …oldest first in the result
  }
  if (!kept.length) return '';
  if (cut) {
    const older = rows.slice(0, rows.length - kept.length);
    const ends = {};
    for (const r of older) { const k = (r.job && r.job.status) || 'answered'; ends[k] = (ends[k] || 0) + 1; }
    const how = Object.keys(ends).sort().map(k => `${ends[k]} ${k.toLowerCase()}`).join(', ');
    kept.unshift(`- earlier: ${older.length} more instruction(s) before these (${how})`);
  }
  return kept.map(r => (typeof r === 'string' ? r : r.text)).join('\n');
}

// One block for a prompt. Empty string when there is nothing to say, so no prompt grows for free.
async function contextBlock(tenant_id, opts) {
  opts = opts || {};
  const r = await rules(tenant_id);
  const pr = opts.project_key ? await rules(tenant_id, opts.project_key) : { text: '' };
  const work = await recentWork(tenant_id, opts);
  const parts = [];
  if (r.text) parts.push('HOUSE RULES the owner set for every change (follow them unless this instruction says otherwise):\n' + r.text);
  if (pr.text) parts.push('RULES FOR THIS PROJECT (' + opts.project_key + '), on top of the house rules:\n' + pr.text);
  if (work) parts.push('RECENT WORK IN THIS CONSOLE, oldest first. The new instruction may be a follow-up to it — read it that way before assuming anything new:\n' + work);
  return parts.join('\n\n');
}

module.exports = { RULES_KEY, THREAD_KEY, projectKey, startNewThread, threadStart, RULES_MAX, THREAD_MAX, DEFAULT_RULES, rules, setRules, recentWork, contextBlock, line };
