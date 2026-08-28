'use strict';

/**
 * CONSTRAINT ENFORCEMENT for the architecture record.
 *
 * Same doctrine as verify.js, a different contract. It runs on every record
 * before it leaves the service, including the deterministic one, so an edit to
 * spec-plan.js that quietly drops a stage fails here rather than shipping.
 *
 * This module reads corpus.js and nothing else — no models, no database, no
 * network. That is the "read-only with respect to all runtime systems"
 * constraint, and SIT greps for it rather than trusting the comment.
 */

const C = require('./corpus');
const { PHI_PATTERNS } = require('./verify');

const SPEC_KEYS = [
  'project', 'brandInheritance', 'reuseAnalysis', 'primaryUsers', 'medicalSpecialties',
  'mcpArchitecture', 'physicianIntelligenceProfile', 'hospitalClientIntelligenceProfile',
  'matchingEngine', 'recruitmentPipeline', 'roboticsDivision', 'conversationalSearch',
  'automatedTalentDiscovery', 'separationFromJobUpDev', 'openQuestions'
];

const ITEM_TYPES = ['component', 'service', 'mcp_endpoint', 'agent_pattern', 'design_system', 'data_model'];
const DECISIONS = ['reuse_as_is', 'extend_for_healthcare', 'build_new_for_jobmd'];

