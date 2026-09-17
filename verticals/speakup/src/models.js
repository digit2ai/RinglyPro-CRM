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
  // AI Factory session fields (added idempotently in index.js init)
  mode: { type: DataTypes.STRING(20) },                      // meeting|note|command|architect (null = legacy)
  project_key: { type: DataTypes.STRING(60) },
  participants: { type: DataTypes.JSONB, defaultValue: [] },
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
  kind: { type: DataTypes.STRING },     // minutes|details|next_steps|presentation|project_plan|custom
  title: { type: DataTypes.STRING },
  prompt: { type: DataTypes.TEXT },     // free-form instruction (when kind=custom)
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

// ═════════════════════════════════════════════════════════════════════════════
// AI FACTORY (voice → architect → GitHub branch/PR). See src/factory/.
// ═════════════════════════════════════════════════════════════════════════════

// ─── su_projects ──────────────────────────────────────────────────────────────
// The Project Registry. Routing is data, never code: adding a project is a row.
const Project = sequelize.define('SpeakProject', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  key: { type: DataTypes.STRING(60), allowNull: false },        // ringlypro | jobmd | ...
  name: { type: DataTypes.STRING(120), allowNull: false },
  aliases: { type: DataTypes.JSONB, defaultValue: [] },          // spoken names
  repo: { type: DataTypes.STRING(200) },                         // owner/name
  default_branch: { type: DataTypes.STRING(100), defaultValue: 'main' },
  path_scope: { type: DataTypes.JSONB, defaultValue: [] },       // monorepo sub-paths
  deployment: { type: DataTypes.STRING(200) },                   // human description
  architect_agent: { type: DataTypes.STRING(80), defaultValue: 'ringlypro-architect' },
  knowledge_sources: { type: DataTypes.JSONB, defaultValue: [] },// files the agent reads first
  allowed_actions: { type: DataTypes.JSONB, defaultValue: [] },  // read|prepare|execute|merge
  test_commands: { type: DataTypes.JSONB, defaultValue: [] },    // run in CI, keyless + DB-less
  workflow_file: { type: DataTypes.STRING(120), defaultValue: 'speakup-factory.yml' },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_projects', timestamps: false,
  indexes: [{ name: 'su_projects_tenant_idx', fields: ['tenant_id'] },
    { name: 'su_projects_tenant_key_uq', unique: true, fields: ['tenant_id', 'key'] }]
});

// ─── su_meeting_intel ─────────────────────────────────────────────────────────
// Structured extraction of one recording. Items are classified DISCUSSION|IDEA|
// SUGGESTION|DECISION|APPROVED_REQUIREMENT and each carries a verbatim quote.
const MeetingIntel = sequelize.define('SpeakMeetingIntel', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  recording_id: { type: DataTypes.INTEGER, allowNull: false },
  project_key: { type: DataTypes.STRING(60) },
  data: { type: DataTypes.JSONB, defaultValue: {} },
  composed_by: { type: DataTypes.STRING(60) },
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_meeting_intel', timestamps: false,
  indexes: [{ name: 'su_meeting_intel_tenant_idx', fields: ['tenant_id'] },
    { name: 'su_meeting_intel_rec_idx', fields: ['recording_id'] }]
});

// ─── su_commands ──────────────────────────────────────────────────────────────
// Every interpreted voice/typed command. The private phrase is never stored.
const Command = sequelize.define('SpeakCommand', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
  mode: { type: DataTypes.STRING(20) },
  transcript: { type: DataTypes.TEXT },          // redacted
  normalized: { type: DataTypes.TEXT },
  intent: { type: DataTypes.STRING(40) },
  classified_by: { type: DataTypes.STRING(30) },  // rules|model|mode
  project_key: { type: DataTypes.STRING(60) },
  context_recording_ids: { type: DataTypes.JSONB, defaultValue: [] },
  job_id: { type: DataTypes.INTEGER },
  status: { type: DataTypes.STRING(20), defaultValue: 'done' }, // done|error|needs_confirmation
  result: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_commands', timestamps: false,
  indexes: [{ name: 'su_commands_tenant_idx', fields: ['tenant_id'] },
    { name: 'su_commands_tenant_created_idx', fields: ['tenant_id', 'created_at'] }]
});

