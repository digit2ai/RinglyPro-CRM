'use strict';

/**
 * THE CORPUS — the only source of truth the JobMD Build Plan Architect may draw
 * a named entity from.
 *
 * WHY THIS FILE EXISTS, AND WHY IT IS NOT A PROMPT.
 *
 * The spec's constraints are absolutes about what must never be invented:
 * never fabricate a value, never invent a JobUp.dev component, never rename the
 * user's nouns, never drop/merge/reorder a specialty, dimension, agent or
 * pipeline stage. A model asked for "the 13 pipeline stages" will happily
 * return 12 well-formed ones, and the output still parses. So the named
 * entities are NOT generated. They are read from here, verbatim, in order, by
 * code, and the model is only ever allowed to write prose ABOUT them.
 *
 * Same doctrine as the AI Readiness Department (the model writes prose; it
 * never writes a number) and the Citi tracker's tailoring (the model selects
 * bullet ids; it cannot author a bullet).
 *
 * Every array below is transcribed from the JobMD.io project request as
 * supplied. Order is load-bearing and is asserted by SIT.
 */

// ── §1 Primary Users ─────────────────────────────────────────────────────────
const PRIMARY_USERS = [
  {
    user_type: 'Physicians & Surgeons',
    description: 'Medical professionals seeking opportunities based on specialty, experience, location, compensation, hospital type, technology experience, lifestyle requirements, and professional objectives.',
    key_capabilities: [
      'Conversational intake and structured profile creation',
      'Persistent Talent Intelligence Record',
      'Opportunity matching with explainable scores',
      'Interview scheduling coordination'
    ]
  },
  {
    user_type: 'Hospitals / Health Systems / IDNs',
    description: 'Organizations searching for highly qualified physicians and surgeons based on clinical, operational, geographic, and strategic requirements.',
    key_capabilities: [
      'Structured position profiles from recruiting requirements',
      'Hospital / Client Intelligence Profile',
      'Conversational Search across the physician network',
      'Candidate pipeline visibility'
    ]
  },
  {
    user_type: 'JobMD.io Recruiters',
    description: 'Internal recruiters using AI-powered tools to identify, qualify, rank, contact, manage, and place candidates.',
    key_capabilities: [
      'Visual Recruitment Pipeline management',
      'Explainable candidate rankings',
      'Personalized outreach through approved channels',
      'Recruiter Copilot conversational interface'
    ]
  },
  {
    user_type: 'Platform Administrators',
    description: 'Leadership managing clients, candidates, recruiters, placements, AI agents, analytics, workflows, and system configuration.',
    key_capabilities: [
      'Client, candidate and recruiter administration',
      'AI agent configuration and authorization',
      'Analytics and workflow configuration'
    ]
  }
];

// ── §2 Medical Specialties (15, exact order) ────────────────────────────────
const MEDICAL_SPECIALTIES = [
  'General Surgery', 'Cardiac Surgery', 'Thoracic Surgery', 'Orthopaedic Surgery',
  'Urology', 'Gynecology', 'Colon & Rectal Surgery', 'Trauma Surgery',
  'Plastic Surgery', 'Vascular Surgery', 'Robotic Surgery', 'Pediatric Surgery',
  'Neurosurgery', 'Transplant Surgery', 'Hepatobiliary Surgery'
];

const SPECIALTY_EXTENSIBILITY_NOTE =
  'The architecture must allow additional physician specialties and subspecialties without redesigning the platform.';

