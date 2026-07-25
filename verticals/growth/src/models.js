'use strict';

/**
 * Digit2AI Growth — data models.
 *
 * Internal, owner-only growth cockpit that markets Digit2AI's OWN portfolio of
 * verticals. Each "brand" is one of our products (Lawn Co-Pilot, Speakly,
 * EquiMind, Veritas, ...). Growth agents draft SEO/content/social/GEO work per
 * brand; every output lands in a DRAFT queue for the owner to review + publish.
 * Nothing auto-publishes (obeys the EMAIL_AUTOSEND_DISABLED philosophy).
 *
 * `gr_` table prefix. Single-owner tool, but rows still carry owner_id so a
 * future second operator can be added without a migration.
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ── Operators (login-only; no public signup) ────────────────────────────────
const User = sequelize.define('gr_user', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  name: { type: DataTypes.STRING },
  role: { type: DataTypes.STRING, defaultValue: 'owner' } // owner | operator
}, { tableName: 'gr_users', underscored: true, timestamps: true });

// ── Brands = our own verticals/products ─────────────────────────────────────
const Brand = sequelize.define('gr_brand', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  owner_id: { type: DataTypes.INTEGER, allowNull: false },
  slug: { type: DataTypes.STRING, allowNull: false }, // e.g. 'lawncopilot'
  name: { type: DataTypes.STRING, allowNull: false }, // e.g. 'Lawn Co-Pilot'
  url: { type: DataTypes.STRING },                     // canonical landing URL
  tagline: { type: DataTypes.STRING },
  positioning: { type: DataTypes.TEXT },              // what it is / who it's for
  icp: { type: DataTypes.TEXT },                       // ideal customer profile
  voice: { type: DataTypes.STRING },                   // brand voice hint
  keywords: { type: DataTypes.JSONB, defaultValue: [] },
  channels: { type: DataTypes.JSONB, defaultValue: ['seo', 'x', 'linkedin', 'geo', 'content'] },
  active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'gr_brands', underscored: true, timestamps: true });

// ── Drafts = every agent output, awaiting human review ──────────────────────
const Draft = sequelize.define('gr_draft', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  owner_id: { type: DataTypes.INTEGER, allowNull: false },
  brand_id: { type: DataTypes.INTEGER, allowNull: false },
  agent: { type: DataTypes.STRING, allowNull: false },   // 'seo.audit' | 'content.draft' | ...
  channel: { type: DataTypes.STRING },                    // seo | x | linkedin | geo | content
  kind: { type: DataTypes.STRING },                       // post | article | audit | monitor
  title: { type: DataTypes.STRING },
  body: { type: DataTypes.TEXT },
  meta: { type: DataTypes.JSONB, defaultValue: {} },      // findings, scores, keywords
  status: { type: DataTypes.STRING, defaultValue: 'draft' }, // draft | approved | published | dismissed
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false }, // heuristic (no LLM key) = labeled
  run_id: { type: DataTypes.INTEGER }
}, { tableName: 'gr_drafts', underscored: true, timestamps: true });

// ── Runs = one scheduler/manual fan-out over a brand ────────────────────────
const Run = sequelize.define('gr_run', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  owner_id: { type: DataTypes.INTEGER, allowNull: false },
  brand_id: { type: DataTypes.INTEGER, allowNull: false },
  trigger: { type: DataTypes.STRING, defaultValue: 'manual' }, // manual | scheduled
  agents: { type: DataTypes.JSONB, defaultValue: [] },
  drafts_created: { type: DataTypes.INTEGER, defaultValue: 0 },
  cost_usd: { type: DataTypes.FLOAT, defaultValue: 0 },
  status: { type: DataTypes.STRING, defaultValue: 'ok' } // ok | partial | error
}, { tableName: 'gr_runs', underscored: true, timestamps: true });

// ── Metrics = GSC/GA4 snapshots feeding the agents (Phase 4) ────────────────
const Metric = sequelize.define('gr_metric', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  owner_id: { type: DataTypes.INTEGER, allowNull: false },
  brand_id: { type: DataTypes.INTEGER, allowNull: false },
  source: { type: DataTypes.STRING },   // gsc | ga4
  snapshot: { type: DataTypes.JSONB, defaultValue: {} },
  captured_at: { type: DataTypes.DATE }
}, { tableName: 'gr_metrics', underscored: true, timestamps: true });

// ── Channel settings (owner-level integration + prefs config) ───────────────
// One row per owner. Each channel is a JSONB blob; secrets inside x/linkedin are
// AES-encrypted before they land here (see services/crypto.js).
const Setting = sequelize.define('gr_setting', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  owner_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  seo: { type: DataTypes.JSONB, defaultValue: {} },       // gsc/ga4 property, site url, kw count
  content: { type: DataTypes.JSONB, defaultValue: {} },   // default words, tone, cta, blog url
  x: { type: DataTypes.JSONB, defaultValue: {} },         // handle, posts_per_run, encrypted tokens, autopost
  linkedin: { type: DataTypes.JSONB, defaultValue: {} },  // profile/org, encrypted token, autopost
  geo: { type: DataTypes.JSONB, defaultValue: {} }        // engines[], brand_facts
}, { tableName: 'gr_settings', underscored: true, timestamps: true });

module.exports = { sequelize, User, Brand, Draft, Run, Metric, Setting };
