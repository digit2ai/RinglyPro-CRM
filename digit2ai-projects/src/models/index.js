'use strict';

const sequelize = require('../config/database');
const { DataTypes } = require('sequelize');

// =====================================================
// WORKSPACE
// =====================================================
const Workspace = sequelize.define('Workspace', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING(255), allowNull: false, defaultValue: 'Digit2AI' },
  description: DataTypes.TEXT,
  settings: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'd2_workspaces' });

// =====================================================
// USER ACCESS
// =====================================================
const UserAccess = sequelize.define('UserAccess', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_id: DataTypes.INTEGER,
  email: { type: DataTypes.STRING(255), allowNull: false },
  display_name: DataTypes.STRING(255),
  role: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'contributor' },
  permissions: { type: DataTypes.JSONB, defaultValue: {} },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  last_login: DataTypes.DATE
}, { tableName: 'd2_user_access' });

// =====================================================
// VERTICAL
// =====================================================
const Vertical = sequelize.define('Vertical', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  name: { type: DataTypes.STRING(255), allowNull: false },
  slug: DataTypes.STRING(255),
  description: DataTypes.TEXT,
  color: { type: DataTypes.STRING(20), defaultValue: '#6366f1' },
  icon: { type: DataTypes.STRING(50), defaultValue: 'folder' },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'd2_verticals' });

// =====================================================
// COMPANY
// =====================================================
const Company = sequelize.define('Company', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  name: { type: DataTypes.STRING(255), allowNull: false },
  website: DataTypes.STRING(500),
  industry: DataTypes.STRING(255),
  phone: DataTypes.STRING(50),
  email: DataTypes.STRING(255),
  address: DataTypes.TEXT,
  notes: DataTypes.TEXT
}, { tableName: 'd2_companies' });

// =====================================================
// CONTACT
// =====================================================
const Contact = sequelize.define('Contact', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  company_id: DataTypes.INTEGER,
  vertical_id: DataTypes.INTEGER,
  first_name: { type: DataTypes.STRING(255), allowNull: false },
  last_name: DataTypes.STRING(255),
  title: DataTypes.STRING(255),
  email: DataTypes.STRING(255),
  phone: DataTypes.STRING(50),
  whatsapp: DataTypes.STRING(50),
  website: DataTypes.STRING(500),
  contact_type: { type: DataTypes.STRING(50), defaultValue: 'general' },
  tags: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  status: { type: DataTypes.STRING(50), defaultValue: 'active' },
  source: DataTypes.STRING(100),
  owner_user_id: DataTypes.INTEGER,
  notes: DataTypes.TEXT,
  next_followup_date: DataTypes.DATEONLY,
  last_interaction_date: DataTypes.DATE,
  avatar_url: DataTypes.STRING(500),
  archived_at: DataTypes.DATE,
  pipeline_stage: { type: DataTypes.STRING(50), defaultValue: 'prospect' },
  last_email_event: DataTypes.STRING(50),
  last_email_event_at: DataTypes.DATE,
  workflow_id: DataTypes.INTEGER
}, { tableName: 'd2_contacts' });

// =====================================================
// PROJECT
// =====================================================
const Project = sequelize.define('Project', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  vertical_id: DataTypes.INTEGER,
  company_id: DataTypes.INTEGER,
  name: { type: DataTypes.STRING(500), allowNull: false },
  code: DataTypes.STRING(50),
  category: DataTypes.STRING(100),
  description: DataTypes.TEXT,
  status: { type: DataTypes.STRING(50), defaultValue: 'planning' },
  stage: { type: DataTypes.STRING(100), defaultValue: 'initiation' },
  priority: { type: DataTypes.STRING(20), defaultValue: 'medium' },
  owner_user_id: DataTypes.INTEGER,
  lead_staff_id: DataTypes.INTEGER,
  team_members: { type: DataTypes.JSONB, defaultValue: [] },
  start_date: DataTypes.DATEONLY,
  due_date: DataTypes.DATEONLY,
  notes: DataTypes.TEXT,
  blockers: DataTypes.TEXT,
  next_step: DataTypes.TEXT,
  ai_summary: DataTypes.TEXT,
  tags: { type: DataTypes.ARRAY(DataTypes.TEXT), defaultValue: [] },
  progress: { type: DataTypes.INTEGER, defaultValue: 0 },
  archived_at: DataTypes.DATE
}, { tableName: 'd2_projects' });