// ── §3 The 11 named AI agents (exact names, exact order) ────────────────────
const AGENTS = [
  { name: 'Candidate Intake Agent',        function: 'Conversational physician/surgeon intake and structured profile creation.' },
  { name: 'CV / Resume Intelligence Agent', function: 'Extract education, residency, fellowship, board certifications, licenses, specialties, procedures, experience, publications, leadership roles, robotic experience, and employment history.' },
  { name: 'Hospital Intake Agent',         function: 'Converts hospital recruiting requirements into structured position profiles.' },
  { name: 'Candidate Matching Agent',      function: 'Continuously compares physician profiles against opportunities.' },
  { name: 'Clinical Qualification Agent',  function: 'Evaluates specialty-specific qualifications, certifications, procedural expertise, and experience.' },
  { name: 'Robotics Intelligence Agent',   function: 'Specialized robotic-surgery recruitment intelligence.' },
  { name: 'Candidate Ranking Agent',       function: 'Generates explainable candidate rankings and match scores with strengths and gaps.' },
  { name: 'Recruitment Outreach Agent',    function: 'Creates personalized outreach through approved channels and tracks responses.' },
  { name: 'Scheduling Agent',              function: 'Coordinates recruiter, candidate, and hospital interview availability.' },
  { name: 'Follow-Up Agent',               function: 'Manages follow-ups throughout the recruitment pipeline.' },
  { name: 'Recruiter Copilot',             function: 'Conversational interface across the ecosystem.' }
];

// ── §4 Talent Intelligence Record fields (verbatim from the request) ────────
const TALENT_INTELLIGENCE_RECORD_FIELDS = [
  'contact information', 'specialty/subspecialty', 'education', 'residency', 'fellowship',
  'board certifications', 'licenses', 'experience', 'current/previous organizations',
  'leadership', 'clinical interests', 'procedure expertise', 'robotic platforms',
  'academic experience', 'research/publications', 'geographic preferences',
  'relocation willingness', 'compensation expectations', 'employment preferences',
  'availability', 'credentialing information', 'recruitment status', 'recruiter notes',
  'AI summary', 'match history'
];

// ── §5 Hospital / Client Intelligence Profile fields (verbatim) ─────────────
const HOSPITAL_CLIENT_PROFILE_FIELDS = [
  'organization', 'health system/IDN', 'facilities', 'locations', 'contacts',
  'open positions', 'specialty and experience requirements', 'certifications',
  'licensing', 'procedures', 'robotics platform', 'compensation range',
  'call schedule', 'employment model', 'relocation assistance',
  'start-date requirements', 'recruiting priorities', 'historical placements',
  'candidate pipeline'
];

// ── §6 Intelligent Matching Engine — the 7 dimensions (exact order) ─────────
const MATCHING_DIMENSIONS = [
  { dimension: 'Clinical Match',                evaluates: 'Specialty-specific qualifications, certifications, procedural expertise, and experience.' },
  { dimension: 'Technology Match',              evaluates: 'Robotic platforms and technology experience against the position requirements.' },
  { dimension: 'Geographic Match',              evaluates: 'Geographic preferences and relocation willingness against the facility locations.' },
  { dimension: 'Career Match',                  evaluates: 'Professional objectives, leadership and academic experience against the opportunity.' },
  { dimension: 'Compensation Match',            evaluates: 'Compensation expectations against the compensation range.' },
  { dimension: 'Availability Match',            evaluates: 'Availability against the start-date requirements.' },
  { dimension: 'Cultural / Professional Match', evaluates: 'Employment preferences and hospital type against the employment model and call schedule.' }
];

const MATCH_OUTPUT_CONTRACT = {
  score: 'Every match generates a score.',
  explanation: 'Every match generates an understandable explanation of why the candidate was selected.',
  material_gaps: 'Every match states any material gaps.'
};

