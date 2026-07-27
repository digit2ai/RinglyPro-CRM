'use strict';

/**
 * AI Radar — Sequelize models.
 * Personal capture log for AI products/features spotted in the wild
 * (Instagram, Facebook, TikTok, X, YouTube, LinkedIn, the open web).
 *
 * Every table is multi-tenant (tenant_id), ar_ prefix.
 * Tables: ar_users, ar_items, ar_enrichments
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── ar_users ────────────────────────────────────────────────────────────────
// Login accounts (no public signup; seeded by the owner). Each user is their
// own private tenant (tenant_id = user id) so nothing ever leaks across people.
const User = sequelize.define('RadarUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'member' }, // admin|member
  lang: { type: DataTypes.STRING, defaultValue: 'en' },
  // Long-lived secret used by the iOS Shortcut / bookmarklet capture endpoint,
  // which cannot carry the session cookie. Rotatable from the app.
  capture_token: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ar_users', timestamps: false });

// ─── ar_items ────────────────────────────────────────────────────────────────
// One captured AI discovery. The three fields the owner asked for are
// company_name / company_url / description; everything else is context.
const Item = sequelize.define('RadarItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_id: { type: DataTypes.INTEGER },

  company_name: { type: DataTypes.STRING },
  company_url: { type: DataTypes.STRING },
  description: { type: DataTypes.TEXT },

  source_url: { type: DataTypes.TEXT },        // the shared post/video link
  source_platform: { type: DataTypes.STRING }, // instagram|facebook|tiktok|x|youtube|linkedin|reddit|web
  source_title: { type: DataTypes.TEXT },      // page/post title as fetched
  shared_text: { type: DataTypes.TEXT },       // caption/text handed over by the share sheet

  category: { type: DataTypes.STRING },        // agents|voice|video|image|coding|...
  tags: { type: DataTypes.JSONB, defaultValue: [] },
  status: { type: DataTypes.STRING, defaultValue: 'inbox' }, // inbox|saved|archived
  rating: { type: DataTypes.INTEGER, defaultValue: 0 },      // 0-5 personal interest
  notes: { type: DataTypes.TEXT },
  thumbnail_url: { type: DataTypes.TEXT },

  // Honesty flags: how the fields were filled in.
  enriched_by: { type: DataTypes.STRING, defaultValue: 'manual' }, // manual|model|heuristic
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },  // true = drafted without a live model
  needs_review: { type: DataTypes.BOOLEAN, defaultValue: false },  // AI could not identify the company
  // Background labelling: the link is saved instantly, details arrive after.
  enrich_status: { type: DataTypes.STRING, defaultValue: 'none' }, // none|pending|done|failed

  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'ar_items', timestamps: false,
  indexes: [
    { fields: ['tenant_id'] },
    { fields: ['status'] },
    { fields: ['category'] },
    { fields: ['source_platform'] },
    { fields: ['user_id'] }
  ]
});

// ─── ar_enrichments ──────────────────────────────────────────────────────────
// Audit trail of every AI/heuristic draft, so a suggestion can be re-read,
// re-applied, or shown to be simulated.
const Enrichment = sequelize.define('RadarEnrichment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  item_id: { type: DataTypes.INTEGER },
  input_url: { type: DataTypes.TEXT },
  page_meta: { type: DataTypes.JSONB, defaultValue: {} },   // og:* / title / description actually fetched
  suggestion: { type: DataTypes.JSONB, defaultValue: {} },  // what was proposed
  model: { type: DataTypes.STRING },
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'ar_enrichments', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['item_id'] }]
});

Item.hasMany(Enrichment, { foreignKey: 'item_id' });
Enrichment.belongsTo(Item, { foreignKey: 'item_id' });

module.exports = { sequelize, User, Item, Enrichment };