// ─── su_settings ──────────────────────────────────────────────────────────────
// Owner-level text the factory reads on EVERY instruction: the house rules. One row per
// tenant per key, so adding a second setting later is a row, not a migration.
const Setting = sequelize.define('SpeakSetting', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  key: { type: DataTypes.STRING(60), allowNull: false },
  value: { type: DataTypes.TEXT, defaultValue: '' },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_settings', timestamps: false,
  indexes: [{ name: 'su_settings_tenant_key_idx', unique: true, fields: ['tenant_id', 'key'] }]
});

// ─── su_jobs ──────────────────────────────────────────────────────────────────
// A persistent engineering job. Never depends on an open browser.
const Job = sequelize.define('SpeakJob', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
  command_id: { type: DataTypes.INTEGER },
  project_key: { type: DataTypes.STRING(60) },
  repo: { type: DataTypes.STRING(200) },
  base_branch: { type: DataTypes.STRING(100) },
  title: { type: DataTypes.STRING(200) },
  status: { type: DataTypes.STRING(30), defaultValue: 'QUEUED' },
  source_recording_ids: { type: DataTypes.JSONB, defaultValue: [] },
  spec: { type: DataTypes.JSONB, defaultValue: {} },
  // Every correction the owner typed against a shown plan, oldest first. In the plan hash.
  revisions: { type: DataTypes.JSONB, defaultValue: [] },
  plan: { type: DataTypes.JSONB, defaultValue: {} },
  plan_md: { type: DataTypes.TEXT },
  plan_hash: { type: DataTypes.STRING(64) },
  plan_composed_by: { type: DataTypes.STRING(60) },
  repo_sha: { type: DataTypes.STRING(64) },
  // Snapshot of the registry at PREPARE time, covered by plan_hash. Dispatch and the
  // brief read these, never the live project row.
  workflow_file: { type: DataTypes.STRING(120) },
  test_commands: { type: DataTypes.JSONB, defaultValue: [] },
  path_scope: { type: DataTypes.JSONB, defaultValue: [] },
  changed_files: { type: DataTypes.JSONB, defaultValue: [] },
  suite_modified: { type: DataTypes.BOOLEAN },
  baseline_ok: { type: DataTypes.BOOLEAN },   // the base-branch suite passed over the change
  brief_token_used_at: { type: DataTypes.DATE },
  auto_run: { type: DataTypes.BOOLEAN, defaultValue: false }, // console job: dispatch as soon as the plan is ready
  attachments: { type: DataTypes.JSONB, defaultValue: [] },  // pasted screenshots the agent may look at
  approved_by: { type: DataTypes.STRING(200) },
  approved_at: { type: DataTypes.DATE },
  branch: { type: DataTypes.STRING(120) },
  commit_sha: { type: DataTypes.STRING(64) },
  pr_number: { type: DataTypes.INTEGER },
  pr_url: { type: DataTypes.STRING(300) },
  pr_draft: { type: DataTypes.BOOLEAN },
  run_url: { type: DataTypes.STRING(300) },
  files_changed: { type: DataTypes.INTEGER },
  tests: { type: DataTypes.JSONB, defaultValue: {} },  // {passed, failed, measured, summary}
  merge_sha: { type: DataTypes.STRING(64) },
  deploy_status: { type: DataTypes.STRING(60) },
  error: { type: DataTypes.TEXT },
  callback_nonces: { type: DataTypes.JSONB, defaultValue: [] },
  poll_claimed_at: { type: DataTypes.DATE },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_jobs', timestamps: false,
  indexes: [{ name: 'su_jobs_tenant_idx', fields: ['tenant_id'] },
    { name: 'su_jobs_tenant_status_idx', fields: ['tenant_id', 'status'] },
    { name: 'su_jobs_status_updated_idx', fields: ['status', 'updated_at'] }]
});

