'use strict';

/**
 * THE ARCHITECTURE RECORD — the second output contract.
 *
 * A different agent from the Build Plan Architect, with a materially different
 * shape: camelCase keys, brandInheritance, reuseAnalysis carrying itemType /
 * decision / modular, profile fields as objects rather than strings, and
 * openQuestions as objects with a blocksBuild flag.
 *
 * IT SHARES corpus.js AND NOTHING ELSE. Two agents that each transcribed the
 * project request separately would eventually disagree about how many pipeline
 * stages there are, and both would look right in isolation. One corpus, two
 * projections of it.
 *
 * Deterministic, exactly as the other one: no model writes a named entity.
 */

const C = require('./corpus');

// itemType per registry entry. The declared enum is
// component | service | mcp_endpoint | agent_pattern | design_system | data_model.
const ITEM_TYPE = {
  'JobUp design system (dark aurora tokens, .d2b scope)': 'design_system',
  'JobUp PWA shell generator': 'component',
  'JobUp resume ingestion': 'service',
  'JobUp structured profile service': 'data_model',
  'JobUp matching logic': 'service',
  'JobUp job source connectors': 'service',
  'JobUp employer registry': 'data_model',
  'JobUp MCP brain': 'agent_pattern',
  'JobUp assistant': 'agent_pattern',
  'JobUp identity / tenancy': 'service',
  'JobUp auth service': 'service',
  'JobUp billing (Stripe)': 'service',
  'JobUp analytics': 'service',
  'JobUp mailer': 'service',
  'JobUp subscriber dashboard': 'component',
  'JobUp admin console': 'component',
  'JobUp geo service': 'service',
  'JobUp entitlements / plans': 'service',
  'CRM zero-key Edge TTS voice layer': 'service',
  'CRM voice orb embed': 'component'
};

/**
 * THE DECLARED ENUM HAS NO VALUE FOR "NOT APPLICABLE".
 *
 * Two registry items — billing and entitlements — are genuinely not reused,
 * because the request describes internal recruiters and hospital clients and
 * names no subscriber billing. Forcing them into build_new_for_jobmd would
 * assert JobMD.io is building its own billing, which the request never says.
 * They are omitted from reuseAnalysis and the omission is stated in
 * openQuestions, which is what the "flag, never fill in" rule requires.
 */
const NOT_APPLICABLE = ['JobUp billing (Stripe)', 'JobUp entitlements / plans'];

