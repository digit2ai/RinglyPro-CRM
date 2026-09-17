-- SpeakUp AI Factory — canonical schema (voice -> architect -> GitHub branch/PR).
-- Created on boot by sync({alter:false}) + the idempotent ALTERs in src/index.js;
-- this file is the from-scratch source of truth. All tables tenant-scoped, su_ prefix.

-- Sessions: existing recordings gain a mode, a project and participants.
ALTER TABLE su_recordings ADD COLUMN IF NOT EXISTS mode VARCHAR(20);          -- meeting|note|command|architect (NULL = legacy)
ALTER TABLE su_recordings ADD COLUMN IF NOT EXISTS project_key VARCHAR(60);
ALTER TABLE su_recordings ADD COLUMN IF NOT EXISTS participants JSONB DEFAULT '[]';
CREATE INDEX IF NOT EXISTS su_recordings_tenant_created_idx ON su_recordings(tenant_id, created_at);
CREATE INDEX IF NOT EXISTS su_recordings_tenant_project_idx ON su_recordings(tenant_id, project_key);

-- Project Registry: routing is data.
CREATE TABLE IF NOT EXISTS su_projects (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL,
  key               VARCHAR(60) NOT NULL,
  name              VARCHAR(120) NOT NULL,
  aliases           JSONB DEFAULT '[]',
  repo              VARCHAR(200),
  default_branch    VARCHAR(100) DEFAULT 'main',
  path_scope        JSONB DEFAULT '[]',
  deployment        VARCHAR(200),
  architect_agent   VARCHAR(80) DEFAULT 'ringlypro-architect',
  knowledge_sources JSONB DEFAULT '[]',
  allowed_actions   JSONB DEFAULT '[]',   -- read|prepare|execute|merge
  test_commands     JSONB DEFAULT '[]',   -- node|npx jest|npm test only, no shell
  workflow_file     VARCHAR(120) DEFAULT 'speakup-factory.yml',
  enabled           BOOLEAN DEFAULT TRUE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS su_projects_tenant_idx ON su_projects(tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS su_projects_tenant_key_uq ON su_projects(tenant_id, key);

-- Meeting intelligence: classified items, each with a verbatim quote.
CREATE TABLE IF NOT EXISTS su_meeting_intel (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  recording_id INTEGER NOT NULL,
  project_key  VARCHAR(60),
  data         JSONB DEFAULT '{}',
  composed_by  VARCHAR(60),
  is_simulated BOOLEAN DEFAULT FALSE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS su_meeting_intel_tenant_idx ON su_meeting_intel(tenant_id);
CREATE INDEX IF NOT EXISTS su_meeting_intel_rec_idx ON su_meeting_intel(recording_id);

-- Every interpreted command (private phrase redacted, confirm tokens never stored).
CREATE TABLE IF NOT EXISTS su_commands (
  id                    SERIAL PRIMARY KEY,
  tenant_id             INTEGER NOT NULL,
  user_id               INTEGER,
  mode                  VARCHAR(20),
  transcript            TEXT,
  normalized            TEXT,
  intent                VARCHAR(40),
  classified_by         VARCHAR(30),
  project_key           VARCHAR(60),
  context_recording_ids JSONB DEFAULT '[]',
  job_id                INTEGER,
  status                VARCHAR(20) DEFAULT 'done',
  result                JSONB DEFAULT '{}',
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS su_commands_tenant_idx ON su_commands(tenant_id);
CREATE INDEX IF NOT EXISTS su_commands_tenant_created_idx ON su_commands(tenant_id, created_at);

-- Persistent engineering jobs.
CREATE TABLE IF NOT EXISTS su_jobs (
  id                   SERIAL PRIMARY KEY,
  tenant_id            INTEGER NOT NULL,
  user_id              INTEGER,
  command_id           INTEGER,
  project_key          VARCHAR(60),
  repo                 VARCHAR(200),
  base_branch          VARCHAR(100),
  title                VARCHAR(200),
  status               VARCHAR(30) DEFAULT 'QUEUED',
  source_recording_ids JSONB DEFAULT '[]',
  spec                 JSONB DEFAULT '{}',
  revisions            JSONB DEFAULT '[]',
  plan                 JSONB DEFAULT '{}',
  plan_md              TEXT,
  plan_hash            VARCHAR(64),
  plan_composed_by     VARCHAR(60),
  repo_sha             VARCHAR(64),
  approved_by          VARCHAR(200),
  approved_at          TIMESTAMPTZ,
  branch               VARCHAR(120),
  commit_sha           VARCHAR(64),
  pr_number            INTEGER,
  pr_url               VARCHAR(300),
  pr_draft             BOOLEAN,
  run_url              VARCHAR(300),
  files_changed        INTEGER,
  tests                JSONB DEFAULT '{}',
  merge_sha            VARCHAR(64),
  deploy_status        VARCHAR(60),
  error                TEXT,
  callback_nonces      JSONB DEFAULT '[]',
  poll_claimed_at      TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS su_jobs_tenant_idx ON su_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS su_jobs_tenant_status_idx ON su_jobs(tenant_id, status);
CREATE INDEX IF NOT EXISTS su_jobs_status_updated_idx ON su_jobs(status, updated_at);

-- Append-only audit trail.
CREATE TABLE IF NOT EXISTS su_audit (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  user_id     INTEGER,
  actor       VARCHAR(200),
  action      VARCHAR(60),
  entity      VARCHAR(30),
  entity_id   INTEGER,
  from_status VARCHAR(30),
  to_status   VARCHAR(30),
  detail      JSONB DEFAULT '{}',
  ip_hash     VARCHAR(64),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS su_audit_tenant_idx ON su_audit(tenant_id);
CREATE INDEX IF NOT EXISTS su_audit_entity_idx ON su_audit(entity, entity_id);

-- Security review 2026-09-15: registry snapshot at PREPARE, verification results.
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS workflow_file VARCHAR(120);
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS revisions JSONB DEFAULT '[]';
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS test_commands JSONB DEFAULT '[]';
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS path_scope JSONB DEFAULT '[]';
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS changed_files JSONB DEFAULT '[]';
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS suite_modified BOOLEAN;
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS brief_token_used_at TIMESTAMPTZ;

-- Live factory activity (what Claude is doing), private to SpeakUp.
CREATE TABLE IF NOT EXISTS su_job_events (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL,
  job_id     INTEGER NOT NULL,
  kind       VARCHAR(20),
  text       TEXT,
  detail     JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS su_job_events_job_idx ON su_job_events(job_id, id);
CREATE INDEX IF NOT EXISTS su_job_events_tenant_idx ON su_job_events(tenant_id);

-- Console jobs run without a second approval tap (SPEAKUP_AUTO_RUN=off restores it).
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS auto_run BOOLEAN DEFAULT FALSE;
-- The console works on the whole repository, not just src/.
UPDATE su_projects SET path_scope = '[]'::jsonb WHERE key = 'ringlypro' AND path_scope = '["src"]'::jsonb;

-- Screenshots pasted into the console (Render's disk is ephemeral).
CREATE TABLE IF NOT EXISTS su_uploads (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL,
  user_id    INTEGER,
  job_id     INTEGER,
  name       VARCHAR(120),
  mime       VARCHAR(60),
  size       INTEGER,
  bytes      BYTEA,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS su_uploads_tenant_idx ON su_uploads(tenant_id);
CREATE INDEX IF NOT EXISTS su_uploads_job_idx ON su_uploads(job_id);
ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]';

ALTER TABLE su_jobs ADD COLUMN IF NOT EXISTS baseline_ok BOOLEAN;
