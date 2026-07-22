'use strict';

/**
 * CaseGuard — Sequelize models.
 * Private, login-only administrative-review / regulatory-escalation case manager.
 * Built for the owner's ongoing administrative review involving Florida
 * Orthopaedic Institute (FOI), but generic to any patient-advocacy / regulatory
 * accountability matter. Every table is multi-tenant (tenant_id = user id),
 * cg_ prefix.
 *
 * Tables:
 *   cg_users          - login accounts
 *   cg_cases          - case container (one review/investigation)
 *   cg_timeline       - chronological events
 *   cg_evidence       - evidence inventory (emails, records, MRI, labs, photos, transcripts)
 *   cg_providers      - provider / entity list (name, role, facility, license, board)
 *   cg_communications - communication log (who, when, channel, summary)
 *   cg_contradictions - contradiction / inconsistency log (evidence A vs B)
 *   cg_policies       - regulatory + organizational knowledge base (citation + text)
 *   cg_comparisons    - care-received vs. standard-of-care / policy comparison
 *   cg_questions      - outstanding questions
 *   cg_escalations    - escalation tracker (target org, status, dates, response)
 *   cg_correspondence - drafted letters / correspondence
 *   cg_analyses       - AI document analyses (extracted facts + flags)
 */

const { DataTypes } = require('sequelize');
const sequelize = require('./db');

// ─── cg_users ─────────────────────────────────────────────────────────────────
const User = sequelize.define('CgUser', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER },       // each user is their own private tenant
  email: { type: DataTypes.STRING, allowNull: false, unique: true },
  name: { type: DataTypes.STRING },
  password_hash: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'owner' }, // owner|member
  lang: { type: DataTypes.STRING, defaultValue: 'en' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { tableName: 'cg_users', timestamps: false });

// ─── cg_cases ─────────────────────────────────────────────────────────────────
const Case = sequelize.define('CgCase', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_id: { type: DataTypes.INTEGER },
  title: { type: DataTypes.STRING, allowNull: false },
  subject_org: { type: DataTypes.STRING },        // e.g. Florida Orthopaedic Institute
  summary: { type: DataTypes.TEXT },
  objective: { type: DataTypes.TEXT },            // desired resolution / accountability goal
  status: { type: DataTypes.STRING, defaultValue: 'open' }, // open|escalating|resolved|closed
  priority: { type: DataTypes.STRING, defaultValue: 'high' },
  opened_at: { type: DataTypes.DATEONLY },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_cases', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['status'] }]
});

// ─── cg_timeline ──────────────────────────────────────────────────────────────
const TimelineEvent = sequelize.define('CgTimelineEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  event_date: { type: DataTypes.DATEONLY },
  event_time: { type: DataTypes.STRING },         // free-form time (approximate ok)
  title: { type: DataTypes.STRING, allowNull: false },
  detail: { type: DataTypes.TEXT },
  location: { type: DataTypes.STRING },           // facility / provider
  category: { type: DataTypes.STRING, defaultValue: 'clinical' }, // clinical|communication|imaging|escalation|admin
  provider_id: { type: DataTypes.INTEGER },
  evidence_ids: { type: DataTypes.JSONB, defaultValue: [] },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_timeline', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }, { fields: ['event_date'] }]
});

// ─── cg_evidence ──────────────────────────────────────────────────────────────
const Evidence = sequelize.define('CgEvidence', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  label: { type: DataTypes.STRING, allowNull: false },
  kind: { type: DataTypes.STRING, defaultValue: 'document' }, // email|medical_record|mri|lab|photo|transcript|document|note|audio
  source: { type: DataTypes.STRING },             // who/where it came from
  evidence_date: { type: DataTypes.DATEONLY },
  content: { type: DataTypes.TEXT },              // pasted text / transcription / description
  file_path: { type: DataTypes.STRING },          // ephemeral disk path (Render wipes on deploy)
  mime: { type: DataTypes.STRING },
  provider_id: { type: DataTypes.INTEGER },
  tags: { type: DataTypes.JSONB, defaultValue: [] },
  analyzed: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_evidence', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }, { fields: ['kind'] }]
});