const REUSE_DECISION = {
  'JobUp design system (dark aurora tokens, .d2b scope)': ['reuse_as_is', null,
    'Brand inheritance is explicitly requested: theme, colors, fonts, layout language and interaction patterns are taken as the starting point.'],
  'JobUp PWA shell generator': ['extend_for_healthcare', 'Separate manifest identity, scope and icons for JobMD.io',
    'The generator is already parameterized by base path; JobMD.io needs its own installable identity so an install does not collide with JobUp.dev.'],
  'JobUp resume ingestion': ['extend_for_healthcare', 'CV / Resume Intelligence Agent extraction set',
    'Ingestion carries over; the fields to extract are clinical — residency, fellowship, board certifications, licenses, procedures, robotic experience.'],
  'JobUp structured profile service': ['extend_for_healthcare', 'Talent Intelligence Record',
    'The structured-profile concept carries over; the healthcare field set and its credentialing semantics are JobMD.io owned.'],
  'JobUp matching logic': ['extend_for_healthcare', 'Intelligent Matching Engine across the seven named dimensions',
    'Scoring and explanation machinery is reusable; the named dimensions and their clinical evaluators are JobMD.io owned.'],
  'JobUp job source connectors': ['extend_for_healthcare', 'Automated Talent Discovery connectors',
    'Connector shape is reusable, but the authorized sources named in the request are the existing JobMD.io database and candidate-submitted profiles, not public job boards.'],
  'JobUp employer registry': ['extend_for_healthcare', 'Hospital / Client Intelligence Profile',
    'An employer registry is the nearest existing analogue to a hospital, health system or IDN profile; the field set and facility hierarchy are new.'],
  'JobUp MCP brain': ['extend_for_healthcare', 'Central MCP orchestration layer and Recruiter Copilot',
    'The gateway pattern — tool registry, tenant injection, authorization gates, audit — transfers directly; the eleven agents and their A2A workflows are JobMD.io owned.'],
  'JobUp assistant': ['extend_for_healthcare', 'Candidate Intake Agent',
    'Conversational intake exists; the questions, the clinical validation and the resulting record are healthcare specific.'],
  'JobUp identity / tenancy': ['reuse_as_is', null,
    'Tenant resolution and session-derived tenant_id are domain neutral and already proven in this repository.'],
  'JobUp auth service': ['reuse_as_is', null,
    'Password handling, session cookies and token verification carry no healthcare semantics.'],
  'JobUp analytics': ['extend_for_healthcare', 'Platform Administrator analytics',
    'Event capture is reusable; the metrics that matter are placements, pipeline velocity and match quality.'],
  'JobUp mailer': ['extend_for_healthcare', 'Recruitment Outreach Agent delivery',
    'Delivery is reusable; outreach must go through approved channels and track responses, which is a JobMD.io workflow.'],
  'JobUp subscriber dashboard': ['extend_for_healthcare', 'Recruiter and physician dashboards',
    'Layout and component vocabulary transfer; the visual Recruitment Pipeline is a new surface.'],
  'JobUp admin console': ['extend_for_healthcare', 'Platform Administrator console',
    'Aggregate-first administration with audited access to identity is the right pattern for a console holding physician records.'],
  'JobUp geo service': ['reuse_as_is', null,
    'Location resolution and distance are domain neutral and feed the Geographic Match dimension unchanged.'],
  'CRM zero-key Edge TTS voice layer': ['reuse_as_is', null,
    'The voice layer is already shared infrastructure in this repository and carries no per-product cost.'],
  'CRM voice orb embed': ['reuse_as_is', null,
    'Brand inheritance names the Orb experience explicitly; the embed is drop-in and reads the page it sits on.']
};

// Which agent first writes each profile field. null where the request does not
// attribute it to a named agent — recruiter- or owner-entered, not inferred.
const TIR_SOURCE = {
  'contact information': 'Candidate Intake Agent',
  'specialty/subspecialty': 'CV / Resume Intelligence Agent',
  'education': 'CV / Resume Intelligence Agent',
  'residency': 'CV / Resume Intelligence Agent',
  'fellowship': 'CV / Resume Intelligence Agent',
  'board certifications': 'CV / Resume Intelligence Agent',
  'licenses': 'CV / Resume Intelligence Agent',
  'experience': 'CV / Resume Intelligence Agent',
  'current/previous organizations': 'CV / Resume Intelligence Agent',
  'leadership': 'CV / Resume Intelligence Agent',
  'clinical interests': 'Candidate Intake Agent',
  'procedure expertise': 'CV / Resume Intelligence Agent',
  'robotic platforms': 'Robotics Intelligence Agent',
  'academic experience': 'CV / Resume Intelligence Agent',
  'research/publications': 'CV / Resume Intelligence Agent',
  'geographic preferences': 'Candidate Intake Agent',
  'relocation willingness': 'Candidate Intake Agent',
  'compensation expectations': 'Candidate Intake Agent',
  'employment preferences': 'Candidate Intake Agent',
  'availability': 'Candidate Intake Agent',
  'credentialing information': null,
  'recruitment status': null,
  'recruiter notes': null,
  'AI summary': 'Candidate Ranking Agent',
  'match history': 'Candidate Matching Agent'
};

