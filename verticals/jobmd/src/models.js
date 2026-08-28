'use strict';

/**
 * JobMD.io models. Every table carries tenant_id, and every read is scoped by
 * it — the repo convention, and non-negotiable for a system that will hold
 * physician records.
 *
 * The database is shared with the rest of the CRM, so every table is `jm_`
 * prefixed. sync({alter:false}) never adds a column to an existing table, so
 * new columns go in as idempotent ALTER TABLE ... ADD COLUMN IF NOT EXISTS in
 * index.js init.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

const tenant = {
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 1,
  comment: 'Multi-tenant isolation. Never read from a request body.'
};

// ── Operator accounts ───────────────────────────────────────────────────────
const User = sequelize.define('JmUser', {
  id:            { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:     tenant,
  email:         { type: DataTypes.STRING, allowNull: false, unique: true },
  name:          { type: DataTypes.STRING },
  role:          { type: DataTypes.STRING, defaultValue: 'admin' },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  created_at:    { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'jm_users', timestamps: false, indexes: [{ fields: ['tenant_id'] }] });

// ── Generated build plans ───────────────────────────────────────────────────
const BuildPlan = sequelize.define('JmBuildPlan', {
  id:           { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:    tenant,
  label:        { type: DataTypes.STRING },
  kind:         { type: DataTypes.STRING, defaultValue: 'build_plan' },  // build_plan | architecture_record
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
  indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'created_at'] }]
});

// ── Audit of every architect run, successful or refused ─────────────────────
const PlanRun = sequelize.define('JmPlanRun', {
  id:          { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:   tenant,
  status:      { type: DataTypes.STRING, allowNull: false },   // ok | refused | error
  kind:         { type: DataTypes.STRING, defaultValue: 'build_plan' },  // build_plan | architecture_record
  composed_by: { type: DataTypes.STRING },
  violations:  { type: DataTypes.JSONB },
  rejected_rewrites: { type: DataTypes.JSONB },
  duration_ms: { type: DataTypes.INTEGER },
  error:       { type: DataTypes.TEXT },
  created_at:  { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_plan_runs', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'created_at'] }]
});

// ── Landing-page inquiries ──────────────────────────────────────────────────
//
// DELIBERATELY UNREACHABLE FROM THE ARCHITECT. A lead is a real person's
// contact detail; the build plan describes structures only. Nothing in
// services/architect.js, plan.js or corpus.js imports this model, and SIT greps
// those files to prove it stays that way.
const Lead = sequelize.define('JmLead', {
  id:         { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id:  tenant,
  first_name: { type: DataTypes.STRING, allowNull: false },
  last_name:  { type: DataTypes.STRING },
  email:      { type: DataTypes.STRING, allowNull: false },
  phone:      { type: DataTypes.STRING },
  role:       { type: DataTypes.STRING },     // surgeon | hospital_executive | other
  message:    { type: DataTypes.TEXT },
  source:     { type: DataTypes.STRING, defaultValue: 'landing' },
  ip_hash:    { type: DataTypes.STRING },     // salted, never a raw IP
  status:     { type: DataTypes.STRING, defaultValue: 'new' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'jm_leads', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'created_at'] }]
});

module.exports = { sequelize, User, BuildPlan, PlanRun, Lead };