// =====================================================
// PROJECT CONTACT LINK
// =====================================================
const ProjectContact = sequelize.define('ProjectContact', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  contact_id: { type: DataTypes.INTEGER, allowNull: false },
  role: DataTypes.STRING(100)
}, { tableName: 'd2_project_contacts', updatedAt: false });

// =====================================================
// PROJECT MILESTONE
// =====================================================
const ProjectMilestone = sequelize.define('ProjectMilestone', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(500), allowNull: false },
  description: DataTypes.TEXT,
  due_date: DataTypes.DATEONLY,
  status: { type: DataTypes.STRING(50), defaultValue: 'pending' },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 },
  completed_at: DataTypes.DATE
}, { tableName: 'd2_project_milestones' });

// =====================================================
// PROJECT UPDATE
// =====================================================
const ProjectUpdate = sequelize.define('ProjectUpdate', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  user_email: DataTypes.STRING(255),
  content: { type: DataTypes.TEXT, allowNull: false },
  update_type: { type: DataTypes.STRING(50), defaultValue: 'note' }
}, { tableName: 'd2_project_updates', updatedAt: false });

// =====================================================
// TASK
// =====================================================
const Task = sequelize.define('Task', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_email: DataTypes.STRING(255),
  project_id: DataTypes.INTEGER,
  contact_id: DataTypes.INTEGER,
  assigned_staff_id: DataTypes.INTEGER,
  title: { type: DataTypes.STRING(500), allowNull: false },
  description: DataTypes.TEXT,
  task_type: { type: DataTypes.STRING(50), defaultValue: 'task' },
  status: { type: DataTypes.STRING(50), defaultValue: 'pending' },
  priority: { type: DataTypes.STRING(20), defaultValue: 'medium' },
  due_date: DataTypes.DATE,
  reminder_date: DataTypes.DATE,
  reminder_sent: { type: DataTypes.BOOLEAN, defaultValue: false },
  completed_at: DataTypes.DATE,
  quicktask_id: DataTypes.INTEGER
}, { tableName: 'd2_tasks' });

// =====================================================
// CALENDAR EVENT
// =====================================================
const CalendarEvent = sequelize.define('CalendarEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_email: DataTypes.STRING(255),
  project_id: DataTypes.INTEGER,
  contact_id: DataTypes.INTEGER,
  title: { type: DataTypes.STRING(500), allowNull: false },
  description: DataTypes.TEXT,
  event_type: { type: DataTypes.STRING(50), defaultValue: 'meeting' },
  start_time: { type: DataTypes.DATE, allowNull: false },
  end_time: DataTypes.DATE,
  all_day: { type: DataTypes.BOOLEAN, defaultValue: false },
  location: DataTypes.STRING(500),
  reminder_minutes: { type: DataTypes.INTEGER, defaultValue: 30 },
  reminder_sent: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'd2_calendar_events' });

// =====================================================
// NOTIFICATION
// =====================================================
const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_email: DataTypes.STRING(255),
  type: { type: DataTypes.STRING(50), allowNull: false },
  title: DataTypes.STRING(500),
  message: DataTypes.TEXT,
  entity_type: DataTypes.STRING(50),
  entity_id: DataTypes.INTEGER,
  read: { type: DataTypes.BOOLEAN, defaultValue: false },
  email_sent: { type: DataTypes.BOOLEAN, defaultValue: false }
}, { tableName: 'd2_notifications', updatedAt: false });

