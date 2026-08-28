'use strict';

/**
 * THE DETERMINISTIC BUILD PLAN.
 *
 * Every named entity in the output originates here, read from corpus.js, in
 * corpus order. No model is involved in producing this object. The architect
 * may afterwards ask a model to improve PROSE fields (reason, purpose,
 * description, mitigation) — never to add, remove, rename or reorder a named
 * entity, and never to introduce an identifier the corpus does not contain.
 *
 * The consequence worth preserving: with no ANTHROPIC_API_KEY the plan is
 * byte-identical in every structural field. Only the prose differs, and it is
 * labelled. SIT asserts that equivalence.
 */

const C = require('./corpus');

// ── The capability ledger ───────────────────────────────────────────────────
// Instruction 3: "never leave a capability unmapped". So the capabilities are
// enumerated explicitly and each one carries its mapping. verify.js fails the
// plan if any capability is missing a mapping — an unmapped capability is a
// silent hole in a build plan, which is the expensive kind.
const CAPABILITIES = [
  { capability: 'Physician and surgeon conversational intake',        mapping: 'specialize', via: 'JobUp assistant' },
  { capability: 'CV / resume extraction',                             mapping: 'specialize', via: 'JobUp resume ingestion' },
  { capability: 'Structured professional profile storage',            mapping: 'specialize', via: 'JobUp structured profile service' },
  { capability: 'Hospital recruiting requirement intake',             mapping: 'new',        via: 'Hospital / Client Intelligence Profile service' },
  { capability: 'Candidate to opportunity matching',                  mapping: 'specialize', via: 'JobUp matching logic' },
  { capability: 'Clinical qualification evaluation',                  mapping: 'new',        via: 'Clinical Qualification engine' },
  { capability: 'Robotic surgery recruitment intelligence',           mapping: 'new',        via: 'Robotics Division module' },
  { capability: 'Explainable candidate ranking',                      mapping: 'specialize', via: 'JobUp matching logic' },
  { capability: 'Personalized recruitment outreach',                  mapping: 'specialize', via: 'JobUp mailer' },
  { capability: 'Interview scheduling coordination',                  mapping: 'new',        via: 'Scheduling service' },
  { capability: 'Recruitment pipeline follow-up',                     mapping: 'new',        via: 'Recruitment Pipeline state machine' },
  { capability: 'Recruiter conversational interface',                 mapping: 'specialize', via: 'JobUp MCP brain' },
  { capability: 'Conversational search over the physician network',   mapping: 'new',        via: 'Conversational Search service' },
  { capability: 'Automated talent discovery',                         mapping: 'new',        via: 'Automated Talent Discovery service' },
  { capability: 'Recruiter and administrator dashboards',             mapping: 'specialize', via: 'JobUp subscriber dashboard' },
  { capability: 'Authentication, tenancy and permissions',            mapping: 'reuse_as_is', via: 'JobUp identity / tenancy' },
  { capability: 'Visual design and brand inheritance',                mapping: 'reuse_as_is', via: 'JobUp design system (dark aurora tokens, .d2b scope)' },
  { capability: 'Voice interaction (Orb experience)',                 mapping: 'reuse_as_is', via: 'CRM voice orb embed' }
];