const HCP_SOURCE = {
  'organization': 'Hospital Intake Agent', 'health system/IDN': 'Hospital Intake Agent',
  'facilities': 'Hospital Intake Agent', 'locations': 'Hospital Intake Agent',
  'contacts': 'Hospital Intake Agent', 'open positions': 'Hospital Intake Agent',
  'specialty and experience requirements': 'Hospital Intake Agent',
  'certifications': 'Hospital Intake Agent', 'licensing': 'Hospital Intake Agent',
  'procedures': 'Hospital Intake Agent', 'robotics platform': 'Robotics Intelligence Agent',
  'compensation range': 'Hospital Intake Agent', 'call schedule': 'Hospital Intake Agent',
  'employment model': 'Hospital Intake Agent', 'relocation assistance': 'Hospital Intake Agent',
  'start-date requirements': 'Hospital Intake Agent', 'recruiting priorities': 'Hospital Intake Agent',
  'historical placements': null, 'candidate pipeline': 'Candidate Matching Agent'
};

// Field names are architecture. VALUES are never carried, which is why these
// two carry an explicit note rather than being silently listed.
const FIELD_NOTE = {
  'contact information': 'Field name only. No contact value is carried in this record.',
  'credentialing information': 'Field name only. No credentialing value is carried in this record.'
};

const AGENT_IO = {
  'Candidate Intake Agent':         { inputs: ['physician conversational session'], outputs: ['Talent Intelligence Record'], a2a: ['CV / Resume Intelligence Agent', 'Clinical Qualification Agent'], stages: [] },
  'CV / Resume Intelligence Agent': { inputs: ['candidate-submitted CV or resume'], outputs: ['Talent Intelligence Record fields'], a2a: ['Candidate Intake Agent', 'Clinical Qualification Agent', 'Robotics Intelligence Agent'], stages: [] },
  'Hospital Intake Agent':          { inputs: ['hospital recruiting requirements'], outputs: ['structured position profiles'], a2a: ['Candidate Matching Agent'], stages: [] },
  'Candidate Matching Agent':       { inputs: ['Talent Intelligence Record', 'structured position profiles'], outputs: ['matches with scores'], a2a: ['Candidate Ranking Agent', 'Clinical Qualification Agent', 'Robotics Intelligence Agent'], stages: ['Matched'] },
  'Clinical Qualification Agent':   { inputs: ['Talent Intelligence Record', 'specialty and experience requirements'], outputs: ['qualification evaluation'], a2a: ['Candidate Matching Agent', 'Candidate Ranking Agent'], stages: ['Qualified'] },
  'Robotics Intelligence Agent':    { inputs: ['Robotics Division fields', 'robotics platform requirements'], outputs: ['robotic-surgery recruitment intelligence'], a2a: ['Candidate Matching Agent', 'Candidate Ranking Agent'], stages: [] },
  'Candidate Ranking Agent':        { inputs: ['matches with scores', 'qualification evaluation'], outputs: ['explainable rankings with strengths and gaps'], a2a: ['Recruiter Copilot', 'Recruitment Outreach Agent'], stages: [] },
  'Recruitment Outreach Agent':     { inputs: ['explainable rankings with strengths and gaps'], outputs: ['personalized outreach', 'tracked responses'], a2a: ['Follow-Up Agent', 'Scheduling Agent'], stages: ['Contacted', 'Interested'] },
  'Scheduling Agent':               { inputs: ['recruiter availability', 'candidate availability', 'hospital availability'], outputs: ['scheduled interviews'], a2a: ['Follow-Up Agent', 'Recruitment Outreach Agent'], stages: ['Interview'] },
  'Follow-Up Agent':                { inputs: ['recruitment pipeline state'], outputs: ['follow-up actions'], a2a: ['Recruitment Outreach Agent', 'Scheduling Agent'], stages: [] },
  'Recruiter Copilot':              { inputs: ['recruiter natural-language request'], outputs: ['answers and ranked results'], a2a: ['Candidate Ranking Agent', 'Candidate Matching Agent', 'Robotics Intelligence Agent'], stages: [] }
};

