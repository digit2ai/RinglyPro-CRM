'use strict';

/**
 * Executive English Coaching — Sequelize models.
 * Multi-tenant AI coaching platform for executive English (revelum-of-coaching).
 * Every table is multi-tenant (tenant_id), ec_ prefix.
 *
 * Tenancy model (launch): one coach = one tenant (tenant_id = coach user id).
 * Schema is academy-ready: ec_students carry coach_id so a future "owner"
 * role can hold multiple coaches under one tenant without a migration.
 *
 * Tables: ec_users, ec_students, ec_sessions, ec_transcripts, ec_reports,
 *         ec_assignments
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── ec_users ───────────────────────────────────────────────────────────────
// Coach / owner login accounts.
const User = sequelize.define('ExecUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER }, // each coach is their own tenant (= user id)
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  org: { type: DataTypes.STRING, defaultValue: 'digit2ai' }, // signup source / academy slug
  role: { type: DataTypes.STRING, defaultValue: 'coach' }, // owner|coach
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_users', timestamps: false });

// ─── ec_students ──────────────────────────────────────────────────────────
// A person the coach trains (e.g. the Minister). Belongs to one coach + tenant.
const Student = sequelize.define('ExecStudent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  coach_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  email: { type: DataTypes.STRING },
  role_title: { type: DataTypes.STRING },       // e.g. "Ministro de Comercio"
  target_level: { type: DataTypes.STRING, defaultValue: 'C1' }, // CEFR goal
  native_language: { type: DataTypes.STRING, defaultValue: 'es' },
  goals: { type: DataTypes.TEXT },              // what success looks like
  notes: { type: DataTypes.TEXT },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_students', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['coach_id'] }] });

// ─── ec_sessions ──────────────────────────────────────────────────────────
// One 1:1 coaching session.
const Session = sequelize.define('ExecSession', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  student_id: { type: DataTypes.INTEGER, allowNull: false },
  coach_name: { type: DataTypes.STRING, defaultValue: 'Coach' },
  session_date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
  scenario: { type: DataTypes.STRING },          // roleplay theme (press conf, negotiation...)
  subject: { type: DataTypes.STRING },
  summary: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'in_progress' }, // in_progress|finalized
  duration_min: { type: DataTypes.INTEGER },
  student_words: { type: DataTypes.INTEGER, defaultValue: 0 },
  coach_words: { type: DataTypes.INTEGER, defaultValue: 0 },
  speaking_pct: { type: DataTypes.INTEGER },      // % of words spoken by the student
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_sessions', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['student_id'] }, { fields: ['status'] }] });

// ─── ec_transcripts ───────────────────────────────────────────────────────
// Turn-by-turn record of the session (voice or typed).
const Transcript = sequelize.define('ExecTranscript', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  session_id: { type: DataTypes.INTEGER, allowNull: false },
  turn_index: { type: DataTypes.INTEGER, defaultValue: 0 },
  role: { type: DataTypes.STRING, defaultValue: 'student' }, // student|coach
  text: { type: DataTypes.TEXT, allowNull: false },
  source: { type: DataTypes.STRING, defaultValue: 'typed' }, // voice|typed
  ts: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_transcripts', timestamps: false, indexes: [{ fields: ['session_id'] }] });

// ─── ec_reports ───────────────────────────────────────────────────────────
// The 5 post-session deliverables promised in the coaching program (one row
// per finalized session). Arrays stored as JSON text.
const Report = sequelize.define('ExecReport', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  session_id: { type: DataTypes.INTEGER, allowNull: false },
  student_id: { type: DataTypes.INTEGER, allowNull: false },
  fortalezas: { type: DataTypes.TEXT },          // JSON array — principales fortalezas
  aspectos_mejorar: { type: DataTypes.TEXT },    // JSON array — aspectos a mejorar
  expresiones: { type: DataTypes.TEXT },         // JSON array — expresiones de alto impacto
  vocabulario: { type: DataTypes.TEXT },         // JSON array — vocabulario estratégico
  ejercicio: { type: DataTypes.TEXT },           // ejercicio práctico para el día siguiente
  correcciones: { type: DataTypes.TEXT },        // JSON array — {error, correccion}
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_reports', timestamps: false, indexes: [{ fields: ['session_id'] }, { fields: ['student_id'] }] });

// ─── ec_assignments ───────────────────────────────────────────────────────
// "Entre sesiones" daily immersion tasks (audio, article, podcast, expression).
const Assignment = sequelize.define('ExecAssignment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  student_id: { type: DataTypes.INTEGER, allowNull: false },
  session_id: { type: DataTypes.INTEGER },       // origin session (nullable)
  kind: { type: DataTypes.STRING, defaultValue: 'ejercicio' }, // audio|articulo|podcast|expresion|vocabulario|ejercicio
  title: { type: DataTypes.STRING, allowNull: false },
  detail: { type: DataTypes.TEXT },
  status: { type: DataTypes.STRING, defaultValue: 'open' }, // open|done
  due_date: { type: DataTypes.DATEONLY },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  completed_at: { type: DataTypes.DATE }
}, { tableName: 'ec_assignments', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['student_id'] }, { fields: ['status'] }] });

// ═══════════════════════════════════════════════════════════════════════════
// STUDENT SELF-SERVE MODEL (v2 upgrade) — intake → placement → AI curriculum →
// modular learning → assessments. A self-serve student is an ec_users row with
// role='student' and tenant_id = own id. All tables below key on
// student_user_id = ec_users.id.
// ═══════════════════════════════════════════════════════════════════════════

// ─── ec_intake_profiles ────────────────────────────────────────────────────
// The typeform-style intake answers + placement result (one row per student).
const IntakeProfile = sequelize.define('ExecIntakeProfile', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  student_user_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  first_name: { type: DataTypes.STRING },
  last_name: { type: DataTypes.STRING },
  phone: { type: DataTypes.STRING },
  email: { type: DataTypes.STRING },
  age_range: { type: DataTypes.STRING },        // 18-24 ... 65+
  occupation: { type: DataTypes.STRING },
  industry: { type: DataTypes.STRING },
  motivation: { type: DataTypes.STRING },       // multiple-choice key
  motivation_text: { type: DataTypes.TEXT },    // free text
  timeline_months: { type: DataTypes.INTEGER, defaultValue: 6 },
  hours_per_week: { type: DataTypes.INTEGER, defaultValue: 3 },
  self_level: { type: DataTypes.STRING, defaultValue: 'medium' }, // low|medium|high
  placement_level: { type: DataTypes.STRING },   // verified low|medium|high
  placement_score: { type: DataTypes.INTEGER },  // 0-100
  placement_spoken: { type: DataTypes.TEXT },    // JSON rubric of the 30s spoken response
  step: { type: DataTypes.INTEGER, defaultValue: 1 }, // furthest intake step reached
  status: { type: DataTypes.STRING, defaultValue: 'in_progress' }, // in_progress|completed
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_intake_profiles', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['student_user_id'] }] });

// ─── ec_curricula ──────────────────────────────────────────────────────────
// The AI-generated personalized program (one active per student).
const Curriculum = sequelize.define('ExecCurriculum', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  student_user_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING },
  level: { type: DataTypes.STRING },             // low|medium|high (CEFR-ish)
  focus: { type: DataTypes.TEXT },               // ESP domain description
  total_modules: { type: DataTypes.INTEGER, defaultValue: 5 },
  pass_threshold: { type: DataTypes.INTEGER, defaultValue: 80 },
  generated_by: { type: DataTypes.STRING, defaultValue: 'ai' }, // ai|heuristic
  status: { type: DataTypes.STRING, defaultValue: 'active' },    // active|archived
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_curricula', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['student_user_id'] }] });

// ─── ec_modules ────────────────────────────────────────────────────────────
// One module of the curriculum. Lessons + vocab stored inline as JSON.
const Module = sequelize.define('ExecModule', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  student_user_id: { type: DataTypes.INTEGER, allowNull: false },
  curriculum_id: { type: DataTypes.INTEGER, allowNull: false },
  order_index: { type: DataTypes.INTEGER, defaultValue: 0 },
  title: { type: DataTypes.STRING },
  objective: { type: DataTypes.TEXT },
  vocab: { type: DataTypes.TEXT },               // JSON [{term, meaning_es, example}]
  lessons: { type: DataTypes.TEXT },             // JSON [{title, type, mins, content_en, exercises[]}]
  status: { type: DataTypes.STRING, defaultValue: 'locked' }, // locked|unlocked|in_progress|passed
  best_score: { type: DataTypes.INTEGER },
  reinforcement: { type: DataTypes.TEXT },       // AI reinforcement content after a fail
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_modules', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['student_user_id'] }, { fields: ['curriculum_id'] }] });

// ─── ec_assessments ────────────────────────────────────────────────────────
// The end-of-module assessment (one per module). Questions stored as JSON.
const Assessment = sequelize.define('ExecAssessment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  student_user_id: { type: DataTypes.INTEGER, allowNull: false },
  module_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  questions: { type: DataTypes.TEXT },           // JSON [{type, q, options?, answer, points?}]
  pass_threshold: { type: DataTypes.INTEGER, defaultValue: 80 },
  is_final: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_assessments', timestamps: false, indexes: [{ fields: ['module_id'] }, { fields: ['student_user_id'] }] });

// ─── ec_assessment_attempts ────────────────────────────────────────────────
const AssessmentAttempt = sequelize.define('ExecAssessmentAttempt', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  student_user_id: { type: DataTypes.INTEGER, allowNull: false },
  assessment_id: { type: DataTypes.INTEGER, allowNull: false },
  module_id: { type: DataTypes.INTEGER, allowNull: false },
  answers: { type: DataTypes.TEXT },             // JSON array aligned to questions
  score: { type: DataTypes.INTEGER },
  passed: { type: DataTypes.BOOLEAN, defaultValue: false },
  weak_areas: { type: DataTypes.TEXT },          // JSON list of missed concepts
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_assessment_attempts', timestamps: false, indexes: [{ fields: ['module_id'] }, { fields: ['student_user_id'] }] });

// ─── ec_kb_documents ───────────────────────────────────────────────────────
// Coach knowledge base: teaching materials that steer the AI to teach the way
// THIS coach teaches (white-label coach AI). Keyed by coach tenant.
const KbDocument = sequelize.define('ExecKbDocument', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false },
  coach_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  kind: { type: DataTypes.STRING, defaultValue: 'method' }, // method|vocab|lesson_plan|transcript|notes
  content: { type: DataTypes.TEXT },             // plain text (RAG-lite: whole-doc context)
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'ec_kb_documents', timestamps: false, indexes: [{ fields: ['tenant_id'] }, { fields: ['coach_id'] }] });

// Associations — student self-serve
Curriculum.hasMany(Module, { foreignKey: 'curriculum_id' });
Module.belongsTo(Curriculum, { foreignKey: 'curriculum_id' });
Module.hasOne(Assessment, { foreignKey: 'module_id' });
Assessment.belongsTo(Module, { foreignKey: 'module_id' });
Assessment.hasMany(AssessmentAttempt, { foreignKey: 'assessment_id' });
AssessmentAttempt.belongsTo(Assessment, { foreignKey: 'assessment_id' });

// Associations — coach session model (v1)
Student.hasMany(Session, { foreignKey: 'student_id' });
Session.belongsTo(Student, { foreignKey: 'student_id' });
Session.hasMany(Transcript, { foreignKey: 'session_id' });
Transcript.belongsTo(Session, { foreignKey: 'session_id' });
Session.hasOne(Report, { foreignKey: 'session_id' });
Report.belongsTo(Session, { foreignKey: 'session_id' });
Student.hasMany(Assignment, { foreignKey: 'student_id' });
Assignment.belongsTo(Student, { foreignKey: 'student_id' });

module.exports = {
  sequelize, User, Student, Session, Transcript, Report, Assignment,
  IntakeProfile, Curriculum, Module, Assessment, AssessmentAttempt, KbDocument
};
