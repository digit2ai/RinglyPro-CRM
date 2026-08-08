'use strict';

/**
 * AI Readiness Department — Sequelize models.
 *
 * The unit of work is an ENGAGEMENT: one CEO, one company, walked from fear to
 * a signed-off next step by a human sponsor. Everything else hangs off it.
 *
 * Every table is multi-tenant (tenant_id = the sponsor's id), air_ prefix.
 * Tables: air_sponsors, air_engagements, air_answers, air_findings,
 *         air_roadmaps, air_calls, air_approvals
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── air_sponsors ────────────────────────────────────────────────────────────
// The human who runs the engagement and presents to the CEO. Each sponsor is
// their own tenant, so one consultant can never see another's client material —
// and client material here is unusually sensitive (a CEO's stated fears).
const Sponsor = sequelize.define('ReadinessSponsor', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'sponsor' },   // owner|sponsor
  lang: { type: DataTypes.STRING, defaultValue: 'en' },        // en|es
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'air_sponsors', timestamps: false });

// ─── air_engagements ─────────────────────────────────────────────────────────
// One CEO, one company, one run through the department.
const Engagement = sequelize.define('ReadinessEngagement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  sponsor_id: { type: DataTypes.INTEGER },

  company_name: { type: DataTypes.STRING, allowNull: false },
  ceo_name: { type: DataTypes.STRING },
  industry: { type: DataTypes.STRING },
  country: { type: DataTypes.STRING },
  headcount: { type: DataTypes.INTEGER },
  revenue_band: { type: DataTypes.STRING },      // labeled band, never a precise guess
  lang: { type: DataTypes.STRING, defaultValue: 'en' },

  // Where the engagement is in the process. The sponsor drives this.
  stage: { type: DataTypes.STRING, defaultValue: 'intake' },
  // intake -> interview -> analysis -> roadmap -> presented -> decided

  // What the CEO decided at the end. The whole product exists to move this
  // from null to something.
  decision: { type: DataTypes.STRING },          // pilot|narrow_pilot|remediate|declined
  decision_note: { type: DataTypes.TEXT },
  decided_at: { type: DataTypes.DATE },

  // A read-only link the sponsor can hand the CEO after the meeting.
  share_token: { type: DataTypes.STRING },

  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'air_engagements',
  timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'stage'] }]
});

// ─── air_answers ─────────────────────────────────────────────────────────────
// The interview, one row per section. Kept as JSONB because the question bank
// evolves and a new question must never be a migration.
//
// THIS IS THE ONLY SOURCE OF FACTS. Every number the department reports must
// trace back to a row here or be explicitly labeled an assumption. Nothing is
// invented about a company we have not asked about.
const Answer = sequelize.define('ReadinessAnswer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  engagement_id: { type: DataTypes.INTEGER, allowNull: false },
  section: { type: DataTypes.STRING, allowNull: false },  // context|fears|pain|cost|risk|data
  payload: { type: DataTypes.JSONB, defaultValue: {} },
  answered_by: { type: DataTypes.STRING },                // ceo|sponsor|unknown
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'air_answers',
  timestamps: false,
  indexes: [{ fields: ['tenant_id', 'engagement_id'] }]
});

// ─── air_findings ────────────────────────────────────────────────────────────
// One agent's output for one engagement. Re-running an agent replaces its row,
// so a finding can never be stale relative to its agent.
const Finding = sequelize.define('ReadinessFinding', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  engagement_id: { type: DataTypes.INTEGER, allowNull: false },
  agent: { type: DataTypes.STRING, allowNull: false },   // cost_comfort|risk_comfort|data_readiness
  lane: { type: DataTypes.STRING },                      // cost|risk|data
  score: { type: DataTypes.INTEGER },                    // 0-100
  rating: { type: DataTypes.STRING },                    // red|yellow|green
  payload: { type: DataTypes.JSONB, defaultValue: {} },

  // Honesty flags. The narrative may be model-written; the numbers never are.
  computed_by: { type: DataTypes.STRING, defaultValue: 'deterministic' },
  narrative_by: { type: DataTypes.STRING, defaultValue: 'heuristic' }, // model|heuristic
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },

  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'air_findings',
  timestamps: false,
  indexes: [{ fields: ['tenant_id', 'engagement_id'] }]
});

// ─── air_roadmaps ────────────────────────────────────────────────────────────
// The deliverable: the three-phase roadmap plus the scorecard, frozen at the
// moment it was assembled so a presented document can never silently change
// under the CEO after the meeting.
const Roadmap = sequelize.define('ReadinessRoadmap', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  engagement_id: { type: DataTypes.INTEGER, allowNull: false },
  version: { type: DataTypes.INTEGER, defaultValue: 1 },

  scorecard: { type: DataTypes.JSONB, defaultValue: {} },   // 3 lanes, RYG
  phases: { type: DataTypes.JSONB, defaultValue: [] },      // phase 1/2/3
  safe_next_step: { type: DataTypes.JSONB, defaultValue: {} },
  talk_track: { type: DataTypes.JSONB, defaultValue: [] },  // sponsor speaker notes
  executive_summary: { type: DataTypes.TEXT },

  narrative_by: { type: DataTypes.STRING, defaultValue: 'heuristic' },
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },

  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'air_roadmaps',
  timestamps: false,
  indexes: [{ fields: ['tenant_id', 'engagement_id'] }]
});

// ─── air_calls ───────────────────────────────────────────────────────────────
// Every tool call through the department Brain, including the denied ones.
// Because every capability crosses one gateway this is a complete record.
const Call = sequelize.define('ReadinessCall', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  engagement_id: { type: DataTypes.INTEGER },
  agent: { type: DataTypes.STRING },
  tool: { type: DataTypes.STRING },
  channel: { type: DataTypes.STRING },
  actor: { type: DataTypes.STRING },
  arguments: { type: DataTypes.JSONB, defaultValue: {} },   // redacted
  success: { type: DataTypes.BOOLEAN, defaultValue: true },
  error: { type: DataTypes.TEXT },
  requires_approval: { type: DataTypes.BOOLEAN, defaultValue: false },
  latency_ms: { type: DataTypes.INTEGER, defaultValue: 0 },
  cost_cents: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'air_calls',
  timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['tenant_id', 'engagement_id'] }]
});

// ─── air_approvals ───────────────────────────────────────────────────────────
// The human-in-the-loop queue. A department whose whole pitch is "we will not
// let AI act without a human" must itself obey that rule, visibly.
const Approval = sequelize.define('ReadinessApproval', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  engagement_id: { type: DataTypes.INTEGER },
  agent: { type: DataTypes.STRING },
  tool: { type: DataTypes.STRING },
  arguments: { type: DataTypes.JSONB, defaultValue: {} },
  reason: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'pending' }, // pending|executed|rejected|approved
  result: { type: DataTypes.JSONB },
  decided_by: { type: DataTypes.INTEGER },
  decided_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'air_approvals',
  timestamps: false,
  indexes: [{ fields: ['tenant_id', 'status'] }]
});

module.exports = {
  sequelize,
  Sponsor, Engagement, Answer, Finding, Roadmap, Call, Approval
};