// ── §7 Recruitment Pipeline — the 13 stages, in order ───────────────────────
//
// AGENT STATE-CHANGE AUTHORITY IS AN ALLOW-LIST, NOT A DEFAULT.
//
// The request authorizes agent updates only in the general — "with authorized
// AI agents updating relevant states when appropriate" — and never enumerates
// which stage each agent may move. The constraint is absolute in the other
// direction ("never assign state-change authority to an AI agent for a pipeline
// stage unless the request authorizes agent updates for it"), so authority is
// granted ONLY where a §3 agent function names the work that produces the
// state. Everything else is recruiter-only, and the ambiguity is reported in
// open_questions rather than resolved by guessing.
const RECRUITMENT_PIPELINE = [
  { order: 1,  stage: 'Prospect',        agents_authorized_to_update: [] },
  { order: 2,  stage: 'Contacted',       agents_authorized_to_update: ['Recruitment Outreach Agent'] },
  { order: 3,  stage: 'Interested',      agents_authorized_to_update: ['Recruitment Outreach Agent'] },
  { order: 4,  stage: 'Qualified',       agents_authorized_to_update: ['Clinical Qualification Agent'] },
  { order: 5,  stage: 'Matched',         agents_authorized_to_update: ['Candidate Matching Agent'] },
  { order: 6,  stage: 'Submitted',       agents_authorized_to_update: [] },
  { order: 7,  stage: 'Hospital Review', agents_authorized_to_update: [] },
  { order: 8,  stage: 'Interview',       agents_authorized_to_update: ['Scheduling Agent'] },
  { order: 9,  stage: 'Offer',           agents_authorized_to_update: [] },
  { order: 10, stage: 'Negotiation',     agents_authorized_to_update: [] },
  { order: 11, stage: 'Accepted',        agents_authorized_to_update: [] },
  { order: 12, stage: 'Credentialing',   agents_authorized_to_update: [] },
  { order: 13, stage: 'Placement',       agents_authorized_to_update: [] }
];

// Roles that may advance any stage. The request says recruiters manage
// candidates through the pipeline and administrators manage workflows.
const PIPELINE_ROLES = ['JobMD.io Recruiters', 'Platform Administrators'];

// ── §8 Robotics Division ────────────────────────────────────────────────────
const ROBOTICS_CAPTURED_FIELDS = [
  'robotic platforms used', 'years of robotic experience', 'relevant procedures',
  'procedure volume when available', 'training/certifications', 'specialty',
  'hospital robotics experience', 'program leadership',
  'robotics program-development experience'
];
const ROBOTICS_SEARCH_CAPABILITIES = [
  'Search for highly specialized robotic surgeons instead of relying on generic physician search.'
];

// ── §9 Conversational Search ────────────────────────────────────────────────
const CONVERSATIONAL_SEARCH_DIMENSIONS = [
  'specialty', 'robotic experience', 'licensing', 'geography',
  'relocation preferences', 'experience', 'hospital requirements',
  'candidate-to-position matching'
];
const CONVERSATIONAL_SEARCH_RESULT_CONTRACT =
  'The AI translates natural-language requests into structured searches and ranked results.';

// ── §10 Automated Talent Discovery (TRUNCATED IN THE SOURCE) ────────────────
// The supplied request is cut off mid-sentence at "candidate-submitted profil".
// Only what the text actually states is recorded; the rest is an open question.
const TALENT_DISCOVERY_SOURCES = [
  'the existing JobMD.io database',
  'candidate-submitted profiles'
];
const TALENT_DISCOVERY_TRUNCATED = true;

// ── Project header facts ────────────────────────────────────────────────────
const PROJECT = {
  name: 'JobMD.io',
  parent_ecosystem: 'JobUp.dev',
  public_domain: 'JobMD.io',
  hosted_location: 'https://aiagent.ringlypro.com/jobMD',
  architecture_principle: 'Reuse the JobUp.dev foundation. Specialize the intelligence for healthcare. Keep JobMD.io as its own scalable ecosystem.'
};

const SEPARATION_BOUNDARIES = {
  shared_modular_components: [
    'architecture', 'user experience patterns', 'theme', 'colors', 'typography',
    'interface components', 'AI career intelligence concepts', 'resume ingestion',
    'structured professional profiles', 'matching logic', 'dashboards', 'pipelines',
    'agent patterns', 'MCP endpoints'
  ],
  jobmd_owned: [
    'healthcare data model', 'workflows', 'permissions', 'agents',
    'recruitment intelligence', 'hospital/client experience', 'physician experience',
    'future integrations'
  ],
  brand_inheritance: [
    'theme', 'colors', 'fonts', 'layout language', 'interaction patterns',
    'Orb experience', 'overall design identity'
  ]
};

