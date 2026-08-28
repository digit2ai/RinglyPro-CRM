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

/**
 * Parse the model's rewrites.
 *
 * The first cut sliced from the first "{" to the last "}", which silently
 * returned NOTHING when the model answered with a bare array instead of the
 * requested {"rewrites":[...]} — the slice then spanned "},{" and failed to
 * parse. That is exactly what happened to the spec generator in production:
 * 1390 output tokens, zero rewrites applied, zero rejected, and composed_by
 * quietly reading "deterministic". A model path that does nothing must not be
 * indistinguishable from one that was never called, so this accepts both
 * shapes and the caller reports what it saw.
 */
function parseRewrites(text) {
  if (!text) return [];
  let s = String(text).trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();

  const pick = function (obj) {
    if (Array.isArray(obj)) return obj;
    if (obj && Array.isArray(obj.rewrites)) return obj.rewrites;
    return null;
  };
  // 1. the whole thing, as sent
  try { const got = pick(JSON.parse(s)); if (got) return got; } catch (e) { /* keep trying */ }
  // 2. a bare array anywhere in the text
  const a0 = s.indexOf('['), a1 = s.lastIndexOf(']');
  if (a0 !== -1 && a1 > a0) {
    try { const got = pick(JSON.parse(s.slice(a0, a1 + 1))); if (got) return got; } catch (e) { /* keep trying */ }
  }
  // 3. an object wrapper with prose around it
  const o0 = s.indexOf('{'), o1 = s.lastIndexOf('}');
  if (o0 !== -1 && o1 > o0) {
    try { const got = pick(JSON.parse(s.slice(o0, o1 + 1))); if (got) return got; } catch (e) { /* give up */ }
  }
  return [];
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
  // Observability: a model that answered but changed nothing must look
  // different from a model that was never called.
  let model_text_chars = 0, model_rewrites_parsed = 0, model_rewrites_accepted = 0;
  let model_text_sample = null;

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
        model_text_chars = (out.text || '').length;
        model_rewrites_parsed = rewrites.length;
        model_rewrites_accepted = accepted;
        // When the model answers and NOTHING parses, keep a short sample of
        // what it actually sent. Without it the only signal is a token bill
        // and a record that did not change.
        if (!rewrites.length && model_text_chars) model_text_sample = String(out.text).slice(0, 400);
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
    model_text_chars: model_text_chars,
    model_rewrites_parsed: model_rewrites_parsed,
    model_rewrites_accepted: model_rewrites_accepted,
    model_text_sample: model_text_sample,
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
