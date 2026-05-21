'use strict';

// Classifier — decides which agent (research / draft / triage / none)
// should handle a given task. Cheap path: regex on title; if it does
// not match a confident bucket, call Haiku once for the verdict.
// Idempotent: callers should only invoke when agent_status IS NULL.
//
// Triggers per spec:
//   research  — task title matches /research|investigate|analyze|compare|evaluate|study|benchmark|estimar|investigar|analizar/i
//   draft     — task title matches /^(send|email|draft|follow.?up|reach out|propose|prepare presentation|prepara|enviar|redactar|escribir)/i
//   triage    — not used at task level (triage runs on intake projects via inboxTriageAgent)

const { Task } = require('../../models');

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';

const RESEARCH_RE = /research|investigate|analyze|compare|evaluate|study|benchmark|estimar|investigar|analizar/i;
const DRAFT_RE    = /^(send|email|draft|follow.?up|reach out|propose|prepare presentation|prepara|enviar|redactar|escribir)/i;

// Tag-based override: anyone can stuff "agent:research" / "agent:draft" into
// a task's description (or as a tag if Task ever gets a tags column).
function findTag(text, tagPrefix) {
  if (!text) return null;
  const re = new RegExp('(?:^|\\s)' + tagPrefix + ':(\\w+)', 'i');
  const m = String(text).match(re);
  return m ? m[1].toLowerCase() : null;
}

function classifyByHeuristics(task) {
  const title = String(task.title || '');
  const desc  = String(task.description || '');
  const tag = findTag(title + ' ' + desc, 'agent');
  if (tag === 'research' || tag === 'draft' || tag === 'triage') return tag;
  if (RESEARCH_RE.test(title)) return 'research';
  if (DRAFT_RE.test(title)) return 'draft';
  return null;
}

async function classifyWithClaude(task) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); } catch (_) { return null; }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const userMsg = `Classify this task into one of: research, draft, none.
- research: needs web research, competitive analysis, market sizing, benchmarking, or fact-finding
- draft: needs outreach/email/message/proposal/presentation drafting to a stakeholder
- none: routine work, no AI agent assistance needed

Task title: ${task.title}
Task description: ${(task.description || '').slice(0, 800)}

Reply with strict JSON only, no prose: {"agent_type":"research"|"draft"|"none"}`;
  try {
    const resp = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 60,
      messages: [{ role: 'user', content: userMsg }]
    });
    const text = resp?.content?.[0]?.text || '';
    const clean = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(clean);
    const v = parsed && parsed.agent_type;
    if (v === 'research' || v === 'draft') return v;
    return null;
  } catch (err) {
    console.warn('[agents/classifier] Haiku classify failed:', err.message);
    return null;
  }
}

// Public entry — runs heuristic first, then optional Claude fallback. Sets
// agent_type + agent_status on the row. Returns the chosen type or null.
async function classifyAndQueue(taskId, { useClaude = true } = {}) {
  try {
    const task = await Task.findOne({ where: { id: taskId, workspace_id: 1 } });
    if (!task) return null;
    if (task.agent_status) return task.agent_type; // already classified
    let chosen = classifyByHeuristics(task);
    if (!chosen && useClaude) chosen = await classifyWithClaude(task);
    if (!chosen) {
      // Mark as skipped so we do not re-classify on every save
      await task.update({ agent_type: null, agent_status: 'skipped' });
      return null;
    }
    await task.update({ agent_type: chosen, agent_status: 'pending', agent_error: null });
    return chosen;
  } catch (err) {
    console.error('[agents/classifier] classifyAndQueue failed:', err.message);
    return null;
  }
}

module.exports = {
  classifyAndQueue,
  classifyByHeuristics,
  classifyWithClaude,
  RESEARCH_RE,
  DRAFT_RE,
  HAIKU_MODEL
};
