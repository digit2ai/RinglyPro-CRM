-- Valle Milagro: esquema completo. Se ejecuta en cada arranque (src/db.js),
-- bajo un candado, así que CADA sentencia debe ser idempotente.
-- Toda tabla lleva tenant_id NOT NULL. El prefijo es vm_.

CREATE TABLE IF NOT EXISTS vm_members (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  member_no INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  email_verified_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ,
  dues_status TEXT NOT NULL DEFAULT 'sin_registro',
  status TEXT NOT NULL DEFAULT 'pending',
  is_founder BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_members_email ON vm_members (tenant_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_members_no ON vm_members (tenant_id, member_no) WHERE member_no IS NOT NULL;

CREATE TABLE IF NOT EXISTS vm_counters (
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  value INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS vm_admins (
  tenant_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, member_id)
);

CREATE TABLE IF NOT EXISTS vm_login_codes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  link_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_login_codes_email ON vm_login_codes (tenant_id, email, created_at);
CREATE INDEX IF NOT EXISTS ix_vm_login_codes_link ON vm_login_codes (link_hash);

CREATE TABLE IF NOT EXISTS vm_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  member_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_sessions_token ON vm_sessions (token_hash);
CREATE INDEX IF NOT EXISTS ix_vm_sessions_member ON vm_sessions (tenant_id, member_id);

CREATE TABLE IF NOT EXISTS vm_consents (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  version TEXT NOT NULL,
  text TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS ix_vm_consents_member ON vm_consents (tenant_id, member_id);

CREATE TABLE IF NOT EXISTS vm_projects (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  municipio TEXT NOT NULL,
  entity TEXT,
  sector TEXT NOT NULL DEFAULT 'publico',
  layer TEXT NOT NULL DEFAULT 'Obras públicas',
  category TEXT,
  stage INTEGER NOT NULL DEFAULT 0,
  progress_pct INTEGER,
  delivery_date DATE,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  contributors_count INTEGER,
  fiduciary TEXT,
  quota_committed_cop BIGINT,
  work_value_cop BIGINT,
  u_need INTEGER,
  u_people INTEGER,
  u_quake INTEGER,
  u_time INTEGER,
  u_viability INTEGER,
  status TEXT NOT NULL DEFAULT 'draft',
  origin TEXT NOT NULL DEFAULT 'admin',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_projects_tenant ON vm_projects (tenant_id, status, sector);

CREATE TABLE IF NOT EXISTS vm_interests (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  contacted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_interests ON vm_interests (tenant_id, member_id, project_id);

CREATE TABLE IF NOT EXISTS vm_follows (
  tenant_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  project_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, member_id, project_id)
);

CREATE TABLE IF NOT EXISTS vm_submissions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  category TEXT NOT NULL,
  municipio TEXT NOT NULL,
  place TEXT,
  map_point TEXT,
  conditions TEXT,
  population INTEGER,
  time_unattended TEXT,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'en_revision',
  project_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_submissions_tenant ON vm_submissions (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS vm_files (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  owner_kind TEXT NOT NULL,
  owner_id INTEGER,
  member_id INTEGER,
  mime TEXT NOT NULL,
  bytes BYTEA NOT NULL,
  size INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_files_owner ON vm_files (tenant_id, owner_kind, owner_id);

CREATE TABLE IF NOT EXISTS vm_home_photos (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL,
  caption TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_home_photos_tenant ON vm_home_photos (tenant_id, active, position);

CREATE TABLE IF NOT EXISTS vm_kb_docs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'doc',
  text TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_kb_docs_tenant ON vm_kb_docs (tenant_id, active);

CREATE TABLE IF NOT EXISTS vm_scout_directives (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  topics TEXT NOT NULL DEFAULT '',
  sources TEXT NOT NULL DEFAULT '',
  municipios TEXT NOT NULL DEFAULT '',
  frequency_hours INTEGER NOT NULL DEFAULT 24,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_scout_directives_tenant ON vm_scout_directives (tenant_id, active);

CREATE TABLE IF NOT EXISTS vm_scout_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'manual',
  status TEXT NOT NULL DEFAULT 'running',
  searches INTEGER NOT NULL DEFAULT 0,
  found INTEGER NOT NULL DEFAULT 0,
  discarded INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_vm_scout_runs_tenant ON vm_scout_runs (tenant_id, started_at);

CREATE TABLE IF NOT EXISTS vm_findings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  run_id INTEGER,
  type TEXT NOT NULL DEFAULT 'noticia',
  tema TEXT NOT NULL DEFAULT 'Sin clasificar',
  municipio TEXT,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  medio TEXT,
  published_on DATE,
  source_url TEXT,
  url_seen BOOLEAN NOT NULL DEFAULT FALSE,
  flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending',
  edition_date DATE,
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_findings_tenant ON vm_findings (tenant_id, status, edition_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_findings_url ON vm_findings (tenant_id, source_url) WHERE source_url IS NOT NULL AND is_demo = FALSE;

CREATE TABLE IF NOT EXISTS vm_editions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  edition_date DATE NOT NULL,
  headline TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  today_line TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  composed_by TEXT NOT NULL DEFAULT 'admin',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  published_by INTEGER,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_vm_editions_date ON vm_editions (tenant_id, edition_date);

CREATE TABLE IF NOT EXISTS vm_texts (
  tenant_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_by INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS vm_audit (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  actor_id INTEGER,
  action TEXT NOT NULL,
  ref TEXT,
  detail JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_vm_audit_tenant ON vm_audit (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS vm_job_runs (
  tenant_id INTEGER NOT NULL,
  job TEXT NOT NULL,
  run_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, job, run_key)
);
