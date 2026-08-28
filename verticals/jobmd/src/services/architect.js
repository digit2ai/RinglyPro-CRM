'use strict';

/**
 * THE JobMD BUILD PLAN ARCHITECT.
 *
 * Converts the JobMD.io project request into the declared build-plan JSON.
 *
 * THE MODEL WRITES PROSE. IT NEVER WRITES A NAMED ENTITY.
 *
 * plan.js produces the entire structure deterministically from corpus.js. The
 * model is offered a narrow rewrite job — improve the wording of a reason, a
 * purpose or a mitigation — and each rewrite is accepted only if it survives
 * three checks: it stays a string, it introduces no identifier absent from the
 * source text, and it introduces nothing PHI-shaped. A rejected rewrite falls
 * back to the deterministic prose, which is always present.
 *
 * The consequence, asserted by SIT: the plan is STRUCTURALLY IDENTICAL with and
 * without ANTHROPIC_API_KEY. Only wording changes, and the response says which
 * path produced it. There is no silent fake.
 */

const C = require('./corpus');
const { buildPlan, buildEvidence } = require('./plan');
const { verifyPlan, unverifiedIdentifiers } = require('./verify');

const MODEL = process.env.JOBMD_MODEL || 'claude-haiku-4-5-20251001';
const MAX_REWRITES = 40;

// The corpus text an identifier must appear in to count as verified.
function corpusText() {
  return JSON.stringify(C) + ' ' + JSON.stringify(buildPlan());
}

/** The prose slots the model may touch. Nothing else is reachable. */
function proseSlots(plan) {
  const slots = [];
  plan.reuse_inventory.forEach(function (r, i) {
    slots.push({ path: ['reuse_inventory', i, 'reason'], subject: r.jobup_component, text: r.reason });
  });
  plan.new_components.forEach(function (n, i) {
    slots.push({ path: ['new_components', i, 'purpose'], subject: n.component, text: n.purpose });
  });
  plan.risks.forEach(function (r, i) {
    slots.push({ path: ['risks', i, 'mitigation'], subject: r.risk, text: r.mitigation });
  });
  return slots.slice(0, MAX_REWRITES);
}

function setPath(obj, path, value) {
  let node = obj;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
  node[path[path.length - 1]] = value;
}

function buildRewritePrompt(slots) {
  const lines = slots.map(function (s, i) {
    return i + '. SUBJECT: ' + s.subject + '\n   CURRENT: ' + s.text;
  }).join('\n');
  return [
    'You are copy-editing an architecture build plan for JobMD.io, a physician and surgeon',
    'recruitment platform built as a division of JobUp.dev.',
    '',
    'Rewrite each CURRENT sentence so it reads more clearly and concretely.',
    '',
    'ABSOLUTE RULES:',
    '- Do NOT introduce any table name, column, file path, API route, endpoint, metric, product',
    '  name or component name that is not already in the CURRENT text.',
    '- Do NOT include any email address, phone number, person name, licence number or any other',
    '  detail about a real physician, candidate or hospital.',
    '- Keep every proper noun exactly as written: JobMD.io, JobUp.dev, IDNs, Talent Intelligence',
    '  Record, Robotics Division, and the agent names.',
    '- Keep each rewrite to one or two sentences.',
    '',
    'Return JSON only: {"rewrites":[{"i":0,"text":"..."}]}. No prose, no code fences.',
    '',
    lines
  ].join('\n');
}

async function callModel(prompt) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  let Anthropic;
  try { Anthropic = require('@anthropic-ai/sdk'); }
  catch (e) { return null; }
  const client = new Anthropic({ apiKey: key });
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    temperature: 0,               // the spec pins temperature to 0
    messages: [{ role: 'user', content: prompt }]
  });
  const text = (res.content || []).map(function (b) { return b.text || ''; }).join('');
  const usage = res.usage || {};
  return { text: text, usage: usage };
}

function parseRewrites(text) {
  if (!text) return [];
  let s = String(text).trim();
  // Strip a code fence if the model added one despite being told not to.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start === -1 || end === -1) return [];
  try {
    const obj = JSON.parse(s.slice(start, end + 1));
    return Array.isArray(obj.rewrites) ? obj.rewrites : [];
  } catch (e) { return []; }
}

/**
 * Compose the build plan.
 * @param {{use_model?:boolean}} opts
 */
async function composePlan(opts) {
  opts = opts || {};
  const plan = buildPlan();
  const evidence = buildEvidence();
  const started = Date.now();

  let composed_by = 'deterministic';
  let is_simulated = true;      // true = no model wrote any of this prose
  let rejected = [];
  let usage = null;
  let model_error = null;

  const wantModel = opts.use_model !== false && Boolean(process.env.ANTHROPIC_API_KEY);

  if (wantModel) {
    const slots = proseSlots(plan);
    try {
      const out = await callModel(buildRewritePrompt(slots));
      if (out) {
        const hay = corpusText();
        const rewrites = parseRewrites(out.text);
        let accepted = 0;
        rewrites.forEach(function (r) {
          const i = Number(r && r.i);
          const text = r && typeof r.text === 'string' ? r.text.trim() : '';
          const slot = slots[i];
          if (!slot || !text) return;

          // Guard 1 — no invented identifier.
          const unv = unverifiedIdentifiers(text, hay + ' ' + slot.text);
          if (unv.length) {
            rejected.push({ path: slot.path.join('.'), reason: 'introduced unverified identifiers', tokens: unv });
            return;
          }
          // Guard 2 — nothing PHI-shaped. Checked again on the whole plan below.
          const probe = JSON.parse(JSON.stringify(plan));
          setPath(probe, slot.path, text);
          if (!verifyPlan(probe).ok) {
            rejected.push({ path: slot.path.join('.'), reason: 'rewrite failed constraint verification' });
            return;
          }
          setPath(plan, slot.path, text);
          accepted++;
        });
        if (accepted > 0) { composed_by = 'model'; is_simulated = false; }
        usage = out.usage || null;
      }
    } catch (e) {
      // A model failure never fails the plan — it falls back to deterministic
      // prose, and says so, rather than returning nothing.
      model_error = e.message;
    }
  }

  // FINAL GATE. Nothing leaves this function unverified, model path or not.
  const verification = verifyPlan(plan);

  return {
    plan: verification.ok ? plan : null,
    ok: verification.ok,
    verification: verification,
    evidence: evidence,
    composed_by: composed_by,
    is_simulated: is_simulated,
    model: composed_by === 'model' ? MODEL : null,
    model_error: model_error,
    rejected_rewrites: rejected,
    usage: usage,
    duration_ms: Date.now() - started,
    counts: {
      medical_specialties: plan.medical_specialties.initial.length,
      agents: plan.agents.length,
      recruitment_pipeline_stages: plan.recruitment_pipeline.length,
      matching_dimensions: plan.matching_engine.dimensions.length,
      reuse_inventory: plan.reuse_inventory.length,
      new_components: plan.new_components.length,
      build_phases: plan.build_phases.length,
      open_questions: plan.open_questions.length
    }
  };
}

module.exports = { composePlan, MODEL, proseSlots, parseRewrites, callModel };
