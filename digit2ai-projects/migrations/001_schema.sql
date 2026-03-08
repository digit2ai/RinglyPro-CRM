-- =====================================================
-- Digit2AI Contacts & Projects Hub - Database Schema
-- All tables prefixed with d2_ for isolation
-- =====================================================

-- Workspaces
CREATE TABLE IF NOT EXISTS d2_workspaces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL DEFAULT 'Digit2AI',
  description TEXT,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Access / Roles
CREATE TABLE IF NOT EXISTS d2_user_access (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(255),
  role VARCHAR(50) NOT NULL DEFAULT 'contributor',
  permissions JSONB DEFAULT '{}',
  active BOOLEAN DEFAULT true,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_d2_user_access_email ON d2_user_access(email);
CREATE INDEX IF NOT EXISTS idx_d2_user_access_ws ON d2_user_access(workspace_id);

-- Verticals
CREATE TABLE IF NOT EXISTS d2_verticals (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  description TEXT,
  color VARCHAR(20) DEFAULT '#6366f1',
  icon VARCHAR(50) DEFAULT 'folder',
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Companies
CREATE TABLE IF NOT EXISTS d2_companies (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  website VARCHAR(500),
  industry VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_d2_companies_ws ON d2_companies(workspace_id);

-- Contacts
CREATE TABLE IF NOT EXISTS d2_contacts (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  company_id INTEGER REFERENCES d2_companies(id) ON DELETE SET NULL,
  vertical_id INTEGER REFERENCES d2_verticals(id) ON DELETE SET NULL,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255),
  title VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  whatsapp VARCHAR(50),
  website VARCHAR(500),
  contact_type VARCHAR(50) DEFAULT 'general',
  tags TEXT[] DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'active',
  source VARCHAR(100),
  owner_user_id INTEGER,
  notes TEXT,
  next_followup_date DATE,
  last_interaction_date TIMESTAMPTZ,
  avatar_url VARCHAR(500),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_d2_contacts_ws ON d2_contacts(workspace_id);
CREATE INDEX IF NOT EXISTS idx_d2_contacts_email ON d2_contacts(email);
CREATE INDEX IF NOT EXISTS idx_d2_contacts_status ON d2_contacts(status);
CREATE INDEX IF NOT EXISTS idx_d2_contacts_followup ON d2_contacts(next_followup_date);

-- Projects
CREATE TABLE IF NOT EXISTS d2_projects (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  vertical_id INTEGER REFERENCES d2_verticals(id) ON DELETE SET NULL,
  company_id INTEGER REFERENCES d2_companies(id) ON DELETE SET NULL,
  name VARCHAR(500) NOT NULL,
  code VARCHAR(50),
  category VARCHAR(100),
  description TEXT,
  status VARCHAR(50) DEFAULT 'planning',
  stage VARCHAR(100) DEFAULT 'initiation',
  priority VARCHAR(20) DEFAULT 'medium',
  owner_user_id INTEGER,
  team_members JSONB DEFAULT '[]',
  start_date DATE,
  due_date DATE,
  notes TEXT,
  blockers TEXT,
  next_step TEXT,
  ai_summary TEXT,
  tags TEXT[] DEFAULT '{}',
  progress INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_d2_projects_ws ON d2_projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_d2_projects_status ON d2_projects(status);
CREATE INDEX IF NOT EXISTS idx_d2_projects_due ON d2_projects(due_date);
CREATE INDEX IF NOT EXISTS idx_d2_projects_priority ON d2_projects(priority);

-- Project-Contact Links
CREATE TABLE IF NOT EXISTS d2_project_contacts (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES d2_projects(id) ON DELETE CASCADE,
  contact_id INTEGER NOT NULL REFERENCES d2_contacts(id) ON DELETE CASCADE,
  role VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(project_id, contact_id)
);

-- Project Milestones
CREATE TABLE IF NOT EXISTS d2_project_milestones (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES d2_projects(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'pending',
  sort_order INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_d2_milestones_project ON d2_project_milestones(project_id);

-- Project Updates
CREATE TABLE IF NOT EXISTS d2_project_updates (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES d2_projects(id) ON DELETE CASCADE,
  user_email VARCHAR(255),
  content TEXT NOT NULL,
  update_type VARCHAR(50) DEFAULT 'note',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks / Reminders
CREATE TABLE IF NOT EXISTS d2_tasks (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  user_email VARCHAR(255),
  project_id INTEGER REFERENCES d2_projects(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES d2_contacts(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  task_type VARCHAR(50) DEFAULT 'task',
  status VARCHAR(50) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  due_date TIMESTAMPTZ,
  reminder_date TIMESTAMPTZ,
  reminder_sent BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_d2_tasks_ws ON d2_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_d2_tasks_status ON d2_tasks(status);
CREATE INDEX IF NOT EXISTS idx_d2_tasks_due ON d2_tasks(due_date);

-- Calendar Events
CREATE TABLE IF NOT EXISTS d2_calendar_events (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  user_email VARCHAR(255),
  project_id INTEGER REFERENCES d2_projects(id) ON DELETE SET NULL,
  contact_id INTEGER REFERENCES d2_contacts(id) ON DELETE SET NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  event_type VARCHAR(50) DEFAULT 'meeting',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  location VARCHAR(500),
  reminder_minutes INTEGER DEFAULT 30,
  reminder_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_d2_events_ws ON d2_calendar_events(workspace_id);
CREATE INDEX IF NOT EXISTS idx_d2_events_start ON d2_calendar_events(start_time);

-- Notifications
CREATE TABLE IF NOT EXISTS d2_notifications (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  user_email VARCHAR(255),
  type VARCHAR(50) NOT NULL,
  title VARCHAR(500),
  message TEXT,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  read BOOLEAN DEFAULT false,
  email_sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_d2_notif_user ON d2_notifications(user_email, read);

-- Activity Log
CREATE TABLE IF NOT EXISTS d2_activity_log (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  user_email VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INTEGER,
  entity_name VARCHAR(500),
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_d2_activity_ws ON d2_activity_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_d2_activity_created ON d2_activity_log(created_at DESC);

-- NLP Command Log
CREATE TABLE IF NOT EXISTS d2_nlp_commands (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  user_email VARCHAR(255),
  input_text TEXT NOT NULL,
  intent VARCHAR(100),
  entities JSONB DEFAULT '{}',
  action_taken VARCHAR(255),
  response TEXT,
  success BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default workspace
INSERT INTO d2_workspaces (name, description) VALUES ('Digit2AI', 'Digit2AI Main Workspace')
ON CONFLICT DO NOTHING;

-- Seed default verticals
INSERT INTO d2_verticals (workspace_id, name, slug, description, color, icon, sort_order) VALUES
(1, 'RinglyPro', 'ringlypro', 'Voice AI & CRM Platform', '#6366f1', 'phone', 1),
(1, 'Healthcare', 'healthcare', 'Healthcare AI Solutions', '#10b981', 'heart', 2),
(1, 'Motorsport', 'motorsport', 'Racing & Motorsport Tech', '#ef4444', 'flag', 3),
(1, 'Manufacturing', 'manufacturing', 'Industrial & Manufacturing', '#f59e0b', 'cog', 4),
(1, 'Partnerships', 'partnerships', 'Strategic Partnerships', '#8b5cf6', 'handshake', 5),
(1, 'Internal', 'internal', 'Internal Projects & Ops', '#64748b', 'building', 6)
ON CONFLICT DO NOTHING;
