'use strict';

/**
 * THE JobMD.io PLATFORM ARCHITECTURE SPEC GENERATOR.
 *
 * Same doctrine as the Build Plan Architect: spec-plan.js produces the whole
 * record deterministically from corpus.js, and the model is offered only a
 * narrow prose rewrite. A rewrite is accepted only if it introduces no
 * identifier absent from the sources and the whole record still verifies.
 *
 * READ-ONLY WITH RESPECT TO EVERY RUNTIME SYSTEM. This module and the two it
 * depends on never import models.js or db.js, never open a socket to anything
 * but the model, and cannot execute, deploy or migrate. SIT greps the files
 * rather than trusting this paragraph.
 */

const C = require('./corpus');
const { buildRecord } = require('./spec-plan');
const { verifyRecord } = require('./spec-verify');
const { unverifiedIdentifiers } = require('./verify');
const { MODEL, callModel, parseRewrites } = require('./architect');

const MAX_REWRITES = 40;

function corpusText() { return JSON.stringify(C) + ' ' + JSON.stringify(buildRecord()); }

/** The only prose the model may touch. Nothing else is reachable. */
function proseSlots(rec) {
  const slots = [];
  rec.reuseAnalysis.forEach(function (r, i) {
    slots.push({ path: ['reuseAnalysis', i, 'rationale'], subject: r.jobUpDevItem, text: r.rationale });
  });
  rec.openQuestions.forEach(function (q, i) {
    slots.push({ path: ['openQuestions', i, 'question'], subject: q.topic, text: q.question });
  });
  slots.push({ path: ['project', 'positioning'], subject: 'JobMD.io positioning', text: rec.project.positioning });
  slots.push({ path: ['medicalSpecialties', 'extensionMechanism'], subject: 'specialty taxonomy', text: rec.medicalSpecialties.extensionMechanism });
  return slots.slice(0, MAX_REWRITES);
}

function setPath(obj, path, value) {
  let node = obj;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
  node[path[path.length - 1]] = value;
}

function buildPrompt(slots) {
  const lines = slots.map(function (s, i) { return i + '. SUBJECT: ' + s.subject + '\n   CURRENT: ' + s.text; }).join('\n');
  return [
    'You are copy-editing an architecture record for JobMD.io, a physician and surgeon',
    'recruitment platform built as a division of JobUp.dev.',
    '',
    'Rewrite each CURRENT sentence so it reads more clearly and concretely.',
    '',
    'ABSOLUTE RULES:',
    '- Do NOT introduce any table, column, file path, API route, MCP endpoint, metric,',
    '  product name or component name that is not already in the CURRENT text.',
    '- Do NOT include any contact detail, licence number, credentialing record or any',
    '  other identifiable data about a physician, candidate or hospital.',
    '- Keep every proper noun exactly as written: JobMD.io, JobUp.dev, IDNs, Talent',
    '  Intelligence Record, Robotics Division, JobMD.io Recruiters, Platform Administrators,',
    '  and the agent names.',
    '- Keep each rewrite to one or two sentences.',
    '',
    'Return JSON only: {"rewrites":[{"i":0,"text":"..."}]}. No prose, no code fences.',
    '',
    lines
  ].join('\n');
}

async function composeRecord(opts) {
  opts = opts || {};
  const record = buildRecord();
  const started = Date.now();

  let composed_by = 'deterministic';
  let is_simulated = true;
  const rejected = [];
  let usage = null;
  let model_error = null;
  let model_text_chars = 0, model_rewrites_parsed = 0, model_rewrites_accepted = 0;
  let model_text_sample = null;

  if (opts.use_model !== false && process.env.ANTHROPIC_API_KEY) {
    const slots = proseSlots(record);
    try {
      const out = await callModel(buildPrompt(slots));
      if (out) {
        const hay = corpusText();
        let accepted = 0;
        const rewrites = parseRewrites(out.text);
        rewrites.forEach(function (r) {
          const i = Number(r && r.i);
          const text = r && typeof r.text === 'string' ? r.text.trim() : '';
          const slot = slots[i];
          if (!slot || !text) return;
          const unv = unverifiedIdentifiers(text, hay + ' ' + slot.text);
          if (unv.length) { rejected.push({ path: slot.path.join('.'), reason: 'introduced unverified identifiers', tokens: unv }); return; }
          const probe = JSON.parse(JSON.stringify(record));
          setPath(probe, slot.path, text);
          if (!verifyRecord(probe).ok) { rejected.push({ path: slot.path.join('.'), reason: 'rewrite failed constraint verification' }); return; }
          setPath(record, slot.path, text);
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
    } catch (e) { model_error = e.message; }
  }

  // FINAL GATE. Nothing leaves unverified, model path or not.
  const verification = verifyRecord(record);

  return {
    record: verification.ok ? record : null,
    ok: verification.ok,
    verification: verification,
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
      medical_specialties: record.medicalSpecialties.initialSpecialties.length,
      agents: record.mcpArchitecture.agents.length,
      recruitment_pipeline_stages: record.recruitmentPipeline.stages.length,
      matching_dimensions: record.matchingEngine.dimensions.length,
      reuse_analysis: record.reuseAnalysis.length,
      talent_record_fields: record.physicianIntelligenceProfile.fields.length,
      hospital_profile_fields: record.hospitalClientIntelligenceProfile.fields.length,
      open_questions: record.openQuestions.length,
      blocking_open_questions: record.openQuestions.filter(function (q) { return q.blocksBuild; }).length
    }
  };
}

module.exports = { composeRecord, MODEL, proseSlots };
