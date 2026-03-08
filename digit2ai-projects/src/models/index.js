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
  archived_at: DataTypes.DATE
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
  title: { type: DataTypes.STRING(500), allowNull: false },
  description: DataTypes.TEXT,
  task_type: { type: DataTypes.STRING(50), defaultValue: 'task' },
  status: { type: DataTypes.STRING(50), defaultValue: 'pending' },
  priority: { type: DataTypes.STRING(20), defaultValue: 'medium' },
  due_date: DataTypes.DATE,
  reminder_date: DataTypes.DATE,
  reminder_sent: { type: DataTypes.BOOLEAN, defaultValue: false },
  completed_at: DataTypes.DATE
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
  NlpCommand
};