// Which registry item each agent specializes, or null where it is net-new.
const AGENT_REUSE = {
  'Candidate Intake Agent': 'JobUp assistant',
  'CV / Resume Intelligence Agent': 'JobUp resume ingestion',
  'Hospital Intake Agent': null,
  'Candidate Matching Agent': 'JobUp matching logic',
  'Clinical Qualification Agent': null,
  'Robotics Intelligence Agent': null,
  'Candidate Ranking Agent': 'JobUp matching logic',
  'Recruitment Outreach Agent': 'JobUp mailer',
  'Scheduling Agent': null,
  'Follow-Up Agent': null,
  'Recruiter Copilot': 'JobUp MCP brain'
};

function openQuestions() {
  return [
    { topic: 'Automated Talent Discovery',
      question: 'Section 10 of the project request is truncated mid-sentence at "candidate-submitted profil". Which authorized sources beyond the existing JobMD.io database and candidate-submitted profiles are in scope?',
      blocksBuild: true },
    { topic: 'JobMD.io existing physician database',
      question: 'The request names an existing JobMD.io physician database as a discovery source, but no such table, endpoint or file path exists in this repository. Where does it live, and what is its schema?',
      blocksBuild: true },
    { topic: 'MCP endpoints',
      question: 'The declared schema asks for mcpEndpoints, but neither the project request nor the component registry names a single endpoint path. The list is left empty rather than invented. What are the actual endpoint paths?',
      blocksBuild: true },
    { topic: 'Pipeline stage authority',
      question: 'The request says authorized AI agents update relevant states when appropriate but never enumerates which agent may set which of the thirteen stages. Authority has been granted only where a named agent function produces the state; every other stage is recruiter and administrator only. Is that the intended split?',
      blocksBuild: false },
    { topic: 'reuseAnalysis decision enum',
      question: 'The declared decision enum offers reuse_as_is, extend_for_healthcare and build_new_for_jobmd, with no value for a registry item that is simply not applicable. ' + NOT_APPLICABLE.join(' and ') + ' are not reused because the request describes internal recruiters and hospital clients and names no subscriber billing or plan gating, so they are omitted from reuseAnalysis rather than forced into a decision the request does not support. Should the enum gain a not_applicable value?',
      blocksBuild: false },
    { topic: 'Scope beyond physicians',
      question: 'Section 1 names Physicians & Surgeons as a primary user type and never mentions medical staff, but the owner states JobMD.io recruits surgeons, doctors AND medical staff. What must a non-physician staff record carry?',
      blocksBuild: false },
    { topic: 'Identity and access',
      question: 'The request does not state whether JobMD.io Recruiters and Platform Administrators authenticate against JobUp.dev identity or a separate JobMD.io directory.',
      blocksBuild: false },
    { topic: 'Regulatory regime',
      question: 'The request does not state a retention, consent or regulatory regime for physician credentialing data.',
      blocksBuild: true }
  ];
}