// =====================================================
// ACTIVITY LOG
// =====================================================
const ActivityLog = sequelize.define('ActivityLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_email: DataTypes.STRING(255),
  action: { type: DataTypes.STRING(100), allowNull: false },
  entity_type: DataTypes.STRING(50),
  entity_id: DataTypes.INTEGER,
  entity_name: DataTypes.STRING(500),
  details: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'd2_activity_log', updatedAt: false });

// =====================================================
// NLP COMMAND
// =====================================================
const NlpCommand = sequelize.define('NlpCommand', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  user_email: DataTypes.STRING(255),
  input_text: { type: DataTypes.TEXT, allowNull: false },
  intent: DataTypes.STRING(100),
  entities: { type: DataTypes.JSONB, defaultValue: {} },
  action_taken: DataTypes.STRING(255),
  response: DataTypes.TEXT,
  success: { type: DataTypes.BOOLEAN, defaultValue: true }
}, { tableName: 'd2_nlp_commands', updatedAt: false });

// =====================================================
// STAFF MEMBER
// =====================================================
const StaffMember = sequelize.define('StaffMember', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  first_name: { type: DataTypes.STRING(255), allowNull: false },
  last_name: DataTypes.STRING(255),
  email: DataTypes.STRING(255),
  phone: DataTypes.STRING(50),
  avatar_url: DataTypes.STRING(500),
  department: DataTypes.STRING(100),
  position: DataTypes.STRING(255),
  status: { type: DataTypes.STRING(50), defaultValue: 'active' },
  hire_date: DataTypes.DATEONLY,
  notes: DataTypes.TEXT,
  archived_at: DataTypes.DATE
}, { tableName: 'd2_staff_members' });

// =====================================================
// ROLE
// =====================================================
const Role = sequelize.define('Role', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: DataTypes.TEXT,
  color: { type: DataTypes.STRING(20), defaultValue: '#2563eb' },
  sort_order: { type: DataTypes.INTEGER, defaultValue: 0 }
}, { tableName: 'd2_roles' });

// =====================================================
// STAFF ROLE LINK (many-to-many)
// =====================================================
const StaffRole = sequelize.define('StaffRole', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  staff_id: { type: DataTypes.INTEGER, allowNull: false },
  role_id: { type: DataTypes.INTEGER, allowNull: false }
}, { tableName: 'd2_staff_roles', updatedAt: false });

// =====================================================
// RESPONSIBILITY
// =====================================================
const Responsibility = sequelize.define('Responsibility', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  role_id: DataTypes.INTEGER,
  name: { type: DataTypes.STRING(500), allowNull: false },
  description: DataTypes.TEXT,
  category: DataTypes.STRING(100)
}, { tableName: 'd2_responsibilities' });

// =====================================================
// PIPELINE HISTORY
// =====================================================
const PipelineHistory = sequelize.define('PipelineHistory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  contact_id: { type: DataTypes.INTEGER, allowNull: false },
  from_stage: DataTypes.STRING(50),
  to_stage: { type: DataTypes.STRING(50), allowNull: false },
  trigger_type: { type: DataTypes.STRING(50), defaultValue: 'manual' },
  trigger_detail: DataTypes.TEXT
}, { tableName: 'd2_pipeline_history', updatedAt: false });

// =====================================================
// EMAIL CAMPAIGN
// =====================================================
const EmailCampaign = sequelize.define('EmailCampaign', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  name: { type: DataTypes.STRING(500), allowNull: false },
  subject: { type: DataTypes.STRING(500), allowNull: false },
  body_html: { type: DataTypes.TEXT, allowNull: false },
  from_name: DataTypes.STRING(255),
  from_email: DataTypes.STRING(255),
  target_stage: DataTypes.STRING(50),
  target_vertical_id: DataTypes.INTEGER,
  status: { type: DataTypes.STRING(50), defaultValue: 'draft' },
  sent_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  open_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  click_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  reply_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  bounce_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  sent_at: DataTypes.DATE
}, { tableName: 'd2_email_campaigns' });

