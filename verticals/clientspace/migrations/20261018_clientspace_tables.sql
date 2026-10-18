-- Client Workspace (cws_). Canonical schema; src/schema.js runs the same
-- statements idempotently on boot.
CREATE TABLE IF NOT EXISTS cws_workspaces (
  id SERIAL PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cws_workspaces_slug_uq ON cws_workspaces (slug);

CREATE TABLE IF NOT EXISTS cws_users (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER REFERENCES cws_workspaces(id),
  email VARCHAR(200) NOT NULL,
  name VARCHAR(160),
  role VARCHAR(20) NOT NULL DEFAULT 'member',
  password_hash VARCHAR(200),
  must_change BOOLEAN NOT NULL DEFAULT FALSE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cws_users_email_uq ON cws_users (LOWER(email));
CREATE INDEX IF NOT EXISTS cws_users_ws_idx ON cws_users (workspace_id);

CREATE TABLE IF NOT EXISTS cws_projects (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES cws_workspaces(id),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'planeado',
  start_date DATE,
  end_date DATE,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cws_projects_ws_idx ON cws_projects (workspace_id);

CREATE TABLE IF NOT EXISTS cws_tasks (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES cws_workspaces(id),
  project_id INTEGER NOT NULL REFERENCES cws_projects(id),
  title VARCHAR(300) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pendiente',
  assignee VARCHAR(160),
  due_date DATE,
  position INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cws_tasks_ws_proj_idx ON cws_tasks (workspace_id, project_id);

CREATE TABLE IF NOT EXISTS cws_files (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES cws_workspaces(id),
  project_id INTEGER REFERENCES cws_projects(id),
  category VARCHAR(20) NOT NULL DEFAULT 'documento',
  title VARCHAR(250) NOT NULL,
  filename VARCHAR(250) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  size INTEGER NOT NULL,
  sha256 VARCHAR(64) NOT NULL,
  data BYTEA NOT NULL,
  amount NUMERIC(14,2),
  currency VARCHAR(3),
  invoice_status VARCHAR(20),
  due_date DATE,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cws_files_ws_idx ON cws_files (workspace_id, category);

CREATE TABLE IF NOT EXISTS cws_activity (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER,
  user_id INTEGER,
  user_email VARCHAR(200),
  action VARCHAR(60) NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS cws_activity_ws_idx ON cws_activity (workspace_id, created_at DESC);
