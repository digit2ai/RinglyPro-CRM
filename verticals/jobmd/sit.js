'use strict';

/**
 * JobMD.io — System Integration Test.
 *
 * Asserts the INVARIANTS, not the happy path. Every constraint in the agent
 * spec is an absolute about what must never happen, so each one is attacked
 * here: a plan is deliberately tampered with and the verifier must refuse it.
 * A verifier that only ever sees valid input proves nothing.
 *
 * Zero external keys. The model path is exercised only if ANTHROPIC_API_KEY
 * happens to be set, and its absence is reported rather than skipped silently.
 *
 * Run: node verticals/jobmd/sit.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const express = require('express');

const ROOT = path.join(__dirname, '..', '..');
const C = require('./src/services/corpus');
const { buildPlan, buildEvidence } = require('./src/services/plan');
const { verifyPlan, unverifiedIdentifiers, SCHEMA_KEYS } = require('./src/services/verify');
const { composePlan } = require('./src/services/architect');

let pass = 0, fail = 0;
const failures = [];
function ok(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(name + (detail ? ' :: ' + detail : '')); }
}
function eq(name, a, b) { ok(name, a === b, 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/** Tamper with a valid plan and require the verifier to catch it. */
function mustReject(name, mutate, expectConstraint) {
  const p = clone(buildPlan());
  mutate(p);
  const r = verifyPlan(p);
  if (r.ok) { fail++; failures.push('NOT CAUGHT: ' + name); return; }
  if (expectConstraint && !r.violations.some(function (v) { return v.constraint === expectConstraint; })) {
    fail++; failures.push(name + ' :: caught but as ' + r.violations.map(function (v) { return v.constraint; }).join(',') +
      ', expected ' + expectConstraint);
    return;
  }
  pass++;
}