// ── Reuse classification (one row per REAL JobUp inventory entry) ───────────
const REUSE = {
  'JobUp design system (dark aurora tokens, .d2b scope)': ['reuse_as_is', 'JobMD.io landing and application shell',
    'Brand inheritance is explicitly requested: theme, colors, fonts, layout language and interaction patterns are taken as the starting point.'],
  'JobUp PWA shell generator': ['specialize', 'JobMD.io installable recruiter and physician apps',
    'The generator is parameterized by base path already; JobMD.io needs its own manifest identity, scope and icons so an install does not collide with JobUp.'],
  'JobUp resume ingestion': ['specialize', 'CV / Resume Intelligence Agent',
    'The ingestion path is reusable, but the fields to extract are clinical: residency, fellowship, board certifications, licenses, procedures, robotic experience.'],
  'JobUp structured profile service': ['specialize', 'Talent Intelligence Record',
    'The structured-profile concept carries over; the healthcare field set and its credentialing semantics are JobMD.io owned.'],
  'JobUp matching logic': ['specialize', 'Intelligent Matching Engine',
    'The scoring and explanation machinery is reusable; the seven named dimensions and their clinical evaluators are JobMD.io owned.'],
  'JobUp job source connectors': ['specialize', 'Automated Talent Discovery',
    'Connector shape is reusable, but the authorized sources named in the request are the existing JobMD.io database and candidate-submitted profiles, not public job boards.'],
  'JobUp employer registry': ['specialize', 'Hospital / Client Intelligence Profile',
    'An employer registry is the nearest existing analogue to a hospital, health system or IDN profile, but the field set and facility hierarchy are new.'],
  'JobUp MCP brain': ['specialize', 'Central MCP orchestration layer and Recruiter Copilot',
    'The gateway pattern (tool registry, tenant injection, authorization gates, audit) transfers directly; the eleven agents and their A2A workflows are JobMD.io owned.'],
  'JobUp assistant': ['specialize', 'Candidate Intake Agent',
    'Conversational intake exists; the questions, the clinical validation and the resulting record are healthcare specific.'],
  'JobUp identity / tenancy': ['reuse_as_is', 'JobMD.io tenancy',
    'Tenant resolution and session-derived tenant_id are domain neutral and already proven in this repository.'],
  'JobUp auth service': ['reuse_as_is', 'JobMD.io authentication',
    'Password handling, session cookies and token verification carry no healthcare semantics.'],
  'JobUp billing (Stripe)': ['not_applicable', null,
    'The request describes internal recruiters and hospital clients, and names no subscriber billing for JobMD.io. Adopting it would be inventing a commercial model the request does not state.'],
  'JobUp analytics': ['specialize', 'Platform Administrator analytics',
    'Event capture is reusable; the metrics that matter are placements, pipeline velocity and match quality.'],
  'JobUp mailer': ['specialize', 'Recruitment Outreach Agent',
    'Delivery is reusable; outreach must go through approved channels and track responses, which is a JobMD.io workflow.'],
  'JobUp subscriber dashboard': ['specialize', 'Recruiter and physician dashboards',
    'Layout and component vocabulary transfer; the visual Recruitment Pipeline is a new surface.'],
  'JobUp admin console': ['specialize', 'Platform Administrator console',
    'Aggregate-first administration with audited access to identity is the right pattern for a console holding physician records.'],
  'JobUp geo service': ['reuse_as_is', 'Geographic Match',
    'Location resolution and distance are domain neutral and feed the Geographic Match dimension unchanged.'],
  'JobUp entitlements / plans': ['not_applicable', null,
    'Plan-gated entitlements presuppose a subscription product. The request names roles and permissions, not plans.'],
  'CRM zero-key Edge TTS voice layer': ['reuse_as_is', 'Orb experience on JobMD.io surfaces',
    'The voice layer is already shared infrastructure in this repository and carries no per-product cost.'],
  'CRM voice orb embed': ['reuse_as_is', 'Orb experience on JobMD.io surfaces',
    'Brand inheritance names the Orb experience explicitly; the embed is drop-in and reads the page it sits on.']
};

