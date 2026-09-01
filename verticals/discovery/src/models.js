'use strict';

/**
 * AI DISCOVERY — Sequelize models.
 *
 * The unit of work is an ACCOUNT: one company that signs itself up, connects a
 * capture source, and walks itself to a roadmap with no consultant in the room.
 * That is the difference from the AI Readiness Department, whose unit of work
 * is an engagement a human sponsor runs. Same engines underneath; different
 * front door.
 *
 * tenant_id = the account's own id. A company is its own tenant, and the whole
 * point of the module is that it holds the observed shape of how a company
 * works — which is more sensitive than most CRM data, not less.
 *
 * Tables (dsc_ prefix, every one tenant-scoped and indexed):
 *   dsc_accounts     the company
 *   dsc_api_keys     the two-way key: ingest in, MCP read out
 *   dsc_sources      where captures come from (extension, integration, manual)
 *   dsc_captures     one observed run of one piece of work
 *   dsc_steps        the shape of that run — never its content (see redact.js)
 *   dsc_processes    the consolidated process a capture set proposes
 *   dsc_answers      the questions a capture can never answer
 *   dsc_findings     neural findings, in the shape the CRM's Neural already speaks
 *   dsc_evaluations  the frozen deliverable: scorecard + phases + diagram data
 *   dsc_events       audit
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── dsc_accounts ────────────────────────────────────────────────────────────
const Account = sequelize.define('DiscoveryAccount', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'owner' },   // owner|member
  lang: { type: DataTypes.STRING, defaultValue: 'en' },

  // Company context. Feeds the interview's `context` section verbatim.
  company_name: { type: DataTypes.STRING, allowNull: false },
  industry: { type: DataTypes.STRING },
  country: { type: DataTypes.STRING },
  headcount: { type: DataTypes.INTEGER },
  revenue_band: { type: DataTypes.STRING },

  // The evaluation is free. A build is quoted. Nothing here gates the roadmap.
  quote_requested_at: { type: DataTypes.DATE },

  last_login_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_accounts', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }]
});

// ─── dsc_api_keys ────────────────────────────────────────────────────────────
// ONE key type, TWO directions, separately scoped:
//   ingest — the company's tools and the browser extension push observed work in
//   read   — the company's own AI reads the roadmap back out over MCP
// A key holds whichever scopes were granted. The plaintext is shown exactly
// once at mint; only a SHA-256 lives here, so a database read cannot replay a
// key against the ingest endpoint.
const ApiKey = sequelize.define('DiscoveryApiKey', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  account_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING },
  prefix: { type: DataTypes.STRING, allowNull: false },      // shown in the UI
  key_hash: { type: DataTypes.STRING, allowNull: false, unique: true },
  scopes: { type: DataTypes.JSONB, defaultValue: ['ingest'] },
  last_used_at: { type: DataTypes.DATE },
  use_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  revoked_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_api_keys', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['key_hash'] }]
});

// ─── dsc_sources ─────────────────────────────────────────────────────────────
const Source = sequelize.define('DiscoverySource', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  kind: { type: DataTypes.STRING, allowNull: false },        // extension|integration|api|manual
  provider: { type: DataTypes.STRING },                      // chrome|google|slack|m365|custom
  label: { type: DataTypes.STRING },
  status: { type: DataTypes.STRING, defaultValue: 'active' },// active|paused|revoked
  capture_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  last_seen_at: { type: DataTypes.DATE },
  meta: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_sources', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }]
});

// ─── dsc_captures ────────────────────────────────────────────────────────────
// One observed run of one piece of work. Scribe turns this into a how-to guide;
// we turn it into a line in a cost model. Same recording, different question.
const Capture = sequelize.define('DiscoveryCapture', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  source_id: { type: DataTypes.INTEGER },
  external_ref: { type: DataTypes.STRING },     // the client's own id, for idempotent re-push
  label: { type: DataTypes.STRING },            // what the operator called it
  // A stable pseudonym for whoever performed it. NEVER a name or an email —
  // the module counts distinct people, it does not identify them.
  actor_ref: { type: DataTypes.STRING },
  started_at: { type: DataTypes.DATE },
  ended_at: { type: DataTypes.DATE },
  duration_ms: { type: DataTypes.INTEGER, defaultValue: 0 },
  step_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  app_summary: { type: DataTypes.JSONB, defaultValue: [] },  // [{app, steps, ms}]
  fingerprint: { type: DataTypes.STRING },      // shape hash — groups repeat runs
  redaction_report: { type: DataTypes.JSONB, defaultValue: {} },
  status: { type: DataTypes.STRING, defaultValue: 'received' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_captures', timestamps: false,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['tenant_id', 'fingerprint'] },
    { fields: ['tenant_id', 'external_ref'] }
  ]
});

// ─── dsc_steps ───────────────────────────────────────────────────────────────
// THE SHAPE OF THE WORK, NEVER ITS CONTENT. There is deliberately no column
// here that could hold a value a person typed, a customer name, a document
// body, a URL query or a screenshot. That absence is the reason this is
// installable inside a company that has a compliance officer. See redact.js —
// the columns and the redactor are two halves of one guarantee.
const Step = sequelize.define('DiscoveryStep', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  capture_id: { type: DataTypes.INTEGER, allowNull: false },
  seq: { type: DataTypes.INTEGER, defaultValue: 0 },
  app: { type: DataTypes.STRING },          // resolved friendly name, e.g. "Salesforce"
  host: { type: DataTypes.STRING },         // registrable host only
  path_shape: { type: DataTypes.STRING },   // /orders/:id/edit — ids replaced
  action: { type: DataTypes.STRING },       // navigate|click|type|submit|copy|paste|upload|download|wait|switch_app
  target_role: { type: DataTypes.STRING },  // button|link|field|table|file — the ROLE, not the label
  dwell_ms: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_steps', timestamps: false,
  indexes: [{ fields: ['tenant_id', 'capture_id'] }]
});

// ─── dsc_processes ───────────────────────────────────────────────────────────
// The consolidated process a set of captures proposes — the row that becomes
// one entry in the readiness engines' `processes[]`.
//
// TWO RULES LIVE IN THIS TABLE AND MUST NOT BE SOFTENED:
//
//  1. `hours_per_week` may be MEASURED, but `loaded_hourly_cost` never can be.
//     A browser can observe how long work takes; it cannot observe what the
//     person doing it is paid. A rate is therefore null until a human types
//     one, and an uncosted process contributes zero dollars and is reported as
//     uncosted rather than silently priced at an industry average.
//
//  2. A derived process is a PROPOSAL until a human confirms it. Machine
//     grouping of observed steps is a good guess about what constitutes "a
//     process"; it is not authority to put a name in a board document.
const Process = sequelize.define('DiscoveryProcess', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'proposed' },  // proposed|confirmed|rejected
  origin: { type: DataTypes.STRING, defaultValue: 'derived' },   // derived|manual

  // Measured from captures.
  people: { type: DataTypes.INTEGER },
  hours_per_week: { type: DataTypes.FLOAT },
  hours_source: { type: DataTypes.STRING, defaultValue: 'measured' }, // measured|stated
  observed_runs: { type: DataTypes.INTEGER, defaultValue: 0 },
  observed_window_days: { type: DataTypes.INTEGER, defaultValue: 0 },
  median_run_minutes: { type: DataTypes.FLOAT },
  apps: { type: DataTypes.JSONB, defaultValue: [] },
  fingerprints: { type: DataTypes.JSONB, defaultValue: [] },
  evidence: { type: DataTypes.JSONB, defaultValue: {} },

  // Stated by a human. Never derived.
  loaded_hourly_cost: { type: DataTypes.FLOAT },
  customer_facing: { type: DataTypes.BOOLEAN },        // null = unanswered, not false
  involves_regulated_data: { type: DataTypes.BOOLEAN },
  error_tolerance: { type: DataTypes.STRING },         // high|medium|low|zero

  confirmed_by: { type: DataTypes.INTEGER },
  confirmed_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_processes', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'status'] }]
});

// ─── dsc_answers ─────────────────────────────────────────────────────────────
// The questions no amount of watching can answer: what frightens the owner,
// what they can afford to lose, whether they would trust their own report.
// One row per interview section, JSONB so a new question is never a migration.
const Answer = sequelize.define('DiscoveryAnswer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  section: { type: DataTypes.STRING, allowNull: false },   // fears|cost|risk|data
  payload: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_answers', timestamps: false,
  indexes: [{ fields: ['tenant_id', 'section'] }]
});

// ─── dsc_findings ────────────────────────────────────────────────────────────
// Deliberately shaped like the CRM's existing Neural findings
// (severity CRITICAL|WARNING|OPPORTUNITY, title, explanation, dollarImpact,
// source, treatment) so a Discovery finding renders in the language OrbUp's
// Neural surface already speaks, rather than inventing a second vocabulary.
const Finding = sequelize.define('DiscoveryFinding', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  evaluation_id: { type: DataTypes.INTEGER },
  code: { type: DataTypes.STRING },            // stable machine code, e.g. DSC-SWIVEL-CHAIR
  severity: { type: DataTypes.STRING },        // CRITICAL|WARNING|OPPORTUNITY
  title: { type: DataTypes.STRING },
  explanation: { type: DataTypes.TEXT },
  dollar_impact: { type: DataTypes.STRING },   // '' when nothing was stated to compute one
  source: { type: DataTypes.STRING },          // Capture|Answers|Data|Risk|Cost
  process_id: { type: DataTypes.INTEGER },
  evidence: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_findings', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'evaluation_id'] }]
});

// ─── dsc_evaluations ─────────────────────────────────────────────────────────
// The deliverable, frozen. A roadmap someone has read must never silently
// change underneath them, so a re-run writes a new version rather than editing
// the last one.
const Evaluation = sequelize.define('DiscoveryEvaluation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  account_id: { type: DataTypes.INTEGER },
  version: { type: DataTypes.INTEGER, defaultValue: 1 },

  inputs: { type: DataTypes.JSONB, defaultValue: {} },        // exactly what the engines were fed
  scorecard: { type: DataTypes.JSONB, defaultValue: {} },
  phases: { type: DataTypes.JSONB, defaultValue: [] },
  diagram: { type: DataTypes.JSONB, defaultValue: {} },       // node/edge graph for the dashboard
  safe_next_step: { type: DataTypes.JSONB, defaultValue: {} },
  executive_summary: { type: DataTypes.TEXT },
  findings: { type: DataTypes.JSONB, defaultValue: [] },
  coverage: { type: DataTypes.JSONB, defaultValue: {} },      // what was measured vs stated vs absent

  narrative_by: { type: DataTypes.STRING, defaultValue: 'heuristic' },
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
  share_token: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_evaluations', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'version'] }]
});

// ─── dsc_events ──────────────────────────────────────────────────────────────
const Event = sequelize.define('DiscoveryEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  kind: { type: DataTypes.STRING },
  actor: { type: DataTypes.STRING },
  channel: { type: DataTypes.STRING },      // web|api|mcp|extension
  detail: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'dsc_events', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }]
});

module.exports = {
  sequelize,
  Account, ApiKey, Source, Capture, Step, Process, Answer, Finding, Evaluation, Event
};
