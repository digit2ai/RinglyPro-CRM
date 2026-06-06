'use strict';

/**
 * Veritas — Sequelize models
 * Deepfake detection & takedown data model. Every table is multi-tenant (tenant_id).
 * Tables: df_tenants, df_monitors, df_assets, df_detections, df_takedowns, df_usage
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── df_tenants ───────────────────────────────────────────────────────────
const Tenant = sequelize.define('VeritasTenant', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  plan: { type: DataTypes.STRING, defaultValue: 'starter' }, // starter|growth|enterprise
  seats: { type: DataTypes.INTEGER, defaultValue: 1 },
  contact_email: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'df_tenants', timestamps: false });

// ─── df_monitors ──────────────────────────────────────────────────────────
// A "what to watch" subscription: a brand, a person's likeness, or a keyword.
const Monitor = sequelize.define('VeritasMonitor', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  type: { type: DataTypes.STRING, allowNull: false }, // brand|person|keyword
  target_label: { type: DataTypes.STRING, allowNull: false },
  query_terms: { type: DataTypes.JSONB, defaultValue: [] },
  platforms: { type: DataTypes.JSONB, defaultValue: [] }, // ['facebook','instagram','tiktok','youtube']
  cadence: { type: DataTypes.STRING, defaultValue: 'daily' }, // hourly|daily|weekly
  status: { type: DataTypes.STRING, defaultValue: 'active' }, // active|paused
  last_scanned_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'df_monitors', timestamps: false, indexes: [{ fields: ['tenant_id'] }] });

// ─── df_assets ────────────────────────────────────────────────────────────
// A single piece of media captured by a monitor scan.
const Asset = sequelize.define('VeritasAsset', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  monitor_id: { type: DataTypes.INTEGER },
  source_platform: { type: DataTypes.STRING }, // facebook|instagram|tiktok|youtube|web
  source_url: { type: DataTypes.TEXT },
  media_type: { type: DataTypes.STRING }, // image|video|audio
  thumbnail_url: { type: DataTypes.TEXT },
  captured_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  raw_meta: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'df_assets', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['monitor_id'] }] });

// ─── df_detections ────────────────────────────────────────────────────────
// A verdict on an asset from the detection engine.
const Detection = sequelize.define('VeritasDetection', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  asset_id: { type: DataTypes.INTEGER },
  provider: { type: DataTypes.STRING }, // hive|reality_defender|sensity|stub
  provider_score: { type: DataTypes.FLOAT },
  confidence: { type: DataTypes.INTEGER }, // 0-100 normalized
  verdict: { type: DataTypes.STRING }, // clean|suspect|deepfake
  targeted_person: { type: DataTypes.STRING },
  deepfakes_impact: { type: DataTypes.TEXT },
  evidence: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'df_detections', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['verdict'] }] });

// ─── df_takedowns ─────────────────────────────────────────────────────────
const Takedown = sequelize.define('VeritasTakedown', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  detection_id: { type: DataTypes.INTEGER },
  platform: { type: DataTypes.STRING },
  method: { type: DataTypes.STRING }, // dmca|impersonation|trademark
  status: { type: DataTypes.STRING, defaultValue: 'draft' }, // draft|submitted|acknowledged|removed|rejected
  reference_id: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT },
  submitted_at: { type: DataTypes.DATE },
  removed_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'df_takedowns', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['status'] }] });

// ─── df_usage ─────────────────────────────────────────────────────────────
const Usage = sequelize.define('VeritasUsage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  month: { type: DataTypes.STRING }, // YYYY-MM
  scans_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  takedowns_count: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'df_usage', timestamps: false, indexes: [{ fields: ['tenant_id'] }] });

// ─── df_users ─────────────────────────────────────────────────────────────
// Console operators (login accounts).
const User = sequelize.define('VeritasUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'operator' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'df_users', timestamps: false });

// Associations
Monitor.hasMany(Asset, { foreignKey: 'monitor_id' });
Asset.belongsTo(Monitor, { foreignKey: 'monitor_id' });
Asset.hasMany(Detection, { foreignKey: 'asset_id' });
Detection.belongsTo(Asset, { foreignKey: 'asset_id' });
Detection.hasMany(Takedown, { foreignKey: 'detection_id' });
Takedown.belongsTo(Detection, { foreignKey: 'detection_id' });

module.exports = { sequelize, Tenant, Monitor, Asset, Detection, Takedown, Usage, User };