const NEW_COMPONENTS = [
  { component: 'Talent Intelligence Record store',        purpose: 'Persistent per-physician healthcare record holding the twenty-five fields named in the request.', depends_on: ['JobUp structured profile service', 'JobUp identity / tenancy'] },
  { component: 'Hospital / Client Intelligence Profile service', purpose: 'Structured profiles for organizations, health systems and IDNs, their facilities, positions and pipelines.', depends_on: ['JobUp employer registry'] },
  { component: 'Clinical Qualification engine',           purpose: 'Evaluates specialty-specific qualifications, certifications, procedural expertise and experience.', depends_on: ['Talent Intelligence Record store'] },
  { component: 'Robotics Division module',                purpose: 'Captures robotic platform, experience, procedures, volume, training, program leadership and program-development experience, and makes them searchable.', depends_on: ['Talent Intelligence Record store'] },
  { component: 'Intelligent Matching Engine',             purpose: 'Evaluates the seven named dimensions simultaneously and emits a score, an explanation and material gaps.', depends_on: ['Talent Intelligence Record store', 'Hospital / Client Intelligence Profile service', 'JobUp matching logic', 'JobUp geo service'] },
  { component: 'Recruitment Pipeline state machine',      purpose: 'The thirteen ordered stages, with role and agent authorization enforced on every state change.', depends_on: ['Talent Intelligence Record store', 'Hospital / Client Intelligence Profile service'] },
  { component: 'Scheduling service',                      purpose: 'Coordinates recruiter, candidate and hospital interview availability.', depends_on: ['Recruitment Pipeline state machine'] },
  { component: 'Conversational Search service',           purpose: 'Translates natural-language requests into structured searches and ranked results over the physician network.', depends_on: ['Talent Intelligence Record store', 'Robotics Division module', 'Intelligent Matching Engine'] },
  { component: 'Automated Talent Discovery service',      purpose: 'Authorized physician discovery from the existing JobMD.io database and candidate-submitted profiles.', depends_on: ['Talent Intelligence Record store'] },
  { component: 'JobMD.io agent registry and A2A router',  purpose: 'Registers the eleven agents, their inputs, outputs and permitted agent-to-agent workflows behind the MCP orchestration layer.', depends_on: ['JobUp MCP brain'] }
];

const AGENT_IO = {
  'Candidate Intake Agent':         { inputs: ['physician conversational session'], outputs: ['Talent Intelligence Record'], communicates_with: ['CV / Resume Intelligence Agent', 'Clinical Qualification Agent'] },
  'CV / Resume Intelligence Agent': { inputs: ['candidate-submitted CV or resume'], outputs: ['Talent Intelligence Record fields'], communicates_with: ['Candidate Intake Agent', 'Clinical Qualification Agent', 'Robotics Intelligence Agent'] },
  'Hospital Intake Agent':          { inputs: ['hospital recruiting requirements'], outputs: ['structured position profiles'], communicates_with: ['Candidate Matching Agent'] },
  'Candidate Matching Agent':       { inputs: ['Talent Intelligence Record', 'structured position profiles'], outputs: ['matches with scores'], communicates_with: ['Candidate Ranking Agent', 'Clinical Qualification Agent', 'Robotics Intelligence Agent'] },
  'Clinical Qualification Agent':   { inputs: ['Talent Intelligence Record', 'specialty and experience requirements'], outputs: ['qualification evaluation'], communicates_with: ['Candidate Matching Agent', 'Candidate Ranking Agent'] },
  'Robotics Intelligence Agent':    { inputs: ['Robotics Division fields', 'robotics platform requirements'], outputs: ['robotic-surgery recruitment intelligence'], communicates_with: ['Candidate Matching Agent', 'Candidate Ranking Agent'] },
  'Candidate Ranking Agent':        { inputs: ['matches with scores', 'qualification evaluation'], outputs: ['explainable rankings with strengths and gaps'], communicates_with: ['Recruiter Copilot', 'Recruitment Outreach Agent'] },
  'Recruitment Outreach Agent':     { inputs: ['explainable rankings with strengths and gaps'], outputs: ['personalized outreach', 'tracked responses'], communicates_with: ['Follow-Up Agent', 'Scheduling Agent'] },
  'Scheduling Agent':               { inputs: ['recruiter availability', 'candidate availability', 'hospital availability'], outputs: ['scheduled interviews'], communicates_with: ['Follow-Up Agent', 'Recruitment Outreach Agent'] },
  'Follow-Up Agent':                { inputs: ['recruitment pipeline state'], outputs: ['follow-up actions'], communicates_with: ['Recruitment Outreach Agent', 'Scheduling Agent'] },
  'Recruiter Copilot':              { inputs: ['recruiter natural-language request'], outputs: ['answers and ranked results'], communicates_with: ['Candidate Ranking Agent', 'Candidate Matching Agent', 'Robotics Intelligence Agent'] }
};