// =====================================================
// EMAIL SEND (individual send per contact)
// =====================================================
const EmailSend = sequelize.define('EmailSend', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  campaign_id: { type: DataTypes.INTEGER, allowNull: false },
  contact_id: { type: DataTypes.INTEGER, allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false },
  status: { type: DataTypes.STRING(50), defaultValue: 'queued' },
  sg_message_id: DataTypes.STRING(255),
  opened_at: DataTypes.DATE,
  clicked_at: DataTypes.DATE,
  replied_at: DataTypes.DATE,
  bounced_at: DataTypes.DATE
}, { tableName: 'd2_email_sends' });

// =====================================================
// WORKFLOW
// =====================================================
const Workflow = sequelize.define('Workflow', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  name: { type: DataTypes.STRING(500), allowNull: false },
  description: DataTypes.TEXT,
  trigger_type: { type: DataTypes.STRING(50), defaultValue: 'manual' },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
  steps: { type: DataTypes.JSONB, defaultValue: [] },
  settings: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'd2_workflows' });

// =====================================================
// WORKFLOW RUN (execution state per contact)
// =====================================================
const WorkflowRun = sequelize.define('WorkflowRun', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workflow_id: { type: DataTypes.INTEGER, allowNull: false },
  contact_id: { type: DataTypes.INTEGER, allowNull: false },
  current_step: { type: DataTypes.INTEGER, defaultValue: 0 },
  status: { type: DataTypes.STRING(50), defaultValue: 'active' },
  next_action_at: DataTypes.DATE,
  completed_at: DataTypes.DATE,
  step_data: { type: DataTypes.JSONB, defaultValue: {} }
}, { tableName: 'd2_workflow_runs' });

// =====================================================
// INTAKE BATCH (Project Intake & Discussion Module)
// =====================================================
const IntakeBatch = sequelize.define('IntakeBatch', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  workspace_id: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  company_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(500), allowNull: false },
  meeting_date: DataTypes.DATEONLY,
  submitted_by_email: DataTypes.STRING(255),
  submitted_by_name: DataTypes.STRING(255),
  status: { type: DataTypes.STRING(30), defaultValue: 'draft' },
  share_token: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, unique: true },
  notes: DataTypes.TEXT
}, { tableName: 'd2_intake_batches' });

// =====================================================
// PROJECT INTAKE (one-to-one extension of Project)
// =====================================================
const ProjectIntake = sequelize.define('ProjectIntake', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  batch_id: { type: DataTypes.INTEGER, allowNull: false },
  feasibility: DataTypes.STRING(20),
  feasibility_notes: DataTypes.TEXT,
  risk_level: DataTypes.STRING(20),
  risk_notes: DataTypes.TEXT,
  contacts_notes: DataTypes.TEXT,
  intake_status: { type: DataTypes.STRING(30), defaultValue: 'discussion' },
  priority_avg: DataTypes.DECIMAL(4, 2),
  converted_at: DataTypes.DATE
}, { tableName: 'd2_project_intake' });

// =====================================================
// PROJECT QUESTION
// =====================================================
const ProjectQuestion = sequelize.define('ProjectQuestion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  question_text: { type: DataTypes.TEXT, allowNull: false },
  position: { type: DataTypes.INTEGER, defaultValue: 0 },
  created_by_email: DataTypes.STRING(255)
}, { tableName: 'd2_project_questions' });

// =====================================================
// QUESTION RESPONSE
// =====================================================
const QuestionResponse = sequelize.define('QuestionResponse', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  question_id: { type: DataTypes.INTEGER, allowNull: false },
  responder_email: DataTypes.STRING(255),
  responder_name: DataTypes.STRING(255),
  response_text: { type: DataTypes.TEXT, allowNull: false }
}, { tableName: 'd2_question_responses' });