function walkStrings(node, path, fn) {
  if (typeof node === 'string') { fn(node, path); return; }
  if (Array.isArray(node)) { node.forEach(function (v, i) { walkStrings(v, path + '[' + i + ']', fn); }); return; }
  if (node && typeof node === 'object') {
    Object.keys(node).forEach(function (k) { walkStrings(node[k], path ? path + '.' + k : k, fn); });
  }
}
function eqList(a, b) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function verifyRecord(rec) {
  const v = [];
  const bad = function (constraint, detail, path) { v.push({ constraint: constraint, detail: detail, path: path || '' }); };

  if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
    bad('shape', 'The record is not a JSON object.', '');
    return { ok: false, violations: v };
  }

  // ── Return ONLY the declared shape ────────────────────────────────────────
  const keys = Object.keys(rec);
  SPEC_KEYS.forEach(function (k) { if (keys.indexOf(k) === -1) bad('declared_shape', 'Missing declared key: ' + k, k); });
  keys.forEach(function (k) { if (SPEC_KEYS.indexOf(k) === -1) bad('declared_shape', 'Undeclared key present: ' + k, k); });

  // ── Never drop or reorder the named entities ──────────────────────────────
  const specs = (rec.medicalSpecialties || {}).initialSpecialties || [];
  if (!eqList(specs, C.MEDICAL_SPECIALTIES)) {
    bad('no_reorder', 'initialSpecialties must equal the ' + C.MEDICAL_SPECIALTIES.length + ' named specialties, in order. Got ' + specs.length + '.', 'medicalSpecialties.initialSpecialties');
  }
  const agents = ((rec.mcpArchitecture || {}).agents) || [];
  if (!eqList(agents.map(function (a) { return a && a.agentName; }), C.AGENTS.map(function (a) { return a.name; }))) {
    bad('no_reorder', 'mcpArchitecture.agents must be the ' + C.AGENTS.length + ' named agents, in order. Got ' + agents.length + '.', 'mcpArchitecture.agents');
  }
  const dims = ((rec.matchingEngine || {}).dimensions) || [];
  if (!eqList(dims.map(function (d) { return d && d.dimensionName; }), C.MATCHING_DIMENSIONS.map(function (d) { return d.dimension; }))) {
    bad('no_reorder', 'matchingEngine.dimensions must be the ' + C.MATCHING_DIMENSIONS.length + ' named dimensions, in order.', 'matchingEngine.dimensions');
  }
  // Section 7 order is called out explicitly in the constraints.
  const stages = ((rec.recruitmentPipeline || {}).stages) || [];
  if (!eqList(stages.map(function (s) { return s && s.stageName; }), C.RECRUITMENT_PIPELINE.map(function (s) { return s.stage; }))) {
    bad('no_reorder', 'recruitmentPipeline.stages must be the ' + C.RECRUITMENT_PIPELINE.length + ' stages from Prospect through Placement, in order. Got ' + stages.length + '.', 'recruitmentPipeline.stages');
  }
  stages.forEach(function (s, i) {
    const exp = C.RECRUITMENT_PIPELINE[i];
    if (exp && s && s.order !== exp.order) {
      bad('no_reorder', 'Stage "' + s.stageName + '" carries order ' + s.order + ', expected ' + exp.order + '.', 'recruitmentPipeline.stages[' + i + '].order');
    }
  });
  // Profile field lists are the request's own, unabridged.
  const tir = ((rec.physicianIntelligenceProfile || {}).fields) || [];
  if (!eqList(tir.map(function (f) { return f && f.fieldName; }), C.TALENT_INTELLIGENCE_RECORD_FIELDS)) {
    bad('no_reorder', 'Talent Intelligence Record must carry the ' + C.TALENT_INTELLIGENCE_RECORD_FIELDS.length + ' named fields, in order. Got ' + tir.length + '.', 'physicianIntelligenceProfile.fields');
  }
  const hcp = ((rec.hospitalClientIntelligenceProfile || {}).fields) || [];
  if (!eqList(hcp.map(function (f) { return f && f.fieldName; }), C.HOSPITAL_CLIENT_PROFILE_FIELDS)) {
    bad('no_reorder', 'Hospital / Client Intelligence Profile must carry the ' + C.HOSPITAL_CLIENT_PROFILE_FIELDS.length + ' named fields, in order. Got ' + hcp.length + '.', 'hospitalClientIntelligenceProfile.fields');
  }
  if (!eqList((rec.roboticsDivision || {}).capturedFields || [], C.ROBOTICS_CAPTURED_FIELDS)) {
    bad('no_reorder', 'Robotics Division must carry the ' + C.ROBOTICS_CAPTURED_FIELDS.length + ' named fields, in order.', 'roboticsDivision.capturedFields');
  }

  // ── Agent state-change authority is an allow-list ─────────────────────────
  const agentNames = C.AGENTS.map(function (a) { return a.name; });
  const stageNames = C.RECRUITMENT_PIPELINE.map(function (s) { return s.stage; });
  const allowed = {};
  C.RECRUITMENT_PIPELINE.forEach(function (s) {
    s.agents_authorized_to_update.forEach(function (a) { (allowed[a] = allowed[a] || []).push(s.stage); });
  });
  agents.forEach(function (a, i) {
    (a && a.mayUpdatePipelineStages || []).forEach(function (st) {
      if (stageNames.indexOf(st) === -1) {
        bad('agent_authority', '"' + a.agentName + '" claims stage "' + st + '", which is not one of the thirteen stages.', 'mcpArchitecture.agents[' + i + ']');
      } else if ((allowed[a.agentName] || []).indexOf(st) === -1) {
        bad('agent_authority', '"' + a.agentName + '" claims authority over "' + st + '", which the request does not authorize for it.', 'mcpArchitecture.agents[' + i + ']');
      }
    });
    (a && a.a2aPartners || []).forEach(function (pn) {
      if (agentNames.indexOf(pn) === -1) {
        bad('no_fabrication', '"' + a.agentName + '" names A2A partner "' + pn + '", which is not one of the eleven agents.', 'mcpArchitecture.agents[' + i + '].a2aPartners');
      }
    });
    if (a && a.reuseSource !== null && C.JOBUP_INVENTORY.map(function (e) { return e.component; }).indexOf(a.reuseSource) === -1) {
      bad('no_invented_component', '"' + a.agentName + '" claims reuseSource "' + a.reuseSource + '", which is not in the registry.', 'mcpArchitecture.agents[' + i + '].reuseSource');
    }
  });
  // The pipeline's own authority list must agree with the agents' claims.
  stages.forEach(function (s, i) {
    (s && s.aiAgentsAuthorizedToUpdate || []).forEach(function (an) {
      if (agentNames.indexOf(an) === -1) {
        bad('agent_authority', 'Stage "' + s.stageName + '" authorizes "' + an + '", which is not one of the eleven agents.', 'recruitmentPipeline.stages[' + i + ']');
      } else if ((C.RECRUITMENT_PIPELINE[i] || {}).agents_authorized_to_update.indexOf(an) === -1) {
        bad('agent_authority', 'Stage "' + s.stageName + '" authorizes "' + an + '", which the request does not authorize for that stage.', 'recruitmentPipeline.stages[' + i + ']');
      }
    });
  });

  // ── Never invent a JobUp.dev item ─────────────────────────────────────────
  const known = C.JOBUP_INVENTORY.map(function (e) { return e.component; });
  (rec.reuseAnalysis || []).forEach(function (r, i) {
    if (!r || known.indexOf(r.jobUpDevItem) === -1) {
      bad('no_invented_component', 'reuseAnalysis names "' + (r && r.jobUpDevItem) + '", which is not in the component/service registry.', 'reuseAnalysis[' + i + '].jobUpDevItem');
    }
    if (!r || ITEM_TYPES.indexOf(r.itemType) === -1) {
      bad('declared_shape', 'itemType must be one of ' + ITEM_TYPES.join(' | ') + '.', 'reuseAnalysis[' + i + '].itemType');
    }
    if (!r || DECISIONS.indexOf(r.decision) === -1) {
      bad('declared_shape', 'decision must be one of ' + DECISIONS.join(' | ') + '.', 'reuseAnalysis[' + i + '].decision');
    }
    if (r && !String(r.rationale || '').trim()) {
      bad('no_fabrication', 'Every classification must state its rationale.', 'reuseAnalysis[' + i + '].rationale');
    }
    // Shared items must be recorded as modular, never coupled.
    if (r && r.modular !== true) {
      bad('no_coupling', '"' + r.jobUpDevItem + '" must be recorded as modular.', 'reuseAnalysis[' + i + '].modular');
    }
    // A build-new classification must say why nothing could be reused.
    if (r && r.decision === 'build_new_for_jobmd' && !/reus|no JobUp|cannot|could not/i.test(String(r.rationale || ''))) {
      bad('no_rebuild_from_zero', 'A build_new_for_jobmd decision must state why no JobUp.dev component could be reused.', 'reuseAnalysis[' + i + '].rationale');
    }
    if (r && r.decision === 'reuse_as_is' && r.healthcareSpecialization !== null) {
      bad('no_fabrication', 'A reuse_as_is item carries no healthcareSpecialization.', 'reuseAnalysis[' + i + '].healthcareSpecialization');
    }
  });

  // ── Never invent an MCP endpoint ──────────────────────────────────────────
  const eps = ((rec.mcpArchitecture || {}).orchestrationLayer || {}).mcpEndpoints;
  if (!Array.isArray(eps)) {
    bad('declared_shape', 'mcpEndpoints must be an array.', 'mcpArchitecture.orchestrationLayer.mcpEndpoints');
  } else if (eps.length) {
    bad('no_invented_component', 'Neither the request nor the registry names an MCP endpoint path, so mcpEndpoints must stay empty and the gap recorded in openQuestions. Got ' + eps.length + '.', 'mcpArchitecture.orchestrationLayer.mcpEndpoints');
  }

  // ── Separation, never coupling ────────────────────────────────────────────
  const sep = rec.separationFromJobUpDev || {};
  ['ownDataModel', 'ownWorkflows', 'ownPermissions', 'ownAgents'].forEach(function (k) {
    if (sep[k] !== true) bad('no_coupling', 'separationFromJobUpDev.' + k + ' must be true.', 'separationFromJobUpDev.' + k);
  });
  const shared = sep.sharedModularComponents || [];
  C.SEPARATION_BOUNDARIES.jobmd_owned.forEach(function (o) {
    if (shared.indexOf(o) !== -1) {
      bad('no_coupling', '"' + o + '" is JobMD.io owned and may not be listed as a shared component.', 'separationFromJobUpDev.sharedModularComponents');
    }
  });
  ['Talent Intelligence Record', 'Robotics Division', 'Hospital / Client Intelligence Profile'].forEach(function (e) {
    if (shared.indexOf(e) !== -1) bad('no_coupling', '"' + e + '" may not be shared with JobUp.dev.', 'separationFromJobUpDev.sharedModularComponents');
  });

  // ── Never rename the user's nouns ─────────────────────────────────────────
  const blob = JSON.stringify(rec);
  C.PROTECTED_NOUNS.concat(['Platform Administrators', 'recruiters'])
    .forEach(function (n) {
      const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (!re.test(blob)) bad('protected_noun', 'Protected noun "' + n + '" does not appear in the record.', '');
    });
  ['Talent Intelligence Record', 'Robotics Division', 'JobMD.io', 'JobUp.dev', 'IDN'].forEach(function (n) {
    if (blob.indexOf(n) === -1) bad('protected_noun', 'Canonical term "' + n + '" is missing.', '');
  });
  if ((rec.physicianIntelligenceProfile || {}).recordName !== 'Talent Intelligence Record') {
    bad('protected_noun', 'recordName must be "Talent Intelligence Record".', 'physicianIntelligenceProfile.recordName');
  }
  if ((rec.recruitmentPipeline || {}).visualPipelineOwner !== 'JobMD.io Recruiters') {
    bad('protected_noun', 'visualPipelineOwner must be "JobMD.io Recruiters".', 'recruitmentPipeline.visualPipelineOwner');
  }

  // ── No identifiable candidate data. FIELD NAMES ARE ARCHITECTURE; VALUES
  //    ARE NOT. "contact information" is a field name and is expected; an
  //    actual address or licence number is a violation. ──────────────────────
  walkStrings(rec, '', function (str, path) {
    PHI_PATTERNS.forEach(function (p) {
      if (p.re.test(str)) {
        bad('no_real_data', 'A value looks like a ' + p.name + '. The record carries field names, never values.', path);
      }
    });
  });

  // ── Never fabricate; flag instead ─────────────────────────────────────────
  const proj = rec.project || {};
  if (proj.name !== C.PROJECT.name) bad('no_fabrication', 'project.name must be ' + C.PROJECT.name + '.', 'project.name');
  if (proj.parentEcosystem !== C.PROJECT.parent_ecosystem) bad('no_fabrication', 'project.parentEcosystem must be ' + C.PROJECT.parent_ecosystem + '.', 'project.parentEcosystem');
  if (proj.hostedLocation !== C.PROJECT.hosted_location) bad('no_fabrication', 'project.hostedLocation must be the declared deployment target.', 'project.hostedLocation');

  const atd = rec.automatedTalentDiscovery || {};
  if (C.TALENT_DISCOVERY_TRUNCATED && atd.status !== 'incomplete_in_request') {
    bad('no_fabrication', 'Section 10 is truncated, so automatedTalentDiscovery.status must be incomplete_in_request.', 'automatedTalentDiscovery.status');
  }
  (atd.authorizedSources || []).forEach(function (s, i) {
    if (C.TALENT_DISCOVERY_SOURCES.indexOf(s) === -1) {
      bad('no_fabrication', 'Automated Talent Discovery names source "' + s + '", which the truncated request never states.', 'automatedTalentDiscovery.authorizedSources[' + i + ']');
    }
  });

  const oq = rec.openQuestions;
  if (!Array.isArray(oq) || !oq.length) {
    bad('no_fabrication', 'openQuestions must record what the request leaves incomplete.', 'openQuestions');
  } else {
    oq.forEach(function (q, i) {
      if (!q || typeof q.topic !== 'string' || !q.topic.trim()) bad('declared_shape', 'openQuestions[].topic is required.', 'openQuestions[' + i + '].topic');
      if (!q || typeof q.question !== 'string' || !q.question.trim()) bad('declared_shape', 'openQuestions[].question is required.', 'openQuestions[' + i + '].question');
      if (!q || typeof q.blocksBuild !== 'boolean') bad('declared_shape', 'openQuestions[].blocksBuild must be a boolean.', 'openQuestions[' + i + '].blocksBuild');
    });
    if (C.TALENT_DISCOVERY_TRUNCATED && !oq.some(function (q) { return /truncat/i.test(q.question || ''); })) {
      bad('no_fabrication', 'The request is truncated in section 10 and openQuestions must say so.', 'openQuestions');
    }
    if (!oq.some(function (q) { return /mcpEndpoints|endpoint path/i.test(q.question || ''); })) {
      bad('no_fabrication', 'mcpEndpoints is empty because nothing names one; openQuestions must record that.', 'openQuestions');
    }
  }

  try { JSON.parse(JSON.stringify(rec)); }
  catch (e) { bad('declared_shape', 'The record is not JSON-serializable: ' + e.message, ''); }

  return { ok: v.length === 0, violations: v };
}

module.exports = { verifyRecord, SPEC_KEYS, ITEM_TYPES, DECISIONS };
