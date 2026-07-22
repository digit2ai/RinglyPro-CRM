'use strict';

/**
 * SpeakUp — Sequelize models.
 * Private, login-only voice-to-text + AI editing tool for the owner + team.
 * Every table is multi-tenant (tenant_id), su_ prefix.
 * Tables: su_users, su_recordings, su_transcripts, su_summaries,
 *         su_translations, su_edits, su_usage
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── su_users ───────────────────────────────────────────────────────────────
// Team login accounts (no public signup; seeded by the owner).
const User = sequelize.define('SpeakUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER }, // each user is their own private tenant (= user id)
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'member' }, // admin|member
  lang: { type: DataTypes.STRING, defaultValue: 'es' },     // UI preference
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'su_users', timestamps: false });

// ─── su_recordings ────────────────────────────────────────────────────────────
// One captured/uploaded/imported audio item.
const Recording = sequelize.define('SpeakRecording', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_id: { type: DataTypes.INTEGER },
  title: { type: DataTypes.STRING, defaultValue: 'Grabación' },
  source: { type: DataTypes.STRING, defaultValue: 'mic' },   // mic|meeting|upload|import
  lang: { type: DataTypes.STRING },                          // detected/declared language
  duration_sec: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING, defaultValue: 'done' },  // recording|processing|done|error
  engine: { type: DataTypes.STRING },                        // webspeech|stub|whispercpp|vosk
  file_path: { type: DataTypes.STRING },                     // ephemeral disk path (Render wipes on deploy)
  mime: { type: DataTypes.STRING },
  error: { type: DataTypes.TEXT },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_recordings', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['status'] }, { fields: ['user_id'] }]
});

// ─── su_transcripts ───────────────────────────────────────────────────────────
// The text produced by our own STT engine (one row per recording).
const Transcript = sequelize.define('SpeakTranscript', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  recording_id: { type: DataTypes.INTEGER, allowNull: false },
  text: { type: DataTypes.TEXT, defaultValue: '' },
  segments: { type: DataTypes.JSONB, defaultValue: [] },    // [{ start, end, speaker, text }]
  lang_detected: { type: DataTypes.STRING },
  engine: { type: DataTypes.STRING },
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false }, // stub/placeholder honesty flag
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_transcripts', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['recording_id'] }]
});

// ─── su_summaries ─────────────────────────────────────────────────────────────
// AI summary + bullets + action items for a recording.
const Summary = sequelize.define('SpeakSummary', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  recording_id: { type: DataTypes.INTEGER, allowNull: false },
  summary: { type: DataTypes.TEXT },
  bullets: { type: DataTypes.JSONB, defaultValue: [] },
  action_items: { type: DataTypes.JSONB, defaultValue: [] },
  model: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_summaries', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['recording_id'] }]
});

// ─── su_translations ──────────────────────────────────────────────────────────
const Translation = sequelize.define('SpeakTranslation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  recording_id: { type: DataTypes.INTEGER },
  source_lang: { type: DataTypes.STRING },
  target_lang: { type: DataTypes.STRING, allowNull: false },
  text: { type: DataTypes.TEXT },
  model: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_translations', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['recording_id'] }]
});

// ─── su_edits ─────────────────────────────────────────────────────────────────
// A one-tap tone adjustment / rewrite. Original always preserved as input_text.
const Edit = sequelize.define('SpeakEdit', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  recording_id: { type: DataTypes.INTEGER },
  kind: { type: DataTypes.STRING },        // professional|concise|friendly|email|bullets|grammar|custom
  prompt: { type: DataTypes.TEXT },        // custom prompt (when kind=custom)
  input_text: { type: DataTypes.TEXT },
  output_text: { type: DataTypes.TEXT },
  model: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_edits', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['recording_id'] }]
});

// ─── su_documents ─────────────────────────────────────────────────────────────
// A generated deliverable from a recording: meeting minutes, full details,
// next steps, presentation outline, or project plan. Markdown content.
const Document = sequelize.define('SpeakDocument', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  recording_id: { type: DataTypes.INTEGER, allowNull: false },
  kind: { type: DataTypes.STRING },     // minutes|details|next_steps|presentation|project_plan
  title: { type: DataTypes.STRING },
  content: { type: DataTypes.TEXT },    // markdown
  model: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_documents', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['recording_id'] }, { fields: ['kind'] }]
});

// ─── su_usage ─────────────────────────────────────────────────────────────────
// Lightweight per-tenant usage log (transcription minutes, AI calls).
const Usage = sequelize.define('SpeakUsage', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_id: { type: DataTypes.INTEGER },
  kind: { type: DataTypes.STRING },        // transcribe|summarize|translate|rewrite|import
  units: { type: DataTypes.FLOAT, defaultValue: 1 }, // minutes or count
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_usage', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['kind'] }]
});

// Associations
Recording.hasOne(Transcript, { foreignKey: 'recording_id' });
Transcript.belongsTo(Recording, { foreignKey: 'recording_id' });
Recording.hasMany(Summary, { foreignKey: 'recording_id' });
Summary.belongsTo(Recording, { foreignKey: 'recording_id' });
Recording.hasMany(Translation, { foreignKey: 'recording_id' });
Translation.belongsTo(Recording, { foreignKey: 'recording_id' });
Recording.hasMany(Edit, { foreignKey: 'recording_id' });
Edit.belongsTo(Recording, { foreignKey: 'recording_id' });
Recording.hasMany(Document, { foreignKey: 'recording_id' });
Document.belongsTo(Recording, { foreignKey: 'recording_id' });

module.exports = { sequelize, User, Recording, Transcript, Summary, Translation, Edit, Document, Usage };
