-- AI Discovery — canonical schema (dsc_ prefix, every table tenant-scoped).
-- Generated from verticals/discovery/src/models.js. Applied idempotently on boot;
-- this file is the record, not the mechanism.

CREATE TABLE IF NOT EXISTS dsc_accounts (
  id SERIAL NOT NULL,
  tenant_id INTEGER,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(255) DEFAULT 'owner'::character varying,
  lang VARCHAR(255) DEFAULT 'en'::character varying,
  company_name VARCHAR(255) NOT NULL,
  industry VARCHAR(255),
  country VARCHAR(255),
  headcount INTEGER,
  revenue_band VARCHAR(255),
  quote_requested_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS dsc_accounts_email_key ON public.dsc_accounts USING btree (email);
CREATE INDEX IF NOT EXISTS dsc_accounts_tenant_id ON public.dsc_accounts USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS dsc_api_keys (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  name VARCHAR(255),
  prefix VARCHAR(255) NOT NULL,
  key_hash VARCHAR(255) NOT NULL,
  scopes JSONB DEFAULT '["ingest"]'::jsonb,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS dsc_api_keys_key_hash_key ON public.dsc_api_keys USING btree (key_hash);
CREATE INDEX IF NOT EXISTS dsc_api_keys_tenant_id ON public.dsc_api_keys USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS dsc_api_keys_key_hash ON public.dsc_api_keys USING btree (key_hash);

CREATE TABLE IF NOT EXISTS dsc_sources (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  kind VARCHAR(255) NOT NULL,
  provider VARCHAR(255),
  label VARCHAR(255),
  status VARCHAR(255) DEFAULT 'active'::character varying,
  capture_count INTEGER DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dsc_sources_tenant_id ON public.dsc_sources USING btree (tenant_id);

CREATE TABLE IF NOT EXISTS dsc_captures (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  source_id INTEGER,
  external_ref VARCHAR(255),
  label VARCHAR(255),
  actor_ref VARCHAR(255),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER DEFAULT 0,
  step_count INTEGER DEFAULT 0,
  app_summary JSONB DEFAULT '[]'::jsonb,
  fingerprint VARCHAR(255),
  redaction_report JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(255) DEFAULT 'received'::character varying,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dsc_captures_tenant_id ON public.dsc_captures USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS dsc_captures_tenant_id_fingerprint ON public.dsc_captures USING btree (tenant_id, fingerprint);
CREATE INDEX IF NOT EXISTS dsc_captures_tenant_id_external_ref ON public.dsc_captures USING btree (tenant_id, external_ref);

CREATE TABLE IF NOT EXISTS dsc_steps (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  capture_id INTEGER NOT NULL,
  seq INTEGER DEFAULT 0,
  app VARCHAR(255),
  host VARCHAR(255),
  path_shape VARCHAR(255),
  action VARCHAR(255),
  target_role VARCHAR(255),
  dwell_ms INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dsc_steps_tenant_id_capture_id ON public.dsc_steps USING btree (tenant_id, capture_id);

CREATE TABLE IF NOT EXISTS dsc_processes (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(255) DEFAULT 'proposed'::character varying,
  origin VARCHAR(255) DEFAULT 'derived'::character varying,
  people INTEGER,
  hours_per_week DOUBLE PRECISION,
  hours_source VARCHAR(255) DEFAULT 'measured'::character varying,
  observed_runs INTEGER DEFAULT 0,
  observed_window_days INTEGER DEFAULT 0,
  median_run_minutes DOUBLE PRECISION,
  apps JSONB DEFAULT '[]'::jsonb,
  fingerprints JSONB DEFAULT '[]'::jsonb,
  evidence JSONB DEFAULT '{}'::jsonb,
  loaded_hourly_cost DOUBLE PRECISION,
  customer_facing BOOLEAN,
  involves_regulated_data BOOLEAN,
  error_tolerance VARCHAR(255),
  confirmed_by INTEGER,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dsc_processes_tenant_id ON public.dsc_processes USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS dsc_processes_tenant_id_status ON public.dsc_processes USING btree (tenant_id, status);

CREATE TABLE IF NOT EXISTS dsc_answers (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  section VARCHAR(255) NOT NULL,
  payload JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dsc_answers_tenant_id_section ON public.dsc_answers USING btree (tenant_id, section);

CREATE TABLE IF NOT EXISTS dsc_findings (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  evaluation_id INTEGER,
  code VARCHAR(255),
  severity VARCHAR(255),
  title VARCHAR(255),
  explanation TEXT,
  dollar_impact VARCHAR(255),
  source VARCHAR(255),
  process_id INTEGER,
  evidence JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dsc_findings_tenant_id ON public.dsc_findings USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS dsc_findings_tenant_id_evaluation_id ON public.dsc_findings USING btree (tenant_id, evaluation_id);

CREATE TABLE IF NOT EXISTS dsc_evaluations (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  account_id INTEGER,
  version INTEGER DEFAULT 1,
  inputs JSONB DEFAULT '{}'::jsonb,
  scorecard JSONB DEFAULT '{}'::jsonb,
  phases JSONB DEFAULT '[]'::jsonb,
  diagram JSONB DEFAULT '{}'::jsonb,
  safe_next_step JSONB DEFAULT '{}'::jsonb,
  executive_summary TEXT,
  findings JSONB DEFAULT '[]'::jsonb,
  coverage JSONB DEFAULT '{}'::jsonb,
  narrative_by VARCHAR(255) DEFAULT 'heuristic'::character varying,
  is_simulated BOOLEAN DEFAULT false,
  share_token VARCHAR(255),
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dsc_evaluations_tenant_id ON public.dsc_evaluations USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS dsc_evaluations_tenant_id_version ON public.dsc_evaluations USING btree (tenant_id, version);

CREATE TABLE IF NOT EXISTS dsc_events (
  id SERIAL NOT NULL,
  tenant_id INTEGER NOT NULL,
  kind VARCHAR(255),
  actor VARCHAR(255),
  channel VARCHAR(255),
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS dsc_events_tenant_id ON public.dsc_events USING btree (tenant_id);