// ─── su_job_events ────────────────────────────────────────────────────────────
// What the factory is doing, live: statuses plus the steps Claude takes in GitHub
// Actions (files read, edits, commands, tests). Private to SpeakUp — the public
// Actions log never carries them.
const JobEvent = sequelize.define('SpeakJobEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  job_id: { type: DataTypes.INTEGER, allowNull: false },
  kind: { type: DataTypes.STRING(20) },   // status|say|read|edit|write|run|search|test|error|info|done|pr
  text: { type: DataTypes.TEXT },
  detail: { type: DataTypes.JSONB, defaultValue: {} },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_job_events', timestamps: false,
  indexes: [{ name: 'su_job_events_job_idx', fields: ['job_id', 'id'] }, { name: 'su_job_events_tenant_idx', fields: ['tenant_id'] }]
});

// ─── su_uploads ───────────────────────────────────────────────────────────────
// A screenshot pasted into the console. Kept in the database (Render's disk is
// ephemeral), never written into the repository, and handed to the build job as a
// file in the runner's temp directory so Claude can look at it.
const Upload = sequelize.define('SpeakUpload', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
  job_id: { type: DataTypes.INTEGER },
  name: { type: DataTypes.STRING(120) },
  mime: { type: DataTypes.STRING(60) },
  size: { type: DataTypes.INTEGER },
  bytes: { type: DataTypes.BLOB },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_uploads', timestamps: false,
  indexes: [{ name: 'su_uploads_tenant_idx', fields: ['tenant_id'] }, { name: 'su_uploads_job_idx', fields: ['job_id'] }]
});

// ─── su_meeting_chat ──────────────────────────────────────────────────────────
// The conversation about one meeting. The meeting is a su_recordings row, so meeting_id
// is a recording id. kind: text | prompt (a build prompt, first line "BUILD PROMPT:") |
// transfer (the confirmation that it went to the Factory). composed_by records which model
// answered, or 'offline' when the model could not be reached and the reply is labelled so.
// attachment_url is 'upload:<su_uploads.id>' — the image lives in the database, not on disk.
const MeetingChat = sequelize.define('SpeakMeetingChat', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  meeting_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
  role: { type: DataTypes.STRING(12), allowNull: false },   // user | assistant
  kind: { type: DataTypes.STRING(12), defaultValue: 'text' },
  content: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
  attachment_url: { type: DataTypes.STRING(200) },
  factory_ref: { type: DataTypes.STRING(120) },
  composed_by: { type: DataTypes.STRING(60) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_meeting_chat', timestamps: false,
  indexes: [{ name: 'su_meeting_chat_tenant_idx', fields: ['tenant_id'] },
    { name: 'su_meeting_chat_meeting_idx', fields: ['tenant_id', 'meeting_id', 'id'] }]
});

// ─── su_audit ─────────────────────────────────────────────────────────────────
// Append-only trail. No route updates or deletes a row.
const Audit = sequelize.define('SpeakAudit', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER },
  actor: { type: DataTypes.STRING(200) },       // user email | github-actions | system
  action: { type: DataTypes.STRING(60) },
  entity: { type: DataTypes.STRING(30) },       // job|command|project|intel|auth
  entity_id: { type: DataTypes.INTEGER },
  from_status: { type: DataTypes.STRING(30) },
  to_status: { type: DataTypes.STRING(30) },
  detail: { type: DataTypes.JSONB, defaultValue: {} },
  ip_hash: { type: DataTypes.STRING(64) },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'su_audit', timestamps: false,
  indexes: [{ name: 'su_audit_tenant_idx', fields: ['tenant_id'] },
    { name: 'su_audit_entity_idx', fields: ['entity', 'entity_id'] }]
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

module.exports = { sequelize, User, Recording, Transcript, Summary, Translation, Edit, Document, Usage,
  Project, MeetingIntel, Command, Job, JobEvent, Upload, Audit, MeetingChat, Setting };