/** Build the architecture record deterministically. No model, no network. */
function buildRecord() {
  const reuseAnalysis = C.JOBUP_INVENTORY
    .filter(function (e) { return NOT_APPLICABLE.indexOf(e.component) === -1; })
    .map(function (e) {
      const d = REUSE_DECISION[e.component];
      return {
        jobUpDevItem: e.component,
        itemType: ITEM_TYPE[e.component],
        decision: d[0],
        healthcareSpecialization: d[1],
        modular: true,
        rationale: d[2]
      };
    });

  return {
    project: {
      name: C.PROJECT.name,
      parentEcosystem: C.PROJECT.parent_ecosystem,
      publicDomain: C.PROJECT.public_domain,
      hostedLocation: C.PROJECT.hosted_location,
      positioning: 'A dedicated division of JobUp.dev that remains a separate healthcare recruitment ecosystem, presented as the specialized medical recruitment division.',
      architecturePrinciple: C.PROJECT.architecture_principle
    },
    brandInheritance: {
      inheritedFromJobUpDev: C.SEPARATION_BOUNDARIES.brand_inheritance.slice(),
      jobMDSpecificPresentation: [
        'Presented as the specialized medical recruitment division of JobUp.dev',
        'Healthcare-specific surfaces: physician experience and hospital/client experience'
      ]
    },
    reuseAnalysis: reuseAnalysis,
    primaryUsers: C.PRIMARY_USERS.map(function (u) {
      return { userType: u.user_type, description: u.description, keyCapabilities: u.key_capabilities.slice() };
    }),
    medicalSpecialties: {
      initialSpecialties: C.MEDICAL_SPECIALTIES.slice(),
      extensible: true,
      extensionMechanism: 'Specialties and subspecialties are stored as data with a subspecialty relation, so additional physician specialties and subspecialties are added without redesigning the platform.'
    },
    mcpArchitecture: {
      orchestrationLayer: {
        responsibilities: [
          'Coordinate the eleven specialized AI agents.',
          'Route agent-to-agent workflows between them.',
          'Inject tenant context from the session and never from tool arguments.',
          'Enforce role and channel authorization before any tool call.',
          'Audit every call, including denials.'
        ],
        // EMPTY ON PURPOSE. Neither the request nor the registry names a single
        // endpoint path, and inventing one is the failure this agent exists to
        // avoid. The gap is in openQuestions.
        mcpEndpoints: []
      },
      agents: C.AGENTS.map(function (a) {
        const io = AGENT_IO[a.name];
        return {
          agentName: a.name,
          function: a.function,
          inputs: io.inputs.slice(),
          outputs: io.outputs.slice(),
          a2aPartners: io.a2a.slice(),
          mayUpdatePipelineStages: io.stages.slice(),
          reuseSource: AGENT_REUSE[a.name]
        };
      })
    },
    physicianIntelligenceProfile: {
      recordName: 'Talent Intelligence Record',
      persistent: true,
      fields: C.TALENT_INTELLIGENCE_RECORD_FIELDS.map(function (f) {
        return { fieldName: f, sourceAgent: TIR_SOURCE[f] || null, notes: FIELD_NOTE[f] || null };
      })
    },
    hospitalClientIntelligenceProfile: {
      fields: C.HOSPITAL_CLIENT_PROFILE_FIELDS.map(function (f) {
        return { fieldName: f, sourceAgent: HCP_SOURCE[f] || null, notes: null };
      })
    },
    matchingEngine: {
      dimensions: C.MATCHING_DIMENSIONS.map(function (d) {
        return { dimensionName: d.dimension, evaluates: d.evaluates };
      }),
      outputRequirements: { score: true, explanation: true, materialGaps: true }
    },
    recruitmentPipeline: {
      stages: C.RECRUITMENT_PIPELINE.map(function (s) {
        return { order: s.order, stageName: s.stage, aiAgentsAuthorizedToUpdate: s.agents_authorized_to_update.slice() };
      }),
      visualPipelineOwner: 'JobMD.io Recruiters'
    },
    roboticsDivision: {
      capturedFields: C.ROBOTICS_CAPTURED_FIELDS.slice(),
      searchCapabilities: C.ROBOTICS_SEARCH_CAPABILITIES.slice()
    },
    conversationalSearch: {
      authorizedUsers: ['Hospitals / Health Systems / IDNs', 'JobMD.io Recruiters', 'Platform Administrators'],
      supportedQueryDimensions: C.CONVERSATIONAL_SEARCH_DIMENSIONS.slice(),
      translationBehavior: 'The AI translates natural-language requests into structured searches.',
      resultFormat: 'Ranked results.'
    },
    automatedTalentDiscovery: {
      authorizedSources: C.TALENT_DISCOVERY_SOURCES.slice(),
      status: C.TALENT_DISCOVERY_TRUNCATED ? 'incomplete_in_request' : 'specified',
      notes: 'Section 10 of the supplied request is truncated mid-sentence. Only the sources it states are listed; no further source has been inferred.'
    },
    separationFromJobUpDev: {
      ownDataModel: true,
      ownWorkflows: true,
      ownPermissions: true,
      ownAgents: true,
      sharedModularComponents: C.SEPARATION_BOUNDARIES.shared_modular_components.slice()
    },
    openQuestions: openQuestions()
  };
}

module.exports = { buildRecord, REUSE_DECISION, ITEM_TYPE, NOT_APPLICABLE, AGENT_IO, AGENT_REUSE };