// =====================================================
// PROJECT COMMENT
// =====================================================
const ProjectComment = sequelize.define('ProjectComment', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  parent_comment_id: DataTypes.INTEGER,
  author_email: DataTypes.STRING(255),
  author_name: DataTypes.STRING(255),
  body: { type: DataTypes.TEXT, allowNull: false }
}, { tableName: 'd2_project_comments' });

// =====================================================
// PRIORITY VOTE
// =====================================================
const PriorityVote = sequelize.define('PriorityVote', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  project_id: { type: DataTypes.INTEGER, allowNull: false },
  voter_email: { type: DataTypes.STRING(255), allowNull: false },
  voter_name: DataTypes.STRING(255),
  score: { type: DataTypes.INTEGER, allowNull: false },
  rationale: DataTypes.TEXT
}, { tableName: 'd2_priority_votes' });

// =====================================================
// COMPANY ACCESS TOKEN (magic-link)
// =====================================================
const CompanyAccessToken = sequelize.define('CompanyAccessToken', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  company_id: { type: DataTypes.INTEGER, allowNull: false },
  batch_id: DataTypes.INTEGER,
  token: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, unique: true },
  grantee_email: DataTypes.STRING(255),
  grantee_name: DataTypes.STRING(255),
  role: { type: DataTypes.STRING(20), defaultValue: 'reviewer' },
  expires_at: DataTypes.DATE,
  last_used_at: DataTypes.DATE
}, { tableName: 'd2_company_access_tokens' });

// =====================================================
// ASSOCIATIONS
// =====================================================

// Company <-> Contacts
Company.hasMany(Contact, { foreignKey: 'company_id', as: 'contacts' });
Contact.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Vertical <-> Contacts
Vertical.hasMany(Contact, { foreignKey: 'vertical_id', as: 'contacts' });
Contact.belongsTo(Vertical, { foreignKey: 'vertical_id', as: 'vertical' });

// Vertical <-> Projects
Vertical.hasMany(Project, { foreignKey: 'vertical_id', as: 'projects' });
Project.belongsTo(Vertical, { foreignKey: 'vertical_id', as: 'vertical' });

// Company <-> Projects
Company.hasMany(Project, { foreignKey: 'company_id', as: 'projects' });
Project.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// Project <-> Milestones
Project.hasMany(ProjectMilestone, { foreignKey: 'project_id', as: 'milestones' });
ProjectMilestone.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Project <-> Updates
Project.hasMany(ProjectUpdate, { foreignKey: 'project_id', as: 'updates' });
ProjectUpdate.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Project <-> Contacts (many-to-many)
Project.belongsToMany(Contact, { through: ProjectContact, foreignKey: 'project_id', otherKey: 'contact_id', as: 'contacts' });
Contact.belongsToMany(Project, { through: ProjectContact, foreignKey: 'contact_id', otherKey: 'project_id', as: 'projects' });

// Project <-> Tasks
Project.hasMany(Task, { foreignKey: 'project_id', as: 'tasks' });
Task.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Contact <-> Tasks
Contact.hasMany(Task, { foreignKey: 'contact_id', as: 'tasks' });
Task.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

// Project <-> Calendar Events
Project.hasMany(CalendarEvent, { foreignKey: 'project_id', as: 'events' });
CalendarEvent.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Contact <-> Calendar Events
Contact.hasMany(CalendarEvent, { foreignKey: 'contact_id', as: 'events' });
CalendarEvent.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

// Staff <-> Roles (many-to-many)
StaffMember.belongsToMany(Role, { through: StaffRole, foreignKey: 'staff_id', otherKey: 'role_id', as: 'roles' });
Role.belongsToMany(StaffMember, { through: StaffRole, foreignKey: 'role_id', otherKey: 'staff_id', as: 'staff' });

// Role <-> Responsibilities
Role.hasMany(Responsibility, { foreignKey: 'role_id', as: 'responsibilities' });
Responsibility.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

// Staff <-> Tasks (assigned_to)
StaffMember.hasMany(Task, { foreignKey: 'assigned_staff_id', as: 'tasks' });
Task.belongsTo(StaffMember, { foreignKey: 'assigned_staff_id', as: 'assignee' });

