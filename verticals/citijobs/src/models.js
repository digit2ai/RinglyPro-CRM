'use strict';

/**
 * Citi Opportunity Tracker — Sequelize models.
 *
 * Owner-only job hunter for Citigroup requisitions. Every table is tenant_id
 * scoped (tenant_id = the owner user id) and prefixed cj_.
 *
 * Tables: cj_users, cj_profiles, cj_reqs, cj_tracked, cj_matches,
 *         cj_queries, cj_runs, cj_skills, cj_tailorings
 *
 * THE ONE TABLE TO UNDERSTAND IS cj_skills. Its `kind` column is the safety
 * boundary of the whole app:
 *
 *   verified   — traceable to the owner's real history. MAY appear on a resume.
 *                Reachable ONLY through an explicit human confirmation action.
 *   vocabulary — language harvested from postings. MAY ONLY widen the search.
 *                Can never become claimable without a human saying so.
 *   rejected   — the owner said no. Never suggested again.
 *
 * Without that split, tailoring against ten postings teaches the profile ten
 * skills the owner does not have, the agent then hunts for that fabricated
 * profile, and the loop compounds away from the owner instead of toward them.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── cj_users ────────────────────────────────────────────────────────────────
// Login accounts. No public signup. Each user is their own tenant.
const User = sequelize.define('CjUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'owner' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'cj_users', timestamps: false });

// ─── cj_profiles ─────────────────────────────────────────────────────────────
// One résumé identity. Built for N from day one: three of the four CV Talent
// Engine profiles are Citi-relevant and two are already inside Citi, so
// "internal mobility" and "external return" are different hunts.
const Profile = sequelize.define('CjProfile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  slug: { type: DataTypes.STRING, allowNull: false },
  display_name: { type: DataTypes.STRING, allowNull: false },
  headline: { type: DataTypes.STRING },
  // The base résumé, structured. Tailoring SELECTS and REORDERS from this;
  // it may never author a bullet that is not in here.
  resume_json: { type: DataTypes.JSONB, defaultValue: {} },
  resume_text: { type: DataTypes.TEXT },          // flattened, for term matching
  target_titles: { type: DataTypes.JSONB, defaultValue: [] },
  target_locations: { type: DataTypes.JSONB, defaultValue: [] },
  countries: { type: DataTypes.JSONB, defaultValue: ['United States'] },
  internal: { type: DataTypes.BOOLEAN, defaultValue: false }, // already at Citi?
  score_threshold: { type: DataTypes.INTEGER, defaultValue: 70 },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  settings: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'cj_profiles', timestamps: false });

// ─── cj_reqs ─────────────────────────────────────────────────────────────────
// The shared requisition pool. One row per Citi req id.
//
// salary_source is 'stated' or the salary columns are null. There is no
// 'estimated'. A range is copied out of the posting text or it does not exist.
const Req = sequelize.define('CjReq', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  req_id: { type: DataTypes.STRING, allowNull: false },
  title: { type: DataTypes.TEXT },
  external_path: { type: DataTypes.TEXT },
  url_workday: { type: DataTypes.TEXT },
  // Pasted by a human or null. NEVER constructed — the Phenom posting id in a
  // jobs.citi.com URL exists nowhere in the Workday payload.
  url_citi_careers: { type: DataTypes.TEXT },
  location: { type: DataTypes.TEXT },
  address: { type: DataTypes.TEXT },
  remote_type: { type: DataTypes.STRING },
  time_type: { type: DataTypes.STRING },
  job_family: { type: DataTypes.STRING },
  job_family_group: { type: DataTypes.STRING },
  posted_on: { type: DataTypes.DATEONLY },
  close_date: { type: DataTypes.DATEONLY },
  salary_min_cents: { type: DataTypes.BIGINT },
  salary_max_cents: { type: DataTypes.BIGINT },
  salary_source: { type: DataTypes.STRING },      // 'stated' | null
  description_text: { type: DataTypes.TEXT },
  detail_fetched: { type: DataTypes.BOOLEAN, defaultValue: false },
  feed_status: { type: DataTypes.STRING, defaultValue: 'open' }, // open|gone_from_feed|cannot_apply
  first_seen_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  last_seen_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  source: { type: DataTypes.STRING, defaultValue: 'agent' },     // agent|manual
  raw: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'cj_reqs', timestamps: false });

// ─── cj_tracked ──────────────────────────────────────────────────────────────
// The per-profile board.
const STATUSES = ['new', 'saved', 'applied', 'interview', 'offer', 'closed'];
const CLOSE_REASONS = ['rejected', 'withdrawn', 'filled', 'expired', 'not_interested'];

const Tracked = sequelize.define('CjTracked', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  profile_id: { type: DataTypes.INTEGER, allowNull: false },
  req_id: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'new' },
  status_reason: { type: DataTypes.STRING },
  status_changed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  applied_at: { type: DataTypes.DATE },
  next_action: { type: DataTypes.TEXT },
  next_action_due: { type: DataTypes.DATEONLY },
  notes: { type: DataTypes.TEXT },
  contacts: { type: DataTypes.TEXT },
  source: { type: DataTypes.STRING, defaultValue: 'agent' },  // agent|manual
  archived: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'cj_tracked', timestamps: false });

// ─── cj_matches ──────────────────────────────────────────────────────────────
const Match = sequelize.define('CjMatch', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  profile_id: { type: DataTypes.INTEGER, allowNull: false },
  req_id: { type: DataTypes.STRING, allowNull: false },
  score: { type: DataTypes.INTEGER, defaultValue: 0 },
  rationale: { type: DataTypes.TEXT },
  scored_by: { type: DataTypes.STRING, defaultValue: 'heuristic' }, // model|heuristic
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: true },
  model: { type: DataTypes.STRING },
  cost_cents: { type: DataTypes.FLOAT, defaultValue: 0 },
  scored_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'cj_matches', timestamps: false });

// ─── cj_queries ──────────────────────────────────────────────────────────────
// The saved searches that drive discovery. You cannot page through "all of
// Citi" — Workday caps its reported total at 2000 — so discovery is many
// targeted queries deduped by req id, never one firehose.
const Query = sequelize.define('CjQuery', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  profile_id: { type: DataTypes.INTEGER },        // null = shared across profiles
  label: { type: DataTypes.STRING },
  search_text: { type: DataTypes.STRING, allowNull: false },
  max_pages: { type: DataTypes.INTEGER, defaultValue: 3 },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  weight: { type: DataTypes.FLOAT, defaultValue: 1.0 },
  source: { type: DataTypes.STRING, defaultValue: 'seed' },  // seed|manual|learned
  last_run_at: { type: DataTypes.DATE },
  last_total: { type: DataTypes.INTEGER },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'cj_queries', timestamps: false });

// ─── cj_runs ─────────────────────────────────────────────────────────────────
// Daily audit. run_date + tenant_id is UNIQUE and that uniqueness IS the
// multi-instance claim: Render runs more than one instance, and without a
// database-level claim every instance runs the whole fleet and bills for it.
const Run = sequelize.define('CjRun', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  run_date: { type: DataTypes.DATEONLY, allowNull: false },
  started_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  finished_at: { type: DataTypes.DATE },
  ok: { type: DataTypes.BOOLEAN, defaultValue: false },
  trigger: { type: DataTypes.STRING, defaultValue: 'manual' }, // manual|schedule
  queries_run: { type: DataTypes.INTEGER, defaultValue: 0 },
  http_requests: { type: DataTypes.INTEGER, defaultValue: 0 },
  reqs_seen: { type: DataTypes.INTEGER, defaultValue: 0 },
  reqs_new: { type: DataTypes.INTEGER, defaultValue: 0 },
  scored: { type: DataTypes.INTEGER, defaultValue: 0 },
  boarded: { type: DataTypes.INTEGER, defaultValue: 0 },
  closed_swept: { type: DataTypes.INTEGER, defaultValue: 0 },
  cost_cents: { type: DataTypes.FLOAT, defaultValue: 0 },
  budget_hit: { type: DataTypes.BOOLEAN, defaultValue: false },
  errors: { type: DataTypes.JSONB, defaultValue: [] },
  notes: { type: DataTypes.TEXT }
}, { tableName: 'cj_runs', timestamps: false });

// ─── cj_skills ───────────────────────────────────────────────────────────────
// The profile's growing knowledge. See the header comment — `kind` is the
// safety boundary of this application.
const Skill = sequelize.define('CjSkill', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  profile_id: { type: DataTypes.INTEGER, allowNull: false },
  term: { type: DataTypes.STRING, allowNull: false },
  norm: { type: DataTypes.STRING, allowNull: false },
  kind: { type: DataTypes.STRING, defaultValue: 'vocabulary' }, // verified|vocabulary|rejected
  evidence: { type: DataTypes.TEXT },            // required for 'verified'
  first_seen_req_id: { type: DataTypes.STRING },
  confirmed_at: { type: DataTypes.DATE },
  weight: { type: DataTypes.FLOAT, defaultValue: 1.0 },
  hits: { type: DataTypes.INTEGER, defaultValue: 1 },
  source: { type: DataTypes.STRING, defaultValue: 'tailoring' }, // resume|tailoring|manual
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'cj_skills', timestamps: false });

// ─── cj_tailorings ───────────────────────────────────────────────────────────
// One row per (profile, req) tailoring. Immutable and versioned: a re-tailor
// appends. Citi may call about a req six weeks later and the exact document
// sent must be recoverable — which is why the CONTENT is stored rather than a
// file path (Render's disk is ephemeral; the PDF is re-rendered on demand).
const Tailoring = sequelize.define('CjTailoring', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  profile_id: { type: DataTypes.INTEGER, allowNull: false },
  req_id: { type: DataTypes.STRING, allowNull: false },
  version: { type: DataTypes.INTEGER, defaultValue: 1 },
  content: { type: DataTypes.JSONB, defaultValue: {} },   // the tailored résumé, structured
  keyword_coverage: { type: DataTypes.JSONB, defaultValue: {} },
  gaps: { type: DataTypes.JSONB, defaultValue: [] },
  tailored_by: { type: DataTypes.STRING, defaultValue: 'heuristic' }, // model|heuristic
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: true },
  model: { type: DataTypes.STRING },
  dropped: { type: DataTypes.JSONB, defaultValue: [] },   // model output refused verification
  sent: { type: DataTypes.BOOLEAN, defaultValue: false },
  sent_at: { type: DataTypes.DATE },
  generated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'cj_tailorings', timestamps: false });

module.exports = {
  sequelize,
  User, Profile, Req, Tracked, Match, Query, Run, Skill, Tailoring,
  STATUSES, CLOSE_REASONS
};