const A2A_WORKFLOWS = [
  { workflow: 'Physician onboarding',      participating_agents: ['Candidate Intake Agent', 'CV / Resume Intelligence Agent', 'Clinical Qualification Agent'], trigger: 'A physician or surgeon begins intake or submits a CV.', outcome: 'A Talent Intelligence Record exists and has been evaluated for specialty-specific qualifications.' },
  { workflow: 'Position onboarding',       participating_agents: ['Hospital Intake Agent'], trigger: 'A hospital, health system or IDN states recruiting requirements.', outcome: 'A structured position profile exists on the Hospital / Client Intelligence Profile.' },
  { workflow: 'Continuous matching',       participating_agents: ['Candidate Matching Agent', 'Clinical Qualification Agent', 'Robotics Intelligence Agent', 'Candidate Ranking Agent'], trigger: 'A Talent Intelligence Record or a position profile changes.', outcome: 'An explainable ranking with a score, selection reasons and material gaps.' },
  { workflow: 'Outreach and interview',    participating_agents: ['Recruitment Outreach Agent', 'Scheduling Agent', 'Follow-Up Agent'], trigger: 'A recruiter releases a ranked candidate for contact.', outcome: 'Outreach sent through approved channels, responses tracked, interviews scheduled and followed up.' },
  { workflow: 'Recruiter conversation',    participating_agents: ['Recruiter Copilot', 'Candidate Matching Agent', 'Robotics Intelligence Agent'], trigger: 'A recruiter or authorized user asks a natural-language question.', outcome: 'A structured search is run and ranked results are returned with explanations.' }
];

const BUILD_PHASES = [
  { phase: 1, name: 'Foundation and brand inheritance', deliverables: ['JobMD.io application shell on the inherited JobUp design system', 'Tenancy, authentication and role model', 'Landing surface at the declared hosted location'], depends_on_phases: [] },
  { phase: 2, name: 'Healthcare data model',            deliverables: ['Talent Intelligence Record store', 'Hospital / Client Intelligence Profile service', 'Extensible specialty taxonomy'], depends_on_phases: [1] },
  { phase: 3, name: 'Intake agents',                    deliverables: ['Candidate Intake Agent', 'CV / Resume Intelligence Agent', 'Hospital Intake Agent'], depends_on_phases: [2] },
  { phase: 4, name: 'MCP orchestration layer',          deliverables: ['JobMD.io agent registry and A2A router', 'Authorization gates and audit', 'Recruiter Copilot'], depends_on_phases: [3] },
  { phase: 5, name: 'Qualification and robotics',       deliverables: ['Clinical Qualification engine', 'Robotics Division module', 'Robotics Intelligence Agent'], depends_on_phases: [2, 4] },
  { phase: 6, name: 'Matching and ranking',             deliverables: ['Intelligent Matching Engine across the seven dimensions', 'Candidate Matching Agent', 'Candidate Ranking Agent'], depends_on_phases: [5] },
  { phase: 7, name: 'Pipeline and workflow',            deliverables: ['Recruitment Pipeline state machine across the thirteen stages', 'Visual pipeline for recruiters', 'Recruitment Outreach Agent', 'Scheduling service', 'Scheduling Agent', 'Follow-Up Agent'], depends_on_phases: [6] },
  { phase: 8, name: 'Search and discovery',             deliverables: ['Conversational Search service', 'Automated Talent Discovery service'], depends_on_phases: [6] }
];