// Staff <-> Projects (project lead)
StaffMember.hasMany(Project, { foreignKey: 'lead_staff_id', as: 'led_projects' });
Project.belongsTo(StaffMember, { foreignKey: 'lead_staff_id', as: 'lead' });

// Contact <-> Pipeline History
Contact.hasMany(PipelineHistory, { foreignKey: 'contact_id', as: 'pipeline_history' });
PipelineHistory.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

// Campaign <-> Email Sends
EmailCampaign.hasMany(EmailSend, { foreignKey: 'campaign_id', as: 'sends' });
EmailSend.belongsTo(EmailCampaign, { foreignKey: 'campaign_id', as: 'campaign' });

// Contact <-> Email Sends
Contact.hasMany(EmailSend, { foreignKey: 'contact_id', as: 'email_sends' });
EmailSend.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

// Workflow <-> Workflow Runs
Workflow.hasMany(WorkflowRun, { foreignKey: 'workflow_id', as: 'runs' });
WorkflowRun.belongsTo(Workflow, { foreignKey: 'workflow_id', as: 'workflow' });

// Contact <-> Workflow Runs
Contact.hasMany(WorkflowRun, { foreignKey: 'contact_id', as: 'workflow_runs' });
WorkflowRun.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

// =====================================================
// INTAKE ASSOCIATIONS
// =====================================================

// Company <-> IntakeBatches
Company.hasMany(IntakeBatch, { foreignKey: 'company_id', as: 'intake_batches' });
IntakeBatch.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// IntakeBatch <-> ProjectIntake (and through it -> Project)
IntakeBatch.hasMany(ProjectIntake, { foreignKey: 'batch_id', as: 'project_intakes' });
ProjectIntake.belongsTo(IntakeBatch, { foreignKey: 'batch_id', as: 'batch' });

// Project <-> ProjectIntake (one-to-one)
Project.hasOne(ProjectIntake, { foreignKey: 'project_id', as: 'intake' });
ProjectIntake.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Project <-> Questions
Project.hasMany(ProjectQuestion, { foreignKey: 'project_id', as: 'questions' });
ProjectQuestion.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// ProjectQuestion <-> Responses
ProjectQuestion.hasMany(QuestionResponse, { foreignKey: 'question_id', as: 'responses' });
QuestionResponse.belongsTo(ProjectQuestion, { foreignKey: 'question_id', as: 'question' });

// Project <-> Comments
Project.hasMany(ProjectComment, { foreignKey: 'project_id', as: 'comments' });
ProjectComment.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Project <-> Priority Votes
Project.hasMany(PriorityVote, { foreignKey: 'project_id', as: 'priority_votes' });
PriorityVote.belongsTo(Project, { foreignKey: 'project_id', as: 'project' });

// Company <-> Access Tokens
Company.hasMany(CompanyAccessToken, { foreignKey: 'company_id', as: 'access_tokens' });
CompanyAccessToken.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

// IntakeBatch <-> Access Tokens
IntakeBatch.hasMany(CompanyAccessToken, { foreignKey: 'batch_id', as: 'access_tokens' });
CompanyAccessToken.belongsTo(IntakeBatch, { foreignKey: 'batch_id', as: 'batch' });

module.exports = {
  sequelize,
  Workspace,
  UserAccess,
  Vertical,
  Company,
  Contact,
  Project,
  ProjectContact,
  ProjectMilestone,
  ProjectUpdate,
  Task,
  CalendarEvent,
  Notification,
  ActivityLog,
  NlpCommand,
  StaffMember,
  Role,
  StaffRole,
  Responsibility,
  PipelineHistory,
  EmailCampaign,
  EmailSend,
  Workflow,
  WorkflowRun,
  IntakeBatch,
  ProjectIntake,
  ProjectQuestion,
  QuestionResponse,
  ProjectComment,
  PriorityVote,
  CompanyAccessToken
};
