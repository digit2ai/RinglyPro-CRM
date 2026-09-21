-- Claude Code tab (autodev.digit2ai.com) — canonical schema.
-- Every table is multi-tenant. Applied idempotently on boot by src/index.js;
-- this file is the from-scratch source of truth and must stay idempotent.

CREATE TABLE IF NOT EXISTS cc_runs (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  thread_id       INTEGER,
  repo_full_name  TEXT NOT NULL,
  base_branch     TEXT DEFAULT 'main',
  work_branch     TEXT,
  brief           TEXT NOT NULL,
  source          TEXT DEFAULT 'manual',          -- manual | speakup | factory
  source_ref      TEXT,                            -- meeting id / factory job id
  status          TEXT DEFAULT 'queued',           -- queued|cloning|running|testing|pushing|pr_open|merged|deployed|failed|cancelled
  session_id      TEXT,
  summary         TEXT,
  pr_url          TEXT,
  commit_sha      TEXT,
  deploy_url      TEXT,
  cost_usd        NUMERIC(10,4),
  tokens_in       INTEGER,
  tokens_out      INTEGER,
  turns           INTEGER,
  error           TEXT,
  started_at      TIMESTAMPTZ,
  finished_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cc_runs_tenant_idx  ON cc_runs(tenant_id, id);
CREATE INDEX IF NOT EXISTS cc_runs_status_idx  ON cc_runs(status);

CREATE TABLE IF NOT EXISTS cc_run_events (
  id       SERIAL PRIMARY KEY,
  run_id   INTEGER NOT NULL,
  ts       TIMESTAMPTZ DEFAULT now(),
  kind     TEXT,                                   -- system|assistant|tool_use|tool_result|result|log
  payload  JSONB DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS cc_run_events_run_idx ON cc_run_events(run_id, id);

CREATE TABLE IF NOT EXISTS cc_threads (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  user_id         INTEGER NOT NULL,
  repo_full_name  TEXT NOT NULL,
  base_branch     TEXT DEFAULT 'main',
  work_branch     TEXT,
  pr_url          TEXT,
  pr_number       INTEGER,
  session_id      TEXT,
  title           TEXT,
  archived        BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now(),
  last_run_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS cc_threads_tenant_idx ON cc_threads(tenant_id, id);

CREATE TABLE IF NOT EXISTS cc_repos (
  id                   SERIAL PRIMARY KEY,
  tenant_id            INTEGER NOT NULL,
  repo_full_name       TEXT NOT NULL,
  default_branch       TEXT,
  render_service_id    TEXT,
  has_architect_skill  BOOLEAN,
  can_push             BOOLEAN,
  last_synced_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_repos_tenant_repo_uniq ON cc_repos(tenant_id, repo_full_name);