const RISKS = [
  { risk: 'Section 10 of the request is truncated mid-sentence.', impact: 'Automated Talent Discovery is specified only as far as candidate-submitted profiles; any further authorized source is unknown.', mitigation: 'Build the two stated sources and treat the connector list as configuration, so an additional source is data entry rather than a redesign.' },
  { risk: 'Physician records carry credentialing and licensing data.', impact: 'A permissions error exposes regulated personal data.', mitigation: 'Keep the healthcare data model, permissions and workflows inside JobMD.io, scope every read by tenant, and hold identity behind audited access in administrative surfaces.' },
  { risk: 'Shared components drift toward tight coupling.', impact: 'A JobUp.dev change breaks JobMD.io, or healthcare logic leaks into JobUp.dev business logic.', mitigation: 'Share only the modular components listed in separation_boundaries and keep the JobMD.io data model, workflows, permissions and agents on the JobMD.io side of the boundary.' },
  { risk: 'The request authorizes agent state changes only in general terms.', impact: 'An agent could be granted authority over a stage the request never authorized, such as Offer or Placement.', mitigation: 'Grant authority only where a named agent function produces the state, leave every other stage to recruiters and administrators, and record the ambiguity as an open question.' },
  { risk: 'The specialty taxonomy is fixed at fifteen entries in the request.', impact: 'A hard-coded taxonomy would force a platform redesign to add a subspecialty.', mitigation: 'Store specialties as data with a subspecialty relation, as the request requires.' }
];

function openQuestions() {
  const q = [
    'Section 10, Automated Talent Discovery, is truncated in the supplied request at "candidate-submitted profil". Any authorized source beyond the existing JobMD.io database and candidate-submitted profiles is unknown.',
    'The request states that authorized AI agents update relevant states when appropriate, but does not enumerate which agent may set which of the thirteen pipeline stages. Authority has been granted only where a named agent function produces the state; every remaining stage is recruiter and administrator only.',
    'No Claude model identifier is named in the request; the deployment default is used and is reported on every response.',
    'The request names no output field set for the build plan. The field names in this plan were introduced by the specification author, not by the request.',
    'The request does not state a retention, consent or regulatory regime for physician credentialing data.',
    'The request does not state whether JobMD.io recruiters and Platform Administrators authenticate against JobUp.dev identity or a separate JobMD.io directory.',
    'Section 1 names "Physicians & Surgeons" as a primary user type and never mentions medical staff, but the owner states JobMD.io recruits surgeons, doctors AND medical staff. The Talent Intelligence Record, the specialty taxonomy and the Clinical Qualification Agent are all specified in physician terms; what a non-physician staff record must carry is not stated anywhere in the request and has not been invented here.'
  ];
  if (C.TALENT_DISCOVERY_TRUNCATED) return q;
  return q.slice(1);
}

