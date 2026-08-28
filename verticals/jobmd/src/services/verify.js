'use strict';

/**
 * CONSTRAINT ENFORCEMENT.
 *
 * The spec says the constraints are absolute and must be enforced in code, not
 * only in the prompt. This file is that enforcement. It runs on EVERY plan
 * before it leaves the service — the deterministic one included, so a future
 * edit to plan.js that quietly drops a pipeline stage fails here rather than
 * shipping.
 *
 * A violation is not a warning. verifyPlan() returns violations, and the
 * architect refuses to return a plan that has any.
 */

const C = require('./corpus');

const SCHEMA_KEYS = [
  'project', 'primary_users', 'medical_specialties', 'reuse_inventory', 'new_components',
  'mcp_orchestration_layer', 'agents', 'data_model', 'matching_engine', 'recruitment_pipeline',
  'robotics_division', 'conversational_search', 'automated_talent_discovery',
  'separation_boundaries', 'build_phases', 'risks', 'open_questions'
];

const CLASSIFICATIONS = ['reuse_as_is', 'specialize', 'not_applicable'];

// ── PHI / PII detectors ─────────────────────────────────────────────────────
// "Never include real physician, candidate, hospital, or credentialing data in
// the output; the build plan describes structures only." A build plan has no
// legitimate reason to contain a contact detail or an identifier, so anything
// shaped like one is a violation regardless of whether it happens to be real.
const PHI_PATTERNS = [
  { name: 'email address',          re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { name: 'phone number',           re: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/ },
  { name: 'social security number', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'NPI number',             re: /\bNPI[\s:#]*\d{10}\b/i },
  { name: 'bare 10-digit identifier', re: /\b\d{10}\b/ },
  { name: 'date of birth',          re: /\b(?:DOB|date of birth)\b[\s:]*\d/i },
  { name: 'medical license number', re: /\b(?:license|lic)[\s.#:]*(?:no\.?|number|#)[\s:]*[A-Z0-9-]{4,}/i },
  { name: 'DEA number',             re: /\bDEA[\s:#]*[A-Z]{2}\d{7}\b/i }
];

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

/**
 * Verify a plan against every constraint.
 * @returns {{ok:boolean, violations:Array<{constraint:string,detail:string,path:string}>}}
 */
function verifyPlan(plan) {
  const v = [];
  const bad = function (constraint, detail, path) { v.push({ constraint: constraint, detail: detail, path: path || '' }); };

  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) {
    bad('shape', 'The plan is not a JSON object.', '');
    return { ok: false, violations: v };
  }

  // ── C2: return ONLY the declared JSON shape ───────────────────────────────
  const keys = Object.keys(plan);
  SCHEMA_KEYS.forEach(function (k) { if (keys.indexOf(k) === -1) bad('declared_shape', 'Missing declared key: ' + k, k); });
  keys.forEach(function (k) { if (SCHEMA_KEYS.indexOf(k) === -1) bad('declared_shape', 'Undeclared key present: ' + k, k); });

  // ── C6: never drop, merge or reorder a named specialty / dimension /
  //         agent / pipeline stage. Enforced as exact list equality, in order.
  const specs = (plan.medical_specialties && plan.medical_specialties.initial) || [];
  if (!eqList(specs, C.MEDICAL_SPECIALTIES)) {
    bad('no_reorder', 'medical_specialties.initial must equal the ' + C.MEDICAL_SPECIALTIES.length +
      ' named specialties, in order. Got ' + specs.length + '.', 'medical_specialties.initial');
  }

  const agentNames = (plan.agents || []).map(function (a) { return a && a.name; });
  if (!eqList(agentNames, C.AGENTS.map(function (a) { return a.name; }))) {
    bad('no_reorder', 'agents must be the ' + C.AGENTS.length + ' named agents, in order. Got ' + agentNames.length + '.', 'agents');
  }

  const dimNames = ((plan.matching_engine && plan.matching_engine.dimensions) || []).map(function (d) { return d && d.dimension; });
  if (!eqList(dimNames, C.MATCHING_DIMENSIONS.map(function (d) { return d.dimension; }))) {
    bad('no_reorder', 'matching_engine.dimensions must be the ' + C.MATCHING_DIMENSIONS.length +
      ' named dimensions, in order. Got ' + dimNames.length + '.', 'matching_engine.dimensions');
  }

  const stages = plan.recruitment_pipeline || [];
  const stageNames = stages.map(function (s) { return s && s.stage; });
  if (!eqList(stageNames, C.RECRUITMENT_PIPELINE.map(function (s) { return s.stage; }))) {
    bad('no_reorder', 'recruitment_pipeline must be the ' + C.RECRUITMENT_PIPELINE.length +
      ' named stages, in order. Got ' + stageNames.length + '.', 'recruitment_pipeline');
  }
  stages.forEach(function (s, i) {
    const expected = C.RECRUITMENT_PIPELINE[i];
    if (expected && s && s.order !== expected.order) {
      bad('no_reorder', 'Stage "' + s.stage + '" carries order ' + s.order + ', expected ' + expected.order + '.',
        'recruitment_pipeline[' + i + '].order');
    }
  });

  // ── C8: agent state-change authority is an allow-list ─────────────────────
  const allAgentNames = C.AGENTS.map(function (a) { return a.name; });
  stages.forEach(function (s, i) {
    const granted = (s && s.agents_authorized_to_update) || [];
    const expected = (C.RECRUITMENT_PIPELINE[i] || {}).agents_authorized_to_update || [];
    granted.forEach(function (g) {
      if (allAgentNames.indexOf(g) === -1) {
        bad('agent_authority', 'Stage "' + s.stage + '" grants authority to "' + g + '", which is not one of the eleven named agents.',
          'recruitment_pipeline[' + i + '].agents_authorized_to_update');
      } else if (expected.indexOf(g) === -1) {
        bad('agent_authority', 'Stage "' + s.stage + '" grants state-change authority to "' + g +
          '", which the request does not authorize for that stage.',
          'recruitment_pipeline[' + i + '].agents_authorized_to_update');
      }
    });
    const roles = (s && s.roles_that_may_advance) || [];
    if (!roles.length) {
      bad('agent_authority', 'Stage "' + s.stage + '" names no role that may advance it.',
        'recruitment_pipeline[' + i + '].roles_that_may_advance');
    }
  });

  // ── C3: never invent a JobUp.dev component ────────────────────────────────
  const known = C.JOBUP_INVENTORY.map(function (e) { return e.component; });
  (plan.reuse_inventory || []).forEach(function (r, i) {
    if (!r || known.indexOf(r.jobup_component) === -1) {
      bad('no_invented_component', 'reuse_inventory names "' + (r && r.jobup_component) +
        '", which is not in the JobUp.dev component inventory.', 'reuse_inventory[' + i + '].jobup_component');
    }
    if (!r || CLASSIFICATIONS.indexOf(r.classification) === -1) {
      bad('declared_shape', 'classification must be one of ' + CLASSIFICATIONS.join(' | ') + '. Got "' +
        (r && r.classification) + '".', 'reuse_inventory[' + i + '].classification');
    }
    // C1: not_applicable must carry a reason, and must NOT invent a target.
    if (r && r.classification === 'not_applicable' && r.jobmd_target !== null) {
      bad('no_fabrication', 'A not_applicable component must carry a null jobmd_target, not "' + r.jobmd_target + '".',
        'reuse_inventory[' + i + '].jobmd_target');
    }
    if (r && !String(r.reason || '').trim()) {
      bad('no_fabrication', 'Every classification must record its reason.', 'reuse_inventory[' + i + '].reason');
    }
  });
  // Every inventory entry must be classified — silence is not a classification.
  known.forEach(function (k) {
    if (!(plan.reuse_inventory || []).some(function (r) { return r && r.jobup_component === k; })) {
      bad('no_fabrication', 'Inventory entry "' + k + '" was never classified.', 'reuse_inventory');
    }
  });

  // ── C5: no tight coupling. Shared and JobMD-owned must be disjoint, and the
  //        JobMD-owned set must hold everything the request assigns to it.
  const sb = plan.separation_boundaries || {};
  const shared = sb.shared_modular_components || [];
  const owned = sb.jobmd_owned || [];
  C.SEPARATION_BOUNDARIES.jobmd_owned.forEach(function (o) {
    if (owned.indexOf(o) === -1) {
      bad('no_coupling', 'separation_boundaries.jobmd_owned omits "' + o +
        '", which the request places on the JobMD.io side.', 'separation_boundaries.jobmd_owned');
    }
  });
  owned.forEach(function (o) {
    if (shared.indexOf(o) !== -1) {
      bad('no_coupling', '"' + o + '" is listed as both shared and JobMD.io owned. ' +
        'Healthcare data, permissions and workflows may not live inside JobUp.dev business logic.',
        'separation_boundaries');
    }
  });
  ['Talent Intelligence Record', 'Robotics Division', 'Hospital / Client Intelligence Profile'].forEach(function (e) {
    if (shared.indexOf(e) !== -1) {
      bad('no_coupling', '"' + e + '" may not be a shared JobUp.dev component.', 'separation_boundaries.shared_modular_components');
    }
  });
  (plan.data_model || []).forEach(function (d, i) {
    if (d && d.owned_by !== 'JobMD.io') {
      bad('no_coupling', 'Entity "' + d.entity + '" is owned_by "' + d.owned_by +
        '". The healthcare data model is JobMD.io owned.', 'data_model[' + i + '].owned_by');
    }
  });

  // ── C4: never rename the user's nouns ─────────────────────────────────────
  const blob = JSON.stringify(plan);
  C.PROTECTED_NOUNS.forEach(function (n) {
    const re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    if (!re.test(blob)) {
      bad('protected_noun', 'Protected noun "' + n + '" does not appear in the plan.', '');
    }
  });
  // Canonical spellings that a model reliably "tidies" into something else.
  const CANON = ['Talent Intelligence Record', 'Robotics Division', 'JobMD.io', 'JobUp.dev', 'IDN'];
  CANON.forEach(function (n) {
    if (blob.indexOf(n) === -1) bad('protected_noun', 'Canonical term "' + n + '" is missing from the plan.', '');
  });

  // ── C7: no real physician / candidate / hospital / credentialing data ─────
  walkStrings(plan, '', function (s, path) {
    PHI_PATTERNS.forEach(function (p) {
      if (p.re.test(s)) {
        bad('no_real_data', 'A value looks like a ' + p.name + '. The build plan describes structures only.', path);
      }
    });
  });

  // ── C1: no fabrication — required scalars must be present, not invented ───
  const proj = plan.project || {};
  if (proj.name !== C.PROJECT.name) bad('no_fabrication', 'project.name must be ' + C.PROJECT.name + '.', 'project.name');
  if (proj.parent_ecosystem !== C.PROJECT.parent_ecosystem) bad('no_fabrication', 'project.parent_ecosystem must be ' + C.PROJECT.parent_ecosystem + '.', 'project.parent_ecosystem');
  if (proj.hosted_location !== C.PROJECT.hosted_location) bad('no_fabrication', 'project.hosted_location must be the declared deployment target.', 'project.hosted_location');
  if (!Array.isArray(plan.open_questions) || !plan.open_questions.length) {
    bad('no_fabrication', 'open_questions must record what was truncated, ambiguous or missing.', 'open_questions');
  }
  if (C.TALENT_DISCOVERY_TRUNCATED) {
    const mentionsTruncation = (plan.open_questions || []).some(function (q) { return /truncat/i.test(q); });
    if (!mentionsTruncation) {
      bad('no_fabrication', 'The request is truncated in section 10 and open_questions must say so.', 'open_questions');
    }
  }
  const atd = plan.automated_talent_discovery || {};
  (atd.authorized_sources || []).forEach(function (s, i) {
    if (C.TALENT_DISCOVERY_SOURCES.indexOf(s) === -1) {
      bad('no_fabrication', 'Automated Talent Discovery names source "' + s +
        '", which the truncated request never states.', 'automated_talent_discovery.authorized_sources[' + i + ']');
    }
  });

  // Serializable, and therefore returnable as JSON only.
  try { JSON.parse(JSON.stringify(plan)); }
  catch (e) { bad('declared_shape', 'The plan is not JSON-serializable: ' + e.message, ''); }

  return { ok: v.length === 0, violations: v };
}

/**
 * Identifier guard for MODEL-WRITTEN PROSE.
 *
 * The model may only rewrite prose. The failure mode that matters is prose that
 * introduces a concrete-sounding identifier — a table, a route, a file, a
 * metric — that no source ever mentioned, because a build agent downstream will
 * read it as fact. Any identifier-shaped token absent from the corpus text is
 * reported, and the architect discards that rewrite in favour of the
 * deterministic prose.
 */
const IDENT_RE = /\b(?:[a-z0-9_]+_[a-z0-9_]+|\/[A-Za-z0-9_\-/.]{3,}|[A-Za-z0-9_-]+\.(?:js|ts|sql|json|html|py)|[a-z]+[A-Z][A-Za-z]*\()/g;

function unverifiedIdentifiers(text, corpusText) {
  const hay = String(corpusText || '').toLowerCase();
  const out = [];
  const seen = Object.create(null);
  const m = String(text || '').match(IDENT_RE) || [];
  m.forEach(function (tok) {
    const t = tok.toLowerCase();
    // Separator-only differences are not findings, or the real ones drown.
    const loose = t.replace(/[_\-/.]+/g, ' ').trim();
    if (hay.indexOf(t) !== -1 || hay.indexOf(loose) !== -1) return;
    if (seen[t]) return;
    seen[t] = 1;
    out.push(tok);
  });
  return out;
}

module.exports = { verifyPlan, unverifiedIdentifiers, SCHEMA_KEYS, PHI_PATTERNS };