(async function run() {
  console.log('JobMD.io SIT\n' + '='.repeat(60));

  // ── 1. Corpus integrity ───────────────────────────────────────────────────
  eq('corpus: 15 medical specialties', C.MEDICAL_SPECIALTIES.length, 15);
  eq('corpus: 11 AI agents', C.AGENTS.length, 11);
  eq('corpus: 13 pipeline stages', C.RECRUITMENT_PIPELINE.length, 13);
  eq('corpus: 7 matching dimensions', C.MATCHING_DIMENSIONS.length, 7);
  eq('corpus: 25 Talent Intelligence Record fields', C.TALENT_INTELLIGENCE_RECORD_FIELDS.length, 25);
  eq('corpus: 19 Hospital/Client Profile fields', C.HOSPITAL_CLIENT_PROFILE_FIELDS.length, 19);
  eq('corpus: 9 Robotics Division fields', C.ROBOTICS_CAPTURED_FIELDS.length, 9);
  ok('corpus: pipeline order is 1..13 contiguous',
     C.RECRUITMENT_PIPELINE.every(function (s, i) { return s.order === i + 1; }));
  ok('corpus: first stage is Prospect', C.RECRUITMENT_PIPELINE[0].stage === 'Prospect');
  ok('corpus: last stage is Placement', C.RECRUITMENT_PIPELINE[12].stage === 'Placement');
  ok('corpus: source truncation is recorded', C.TALENT_DISCOVERY_TRUNCATED === true);

  // THE INVENTORY IS REAL, NOT A PLACEHOLDER. Every named JobUp.dev component
  // must resolve to a file on disk, or the plan is citing something invented.
  let missing = [];
  C.JOBUP_INVENTORY.forEach(function (e) {
    if (!fs.existsSync(path.join(ROOT, e.path))) missing.push(e.path);
  });
  ok('inventory: every JobUp component resolves to a real file', missing.length === 0, missing.join(', '));
  ok('inventory: no placeholder survived', !JSON.stringify(C.JOBUP_INVENTORY).includes('<JobUp'));

  // ── 2. The deterministic plan is valid ────────────────────────────────────
  const base = buildPlan();
  const v = verifyPlan(base);
  ok('plan: passes its own constraint verification', v.ok,
     v.violations.map(function (x) { return x.constraint + ':' + x.detail; }).join(' | '));
  ok('plan: top-level keys are exactly the declared schema',
     JSON.stringify(Object.keys(base).sort()) === JSON.stringify(SCHEMA_KEYS.slice().sort()));
  ok('plan: is JSON-serializable', (function () { try { JSON.parse(JSON.stringify(base)); return true; } catch (e) { return false; } })());
  eq('plan: 20 inventory entries classified', base.reuse_inventory.length, C.JOBUP_INVENTORY.length);
  eq('plan: 8 build phases', base.build_phases.length, 8);
  ok('plan: build phases depend only on earlier phases',
     base.build_phases.every(function (p) { return (p.depends_on_phases || []).every(function (d) { return d < p.phase; }); }));

  // ── 3. Instruction 3: no capability is left unmapped ──────────────────────
  const ev = buildEvidence();
  ok('capabilities: every capability carries a mapping',
     ev.capability_map.every(function (c) { return c.mapping && c.via; }));
  const known = C.JOBUP_INVENTORY.map(function (e) { return e.component; });
  const newNames = base.new_components.map(function (n) { return n.component; });
  const unmapped = ev.capability_map.filter(function (c) {
    if (c.mapping === 'new') return false;              // satisfied by a new component
    return known.indexOf(c.via) === -1;
  });
  ok('capabilities: every reuse mapping names a real JobUp component', unmapped.length === 0,
     unmapped.map(function (c) { return c.capability; }).join(', '));
  const newUnbacked = ev.capability_map.filter(function (c) {
    return c.mapping === 'new' && newNames.indexOf(c.via) === -1 &&
           !newNames.some(function (n) { return c.via.indexOf(n) !== -1 || n.indexOf(c.via) !== -1; });
  });
  ok('capabilities: every new mapping names a declared new component', newUnbacked.length === 0,
     newUnbacked.map(function (c) { return c.via; }).join(', '));

  // ── 4. Constraint enforcement — each attacked ─────────────────────────────
  mustReject('C6: dropping a specialty',    function (p) { p.medical_specialties.initial.splice(3, 1); }, 'no_reorder');
  mustReject('C6: reordering specialties',  function (p) { const a = p.medical_specialties.initial; const t = a[0]; a[0] = a[1]; a[1] = t; }, 'no_reorder');
  mustReject('C6: renaming a specialty',    function (p) { p.medical_specialties.initial[10] = 'Robotics'; }, 'no_reorder');
  mustReject('C6: dropping an agent',       function (p) { p.agents.splice(5, 1); }, 'no_reorder');
  mustReject('C6: reordering agents',       function (p) { const a = p.agents; const t = a[0]; a[0] = a[1]; a[1] = t; }, 'no_reorder');
  mustReject('C6: merging two agents',      function (p) { p.agents[3].name = 'Candidate Matching and Ranking Agent'; p.agents.splice(6, 1); }, 'no_reorder');
  mustReject('C6: dropping a pipeline stage', function (p) { p.recruitment_pipeline.splice(6, 1); }, 'no_reorder');
  mustReject('C6: reordering pipeline stages', function (p) { const a = p.recruitment_pipeline; const t = a[8]; a[8] = a[9]; a[9] = t; }, 'no_reorder');
  mustReject('C6: renumbering a stage',     function (p) { p.recruitment_pipeline[4].order = 99; }, 'no_reorder');
  mustReject('C6: dropping a matching dimension', function (p) { p.matching_engine.dimensions.splice(2, 1); }, 'no_reorder');
  mustReject('C6: renaming a matching dimension', function (p) { p.matching_engine.dimensions[1].dimension = 'Tech Match'; }, 'no_reorder');

  mustReject('C3: inventing a JobUp component', function (p) { p.reuse_inventory[0].jobup_component = 'JobUp Credentialing Service'; }, 'no_invented_component');
  mustReject('C3: inventing an MCP endpoint',   function (p) { p.reuse_inventory[1].jobup_component = 'JobUp /api/v1/credentials endpoint'; }, 'no_invented_component');
  mustReject('C3: leaving an entry unclassified', function (p) { p.reuse_inventory.pop(); }, 'no_fabrication');
  mustReject('C3: an invalid classification',   function (p) { p.reuse_inventory[2].classification = 'maybe'; }, 'declared_shape');

  mustReject('C8: agent authority on Offer',      function (p) { p.recruitment_pipeline[8].agents_authorized_to_update = ['Follow-Up Agent']; }, 'agent_authority');
  mustReject('C8: agent authority on Placement',  function (p) { p.recruitment_pipeline[12].agents_authorized_to_update = ['Recruiter Copilot']; }, 'agent_authority');
  mustReject('C8: agent authority on Credentialing', function (p) { p.recruitment_pipeline[11].agents_authorized_to_update = ['Clinical Qualification Agent']; }, 'agent_authority');
  mustReject('C8: authority to an unnamed agent', function (p) { p.recruitment_pipeline[1].agents_authorized_to_update = ['Credentialing Agent']; }, 'agent_authority');
  mustReject('C8: a stage with no human role',    function (p) { p.recruitment_pipeline[0].roles_that_may_advance = []; }, 'agent_authority');

  mustReject('C5: healthcare data declared shared', function (p) { p.separation_boundaries.shared_modular_components.push('Talent Intelligence Record'); }, 'no_coupling');
  mustReject('C5: permissions declared shared',     function (p) { p.separation_boundaries.shared_modular_components.push('permissions'); }, 'no_coupling');
  mustReject('C5: dropping JobMD ownership',        function (p) { p.separation_boundaries.jobmd_owned = p.separation_boundaries.jobmd_owned.filter(function (x) { return x !== 'workflows'; }); }, 'no_coupling');
  mustReject('C5: data model owned elsewhere',      function (p) { p.data_model[0].owned_by = 'shared'; }, 'no_coupling');

  mustReject('C4: renaming Talent Intelligence Record', function (p) {
    Object.assign(p, JSON.parse(JSON.stringify(p).split('Talent Intelligence Record').join('Physician Record')));
  }, 'protected_noun');
  mustReject('C4: renaming Robotics Division', function (p) {
    Object.assign(p, JSON.parse(JSON.stringify(p).split('Robotics Division').join('Robotics Module')));
  }, 'protected_noun');
  mustReject('C4: dropping IDNs', function (p) {
    Object.assign(p, JSON.parse(JSON.stringify(p).split('IDN').join('network')));
  }, 'protected_noun');

  mustReject('C7: an email address in the plan',  function (p) { p.new_components[0].purpose += ' Contact drjones@hospital.org.'; }, 'no_real_data');
  mustReject('C7: a phone number in the plan',    function (p) { p.risks[0].mitigation += ' Call (813) 555-0142.'; }, 'no_real_data');
  mustReject('C7: an NPI in the plan',            function (p) { p.data_model[0].fields.push('NPI 1234567893'); }, 'no_real_data');
  mustReject('C7: a licence number in the plan',  function (p) { p.data_model[0].purpose += ' License No. ME145098.'; }, 'no_real_data');
  mustReject('C7: a DEA number in the plan',      function (p) { p.risks[1].impact += ' DEA BJ1234563.'; }, 'no_real_data');
  mustReject('C7: an SSN in the plan',            function (p) { p.open_questions.push('Verify 123-45-6789.'); }, 'no_real_data');

  mustReject('C2: an undeclared top-level key',   function (p) { p.notes = 'extra'; }, 'declared_shape');
  mustReject('C2: a missing declared key',        function (p) { delete p.risks; }, 'declared_shape');

  mustReject('C1: inventing a discovery source',  function (p) { p.automated_talent_discovery.authorized_sources.push('LinkedIn'); }, 'no_fabrication');
  mustReject('C1: hiding the truncation',         function (p) { p.open_questions = p.open_questions.filter(function (q) { return !/truncat/i.test(q); }); }, 'no_fabrication');
  mustReject('C1: emptying open_questions',       function (p) { p.open_questions = []; }, 'no_fabrication');
  mustReject('C1: a not_applicable with a target', function (p) {
    const r = p.reuse_inventory.filter(function (x) { return x.classification === 'not_applicable'; })[0];
    r.jobmd_target = 'JobMD.io billing';
  }, 'no_fabrication');
  mustReject('C1: a classification with no reason', function (p) { p.reuse_inventory[4].reason = ''; }, 'no_fabrication');
  mustReject('C1: changing the hosted location',  function (p) { p.project.hosted_location = 'https://jobmd.io/app'; }, 'no_fabrication');
  mustReject('C1: changing the parent ecosystem', function (p) { p.project.parent_ecosystem = 'Digit2AI'; }, 'no_fabrication');

  // ══════════════════════════════════════════════════════════════════════
  //  AGENT 2 — JobMD.io Platform Architecture Spec Generator
  //  A different contract over the SAME corpus. Two agents that each
  //  transcribed the request separately would eventually disagree about how
  //  many pipeline stages there are, and both would look right alone.
  // ══════════════════════════════════════════════════════════════════════
  const { buildRecord } = require('./src/services/spec-plan');
  const { verifyRecord, SPEC_KEYS } = require('./src/services/spec-verify');
  const { composeRecord } = require('./src/services/spec-architect');

  const specRec = buildRecord();
  const specV = verifyRecord(specRec);
  ok('spec: the record passes its own constraint verification', specV.ok,
     specV.violations.map(function (x) { return x.constraint + ':' + x.detail; }).join(' | '));
  eq('spec: fifteen declared top-level keys', SPEC_KEYS.length, 15);
  ok('spec: top-level keys are exactly the declared schema',
     JSON.stringify(Object.keys(specRec).sort()) === JSON.stringify(SPEC_KEYS.slice().sort()));
  ok('spec: it is a DIFFERENT contract from the build plan, not a copy',
     JSON.stringify(SPEC_KEYS.slice().sort()) !== JSON.stringify(SCHEMA_KEYS.slice().sort()));

  // Both agents must agree on every count, because both read one corpus.
  eq('spec: same fifteen specialties as the build plan', specRec.medicalSpecialties.initialSpecialties.length, base.medical_specialties.initial.length);
  eq('spec: same eleven agents', specRec.mcpArchitecture.agents.length, base.agents.length);
  eq('spec: same thirteen stages', specRec.recruitmentPipeline.stages.length, base.recruitment_pipeline.length);
  eq('spec: same seven dimensions', specRec.matchingEngine.dimensions.length, base.matching_engine.dimensions.length);
  ok('spec: the two agents name the same stages in the same order',
     JSON.stringify(specRec.recruitmentPipeline.stages.map(function (x) { return x.stageName; })) ===
     JSON.stringify(base.recruitment_pipeline.map(function (x) { return x.stage; })));
  eq('spec: the full Talent Intelligence Record field list', specRec.physicianIntelligenceProfile.fields.length, C.TALENT_INTELLIGENCE_RECORD_FIELDS.length);
  eq('spec: the full Hospital / Client Intelligence Profile field list', specRec.hospitalClientIntelligenceProfile.fields.length, C.HOSPITAL_CLIENT_PROFILE_FIELDS.length);

  // NOTHING NAMES AN MCP ENDPOINT, so the list stays empty and the gap is
  // recorded. This is the single most tempting field to invent.
  eq('spec: mcpEndpoints is empty because nothing names one', specRec.mcpArchitecture.orchestrationLayer.mcpEndpoints.length, 0);
  ok('spec: the empty endpoint list is explained in openQuestions',
     specRec.openQuestions.some(function (q) { return /endpoint/i.test(q.question); }));
  // The declared decision enum has no not-applicable value; the two registry
  // items that are genuinely not reused are omitted and the omission stated.
  eq('spec: reuseAnalysis covers every applicable registry item', specRec.reuseAnalysis.length, C.JOBUP_INVENTORY.length - 2);
  ok('spec: the omitted registry items are explained, not silently dropped',
     specRec.openQuestions.some(function (q) { return /not applicable|decision enum/i.test(q.question + ' ' + q.topic); }));
  ok('spec: every reuseAnalysis row is modular', specRec.reuseAnalysis.every(function (r) { return r.modular === true; }));
  ok('spec: openQuestions are objects with a blocksBuild flag',
     specRec.openQuestions.every(function (q) { return q.topic && q.question && typeof q.blocksBuild === 'boolean'; }));
  ok('spec: the missing physician database is flagged as blocking',
     specRec.openQuestions.some(function (q) { return /physician database/i.test(q.topic) && q.blocksBuild === true; }));

  // The constraints, attacked.
  function mustRejectSpec(name, mutate, expect) {
    const r = JSON.parse(JSON.stringify(buildRecord()));
    mutate(r);
    const res = verifyRecord(r);
    if (res.ok) { fail++; failures.push('NOT CAUGHT: ' + name); return; }
    if (expect && !res.violations.some(function (x) { return x.constraint === expect; })) {
      fail++; failures.push(name + ' :: caught as ' + res.violations.map(function (x) { return x.constraint; }).join(',') + ', expected ' + expect);
      return;
    }
    pass++;
  }
  mustRejectSpec('spec: reordering the section 7 stages', function (r) { const a = r.recruitmentPipeline.stages; const t = a[8]; a[8] = a[9]; a[9] = t; }, 'no_reorder');
  mustRejectSpec('spec: dropping a stage', function (r) { r.recruitmentPipeline.stages.splice(6, 1); }, 'no_reorder');
  mustRejectSpec('spec: dropping a Talent Intelligence Record field', function (r) { r.physicianIntelligenceProfile.fields.splice(3, 1); }, 'no_reorder');
  mustRejectSpec('spec: dropping a hospital profile field', function (r) { r.hospitalClientIntelligenceProfile.fields.pop(); }, 'no_reorder');
  mustRejectSpec('spec: inventing an MCP endpoint', function (r) { r.mcpArchitecture.orchestrationLayer.mcpEndpoints.push('/api/v1/mcp/tools'); }, 'no_invented_component');
  mustRejectSpec('spec: inventing a registry item', function (r) { r.reuseAnalysis[0].jobUpDevItem = 'JobUp Credentialing Service'; }, 'no_invented_component');
  mustRejectSpec('spec: inventing an agent reuse source', function (r) { r.mcpArchitecture.agents[2].reuseSource = 'JobUp Hospital Service'; }, 'no_invented_component');
  mustRejectSpec('spec: inventing an A2A partner', function (r) { r.mcpArchitecture.agents[0].a2aPartners.push('Credentialing Agent'); }, 'no_fabrication');
  mustRejectSpec('spec: a non-modular shared item', function (r) { r.reuseAnalysis[3].modular = false; }, 'no_coupling');
  mustRejectSpec('spec: build_new without saying why', function (r) { r.reuseAnalysis[4].decision = 'build_new_for_jobmd'; r.reuseAnalysis[4].rationale = 'It is new.'; }, 'no_rebuild_from_zero');
  mustRejectSpec('spec: an agent grabbing Placement', function (r) { r.mcpArchitecture.agents[10].mayUpdatePipelineStages = ['Placement']; }, 'agent_authority');
  mustRejectSpec('spec: a stage authorizing the wrong agent', function (r) { r.recruitmentPipeline.stages[11].aiAgentsAuthorizedToUpdate = ['Follow-Up Agent']; }, 'agent_authority');
  mustRejectSpec('spec: sharing the Talent Intelligence Record', function (r) { r.separationFromJobUpDev.sharedModularComponents.push('Talent Intelligence Record'); }, 'no_coupling');
  mustRejectSpec('spec: giving away ownAgents', function (r) { r.separationFromJobUpDev.ownAgents = false; }, 'no_coupling');
  mustRejectSpec('spec: renaming the record', function (r) {
    Object.assign(r, JSON.parse(JSON.stringify(r).split('Talent Intelligence Record').join('Physician Record')));
  }, 'protected_noun');
  mustRejectSpec('spec: a licence number in a note', function (r) { r.physicianIntelligenceProfile.fields[0].notes = 'License No. ME145098'; }, 'no_real_data');
  mustRejectSpec('spec: an email in an open question', function (r) { r.openQuestions[0].question += ' Contact drjones@hospital.org.'; }, 'no_real_data');
  mustRejectSpec('spec: claiming section 10 is complete', function (r) { r.automatedTalentDiscovery.status = 'specified'; }, 'no_fabrication');
  mustRejectSpec('spec: inventing a discovery source', function (r) { r.automatedTalentDiscovery.authorizedSources.push('LinkedIn'); }, 'no_fabrication');
  mustRejectSpec('spec: hiding the truncation', function (r) { r.openQuestions = r.openQuestions.filter(function (q) { return !/truncat/i.test(q.question); }); }, 'no_fabrication');
  mustRejectSpec('spec: an open question without blocksBuild', function (r) { delete r.openQuestions[3].blocksBuild; }, 'declared_shape');
  mustRejectSpec('spec: an undeclared top-level key', function (r) { r.notes = 'extra'; }, 'declared_shape');
  mustRejectSpec('spec: a specialization on a reuse_as_is row', function (r) {
    const x = r.reuseAnalysis.filter(function (y) { return y.decision === 'reuse_as_is'; })[0];
    x.healthcareSpecialization = 'something';
  }, 'no_fabrication');

  // READ-ONLY WITH RESPECT TO EVERY RUNTIME SYSTEM. The constraint says this
  // agent may not execute, deploy, migrate or write anywhere; the way to hold
  // it is to keep the database out of reach entirely.
  ['spec-plan.js', 'spec-verify.js', 'spec-architect.js'].forEach(function (f) {
    const src = fs.readFileSync(path.join(__dirname, 'src', 'services', f), 'utf8');
    ok('spec: ' + f + ' cannot reach the database', !/require\(['"][^'"]*(models|db)['"]\)/.test(src));
    ok('spec: ' + f + ' cannot write, deploy or migrate',
       !/\.(create|update|destroy|query|sync)\s*\(/.test(src));
  });

  // Determinism, and the model may not move a structural field.
  const specA = await composeRecord({ use_model: false });
  const specB = await composeRecord({ use_model: false });
  ok('spec: refuses nothing on the deterministic path', specA.ok === true);
  ok('spec: deterministic runs are byte-identical', JSON.stringify(specA.record) === JSON.stringify(specB.record));
  eq('spec: labels the deterministic path', specA.composed_by, 'deterministic');
  const specM = await composeRecord({ use_model: true });
  ok('spec: the model path also returns a valid record', specM.ok === true);
  function structuralSpec(r) {
    return JSON.stringify({
      project: r.project.name + '|' + r.project.hostedLocation,
      specialties: r.medicalSpecialties.initialSpecialties,
      agents: r.mcpArchitecture.agents.map(function (a) { return [a.agentName, a.inputs, a.outputs, a.a2aPartners, a.mayUpdatePipelineStages, a.reuseSource]; }),
      stages: r.recruitmentPipeline.stages,
      dims: r.matchingEngine.dimensions.map(function (d) { return d.dimensionName; }),
      tir: r.physicianIntelligenceProfile.fields.map(function (f) { return [f.fieldName, f.sourceAgent]; }),
      hcp: r.hospitalClientIntelligenceProfile.fields.map(function (f) { return [f.fieldName, f.sourceAgent]; }),
      reuse: r.reuseAnalysis.map(function (x) { return [x.jobUpDevItem, x.itemType, x.decision, x.healthcareSpecialization]; }),
      endpoints: r.mcpArchitecture.orchestrationLayer.mcpEndpoints,
      sep: r.separationFromJobUpDev, atd: r.automatedTalentDiscovery
    });
  }
  ok('spec: structure is identical with and without a model',
     structuralSpec(specA.record) === structuralSpec(specM.record));

  // ── The rewrite parser ──────────────────────────────────────────────────
  // A model that answers but changes nothing must not look identical to one
  // that was never called. The first parser sliced first-{ to last-}, which
  // silently returned nothing for a bare array — 1390 output tokens spent in
  // production for zero effect, reported as "deterministic".
  const { parseRewrites: PR } = require('./src/services/architect');
  [
    ['object form',        '{"rewrites":[{"i":0,"text":"a"},{"i":1,"text":"b"}]}', 2],
    ['bare array',         '[{"i":0,"text":"a"},{"i":1,"text":"b"}]',              2],
    ['fenced object',      '```json\n{"rewrites":[{"i":0,"text":"a"}]}\n```',      1],
    ['fenced bare array',  '```json\n[{"i":0,"text":"a"}]\n```',                   1],
    ['object w/ preamble', 'Here you go:\n{"rewrites":[{"i":0,"text":"a"}]}',      1],
    ['array w/ preamble',  'Sure:\n[{"i":0,"text":"a"}]',                          1],
    ['unparseable',        'sorry, I cannot',                                     0],
    // THE REAL PRODUCTION FAILURE: a fenced reply cut off mid-array. There is
    // no closing fence and no closing brace, so every whole-payload parse
    // fails and the rewrites that DID arrive were being thrown away.
    ['truncated fenced reply',
     '```json\n{\n "rewrites": [\n  {"i": 0, "text": "First, complete."},\n' +
     '  {"i": 1, "text": "Second with a \\"quote\\" and a { brace } inside."},\n  {', 2]
  ].forEach(function (c) {
    eq('parser: ' + c[0], PR(c[1]).length, c[2]);
  });
  // Salvage must not corrupt the prose it recovers.
  const salv = PR('```json\n{"rewrites":[{"i":0,"text":"a \\"q\\" and { brace }"},{');
  ok('parser: salvaged text survives quotes and braces intact',
     salv.length === 1 && salv[0].text === 'a "q" and { brace }', JSON.stringify(salv));
  ok('parser: the token ceiling leaves room for every prose slot',
     /max_tokens: 12000/.test(fs.readFileSync(path.join(__dirname, 'src', 'services', 'architect.js'), 'utf8')));
  // Both composers must report what the model actually did.
  ['architect.js', 'spec-architect.js'].forEach(function (f) {
    const src = fs.readFileSync(path.join(__dirname, 'src', 'services', f), 'utf8');
    ok('parser: ' + f + ' reports what the model returned',
       /model_text_chars/.test(src) && /model_rewrites_parsed/.test(src) && /model_rewrites_accepted/.test(src));
  });

  // ── 5. The prose identifier guard ─────────────────────────────────────────
  const hay = JSON.stringify(C);
  ok('prose guard: catches an invented table',
     unverifiedIdentifiers('Store this in physician_credentials_2024.', hay).length > 0);
  ok('prose guard: catches an invented route',
     unverifiedIdentifiers('Expose it at /api/v1/credentialing/verify.', hay).length > 0);
  ok('prose guard: catches an invented file',
     unverifiedIdentifiers('Implement it in credentialing-engine.js.', hay).length > 0);
  ok('prose guard: passes ordinary prose',
     unverifiedIdentifiers('The matching machinery is reusable and the clinical evaluators are new.', hay).length === 0);
  ok('prose guard: separator-only differences are not findings',
     unverifiedIdentifiers('The robotic_platforms field is captured.', hay + ' robotic platforms').length === 0);

  // ── 6. Determinism: the model may not move a structural field ─────────────
  const a = await composePlan({ use_model: false });
  const b = await composePlan({ use_model: false });
  ok('compose: refuses nothing on the deterministic path', a.ok === true,
     JSON.stringify((a.verification || {}).violations || []).slice(0, 300));
  ok('compose: deterministic runs are byte-identical', JSON.stringify(a.plan) === JSON.stringify(b.plan));
  eq('compose: labels the deterministic path', a.composed_by, 'deterministic');
  eq('compose: is_simulated is true with no model prose', a.is_simulated, true);
  eq('compose: reports no model when none was used', a.model, null);

  const withModel = await composePlan({ use_model: true });
  ok('compose: the model path also returns a valid plan', withModel.ok === true);

  // THE STRUCTURE IS IDENTICAL WITH AND WITHOUT A MODEL. Only prose may differ.
  function structural(p) {
    return JSON.stringify({
      project: p.project,
      specialties: p.medical_specialties.initial,
      agents: p.agents.map(function (x) { return [x.name, x.inputs, x.outputs, x.communicates_with]; }),
      pipeline: p.recruitment_pipeline,
      dimensions: p.matching_engine.dimensions.map(function (d) { return d.dimension; }),
      data_model: p.data_model.map(function (d) { return [d.entity, d.fields, d.owned_by]; }),
      inventory: p.reuse_inventory.map(function (r) { return [r.jobup_component, r.classification, r.jobmd_target]; }),
      boundaries: p.separation_boundaries,
      robotics: p.robotics_division,
      discovery: p.automated_talent_discovery.authorized_sources,
      phases: p.build_phases
    });
  }
  ok('compose: structure is identical with and without a model',
     structural(a.plan) === structural(withModel.plan));
  console.log('  [model path] ANTHROPIC_API_KEY ' + (process.env.ANTHROPIC_API_KEY ? 'present — model prose exercised' :
    'ABSENT — deterministic prose only; the model rewrite path is NOT covered by this run'));

  // ── 7. The architect can never reach a real person's record ──────────────
  // A lead is a real contact detail. Nothing in the architect may import it.
  const svcDir = path.join(__dirname, 'src', 'services');
  const svcFiles = fs.readdirSync(svcDir).filter(function (f) { return f.endsWith('.js'); });
  let leaks = [];
  svcFiles.forEach(function (f) {
    const src = fs.readFileSync(path.join(svcDir, f), 'utf8');
    if (/require\(['"][^'"]*models['"]\)/.test(src) || /\bLead\b/.test(src)) leaks.push(f);
  });
  ok('isolation: no architect service imports the models or the Lead table', leaks.length === 0, leaks.join(', '));

  // ── 8. Multi-tenancy ──────────────────────────────────────────────────────
  const modelsSrc = fs.readFileSync(path.join(__dirname, 'src', 'models.js'), 'utf8');
  const tableDefs = (modelsSrc.match(/tableName:\s*'jm_[a-z_]+'/g) || []);
  ok('tenancy: the platform tables exist', tableDefs.length >= 11, tableDefs.length + ' tables');
  // EVERY table, without exception.
  eq('tenancy: every table declares tenant_id',
     (modelsSrc.match(/tenant_id:\s*tenant/g) || []).length, tableDefs.length);
  // Indexes are named explicitly — Sequelize's auto-names collided across
  // re-runs and left a half-built schema.
  ok('tenancy: every index is explicitly named',
     (modelsSrc.match(/name: 'jm_[a-z_]+'/g) || []).length >= tableDefs.length,
     (modelsSrc.match(/name: 'jm_[a-z_]+'/g) || []).length + ' named');
  ok('tenancy: no unnamed index declarations remain',
     !/indexes: \[\{ fields:/.test(modelsSrc));
  // tenant_id alone is not access control when everyone shares a tenant: the
  // app routes must scope by account.
  const appApiSrc = fs.readFileSync(path.join(__dirname, 'src', 'routes', 'app.js'), 'utf8');
  ok('tenancy: the app scopes reads by the signed-in account, not just the tenant',
     /account_id: req\.account\.id/.test(appApiSrc));
  ok('tenancy: role is never taken from a request body',
     !/role:\s*(req\.body|b\.role)/.test(appApiSrc));
  const idxSrc = fs.readFileSync(path.join(__dirname, 'src', 'index.js'), 'utf8');
  ok('tenancy: tenant_id is read from the session, never the body', /function tenantOf\(req\)/.test(idxSrc) &&
     !/tenant_id:\s*req\.body/.test(idxSrc));
  const mig = fs.readFileSync(path.join(__dirname, 'migrations', '20260828_jobmd_tables.sql'), 'utf8');
  // The migration is regenerated from the live schema, so it must agree with
  // the models: every table, tenant_id, NOT NULL.
  const migTables = (mig.match(/CREATE TABLE IF NOT EXISTS jm_/g) || []).length;
  ok('tenancy: the migration covers every table', migTables === tableDefs.length,
     migTables + ' in the migration vs ' + tableDefs.length + ' models');
  eq('tenancy: the migration declares tenant_id NOT NULL on every table',
     (mig.match(/tenant_id\s+INTEGER[^\n]*NOT NULL/g) || []).length, migTables);

  // ── 9. The landing page ───────────────────────────────────────────────────
  const html = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
  ok('landing: carries the source positioning', html.indexOf('Superior Results') !== -1);

  // ── SCOPE: surgeons, doctors AND medical staff ──────────────────────────
  // The page was first built from a surgeon-only source. JobMD.io is not
  // surgeon-only, and a page that says it is turns away two thirds of the
  // people it is for.
  ['Surgeons', 'Doctors', 'Medical Staff'].forEach(function (a) {
    ok('scope: the hero names ' + a, new RegExp('class="chip t">' + a + '<').test(html));
  });
  ok('scope: the page no longer calls itself a surgeon recruiting firm',
     html.indexOf('leading surgeon recruiting firm') === -1);
  ok('scope: Who We Serve covers doctors', /<h3>Doctors &amp; Physicians<\/h3>/.test(html));
  ok('scope: Who We Serve covers medical staff', /<h3>Medical Staff<\/h3>/.test(html));
  ok('scope: the surgical specialty list is labelled as surgical, not as everything',
     html.indexOf('>Surgical Specialties<') !== -1);
  // No invented roster: we may not publish a staff role we were never given.
  ok('scope: no medical staff roles are invented',
     !/(registered nurse|nurse practitioner|physician assistant|perfusionist|radiologic tech)/i.test(html));

  // THE FORM AND THE SERVER MUST AGREE. A value the page offers but the server
  // rejects is silently dropped to null, and the lead arrives unattributed.
  const formRoles = (html.match(/<option value="([a-z_]+)">/g) || [])
    .map(function (m) { return m.replace(/.*value="([a-z_]+)".*/, '$1'); });
  const srvMatch = idxSrc.match(/const roles = \[([^\]]+)\]/);
  const srvRoles = srvMatch ? srvMatch[1].split(',').map(function (x) { return x.trim().replace(/'/g, ''); }) : [];
  ok('scope: every role the form offers is accepted by the server',
     formRoles.length > 0 && formRoles.every(function (r) { return srvRoles.indexOf(r) !== -1; }),
     'form=' + formRoles.join(',') + ' server=' + srvRoles.join(','));
  ['surgeon', 'physician', 'medical_staff', 'hospital_executive'].forEach(function (r) {
    ok('scope: the form offers ' + r, formRoles.indexOf(r) !== -1);
  });
  ok('landing: carries the Robotics Division', html.indexOf('Robotics Division') !== -1);
  // The phone number was retired at the owner's request. Assert its absence
  // everywhere, or a future copy edit quietly reinstates a dead line.
  ok('landing: the retired phone number is gone',
     !/315-?4401|8883154401/.test(html));
  ok('landing: no narration segment still reads the number aloud',
     !/three one five|four four zero one/i.test(html));
  ok('landing: the contact path is the form, not a phone call',
     html.indexOf('id="leadForm"') !== -1);
  ok('landing: presents JobMD.io as a division of JobUp.dev',
     /specialized division of JobUp\.dev/.test(html));
  ok('landing: attributes the market figures', /healthsourceelite\.com/.test(html));
  ok('landing: is emoji-free', !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(html));
  C.MEDICAL_SPECIALTIES.forEach(function (s) {
    ok('landing: lists ' + s, html.indexOf(s.replace(/&/g, '&')) !== -1 || html.indexOf(s.replace('&', '&')) !== -1);
  });
  C.AGENTS.forEach(function (a) {
    ok('landing: names ' + a.name, html.indexOf(a.name.replace(/\//g, ' / ').replace(/\s+/g, ' ')) !== -1 ||
       html.indexOf(a.name) !== -1);
  });
  C.RECRUITMENT_PIPELINE.forEach(function (s) {
    ok('landing: shows stage ' + s.stage, html.indexOf('"' + s.stage + '"') !== -1);
  });
  // ── Ava narration ───────────────────────────────────────────────────────
  // It must REUSE the repo's shared zero-key Edge TTS. A second TTS backend
  // inside this vertical is the thing the voice runbook exists to prevent.
  ok('ava: narration posts to the shared /api/tts/edge route', html.indexOf('/api/tts/edge') !== -1);
  ok('ava: uses the Ava voice alias', /VOICE\s*=\s*'ava'/.test(html));
  ok('ava: no second TTS backend ships inside this vertical',
     !fs.existsSync(path.join(__dirname, 'src', 'services', 'edge-tts.js')));
  ok('ava: no paid TTS provider is reachable from the page',
     !/elevenlabs|api\.openai|texttospeech\.googleapis/i.test(html));

  // The narration script must parse, and carry one segment per section plus
  // the intro. A missing segment silently narrates the wrong section.
  const blocks = [];
  html.replace(/<script>([\s\S]*?)<\/script>/g, function (m, b) { blocks.push(b); return m; });
  const avaJs = blocks[blocks.length - 1] || '';
  ok('ava: the narration script parses',
     (function () { try { new (require('vm').Script)(avaJs); return true; } catch (e) { return false; } })());
  let segs = [];
  const sm = avaJs.match(/var segments = \[([\s\S]*?)\n  \];/);
  try { segs = eval('[' + (sm ? sm[1] : '') + ']'); } catch (e) { segs = []; }
  const secCount = (html.match(/class="sec"/g) || []).length;
  eq('ava: seven narratable sections', secCount, 7);
  eq('ava: one segment per section plus the intro', segs.length, secCount + 1);
  ok('ava: every segment carries real narration', segs.every(function (t) { return typeof t === 'string' && t.length > 80; }));

  // NUMBERS ARE SPELLED OUT ON PURPOSE. Edge reads "8.5" and "(888)" badly,
  // and this is copy being read aloud to a surgeon.
  const numeric = segs.filter(function (t) { return /\d{3,}|\(\d|\d\.\d|%/.test(t); });
  ok('ava: numbers are spelled out for the reader', numeric.length === 0,
     numeric.map(function (t) { return (t.match(/[^ ]*\d[^ ]*/g) || []).join(' '); }).join(' | '));

  // A listen button per section, and its index must map to a real segment.
  const plays = (html.match(/data-play="(\d+)"/g) || []).map(function (m) { return parseInt(m.replace(/\D/g, ''), 10); });
  eq('ava: one listen button per section', plays.length, secCount);
  ok('ava: every listen button maps to a real segment',
     plays.every(function (i) { return i + 1 < segs.length; }));
  const narration = segs.join(' ');
  ['doctor', 'medical staff'].forEach(function (w) {
    ok('ava: the narration speaks to ' + w, narration.toLowerCase().indexOf(w) !== -1);
  });
  ok('ava: the browser-speech fallback survives a TTS outage',
     /SpeechSynthesisUtterance/.test(avaJs) && /neuralOK = false/.test(avaJs));

  // ── The hero scene + the agent constellation ────────────────────────────
  // Asked for as "the main image from surgicalmind.app". That file is the
  // SurgicalMind WORDMARK, and no robotic-surgery hero existed anywhere in the
  // repo, so the scene was drawn here. SIT asserts the foreign brand never
  // appears and that nothing is hotlinked from another host's CDN.
  ['jobmd-hero.jpg', 'og-image.jpg'].forEach(function (f) {
    ok('hero: ' + f + ' exists', fs.existsSync(path.join(__dirname, 'public', f)));
  });
  ok('hero: the scene is the hero background', /\.hero::before\{[^}]*url\(jobmd-hero\.jpg\)/.test(html));
  // A picture behind a headline is only allowed if the headline still wins.
  ok('hero: the scene is scrimmed so the headline stays readable',
     /\.hero::after\{[^}]*linear-gradient\(180deg,rgba\(var\(--bg-rgb\)/.test(html));
  ok('hero: the retired neon sign is gone', html.indexOf('jobmd-sign.jpg') === -1);
  ok('hero: no other product\'s brand was copied onto this page', !/surgicalmind/i.test(html));
  ok('hero: no asset is hotlinked from another host\'s CDN',
     !/filesafe\.space|assets\.cdn/i.test(html));
  ok('hero: the social card declares its dimensions',
     /og:image:width" content="1200"/.test(html) && /og:image:height" content="630"/.test(html));

  // The constellation must carry ALL ELEVEN agents, in corpus order, or the
  // picture quietly disagrees with the list underneath it.
  eq('constellation: eleven nodes', (html.match(/class="nd"/g) || []).length, 11);
  eq('constellation: eleven links from the brain', (html.match(/class="lk"/g) || []).length, 11);
  const cstNums = (html.match(/class="nm"[^>]*>(\d\d) /g) || []).map(function (m) { return m.slice(-3, -1); });
  ok('constellation: numbered 01 to 11 in order',
     cstNums.join(',') === '01,02,03,04,05,06,07,08,09,10,11', cstNums.join(','));
  ok('constellation: the brain reports the true agent count', /11 agents · linked/.test(html));
  // Every node must name a real agent from the corpus.
  const shortNames = ['CANDIDATE INTAKE', 'CV / RESUME INTELLIGENCE', 'HOSPITAL INTAKE',
    'CANDIDATE MATCHING', 'CLINICAL QUALIFICATION', 'ROBOTICS INTELLIGENCE', 'CANDIDATE RANKING',
    'RECRUITMENT OUTREACH', 'SCHEDULING', 'FOLLOW-UP', 'RECRUITER COPILOT'];
  shortNames.forEach(function (n) {
    ok('constellation: names ' + n, html.indexOf('>' + (shortNames.indexOf(n) + 1 < 10 ? '0' : '') +
       (shortNames.indexOf(n) + 1) + ' ' + n + '<') !== -1);
  });
  // Motion is decoration; it must never be the only way to read the diagram.
  ok('constellation: honours prefers-reduced-motion',
     /prefers-reduced-motion:reduce\)\{[^}]*\.cst/.test(html.replace(/\s+/g, ' ')));
  ok('constellation: it is described for screen readers', /role="img"[^>]*\n?[^>]*aria-label="The MCP/.test(html));
  // Labels are unreadable at phone width, so the diagram hides and the written
  // list carries the information. The list must therefore always be present.
  ok('constellation: hidden below 720px', /max-width:720px\)\{ \.jmd \.cstwrap\{display:none\}/.test(html));
  ok('constellation: the full written list is always present, never replaced',
     html.indexOf('id="agentList"') !== -1 && !/agentList[^>]*style="display:none/.test(html));

  // ── Footer backdrop ─────────────────────────────────────────────────────
  ok('footer: robotic-surgery.jpg exists', fs.existsSync(path.join(__dirname, 'public', 'robotic-surgery.jpg')));
  ok('footer: the illustration is the footer background',
     /footer::before\{[^}]*url\(robotic-surgery\.jpg\)/.test(html));
  ok('footer: it is a backdrop, not an inline figure', html.indexOf('class="fimg"') === -1);
  // The artwork is bright in places; every footer link sits on top of it.
  // The scrim is graded: light where only the artwork sits, heavy where the
  // links and fine print are.
  ok('footer: the backdrop is scrimmed so the footer stays legible',
     /footer::after\{[\s\S]{0,320}linear-gradient\(180deg,[\s\S]{0,320}rgba\(var\(--bg-rgb\),\.9[0-9]?\)/.test(html));
  // Tall enough that the artwork actually reads, with the content anchored to
  // the bottom so the extra height is image rather than empty space.
  ok('footer: it is tall enough to show the artwork',
     /\.jmd footer\{[\s\S]{0,320}min-height:min\(72vh,660px\)/.test(html));
  ok('footer: content is anchored to the bottom',
     /\.jmd footer\{[\s\S]{0,320}align-items:flex-end/.test(html));
  ok('footer: the backdrop is clipped to the footer',
     /\.jmd footer\{[^}]*overflow:hidden/.test(html));
  // A DECORATIVE BACKGROUND CARRIES NO ALT, so the claims baked into the
  // artwork - less pain, faster recovery, better outcomes - have to be
  // attributed in the fine print or they read as JobMD.io's own outcomes.
  ok('footer: the clinical claims are attributed in the fine print',
     /not outcomes measured by\s+JobMD\.io/.test(html));
  const fimgKB = fs.statSync(path.join(__dirname, 'public', 'robotic-surgery.jpg')).size / 1024;
  ok('footer: the backdrop is under 400KB', fimgKB < 400, Math.round(fimgKB) + 'KB');
  // The fine print sits on the artwork. At --faint it measured 3.64:1, under
  // AA for text that small, so it has its own lighter colour.
  // The fine print keeps its own token because --faint was still under AA
  // over the backdrop; each theme sets --fine independently.
  ok('footer: the fine print has its own contrast-tuned token',
     /\.jmd \.fine\{color:var\(--fine\)/.test(html) && /--fine:#9aa0ad/.test(html) &&
     /html\[data-theme="light"\][\s\S]{0,900}--fine:#[0-9a-f]{6}/.test(html));

  // ── Theme: dark default, light opt-in ───────────────────────────────────
  // DARK IS THE DEFAULT AND STAYS THE DEFAULT. The shipped markup carries no
  // data-theme; only a stored preference adds one.
  ok('theme: the shipped page has no data-theme, so it renders dark',
     !/<html[^>]*data-theme/.test(html));
  // The init must run BEFORE the stylesheet, or a saved light preference
  // flashes dark and repaints.
  ok('theme: the preference is applied before the stylesheet paints',
     html.indexOf('jobmd_theme') < html.indexOf('<style>'));
  ok('theme: an unreadable localStorage falls back to dark, it does not throw',
     /catch\(e\)\{ \/\* private mode: stay on the default \*\//.test(html));
  ok('theme: the light palette exists', /html\[data-theme="light"\] \.jmd\{/.test(html));
  ok('theme: the toggle exists and reports its state',
     /id="themeToggle"/.test(html) && /aria-pressed="false"/.test(html));
  ok('theme: one toggle node serves the bar and the drawer',
     (html.match(/id="themeToggle"/g) || []).length === 1);
  ok('theme: the toggle sits inside the drawer\'s link list', (function () {
    const a = html.indexOf('id="navlinks"'), c = html.indexOf('</div>', a);
    const t = html.indexOf('id="themeToggle"');
    return t > a && t < c;
  })());
  ok('theme: the browser chrome colour follows the theme',
     /id="themeColor"/.test(html) && /themeMeta.setAttribute\('content'/.test(html));
  ok('theme: color-scheme is declared', /name="color-scheme" content="dark light"/.test(html));

  // EVERY THEME-DEPENDENT COLOUR MUST BE A TOKEN. A stray literal renders the
  // same in both themes and is invisible until someone switches.
  ok('theme: no raw page-background literal survives in the CSS',
     !/rgba\(10,10,14,/.test(html), 'rgba(10,10,14,...) still present');
  ok('theme: no raw constellation wire literal survives',
     !/rgba\(120,190,255,/.test(html));
  ok('theme: scrims are built from --bg-rgb so they follow the theme',
     (html.match(/rgba\(var\(--bg-rgb\)/g) || []).length >= 6);
  // --grad paints buttons (dark label on top) AND clipped text. Those pull in
  // opposite directions on a light page, so they are separate tokens.
  ok('theme: the text gradient is separate from the button gradient',
     /--grad-text:/.test(html) && /\.jmd h1 \.g\{background:var\(--grad-text\)/.test(html));
  ok('theme: light restates the text gradient darker',
     /html\[data-theme="light"\][\s\S]{0,900}--grad-text:linear-gradient\(120deg,#0b7285/.test(html));

  // EVERY var(--x) MUST BE DECLARED. An undefined custom property makes the
  // whole declaration invalid at computed-value time and the property silently
  // falls back to its initial value - which is how the aurora ended up
  // painting at opacity 1 and every scrim was dropped, with no error anywhere.
  const cssBlock = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  const usedVars = new Set(Array.from(cssBlock.matchAll(/var\((--[a-z0-9-]+)\)/g), function (m) { return m[1]; }));
  const declVars = new Set(Array.from(cssBlock.matchAll(/(--[a-z0-9-]+)\s*:/g), function (m) { return m[1]; }));
  const undeclared = Array.from(usedVars).filter(function (v) { return !declVars.has(v); });
  ok('theme: every CSS custom property used is declared', undeclared.length === 0, undeclared.join(', '));
  // The light palette must restate everything the dark one sets, or a token
  // silently keeps its dark value on a light page.
  const darkBlock = cssBlock.slice(cssBlock.indexOf('.jmd{'), cssBlock.indexOf('html[data-theme="light"]'));
  const lightBlock = cssBlock.slice(cssBlock.indexOf('html[data-theme="light"] .jmd{'));
  const themed = ['--bg', '--bg-rgb', '--bg2', '--card', '--card2', '--line', '--line2',
                  '--ink', '--mut', '--faint', '--fine', '--teal', '--good',
                  '--wire', '--wire-fill', '--wire-accent', '--surface-soft', '--scrim',
                  '--img-hero', '--img-foot', '--aurora', '--grad-text', '--grad-soft'];
  const notRestated = themed.filter(function (v) {
    return darkBlock.indexOf(v + ':') !== -1 && lightBlock.indexOf(v + ':') === -1;
  });
  ok('theme: light restates every theme-dependent token', notRestated.length === 0, notRestated.join(', '));

  // ── The instruction page ────────────────────────────────────────────────
  const docPath = path.join(__dirname, 'public', 'how-it-works.html');
  ok('docs: how-it-works.html exists', fs.existsSync(docPath));
  const doc = fs.existsSync(docPath) ? fs.readFileSync(docPath, 'utf8') : '';
  ok('docs: it is routed, extensionless, on every root',
     /router\.get\(\['\/how-it-works', '\/how-it-works\/'\]/.test(idxSrc));
  ok('docs: the landing page links to it', /href="how-it-works"/.test(html));
  ok('docs: linked from the nav and the footer at least',
     (html.match(/href="how-it-works"/g) || []).length >= 2);
  ok('docs: it carries the same theme toggle', /id="themeToggle"/.test(doc) && /jobmd_theme/.test(doc));
  ok('docs: it applies the theme before the stylesheet paints',
     doc.indexOf('jobmd_theme') < doc.indexOf('<style>'));
  ok('docs: it carries the shared lockup, not a copy',
     /jobmd-logo\.webp/.test(doc) && /jobmd-logo\.png/.test(doc));

  // DOCUMENTATION THAT DRIFTS FROM THE CODE IS WORSE THAN NONE. Every path the
  // page documents must actually be routed, and the counts it quotes must
  // match the corpus.
  // Endpoints live in two files now: the vertical's own router and the app API.
  const routedSrc = idxSrc + '\n' + fs.readFileSync(path.join(__dirname, 'src', 'routes', 'app.js'), 'utf8');
  const documented = Array.from(doc.matchAll(/<code>\/jobmd(\/[a-z0-9\/:._-]*)<\/code>/g),
                                function (m) { return m[1]; });
  ok('docs: it documents a meaningful number of endpoints', documented.length >= 8, documented.length + ' found');
  const docMissing = documented.filter(function (route) {
    // the app API is mounted at /api/v1, so its own paths are declared without it
    const bare = route.replace(/^\/api\/v1/, '');
    const esc2 = function (x) { return x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    const re = new RegExp("router\\.(get|post|patch|put)\\((\\[[^\\]]*)?['\"](" +
      esc2(route) + "|" + esc2(bare) + ")['\"]");
    return !re.test(routedSrc);
  });
  ok('docs: every documented endpoint is actually routed', docMissing.length === 0, docMissing.join(', '));
  ['eleven agents', 'thirteen-stage', 'seven dimensions'].forEach(function (phrase) {
    ok('docs: it describes the ' + phrase, doc.toLowerCase().indexOf(phrase.toLowerCase()) !== -1);
  });
  // It is a USER GUIDE now, so it must tell each role what to do.
  ['If you are a physician', 'If you are a hospital', 'If you are a recruiter'].forEach(function (h) {
    ok('docs: it guides the reader — "' + h + '"', doc.indexOf(h) !== -1);
  });
  ok('docs: it points at the app', /href="app"/.test(doc) && /href="signup"/.test(doc));
  // AND it must still separate what runs from what does not, or it reads as a
  // description of a platform that is further along than it is.
  ok('docs: it separates what is running from what is not',
     /what is real today/i.test(doc) &&
     (doc.match(/pill open">running/g) || []).length >= 8 &&
     (doc.match(/pill auth">(deliberately not built|blocked)/g) || []).length >= 2);
  // The two remaining gaps are different in kind, and the page must say which
  // is a decision and which is waiting on the owner.
  ok('docs: it explains that sending is a decision, not a gap',
     /never sends anything/i.test(doc) && /landing in client spam/i.test(doc));
  ok('docs: it explains that outside discovery is blocked on missing information',
     /blocked rather than unbuilt/i.test(doc) && /does not exist/i.test(doc));
  ok('docs: it states the agents draft, propose and flag but never act',
     /draft, propose and flag/i.test(doc) && /never move a candidate/i.test(doc));
  ok('docs: it states the scoring is arithmetic, not a language model',
     /arithmetic, not a language model/i.test(doc));
  ok('docs: it does not claim the retired phone number', !/315-?4401/.test(doc));

  // The two pages must not drift apart on colour.
  function tokens(src) {
    const b = src.slice(src.indexOf('.jmd{'), src.indexOf('\n}', src.indexOf('.jmd{')));
    return (b.match(/--[a-z0-9-]+:[^;]+/g) || []).map(function (x) { return x.replace(/\s+/g, ' ').trim(); }).sort();
  }
  const tLanding = tokens(html), tDoc = tokens(doc);
  ok('docs: it shares the landing page token values exactly',
     JSON.stringify(tLanding) === JSON.stringify(tDoc),
     'landing ' + tLanding.length + ' vs docs ' + tDoc.length);

  // ── The two menu bars must carry the same items, in the same order ──────
  function navItems(src) {
    const open = src.indexOf('<div class="navlinks" id="navlinks">');
    const close = src.indexOf('<button class="themetog"', open);
    const seg = src.slice(open, close);
    return Array.from(seg.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)<\/a>/g),
                       function (m) { return { href: m[1], label: m[2].trim() }; });
  }
  const navLanding = navItems(html), navDoc = navItems(doc);
  eq('nav: the landing bar carries five items', navLanding.length, 5);
  ok('nav: both bars carry the same labels, in the same order',
     JSON.stringify(navLanding.map(function (x) { return x.label; })) ===
     JSON.stringify(navDoc.map(function (x) { return x.label; })),
     'landing [' + navLanding.map(function (x) { return x.label; }).join(', ') + '] vs docs [' +
     navDoc.map(function (x) { return x.label; }).join(', ') + ']');
  // The hrefs differ by necessity — the docs page has to reach back to the
  // landing page — but they must resolve to the same targets.
  // "Home" is the one item that legitimately differs: on the landing page it
  // scrolls to the top, from the docs page it navigates back. Everything else
  // must be the same target, prefixed so it resolves from a subpage.
  ok('nav: the docs bar points back at the landing page for shared items',
     navDoc.every(function (d, i) {
       const l = navLanding[i].href;
       if (navLanding[i].label === 'Home') return d.href === './' && l.charAt(0) === '#';
       return d.href === './' + l;
     }),
     navDoc.map(function (d, i) { return d.href + ' vs ' + navLanding[i].href; }).join(' | '));
  // Every in-page target the bar names must exist on the landing page.
  navLanding.filter(function (x) { return x.href.charAt(0) === '#'; }).forEach(function (x) {
    const id = x.href.slice(1);
    ok('nav: "' + x.label + '" points at a section that exists', new RegExp('id="' + id + '"').test(html));
  });
  ok('nav: How It Works points at the routed page',
     navLanding.some(function (x) { return x.href === 'how-it-works'; }));
  // The items dropped from the bar stay reachable in the footer sitemap.
  ['The Right Fit', 'Specialties', 'Contact'].forEach(function (l) {
    ok('nav: "' + l + '" is still reachable from the footer', new RegExp('>' + l + '<').test(html));
  });

  // ── Mobile navigation ──  // ── Mobile navigation ───────────────────────────────────────────────────
  // The hamburger existed but its links were 22px tall, the drawer let the
  // hero ghost through, and it carried no Apply Now. Assert the contract.
  ok('mobile: the burger is a 44px touch target', /\.burger\{[^}]*width:44px[^}]*height:44px/.test(html));
  ok('mobile: the burger reports its state to assistive tech',
     /aria-expanded="false"/.test(html) && /aria-controls="navlinks"/.test(html));
  // The drawer hangs off a white bar, so it is white too - still fully
  // opaque, which is the property that matters (at .98 the hero ghosted).
  ok('mobile: the open drawer is fully opaque',
     /\.navlinks\.open\{[^}]*background:var\(--nav-bg\)/.test(html) &&
     /--nav-bg:#ffffff/.test(html));
  ok('mobile: drawer rows are at least 48px', /\.navlinks\.open a\{[^}]*min-height:48px/.test(html));
  ok('mobile: the primary CTA is reachable inside the drawer',
     /class="btn p navcta"/.test(html));
  // One markup node serves the desktop bar and the drawer, so they can never
  // disagree about the label or the target.
  ok('mobile: there is one Apply Now node in the nav, not a desktop and a mobile copy',
     (html.match(/class="btn p navcta"/g) || []).length === 1);
  // Must sit between the drawer's opening tag and its closing tag, or the
  // mobile menu renders without the primary CTA.
  const navOpen = html.indexOf('id="navlinks"');
  const navClose = html.indexOf('</div>', navOpen);
  const ctaAt = html.indexOf('class="btn p navcta"');
  ok('mobile: that Apply Now lives inside the link list the drawer shows',
     ctaAt > navOpen && ctaAt < navClose, 'nav@' + navOpen + ' cta@' + ctaAt + ' close@' + navClose);
  ['scrim', 'Escape', 'resize'].forEach(function (w) {
    ok('mobile: the drawer closes via ' + w, html.indexOf(w) !== -1);
  });
  ok('mobile: the notch is respected', /env\(safe-area-inset/.test(html));
  ok('mobile: text is not auto-inflated by the browser', /text-size-adjust:100%/.test(html));
  // An inline grid override beats a media query, which is how mobile kept two
  // columns where the breakpoint asked for one.
  ok('mobile: no inline grid-template overrides the breakpoints',
     !/style="grid-template-columns/.test(html));

  // ── The mark ────────────────────────────────────────────────────────────
  ['logo-master.svg', 'favicon.svg', 'favicon-32.png', 'apple-touch-icon.png',
   'icon-192.png', 'icon-512.png'].forEach(function (f) {
    ok('logo: ' + f + ' exists', fs.existsSync(path.join(__dirname, 'public', f)));
  });
  ok('logo: the placeholder MD tile is gone', html.indexOf('class="mk">MD<') === -1);
  // The bar now carries the full brand lockup as artwork; the footer keeps the
  // inline mark, which is drawn white and works on the dark backdrop.
  eq('logo: no inline MD tile remains anywhere', (html.match(/class="mk"/g) || []).length, 0);

  // ── The footer lockup ───────────────────────────────────────────────────
  // ONE lockup serves the bar and the footer, so they can never drift apart.
  ['jobmd-logo.png', 'jobmd-logo.webp'].forEach(function (f) {
    ok('logo: ' + f + ' exists', fs.existsSync(path.join(__dirname, 'public', f)));
  });
  eq('logo: the same asset is used in both places', (html.match(/jobmd-logo\.png/g) || []).length, 2);
  eq('logo: both places offer the WebP first', (html.match(/<source srcset="jobmd-logo\.webp"/g) || []).length, 2);
  eq('logo: both places keep a PNG fallback - the brand mark must never fail',
     (html.match(/<picture>/g) || []).length, 2);
  // WebP is roughly a third the weight, and the bar is above the fold.
  const webpKB = fs.statSync(path.join(__dirname, 'public', 'jobmd-logo.webp')).size / 1024;
  const pngKB = fs.statSync(path.join(__dirname, 'public', 'jobmd-logo.png')).size / 1024;
  ok('logo: the WebP is materially smaller than the PNG', webpKB < pngKB * 0.6,
     Math.round(webpKB) + 'KB vs ' + Math.round(pngKB) + 'KB');
  ok('footer: the footer carries the full lockup',
     /<footer>[\s\S]*?jobmd-logo\.png/.test(html));
  eq('logo: every instance reserves its box',
     (html.match(/jobmd-logo\.png" width="849" height="264"/g) || []).length, 2);
  ok('footer: its copy loads lazily, being below the fold',
     /jobmd-logo\.png"[^>]*loading="lazy"/.test(html));
  ok('nav: its copy is eager and prioritised, being above the fold',
     /jobmd-logo\.png"[^>]*fetchpriority="high"/.test(html));
  ok('footer: it is named for screen readers', /alt="JobMD\.io — AI Healthcare Talent Intelligence Network\. Superior/.test(html));
  // THE ARTWORK IS DARK NAVY ON A TRANSPARENT GROUND. On the dark backdrop it
  // would simply disappear, so it sits on a light plate.
  ok('footer: the lockup sits on a light plate',
     /\.jmd \.fbrand\{[^}]*background:#fff/.test(html));
  ok('footer: the plate is transparent-PNG safe (not a JPEG with a white box)',
     !/jobmd-logo-footer\.jpg/.test(html));

  // ── The white menu bar ──────────────────────────────────────────────────
  ok('nav: the bar carries the full lockup', /class="logo" src="jobmd-logo\.png"/.test(html));
  ok('nav: the retired one-off nav artwork is gone',
     !fs.existsSync(path.join(__dirname, 'public', 'jobmd-logo.jpg')) &&
     !fs.existsSync(path.join(__dirname, 'public', 'jobmd-logo-footer.png')));
  ok('nav: the logo is named for screen readers', /alt="JobMD\.io — AI Healthcare/.test(html));
  // THE BAR IS WHITE IN BOTH THEMES, so it cannot borrow --ink/--mut, which
  // invert - that would leave white links on a white bar in dark mode.
  ok('nav: the bar has its own palette, independent of the theme',
     /--nav-bg:#ffffff/.test(html) && /--nav-ink:/.test(html) && /--nav-mut:/.test(html));
  ok('nav: the bar background is the nav token, not the page background',
     /\.jmd \.nav\{[\s\S]{0,400}background:var\(--nav-bg\)/.test(html));
  ok('nav: links and burger use the nav palette, not the page palette',
     /\.navlinks\{[^}]*color:var\(--nav-mut\)/.test(html) &&
     /\.burger \.bars[^{]*\{[^}]*background:var\(--nav-ink\)/.test(html));
  ok('nav: no nav rule still reads the page --ink or --mut',
     !/\.jmd \.navlinks a:hover\{color:var\(--ink\)\}/.test(html));
  // The drawer's top padding must track the bar height, not a fixed 66px.
  ok('nav: the drawer clears the bar via --nav-h',
     /padding:calc\(var\(--nav-h\)/.test(html) && /--nav-h:86px/.test(html) && /--nav-h:66px/.test(html));
  // The white bar is what sits under the browser chrome in both themes.
  ok('nav: the browser chrome colour matches the white bar',
     /theme-color" content="#ffffff"/.test(html) && /setAttribute\('content', '#ffffff'\)/.test(html));
  // Two inline SVGs sharing one gradient id makes the second render flat.
  const gradIds = (html.match(/linearGradient id="([^"]+)"/g) || []);
  ok('logo: each inline lockup carries a unique gradient id',
     new Set(gradIds).size === gradIds.length, gradIds.join(', '));
  ok('logo: the head links the favicon and the touch icon',
     /rel="icon"[^>]*favicon\.svg/.test(html) && /apple-touch-icon\.png/.test(html));
  // logo-master must stay FULL-BLEED: iOS rounds apple-touch-icon itself, and
  // a pre-rounded source gets double-rounded.
  const master = fs.readFileSync(path.join(__dirname, 'public', 'logo-master.svg'), 'utf8');
  ok('logo: logo-master is full-bleed, not pre-rounded', master.indexOf('rx=') === -1);
  ok('logo: favicon is the rounded tab variant',
     fs.readFileSync(path.join(__dirname, 'public', 'favicon.svg'), 'utf8').indexOf('rx=') !== -1);

  // ── 9b. The jobmd.io domain wiring ───────────────────────────────────────
  //
  // Ava posts to the ABSOLUTE /api/tts/edge. On jobmd.io the host handler
  // routes the whole domain into this router and the CRM mounts its own
  // /api/tts far below, so without a self-mount the narration would silently
  // drop to the robot browser voice on the real domain only.
  ok('domain: the vertical self-mounts /api/tts so Ava is same-origin on jobmd.io',
     /router\.use\('\/api\/tts'/.test(idxSrc));
  ok('domain: the TTS route is reused, not re-implemented here',
     /require\('\.\.\/\.\.\/\.\.\/src\/routes\/presentation-tts'\)/.test(idxSrc));

  const appSrc = fs.readFileSync(path.join(ROOT, 'src', 'app.js'), 'utf8');
  ok('domain: jobmd.io and www.jobmd.io are both handled',
     /host !== 'jobmd\.io' && host !== 'www\.jobmd\.io'/.test(appSrc));
  // REGISTRATION ORDER IS THE WHOLE BUG. Express matches in order, so the host
  // handler must come before the CRM's own paths or it is silently shadowed.
  const hostAt = appSrc.indexOf("host !== 'jobmd.io'");
  const ttsAt = appSrc.indexOf("require('./routes/presentation-tts')");
  const pathMountAt = appSrc.indexOf("app.use(['/jobmd', '/jobMD'], jobmdApp)");
  ok('domain: the host handler is registered before the CRM mounts its own routes',
     hostAt > 0 && ttsAt > 0 && hostAt < ttsAt, 'host@' + hostAt + ' tts@' + ttsAt);
  ok('domain: the host handler precedes the path mount', hostAt > 0 && hostAt < pathMountAt);
  ok('domain: the page declares jobmd.io as canonical and og:url',
     /rel="canonical" href="https:\/\/jobmd\.io\/"/.test(html) &&
     /og:url" content="https:\/\/jobmd\.io\/"/.test(html));
  // Relative asset paths are what let ONE page serve /jobmd/, /jobMD/ and the
  // domain root. An absolute /jobmd/ prefix would break the apex.
  ok('domain: page assets are relative so one page serves every root',
     !/(?:href|src)="\/jobmd\//.test(html) && /href="favicon\.svg"/.test(html) &&
     /fetch\('api\/v1\/leads'/.test(html));

  // jobmd.io must NOT become a second front door to the CRM.
  ok('domain: an unowned path ends in this vertical, not the CRM',
     /JOBMD\.IO IS A PUBLIC BRAND DOMAIN/.test(idxSrc));

  // ── 10. HTTP surface ──────────────────────────────────────────────────────
  const app = express();
  const jobmd = require('./src/index');
  // The router fires init() at load. Await it so the schema is settled before
  // the HTTP probes, and so nothing is still connecting when we close below.
  await jobmd.init().catch(function (e) { ok('boot: router init succeeded', false, e.message); });
  app.use('/jobmd', jobmd);
  const server = http.createServer(app);
  await new Promise(function (r) { server.listen(0, r); });
  const port = server.address().port;

  function req(method, p, body, headers) {
    return new Promise(function (resolve) {
      const data = body ? JSON.stringify(body) : null;
      const r = http.request({ host: '127.0.0.1', port, path: p, method,
        headers: Object.assign({ 'Content-Type': 'application/json' },
          data ? { 'Content-Length': Buffer.byteLength(data) } : {}, headers || {}) },
        function (res) {
          let s = '';
          res.on('data', function (c) { s += c; });
          res.on('end', function () {
            let j = null; try { j = JSON.parse(s); } catch (e) { /* html */ }
            resolve({ status: res.statusCode, body: j, text: s, headers: res.headers });
          });
        });
      r.on('error', function (e) { resolve({ status: 0, body: null, text: String(e.message) }); });
      if (data) r.write(data);
      r.end();
    });
  }

  const health = await req('GET', '/jobmd/health');
  eq('http: health responds 200', health.status, 200);
  ok('http: health reports the binding counts',
     health.body && health.body.counts && health.body.counts.agents === 11 &&
     health.body.counts.recruitment_pipeline_stages === 13);
  ok('http: health names the narrative path',
     health.body && ['model', 'deterministic'].indexOf(health.body.narrative_path) !== -1);

  const landing = await req('GET', '/jobmd/');
  eq('http: landing responds 200', landing.status, 200);
  ok('http: landing serves the page', landing.text.indexOf('Superior Results') !== -1);

  const schema = await req('GET', '/jobmd/api/v1/architect/schema');
  eq('http: schema responds 200', schema.status, 200);
  eq('http: schema declares 17 keys', schema.body.schema_keys.length, 17);
  ok('http: schema reports the source truncation', schema.body.source_truncated === true);

  const planRes = await req('GET', '/jobmd/api/v1/architect/plan?model=0');
  eq('http: plan responds 200', planRes.status, 200);
  ok('http: plan is verified before it is returned', planRes.body.ok === true &&
     planRes.body.verification.violations.length === 0);
  ok('http: returned plan re-verifies independently', verifyPlan(planRes.body.plan).ok);
  ok('http: returned plan carries only the declared keys',
     JSON.stringify(Object.keys(planRes.body.plan).sort()) === JSON.stringify(SCHEMA_KEYS.slice().sort()));
  ok('http: evidence travels beside the plan, not inside it',
     planRes.body.evidence && !planRes.body.plan.capability_map);

  // Auth gates
  // The catch-all, exercised rather than grepped.
  const stray = await req('GET', '/jobmd/admin');
  eq('http: an unowned page 404s instead of serving the CRM', stray.status, 404);
  ok('http: the 404 is branded JobMD, not another product',
     stray.text.indexOf('JobMD.io') !== -1 && stray.text.indexOf('Go to the home page') !== -1);
  ok('http: the 404 does not offer the retired phone number',
     !/315-?4401|8883154401/.test(stray.text));
  const strayApi = await req('GET', '/jobmd/api/v1/nope');
  eq('http: an unowned API path 404s as JSON', strayApi.status, 404);
  ok('http: the API 404 is JSON, not the HTML page', strayApi.body && strayApi.body.error === 'Not found');
  // Ava's route must answer on this router itself, not via the CRM mount.
  const ttsHead = await req('POST', '/jobmd/api/tts/edge', { text: 'Ava check.', voice: 'ava' });
  ok('http: Ava\'s TTS answers from inside the vertical',
     ttsHead.status === 200 || ttsHead.status === 502, 'got ' + ttsHead.status);

  const unauth = await req('POST', '/jobmd/api/v1/architect/runs', {});
  eq('http: persisting a plan requires auth', unauth.status, 401);
  const unauthList = await req('GET', '/jobmd/api/v1/architect/runs');
  eq('http: listing plans requires auth', unauthList.status, 401);
  const unauthLeads = await req('GET', '/jobmd/api/v1/leads');
  eq('http: reading leads requires auth', unauthLeads.status, 401);

  // Leads: validation, and tenant_id is never taken from the body.
  const badLead = await req('POST', '/jobmd/api/v1/leads', { first_name: '', email: 'nope' });
  eq('http: a malformed lead is rejected', badLead.status, 400);
  const stamp = Date.now();
  const goodLead = await req('POST', '/jobmd/api/v1/leads',
    { first_name: 'SIT', last_name: 'Probe', email: 'sit-' + stamp + '@example.invalid',
      role: 'surgeon', message: 'SIT probe', tenant_id: 999999 });
  eq('http: a valid lead is accepted', goodLead.status, 201);

  const { Lead, sequelize } = require('./src/models');
  const stored = await Lead.findOne({ where: { email: 'sit-' + stamp + '@example.invalid' } });
  ok('http: the lead was persisted', Boolean(stored));
  ok('tenancy: a tenant_id in the body is ignored', stored && stored.tenant_id !== 999999);
  ok('privacy: the raw IP is never stored, only a salted hash',
     stored && stored.ip_hash && stored.ip_hash.length === 32 && !/\d+\.\d+\.\d+\.\d+/.test(stored.ip_hash));

  // ══════════════════════════════════════════════════════════════════════
  //  THE PLATFORM, END TO END
  //  A real physician and a real hospital through the whole flow, against the
  //  running server. This is the part that proves there is an application and
  //  not only a set of documents describing one.
  // ══════════════════════════════════════════════════════════════════════
  const { seed } = require('./scripts/seed');
  await seed();

  function jreq(method, p, body, cookie) {
    return new Promise(function (resolve) {
      const data = body ? JSON.stringify(body) : null;
      const r = http.request({ host: '127.0.0.1', port: port, path: '/jobmd' + p, method: method,
        headers: Object.assign({ 'Content-Type': 'application/json' },
          data ? { 'Content-Length': Buffer.byteLength(data) } : {}, cookie ? { Cookie: cookie } : {}) },
        function (res) {
          let s2 = '';
          res.on('data', function (c) { s2 += c; });
          res.on('end', function () {
            let j = null; try { j = JSON.parse(s2); } catch (e) { /* html */ }
            const sc = res.headers['set-cookie'];
            resolve({ status: res.statusCode, body: j, cookie: sc ? sc[0].split(';')[0] : null });
          });
        });
      r.on('error', function (e) { resolve({ status: 0, body: { error: e.message } }); });
      if (data) r.write(data);
      r.end();
    });
  }

  const docEmail = 'sit-doc-' + stamp + '@example.invalid';
  const hospEmail = 'sit-hosp-' + stamp + '@example.invalid';
  let R = await jreq('POST', '/api/v1/auth/signup', { role: 'physician', name: 'SIT Physician',
    email: docEmail, password: 'a-long-enough-pw' });
  eq('app: a physician can sign up', R.status, 201);
  const docCookie = R.cookie;
  R = await jreq('GET', '/api/v1/me', null, docCookie);
  ok('app: the session identifies them as a physician', R.body && R.body.account.role === 'physician');
  ok('app: an empty Talent Intelligence Record is created at signup', !!(R.body && R.body.profile));
  // An unanswered yes/no is not "no": completeness must start at zero.
  eq('app: completeness starts at 0', R.body.completeness.percent, 0);

  R = await jreq('GET', '/api/v1/matches', null, docCookie);
  ok('app: with no specialty there are no matches, and it says why',
     R.status === 200 && R.body.items.length === 0 && !!R.body.message);

  // The CV reader proposes; it must never write.
  R = await jreq('POST', '/api/v1/profile/cv', { text:
    'Board-certified in Robotic Surgery. Residency in General Surgery. 11 years of clinical experience. ' +
    '260 robotic cases per year on the da Vinci Xi with 6 years robotic experience. Licensed in FL and GA.' },
    docCookie);
  ok('app: the CV reader extracts a specialty', R.body && R.body.fields.specialty === 'Robotic Surgery');
  ok('app: it shows the phrase each value came from', !!(R.body && R.body.evidence.specialty));
  ok('app: it names both specialties rather than guessing one',
     !!(R.body && R.body.fields.specialty_candidates && R.body.fields.specialty_candidates.length === 2));
  R = await jreq('GET', '/api/v1/profile', null, docCookie);
  ok('app: READING a CV does not write the profile', R.body.profile.specialty === null);

  R = await jreq('PUT', '/api/v1/profile', { specialty: 'Robotic Surgery', years_experience: 11,
    board_certified: true, licenses: ['FL', 'GA'], robotic_platforms: ['da Vinci Xi'], robotic_years: 6,
    robotics_program_leadership: true, geographic_preferences: ['FL'], relocation_willing: false,
    compensation_expectation: 600000, employment_preference: 'employed', call_tolerance: 'light',
    available_from: '2026-10-01', procedure_expertise: ['robotic cholecystectomy'] }, docCookie);
  eq('app: the profile saves', R.status, 200);
  eq('app: completeness reaches 100', R.body.completeness.percent, 100);
  ok('app: a plain summary is generated from the fields', !!R.body.profile.ai_summary);
  R = await jreq('PUT', '/api/v1/profile', { specialty: 'Space Surgery' }, docCookie);
  eq('app: a specialty outside the taxonomy is refused', R.status, 400);

  R = await jreq('GET', '/api/v1/matches', null, docCookie);
  const mItems = R.body.items || [];
  ok('app: matches are returned', mItems.length > 0);
  ok('app: sorted best first', mItems.every(function (m, i) { return i === 0 || mItems[i - 1].score >= m.score; }));
  ok('app: every match carries all seven dimensions',
     mItems.every(function (m) { return m.dimensions.length === C.MATCHING_DIMENSIONS.length; }));
  // A score with no gaps attached is a number nobody can act on.
  ok('app: every match carries reasons AND gaps',
     mItems.every(function (m) { return Array.isArray(m.reasons) && Array.isArray(m.gaps); }));
  ok('app: the best match is in the physician\'s own specialty',
     mItems[0].position.specialty === 'Robotic Surgery', mItems[0].position.specialty);
  ok('app: scores actually differentiate',
     mItems[0].score - mItems[mItems.length - 1].score > 25,
     mItems[0].score + ' vs ' + mItems[mItems.length - 1].score);
  ok('app: a weak match explains its gaps', mItems[mItems.length - 1].gaps.length > 0);

  R = await jreq('POST', '/api/v1/apply', { position_id: mItems[0].position_id }, docCookie);
  ok('app: a physician can express interest', R.status === 201 && R.body.stage === 'Interested');
  R = await jreq('POST', '/api/v1/apply', { position_id: mItems[0].position_id }, docCookie);
  ok('app: applying twice does not duplicate', R.status === 200 && R.body.already === true);

  R = await jreq('POST', '/api/v1/auth/signup', { role: 'hospital', name: 'SIT Hospital',
    email: hospEmail, password: 'a-long-enough-pw', org_name: 'SIT Hospital ' + stamp,
    city: 'Tampa', state: 'FL' });
  eq('app: a hospital can sign up with its organisation', R.status, 201);
  const hospCookie = R.cookie;
  R = await jreq('POST', '/api/v1/positions', { title: 'SIT Robotic Surgeon', specialty: 'Robotic Surgery',
    city: 'Tampa', state: 'FL', compensation_min: 560000, compensation_max: 660000,
    employment_model: 'employed', call_schedule: 'light', robotics_required: true,
    robotic_platforms: ['da Vinci Xi'], min_years_experience: 5, start_date: '2026-11-01' }, hospCookie);
  eq('app: a hospital can post a position', R.status, 201);
  const sitPos = R.body.position.id;
  R = await jreq('GET', '/api/v1/positions/' + sitPos + '/candidates', null, hospCookie);
  ok('app: ranked candidates come back, with reasons',
     R.status === 200 && R.body.items.length > 0 && R.body.items[0].reasons.length > 0);

  // ── The permission boundaries ─────────────────────────────────────────
  eq('app: a physician cannot open the recruiter pipeline',
     (await jreq('GET', '/api/v1/pipeline', null, docCookie)).status, 403);
  eq('app: a physician cannot post a position',
     (await jreq('POST', '/api/v1/positions', { title: 'x', specialty: 'Urology' }, docCookie)).status, 403);
  eq('app: a hospital has no physician profile to read',
     (await jreq('GET', '/api/v1/profile', null, hospCookie)).status, 403);
  eq('app: no session means no data', (await jreq('GET', '/api/v1/me', null, null)).status, 401);
  // Role is set at signup and can never be raised by a later request.
  await jreq('PUT', '/api/v1/profile', { role: 'recruiter' }, docCookie);
  R = await jreq('GET', '/api/v1/me', null, docCookie);
  eq('app: a physician cannot promote themselves to recruiter', R.body.account.role, 'physician');

  // ── Agent authority, over HTTP ────────────────────────────────────────
  await jreq('POST', '/api/v1/apply', { position_id: sitPos }, docCookie);
  R = await jreq('GET', '/api/v1/pipeline', null, hospCookie);
  const prow = (R.body.items || []).filter(function (x) { return x.position && x.position.id === sitPos; })[0];
  ok('app: the application reaches the hospital pipeline', !!prow);
  if (prow) {
    eq('app: a PERSON may move a candidate to Offer',
       (await jreq('PATCH', '/api/v1/pipeline/' + prow.id, { stage: 'Offer' }, hospCookie)).status, 200);
    eq('app: an AGENT may not move a candidate to Placement',
       (await jreq('PATCH', '/api/v1/pipeline/' + prow.id,
         { stage: 'Placement', as_agent: 'Follow-Up Agent' }, hospCookie)).status, 403);
    eq('app: the Scheduling Agent may set Interview',
       (await jreq('PATCH', '/api/v1/pipeline/' + prow.id,
         { stage: 'Interview', as_agent: 'Scheduling Agent' }, hospCookie)).status, 200);
    eq('app: an agent that is not one of the eleven is refused',
       (await jreq('PATCH', '/api/v1/pipeline/' + prow.id,
         { stage: 'Qualified', as_agent: 'Invented Agent' }, hospCookie)).status, 403);
  }

  // ── THE AGENTS ────────────────────────────────────────────────────────
  // Five of the eleven do real work now. The test is not that they run — it is
  // that none of them sends anything, invents anything, or moves anyone.
  const agentsRaw = fs.readFileSync(path.join(__dirname, 'src', 'services', 'agents.js'), 'utf8');
  // Strip comments first: the file EXPLAINS why there is no send path, and the
  // explanation names SendGrid. The assertion is about code, not about prose.
  const agentsSrc = agentsRaw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok('agents: there is NO send path in the agent runtime at all',
     !/sendgrid|nodemailer|smtp|mailgun|postmark|\bses\b|transporter|\.send\(/i.test(agentsSrc));
  ok('agents: the file still explains why it cannot send', /EMAIL_AUTOSEND_DISABLED/.test(agentsRaw));
  ok('agents: the runtime cannot change a pipeline stage',
     !/\.stage\s*=/.test(agentsSrc) && !/canSet|moveStage/.test(agentsSrc));

  if (prow) {
    R = await jreq('POST', '/api/v1/agents/outreach/' + prow.id, {}, hospCookie);
    eq('agents: the Outreach Agent drafts', R.status, 201);
    const draft = R.body.action;
    eq('agents: the draft is the Recruitment Outreach Agent\'s', draft.agent, 'Recruitment Outreach Agent');
    eq('agents: a draft starts as a draft, never as sent', draft.status, 'draft');
    ok('agents: the draft names the real candidate and position',
       draft.body.indexOf('SIT Physician') !== -1 && draft.body.indexOf('SIT Robotic Surgeon') !== -1);
    // NOTHING INVENTED: every figure in the body must exist on the position row.
    const nums = (draft.body.match(/\$[\d,]+/g) || []).map(function (x) { return x.replace(/[$,]/g, ''); });
    ok('agents: every figure in the draft comes from the position row',
       nums.every(function (n) { return n === '560000' || n === '660000'; }), nums.join(','));
    // Gaps go to the recruiter, not into the message to the candidate.
    ok('agents: gaps are kept for the recruiter, not put in the candidate message',
       Array.isArray(draft.payload.gaps_for_recruiter));

    R = await jreq('POST', '/api/v1/agents/schedule/' + prow.id, {}, hospCookie);
    eq('agents: the Scheduling Agent proposes times', R.status, 201);
    eq('agents: it proposes three slots', R.body.action.payload.slots.length, 3);
    ok('agents: it states it has booked nothing', /nothing is booked/i.test(R.body.action.body));

    // A person approves; the platform never claims it sent anything.
    R = await jreq('PATCH', '/api/v1/agents/actions/' + draft.id, { status: 'approved' }, hospCookie);
    eq('agents: a person can approve a draft', R.status, 200);
    R = await jreq('PATCH', '/api/v1/agents/actions/' + draft.id, { status: 'sent' }, hospCookie);
    eq('agents: the platform refuses to record a send it did not make', R.status, 400);
  }

  R = await jreq('GET', '/api/v1/agents/followup', null, hospCookie);
  eq('agents: the Follow-Up Agent reports', R.status, 200);
  ok('agents: it says plainly that it moved nothing', /Nothing has been moved/i.test(R.body.note));
  ok('agents: it publishes its own thresholds', !!R.body.thresholds.Interested);

  // The Copilot searches real rows and admits what it did not understand.
  R = await jreq('POST', '/api/v1/search', { q: 'board certified robotic surgeons in Florida with more than 8 years' }, hospCookie);
  eq('agents: the Copilot answers', R.status, 200);
  ok('agents: it reports the filters it applied', R.body.applied.length >= 3, JSON.stringify(R.body.applied));
  ok('agents: it finds the physician it should', R.body.items.length >= 1, JSON.stringify(R.body.items.length));
  ok('agents: it reports how many records it actually searched', typeof R.body.searched === 'number');
  R = await jreq('POST', '/api/v1/search', { q: 'somebody great in the southeast' }, hospCookie);
  ok('agents: words it did not understand are reported, not silently dropped',
     R.body.ignored.indexOf('southeast') !== -1, JSON.stringify(R.body.ignored));
  ok('agents: and it says so in the note', /NOT used as filters/.test(R.body.note));

  // Background rescan is a recruiter capability, not a hospital one.
  eq('agents: a hospital cannot trigger a platform-wide rescan',
     (await jreq('POST', '/api/v1/agents/rescan', {}, hospCookie)).status, 403);
  eq('agents: a physician cannot reach the agent queue',
     (await jreq('GET', '/api/v1/agents/actions', null, docCookie)).status, 403);

  // ── The walkthrough ───────────────────────────────────────────────────
  const wtPath = path.join(__dirname, 'public', 'walkthrough.html');
  ok('walkthrough: the page exists', fs.existsSync(wtPath));
  const wt = fs.existsSync(wtPath) ? fs.readFileSync(wtPath, 'utf8') : '';
  eq('walkthrough: it is served', (await req('GET', '/jobmd/walkthrough')).status, 200);
  eq('walkthrough: seven steps', (wt.match(/\{who:'/g) || []).length, 7);
  ['Physician', 'Hospital', 'Recruiter'].forEach(function (r) {
    ok('walkthrough: it covers the ' + r + ' dashboard', wt.indexOf("who:'" + r + "'") !== -1);
  });
  // DELIBERATELY NOT LINKED. It is a bookmark, not a public page.
  ok('walkthrough: the landing page does NOT link to it', !/walkthrough/.test(html));
  ok('walkthrough: the guide does NOT link to it', !/walkthrough/.test(doc));
  ok('walkthrough: it is marked noindex', /name="robots" content="noindex"/.test(wt));
  // THE NUMBERS MUST COME FROM THE REAL ENGINE, not be typed in. Recompute
  // them here and compare — a demo quoting invented scores is the exact thing
  // this whole vertical exists to avoid.
  const demoMatch = wt.match(/var DEMO=(\[[\s\S]*?\]);/);
  ok('walkthrough: it embeds computed match data', !!demoMatch);
  if (demoMatch) {
    const demo = JSON.parse(demoMatch[1]);
    eq('walkthrough: four scored positions', demo.length, 4);
    ok('walkthrough: every embedded row carries all seven dimensions',
       demo.every(function (d) { return d.dims.length === C.MATCHING_DIMENSIONS.length; }));
    ok('walkthrough: rows are ordered best first',
       demo.every(function (d, i) { return i === 0 || demo[i - 1].score >= d.score; }));
    // Re-score the top row with the live engine and require the same number.
    const demoDoc = { specialty: 'Robotic Surgery', board_certified: true, years_experience: 11,
      procedure_expertise: ['robotic cholecystectomy', 'robotic hernia repair'],
      robotic_platforms: ['da Vinci Xi'], robotic_years: 6, robotics_program_leadership: true,
      geographic_preferences: ['FL'], relocation_willing: false, compensation_expectation: 600000,
      employment_preference: 'employed', call_tolerance: 'light', available_from: '2026-10-01',
      publications: 4 };
    const demoPos = { specialty: 'Robotic Surgery', state: 'FL', robotics_required: true,
      robotic_platforms: ['da Vinci Xi'], min_years_experience: 5, board_certification_required: true,
      procedures: ['robotic cholecystectomy', 'robotic hernia repair'],
      compensation_min: 550000, compensation_max: 650000, employment_model: 'employed',
      call_schedule: 'light', start_date: '2026-11-01' };
    const live = require('./src/services/matching').scoreMatch(demoDoc, demoPos);
    eq('walkthrough: the headline score matches the live engine exactly', demo[0].score, live.score);
    ok('walkthrough: a weaker match shows real gaps',
       demo[demo.length - 1].gaps.length > 0);
  }
  ok('walkthrough: it says the data is sample data', /sample data/i.test(wt));
  ok('walkthrough: it states the platform sends nothing',
     /platform sends nothing itself|Nothing is sent by the platform/i.test(wt));

  // ── The pages exist and are routed ────────────────────────────────────
  for (const pg of ['/signup', '/login', '/app']) {
    eq('app: ' + pg + ' is served', (await req('GET', '/jobmd' + pg)).status, 200);
  }
  ok('app: the landing page sends people to sign up', /href="signup"/.test(html));
  ok('app: the landing page offers sign in', /href="login"/.test(html));

  // Clean up every row this suite created.
  const { Account, Physician, Position: Pos, Pipeline: Pipe } = require('./src/models');
  const mine = await Account.findAll({ where: { email: [docEmail, hospEmail] } });
  for (const a of mine) {
    const ph = await Physician.findOne({ where: { account_id: a.id } });
    if (ph) { await Pipe.destroy({ where: { physician_id: ph.id } }); await ph.destroy(); }
    await a.destroy();
  }
  const { AgentAction: AA } = require('./src/models');
  await AA.destroy({ where: { subject: { [require('sequelize').Op.like]: '%SIT Robotic Surgeon%' } } });
  await Pos.destroy({ where: { title: 'SIT Robotic Surgeon' } });
  // The hospital signup creates an organisation; without this they accumulate.
  const { Organization: Org } = require('./src/models');
  await Org.destroy({ where: { name: { [require('sequelize').Op.like]: 'SIT Hospital %' } } });
  ok('cleanup: the SIT accounts were removed',
     (await Account.findAll({ where: { email: [docEmail, hospEmail] } })).length === 0);

  // Clean up after ourselves.
  await Lead.destroy({ where: { email: 'sit-' + stamp + '@example.invalid' } });
  const gone = await Lead.findOne({ where: { email: 'sit-' + stamp + '@example.invalid' } });
  ok('cleanup: the SIT lead was removed', !gone);

  server.close();
  await sequelize.close();

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('='.repeat(60));
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach(function (f) { console.log('  - ' + f); });
  }
  console.log('SIT: ' + pass + '/' + (pass + fail) + (fail ? '  FAILED' : '  PASS'));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('SIT CRASHED:', e && e.stack || e);
  process.exit(1);
});