/** Build the complete plan deterministically. No model, no network. */
function buildPlan() {
  const reuse_inventory = C.JOBUP_INVENTORY.map(function (e) {
    const r = REUSE[e.component];
    return {
      jobup_component: e.component,
      classification: r[0],
      jobmd_target: r[1],
      reason: r[2]
    };
  });

  return {
    project: {
      name: C.PROJECT.name,
      parent_ecosystem: C.PROJECT.parent_ecosystem,
      public_domain: C.PROJECT.public_domain,
      hosted_location: C.PROJECT.hosted_location,
      architecture_principle: C.PROJECT.architecture_principle
    },
    primary_users: C.PRIMARY_USERS.map(function (u) { return JSON.parse(JSON.stringify(u)); }),
    medical_specialties: {
      initial: C.MEDICAL_SPECIALTIES.slice(),
      extensibility_note: C.SPECIALTY_EXTENSIBILITY_NOTE
    },
    reuse_inventory: reuse_inventory,
    new_components: NEW_COMPONENTS.map(function (n) { return JSON.parse(JSON.stringify(n)); }),
    mcp_orchestration_layer: {
      responsibilities: [
        'Coordinate the eleven specialized AI agents.',
        'Route agent-to-agent workflows between them.',
        'Inject tenant context from the session and never from tool arguments.',
        'Enforce role and channel authorization before any tool call.',
        'Audit every call, including denials.'
      ],
      a2a_workflows: A2A_WORKFLOWS.map(function (w) { return JSON.parse(JSON.stringify(w)); })
    },
    agents: C.AGENTS.map(function (a) {
      const io = AGENT_IO[a.name];
      return {
        name: a.name,
        function: a.function,
        inputs: io.inputs.slice(),
        outputs: io.outputs.slice(),
        communicates_with: io.communicates_with.slice(),
        reused_from_jobup: false
      };
    }),
    data_model: [
      { entity: 'Talent Intelligence Record', purpose: 'Persistent physician and surgeon intelligence record.', fields: C.TALENT_INTELLIGENCE_RECORD_FIELDS.slice(), owned_by: 'JobMD.io' },
      { entity: 'Hospital / Client Intelligence Profile', purpose: 'Structured profile for a hospital, health system or IDN.', fields: C.HOSPITAL_CLIENT_PROFILE_FIELDS.slice(), owned_by: 'JobMD.io' },
      { entity: 'Robotics Division', purpose: 'Specialized robotic-surgery module enabling robotic-surgeon search.', fields: C.ROBOTICS_CAPTURED_FIELDS.slice(), owned_by: 'JobMD.io' }
    ],
    matching_engine: {
      dimensions: C.MATCHING_DIMENSIONS.map(function (d) { return { dimension: d.dimension, evaluates: d.evaluates }; }),
      output_contract: Object.assign({}, C.MATCH_OUTPUT_CONTRACT)
    },
    recruitment_pipeline: C.RECRUITMENT_PIPELINE.map(function (s) {
      return {
        order: s.order,
        stage: s.stage,
        roles_that_may_advance: C.PIPELINE_ROLES.slice(),
        agents_authorized_to_update: s.agents_authorized_to_update.slice()
      };
    }),
    robotics_division: {
      captured_fields: C.ROBOTICS_CAPTURED_FIELDS.slice(),
      search_capabilities: C.ROBOTICS_SEARCH_CAPABILITIES.slice()
    },
    conversational_search: {
      authorized_user_types: ['Hospitals / Health Systems / IDNs', 'JobMD.io Recruiters', 'Platform Administrators'],
      supported_query_dimensions: C.CONVERSATIONAL_SEARCH_DIMENSIONS.slice(),
      result_contract: C.CONVERSATIONAL_SEARCH_RESULT_CONTRACT
    },
    automated_talent_discovery: {
      authorized_sources: C.TALENT_DISCOVERY_SOURCES.slice(),
      notes: 'The supplied request is truncated mid-sentence in this section. Only the sources it states are listed; no further source has been inferred.'
    },
    separation_boundaries: {
      shared_modular_components: C.SEPARATION_BOUNDARIES.shared_modular_components.slice(),
      jobmd_owned: C.SEPARATION_BOUNDARIES.jobmd_owned.slice(),
      brand_inheritance: C.SEPARATION_BOUNDARIES.brand_inheritance.slice()
    },
    build_phases: BUILD_PHASES.map(function (p) { return JSON.parse(JSON.stringify(p)); }),
    risks: RISKS.map(function (r) { return JSON.parse(JSON.stringify(r)); }),
    open_questions: openQuestions()
  };
}

/**
 * EVIDENCE — deliberately NOT part of the plan.
 *
 * The capability ledger and the on-disk path behind each reused component are
 * how a reader audits the plan, but the constraint is "return only the declared
 * JSON shape". Extra keys inside the plan would break the contract the
 * downstream scaffolding step reads, so the evidence travels beside the plan in
 * the response envelope instead of inside it.
 */
function buildEvidence() {
  return {
    capability_map: CAPABILITIES.map(function (c) { return JSON.parse(JSON.stringify(c)); }),
    inventory_paths: C.JOBUP_INVENTORY.map(function (e) {
      return { jobup_component: e.component, source_path: e.path };
    })
  };
}

module.exports = { buildPlan, buildEvidence, CAPABILITIES, REUSE, NEW_COMPONENTS, BUILD_PHASES };
