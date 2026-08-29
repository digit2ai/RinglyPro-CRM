'use strict';

/**
 * JobMD.io models.
 *
 * Every table carries tenant_id and is indexed on it, per repo convention.
 * Inside a tenant, ROW OWNERSHIP is account_id: a physician can only ever see
 * their own record, and a recruiter only their own organisation's positions.
 * tenant_id alone is not access control in a marketplace where every user
 * shares a tenant — the account check is what actually isolates people.
 *
 * The database is shared with the rest of the CRM, so every table is `jm_`
 * prefixed. sync({alter:false}) never adds a column, so new columns go in as
 * idempotent ALTER TABLE ... ADD COLUMN IF NOT EXISTS in index.js init.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

const tenant = {
  type: DataTypes.INTEGER, allowNull: false, defaultValue: 1,
  comment: 'Multi-tenant isolation. Never read from a request body.'
};

// ── Operator accounts (the architecture consoles) ───────────────────────────
const User = sequelize.define('JmUser', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:     tenant,
  email:         { type: DataTypes.STRING, allowNull: false, unique: true },
  name:          { type: DataTypes.STRING },
  role:          { type: DataTypes.STRING, defaultValue: 'admin' },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  created_at:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'jm_users', timestamps: false, indexes: [{ name: 'jm_users_tenant', fields: ['tenant_id'] }] });

// ── Subscriber accounts: the people who actually use the platform ──────────
// role is the permission boundary: physician | recruiter | hospital.
const Account = sequelize.define('JmAccount', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:     tenant,
  role:          { type: DataTypes.STRING, allowNull: false },   // physician | recruiter | hospital
  email:         { type: DataTypes.STRING, allowNull: false, unique: true },
  name:          { type: DataTypes.STRING, allowNull: false },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  org_id:        { type: DataTypes.INTEGER },   // recruiter / hospital: which organisation
  status:        { type: DataTypes.STRING, defaultValue: 'active' },
  last_login_at: { type: DataTypes.DATE },
  created_at:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_accounts', timestamps: false,
  indexes: [{ name: 'jm_accounts_tenant_role', fields: ['tenant_id', 'role'] },
            { name: 'jm_accounts_org', fields: ['org_id'] }]
});

// ── The Talent Intelligence Record, made real ──────────────────────────────
// The field names come from the project request; this is the running table
// behind them. Contact detail lives on the Account, not here, so a match or a
// ranking can be computed without ever loading a name or an email.
const Physician = sequelize.define('JmPhysician', {
  id:                    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:             tenant,
  account_id:            { type: DataTypes.INTEGER, allowNull: false, unique: true },
  specialty:             { type: DataTypes.STRING },
  subspecialty:          { type: DataTypes.STRING },
  education:             { type: DataTypes.TEXT },
  residency:             { type: DataTypes.STRING },
  fellowship:            { type: DataTypes.STRING },
  board_certified: { type: DataTypes.BOOLEAN, defaultValue: null },   // null = not answered yet
  board_certifications:  { type: DataTypes.JSONB, defaultValue: [] },
  licenses:              { type: DataTypes.JSONB, defaultValue: [] },   // ["FL","TX"]
  years_experience:      { type: DataTypes.INTEGER },
  current_organization:  { type: DataTypes.STRING },
  previous_organizations:{ type: DataTypes.JSONB, defaultValue: [] },
  leadership:            { type: DataTypes.TEXT },
  clinical_interests:    { type: DataTypes.JSONB, defaultValue: [] },
  procedure_expertise:   { type: DataTypes.JSONB, defaultValue: [] },
  robotic_platforms:     { type: DataTypes.JSONB, defaultValue: [] },   // ["da Vinci Xi"]
  robotic_years:         { type: DataTypes.INTEGER },
  robotic_cases_annual:  { type: DataTypes.INTEGER },
  robotics_program_leadership: { type: DataTypes.BOOLEAN, defaultValue: null },   // null = not answered yet
  academic_experience:   { type: DataTypes.TEXT },
  publications:          { type: DataTypes.INTEGER },
  geographic_preferences:{ type: DataTypes.JSONB, defaultValue: [] },   // ["FL","GA"]
  relocation_willing: { type: DataTypes.BOOLEAN, defaultValue: null },   // null = not answered yet
  compensation_expectation: { type: DataTypes.INTEGER },
  employment_preference: { type: DataTypes.STRING },   // employed | independent | academic | any
  call_tolerance:        { type: DataTypes.STRING },   // none | light | moderate | any
  available_from:        { type: DataTypes.DATEONLY },
  credentialing_notes:   { type: DataTypes.TEXT },
  recruitment_status:    { type: DataTypes.STRING, defaultValue: 'open_to_offers' },
  recruiter_notes:       { type: DataTypes.TEXT },
  ai_summary:            { type: DataTypes.TEXT },
  ai_summary_by:         { type: DataTypes.STRING },   // model | heuristic
  cv_text:               { type: DataTypes.TEXT },
  source:                { type: DataTypes.STRING, defaultValue: 'form' },  // form | cv
  created_at:            { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at:            { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_physicians', timestamps: false,
  indexes: [{ name: 'jm_physicians_tenant_specialty', fields: ['tenant_id', 'specialty'] },
            { name: 'jm_physicians_account', fields: ['account_id'] }]
});

// ── Hospital / Client Intelligence Profile ─────────────────────────────────
const Organization = sequelize.define('JmOrganization', {
  id:                { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:         tenant,
  name:              { type: DataTypes.STRING, allowNull: false },
  org_type:          { type: DataTypes.STRING, defaultValue: 'hospital' }, // hospital | health_system | idn
  health_system:     { type: DataTypes.STRING },
  city:              { type: DataTypes.STRING },
  state:             { type: DataTypes.STRING },
  facilities:        { type: DataTypes.INTEGER },
  robotics_platforms:{ type: DataTypes.JSONB, defaultValue: [] },
  recruiting_priorities: { type: DataTypes.TEXT },
  created_at:        { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_organizations', timestamps: false,
  indexes: [{ name: 'jm_orgs_tenant_state', fields: ['tenant_id', 'state'] }]
});

// ── Open positions ─────────────────────────────────────────────────────────
const Position = sequelize.define('JmPosition', {
  id:                 { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:          tenant,
  org_id:             { type: DataTypes.INTEGER, allowNull: false },
  title:              { type: DataTypes.STRING, allowNull: false },
  specialty:          { type: DataTypes.STRING, allowNull: false },
  subspecialty:       { type: DataTypes.STRING },
  city:               { type: DataTypes.STRING },
  state:              { type: DataTypes.STRING },
  employment_model:   { type: DataTypes.STRING },   // employed | independent | academic
  compensation_min:   { type: DataTypes.INTEGER },
  compensation_max:   { type: DataTypes.INTEGER },
  call_schedule:      { type: DataTypes.STRING },   // none | light | moderate | heavy
  relocation_assistance: { type: DataTypes.BOOLEAN, defaultValue: false },
  robotics_required:  { type: DataTypes.BOOLEAN, defaultValue: false },
  robotic_platforms:  { type: DataTypes.JSONB, defaultValue: [] },
  min_years_experience: { type: DataTypes.INTEGER, defaultValue: 0 },
  board_certification_required: { type: DataTypes.BOOLEAN, defaultValue: true },
  procedures:         { type: DataTypes.JSONB, defaultValue: [] },
  start_date:         { type: DataTypes.DATEONLY },
  status:             { type: DataTypes.STRING, defaultValue: 'open' },  // open | filled | closed
  created_by:         { type: DataTypes.INTEGER },
  created_at:         { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_positions', timestamps: false,
  indexes: [{ name: 'jm_positions_tenant_specialty', fields: ['tenant_id', 'specialty'] },
            { name: 'jm_positions_org', fields: ['org_id'] },
            { name: 'jm_positions_tenant_status', fields: ['tenant_id', 'status'] }]
});

// ── A computed match. Score, reasons AND gaps travel together. ─────────────
const Match = sequelize.define('JmMatch', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:    tenant,
  physician_id: { type: DataTypes.INTEGER, allowNull: false },
  position_id:  { type: DataTypes.INTEGER, allowNull: false },
  score:        { type: DataTypes.INTEGER, allowNull: false },   // 0-100
  dimensions:   { type: DataTypes.JSONB, allowNull: false },     // the seven, each scored
  reasons:      { type: DataTypes.JSONB, defaultValue: [] },
  gaps:         { type: DataTypes.JSONB, defaultValue: [] },
  computed_at:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_matches', timestamps: false,
  indexes: [{ name: 'jm_matches_physician', fields: ['physician_id'] },
            { name: 'jm_matches_position', fields: ['position_id'] },
            { name: 'jm_matches_pair', unique: true, fields: ['physician_id', 'position_id'] }]
});

// ── The recruitment pipeline: one row per candidate per position ───────────
const Pipeline = sequelize.define('JmPipeline', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:    tenant,
  physician_id: { type: DataTypes.INTEGER, allowNull: false },
  position_id:  { type: DataTypes.INTEGER, allowNull: false },
  stage:        { type: DataTypes.STRING, allowNull: false, defaultValue: 'Prospect' },
  set_by_kind:  { type: DataTypes.STRING, defaultValue: 'person' },  // person | agent
  set_by:       { type: DataTypes.STRING },   // account id as text, or the agent name
  notes:        { type: DataTypes.TEXT },
  created_at:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_pipeline', timestamps: false,
  indexes: [{ name: 'jm_pipeline_physician', fields: ['physician_id'] },
            { name: 'jm_pipeline_position', fields: ['position_id'] },
            { name: 'jm_pipeline_pair', unique: true, fields: ['physician_id', 'position_id'] }]
});

// Every stage change, who made it, and whether a person or an agent did.
const PipelineEvent = sequelize.define('JmPipelineEvent', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:   tenant,
  pipeline_id: { type: DataTypes.INTEGER, allowNull: false },
  from_stage:  { type: DataTypes.STRING },
  to_stage:    { type: DataTypes.STRING, allowNull: false },
  actor_kind:  { type: DataTypes.STRING },   // person | agent
  actor:       { type: DataTypes.STRING },
  created_at:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_pipeline_events', timestamps: false,
  indexes: [{ name: 'jm_pipeline_events_pipeline', fields: ['pipeline_id'] }]
});

// ── Generated architecture documents (the two spec agents) ─────────────────
const BuildPlan = sequelize.define('JmBuildPlan', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:    tenant,
  label:        { type: DataTypes.STRING },
  kind:         { type: DataTypes.STRING, defaultValue: 'build_plan' },
  plan:         { type: DataTypes.JSONB, allowNull: false },
  evidence:     { type: DataTypes.JSONB },
  counts:       { type: DataTypes.JSONB },
  verification: { type: DataTypes.JSONB },
  composed_by:  { type: DataTypes.STRING, defaultValue: 'deterministic' },
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: true },
  model:        { type: DataTypes.STRING },
  duration_ms:  { type: DataTypes.INTEGER },
  created_by:   { type: DataTypes.INTEGER },
  created_at:   { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_build_plans', timestamps: false,
  indexes: [{ name: 'jm_build_plans_tenant_created', fields: ['tenant_id', 'created_at'] }]
});

const PlanRun = sequelize.define('JmPlanRun', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:   tenant,
  status:      { type: DataTypes.STRING, allowNull: false },
  kind:        { type: DataTypes.STRING, defaultValue: 'build_plan' },
  composed_by: { type: DataTypes.STRING },
  violations:  { type: DataTypes.JSONB },
  rejected_rewrites: { type: DataTypes.JSONB },
  duration_ms: { type: DataTypes.INTEGER },
  error:       { type: DataTypes.TEXT },
  created_at:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_plan_runs', timestamps: false,
  indexes: [{ name: 'jm_plan_runs_tenant_created', fields: ['tenant_id', 'created_at'] }]
});

// ── Landing-page enquiries ─────────────────────────────────────────────────
const Lead = sequelize.define('JmLead', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:  tenant,
  first_name: { type: DataTypes.STRING, allowNull: false },
  last_name:  { type: DataTypes.STRING },
  email:      { type: DataTypes.STRING, allowNull: false },
  phone:      { type: DataTypes.STRING },
  role:       { type: DataTypes.STRING },
  message:    { type: DataTypes.TEXT },
  source:     { type: DataTypes.STRING, defaultValue: 'landing' },
  ip_hash:    { type: DataTypes.STRING },
  status:     { type: DataTypes.STRING, defaultValue: 'new' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_leads', timestamps: false,
  indexes: [{ name: 'jm_leads_tenant_created', fields: ['tenant_id', 'created_at'] }]
});

module.exports = {
  sequelize, User, Account, Physician, Organization, Position,
  Match, Pipeline, PipelineEvent, BuildPlan, PlanRun, Lead
};