// ─── cg_providers ─────────────────────────────────────────────────────────────
const Provider = sequelize.define('CgProvider', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING },               // urgent care provider|hand specialist|NP|radiology|admin
  facility: { type: DataTypes.STRING },
  license_no: { type: DataTypes.STRING },
  board: { type: DataTypes.STRING },              // Board of Medicine|Board of Nursing|...
  npi: { type: DataTypes.STRING },
  contact: { type: DataTypes.STRING },
  notes: { type: DataTypes.TEXT },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_providers', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }]
});

// ─── cg_communications ────────────────────────────────────────────────────────
const Communication = sequelize.define('CgCommunication', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  comm_date: { type: DataTypes.DATEONLY },
  direction: { type: DataTypes.STRING, defaultValue: 'outbound' }, // inbound|outbound
  channel: { type: DataTypes.STRING },            // phone|email|portal|in_person|letter|fax
  counterparty: { type: DataTypes.STRING },       // person/org
  subject: { type: DataTypes.STRING },
  summary: { type: DataTypes.TEXT },
  outcome: { type: DataTypes.STRING },
  evidence_ids: { type: DataTypes.JSONB, defaultValue: [] },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_communications', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }]
});

// ─── cg_contradictions ────────────────────────────────────────────────────────
const Contradiction = sequelize.define('CgContradiction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING, allowNull: false },
  description: { type: DataTypes.TEXT },
  statement_a: { type: DataTypes.TEXT },
  statement_b: { type: DataTypes.TEXT },
  evidence_ids: { type: DataTypes.JSONB, defaultValue: [] },
  severity: { type: DataTypes.STRING, defaultValue: 'medium' }, // low|medium|high|critical
  status: { type: DataTypes.STRING, defaultValue: 'open' },     // open|explained|confirmed|resolved
  detected_by: { type: DataTypes.STRING, defaultValue: 'user' },// user|ai
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_contradictions', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }, { fields: ['severity'] }]
});

// ─── cg_policies (regulatory + organizational knowledge base) ──────────────────
const Policy = sequelize.define('CgPolicy', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER },           // null = general reference for the tenant
  authority: { type: DataTypes.STRING },          // FOI|FL Statutes|AHCA|FL DOH|Board of Medicine|CMS|Joint Commission|ACR|AAOS...
  category: { type: DataTypes.STRING },           // org_policy|statute|rule|accreditation|standard_of_care|contact
  citation: { type: DataTypes.STRING },           // e.g. "Fla. Stat. 456.072" or a URL
  title: { type: DataTypes.STRING, allowNull: false },
  body: { type: DataTypes.TEXT },
  source_url: { type: DataTypes.STRING },
  relevance: { type: DataTypes.TEXT },            // why it matters to the case
  verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_policies', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }, { fields: ['authority'] }, { fields: ['category'] }]
});

// ─── cg_comparisons (care received vs standard/policy) ─────────────────────────
const Comparison = sequelize.define('CgComparison', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  topic: { type: DataTypes.STRING, allowNull: false },
  care_received: { type: DataTypes.TEXT },
  expected_standard: { type: DataTypes.TEXT },
  policy_id: { type: DataTypes.INTEGER },
  gap: { type: DataTypes.TEXT },                  // the delta / concern
  severity: { type: DataTypes.STRING, defaultValue: 'medium' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_comparisons', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }]
});

// ─── cg_questions ─────────────────────────────────────────────────────────────
const Question = sequelize.define('CgQuestion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  text: { type: DataTypes.TEXT, allowNull: false },
  directed_to: { type: DataTypes.STRING },        // FOI|AHCA|provider|self...
  status: { type: DataTypes.STRING, defaultValue: 'open' }, // open|answered|obsolete
  answer: { type: DataTypes.TEXT },
  priority: { type: DataTypes.STRING, defaultValue: 'medium' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_questions', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }, { fields: ['status'] }]
});

