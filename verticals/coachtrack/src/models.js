'use strict';

/**
 * CoachTrack — Sequelize models.
 * Personal AI coaching tracker. Every table is multi-tenant (tenant_id), ct_ prefix.
 * Tables: ct_users, ct_sessions, ct_transcripts, ct_action_items, ct_guidance
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── ct_users ─────────────────────────────────────────────────────────────
// Console login accounts.
const User = sequelize.define('CoachUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER }, // each user is their own private tenant (= user id)
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  org: { type: DataTypes.STRING, defaultValue: 'visionarium' }, // signup source / cohort
  role: { type: DataTypes.STRING, defaultValue: 'member' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ct_users', timestamps: false });

// ─── ct_sessions ──────────────────────────────────────────────────────────
// One weekly coaching session.
const Session = sequelize.define('CoachSession', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  coach_name: { type: DataTypes.STRING, defaultValue: 'Lala' },
  session_date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
  subject: { type: DataTypes.STRING },
  summary: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'in_progress' }, // in_progress|finalized
  duration_min: { type: DataTypes.INTEGER },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ct_sessions', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['status'] }] });

// ─── ct_transcripts ───────────────────────────────────────────────────────
// Turn-by-turn record of the full session (voice or typed).
const Transcript = sequelize.define('CoachTranscript', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  session_id: { type: DataTypes.INTEGER, allowNull: false },
  turn_index: { type: DataTypes.INTEGER, defaultValue: 0 },
  role: { type: DataTypes.STRING, defaultValue: 'me' }, // me|coach
  text: { type: DataTypes.TEXT, allowNull: false },
  source: { type: DataTypes.STRING, defaultValue: 'typed' }, // voice|typed
  ts: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ct_transcripts', timestamps: false, indexes: [{ fields: ['session_id'] }] });

// ─── ct_action_items ──────────────────────────────────────────────────────
// A commitment extracted from a session. CoachAccountable-style state machine.
const ActionItem = sequelize.define('CoachActionItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  session_id: { type: DataTypes.INTEGER, allowNull: false },
  text: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.STRING, defaultValue: 'open' }, // open|in_progress|done|overdue
  due_date: { type: DataTypes.DATEONLY },
  notes: { type: DataTypes.TEXT },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  completed_at: { type: DataTypes.DATE }
}, { tableName: 'ct_action_items', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['session_id'] }, { fields: ['status'] }] });

// ─── ct_guidance ──────────────────────────────────────────────────────────
// The coaching-agent Q&A thread scoped to a single action item.
const Guidance = sequelize.define('CoachGuidance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  action_item_id: { type: DataTypes.INTEGER, allowNull: false },
  question: { type: DataTypes.TEXT, allowNull: false },
  ai_response: { type: DataTypes.TEXT },
  ts: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ct_guidance', timestamps: false, indexes: [{ fields: ['action_item_id'] }] });

// Associations
Session.hasMany(Transcript, { foreignKey: 'session_id' });
Transcript.belongsTo(Session, { foreignKey: 'session_id' });
Session.hasMany(ActionItem, { foreignKey: 'session_id' });
ActionItem.belongsTo(Session, { foreignKey: 'session_id' });
ActionItem.hasMany(Guidance, { foreignKey: 'action_item_id' });
Guidance.belongsTo(ActionItem, { foreignKey: 'action_item_id' });

module.exports = { sequelize, User, Session, Transcript, ActionItem, Guidance };