// ── PROTECTED NOUNS — must survive verbatim into the plan ───────────────────
const PROTECTED_NOUNS = [
  'physicians', 'surgeons', 'hospitals', 'health systems', 'IDNs',
  'JobMD.io recruiters', 'platform administrators', 'Talent Intelligence Record',
  'Robotics Division'
];

/**
 * THE REAL JobUp.dev COMPONENT INVENTORY.
 *
 * The spec shipped placeholders (<JobUp.dev component inventory>) because its
 * author had no repository to point at. JobUp is a real vertical in THIS repo
 * at verticals/jobup/, so the placeholder is replaced by the actual inventory.
 * Every entry below names a file that exists; scripts/verify-jobup-inventory.js
 * and SIT both assert that, so an entry can never drift into a component that
 * was renamed or deleted.
 *
 * This list is the ONLY set of values `reuse_inventory[].jobup_component` may
 * take. The model cannot add to it.
 */
const JOBUP_INVENTORY = [
  { component: 'JobUp design system (dark aurora tokens, .d2b scope)', path: 'verticals/jobup/public/index.html' },
  { component: 'JobUp PWA shell generator',                            path: 'verticals/jobup/src/services/pwa.js' },
  { component: 'JobUp resume ingestion',                               path: 'verticals/jobup/src/services/resume.js' },
  { component: 'JobUp structured profile service',                     path: 'verticals/jobup/src/services/profile.js' },
  { component: 'JobUp matching logic',                                 path: 'verticals/jobup/src/services/matcher.js' },
  { component: 'JobUp job source connectors',                          path: 'verticals/jobup/src/services/jobsource.js' },
  { component: 'JobUp employer registry',                              path: 'verticals/jobup/src/services/employers.js' },
  { component: 'JobUp MCP brain',                                      path: 'verticals/jobup/src/services/brain.js' },
  { component: 'JobUp assistant',                                      path: 'verticals/jobup/src/services/assistant.js' },
  { component: 'JobUp identity / tenancy',                             path: 'verticals/jobup/src/services/identity.js' },
  { component: 'JobUp auth service',                                   path: 'verticals/jobup/src/services/auth.js' },
  { component: 'JobUp billing (Stripe)',                               path: 'verticals/jobup/src/services/billing.js' },
  { component: 'JobUp analytics',                                      path: 'verticals/jobup/src/services/analytics.js' },
  { component: 'JobUp mailer',                                         path: 'verticals/jobup/src/services/mailer.js' },
  { component: 'JobUp subscriber dashboard',                           path: 'verticals/jobup/public/app.html' },
  { component: 'JobUp admin console',                                  path: 'verticals/jobup/src/routes/admin.js' },
  { component: 'JobUp geo service',                                    path: 'verticals/jobup/src/services/geo.js' },
  { component: 'JobUp entitlements / plans',                           path: 'verticals/jobup/src/services/plans.js' },
  { component: 'CRM zero-key Edge TTS voice layer',                    path: 'src/services/edge-tts.js' },
  { component: 'CRM voice orb embed',                                  path: 'public/embed/voice-orb.js' }
];

module.exports = {
  PROJECT, PRIMARY_USERS, MEDICAL_SPECIALTIES, SPECIALTY_EXTENSIBILITY_NOTE,
  AGENTS, TALENT_INTELLIGENCE_RECORD_FIELDS, HOSPITAL_CLIENT_PROFILE_FIELDS,
  MATCHING_DIMENSIONS, MATCH_OUTPUT_CONTRACT, RECRUITMENT_PIPELINE, PIPELINE_ROLES,
  ROBOTICS_CAPTURED_FIELDS, ROBOTICS_SEARCH_CAPABILITIES,
  CONVERSATIONAL_SEARCH_DIMENSIONS, CONVERSATIONAL_SEARCH_RESULT_CONTRACT,
  TALENT_DISCOVERY_SOURCES, TALENT_DISCOVERY_TRUNCATED,
  SEPARATION_BOUNDARIES, PROTECTED_NOUNS, JOBUP_INVENTORY
};