// ─── cg_escalations ───────────────────────────────────────────────────────────
const Escalation = sequelize.define('CgEscalation', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  target: { type: DataTypes.STRING, allowNull: false }, // FOI Executive Leadership|Corporate Compliance|AHCA|FL DOH|FL AG|Board of Medicine|Board of Nursing|Joint Commission|ACR
  target_contact: { type: DataTypes.STRING },
  method: { type: DataTypes.STRING },             // letter|email|online_complaint|phone|portal
  status: { type: DataTypes.STRING, defaultValue: 'planned' }, // planned|drafted|sent|acknowledged|in_review|responded|closed
  sent_date: { type: DataTypes.DATEONLY },
  response_date: { type: DataTypes.DATEONLY },
  reference_no: { type: DataTypes.STRING },       // complaint / case number from the agency
  response_summary: { type: DataTypes.TEXT },
  next_action: { type: DataTypes.TEXT },
  next_action_date: { type: DataTypes.DATEONLY },
  correspondence_id: { type: DataTypes.INTEGER },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_escalations', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }, { fields: ['status'] }]
});

// ─── cg_correspondence ────────────────────────────────────────────────────────
const Correspondence = sequelize.define('CgCorrespondence', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  kind: { type: DataTypes.STRING, defaultValue: 'complaint' }, // complaint|records_request|demand|follow_up|inquiry|appeal
  target: { type: DataTypes.STRING },
  subject: { type: DataTypes.STRING },
  body: { type: DataTypes.TEXT },                 // drafted letter (plain text)
  tone: { type: DataTypes.STRING, defaultValue: 'formal' },
  status: { type: DataTypes.STRING, defaultValue: 'draft' }, // draft|final|sent
  model: { type: DataTypes.STRING },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_correspondence', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }]
});

// ─── cg_analyses (AI document analysis output) ─────────────────────────────────
const Analysis = sequelize.define('CgAnalysis', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  tenant_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  case_id: { type: DataTypes.INTEGER, allowNull: false },
  evidence_id: { type: DataTypes.INTEGER },
  kind: { type: DataTypes.STRING, defaultValue: 'document' }, // document|contradiction_scan|next_steps
  summary: { type: DataTypes.TEXT },
  facts: { type: DataTypes.JSONB, defaultValue: [] },        // extracted [{fact, date, provider}]
  flags: { type: DataTypes.JSONB, defaultValue: [] },        // [{issue, severity}]
  recommendations: { type: DataTypes.JSONB, defaultValue: [] },
  model: { type: DataTypes.STRING },
  is_simulated: { type: DataTypes.BOOLEAN, defaultValue: false }, // heuristic-fallback honesty flag
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'cg_analyses', timestamps: false,
  indexes: [{ fields: ['tenant_id'] }, { fields: ['case_id'] }, { fields: ['evidence_id'] }]
});

// Associations (scoped to a case)
Case.hasMany(TimelineEvent, { foreignKey: 'case_id' });
Case.hasMany(Evidence, { foreignKey: 'case_id' });
Case.hasMany(Provider, { foreignKey: 'case_id' });
Case.hasMany(Communication, { foreignKey: 'case_id' });
Case.hasMany(Contradiction, { foreignKey: 'case_id' });
Case.hasMany(Policy, { foreignKey: 'case_id' });
Case.hasMany(Comparison, { foreignKey: 'case_id' });
Case.hasMany(Question, { foreignKey: 'case_id' });
Case.hasMany(Escalation, { foreignKey: 'case_id' });
Case.hasMany(Correspondence, { foreignKey: 'case_id' });
Case.hasMany(Analysis, { foreignKey: 'case_id' });

module.exports = {
  sequelize,
  User, Case, TimelineEvent, Evidence, Provider, Communication,
  Contradiction, Policy, Comparison, Question, Escalation, Correspondence, Analysis
};
