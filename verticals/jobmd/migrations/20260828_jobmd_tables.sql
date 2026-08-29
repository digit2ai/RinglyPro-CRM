-- JobMD.io — canonical schema.
-- Tables auto-create on boot via sync({alter:false}); this file is the
-- authoritative DDL. Every table carries tenant_id. Shared CRM database, so
-- every table is jm_ prefixed. Regenerate after a model change.

CREATE TABLE IF NOT EXISTS jm_accounts (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  role                        VARCHAR(255) NOT NULL,
  email                       VARCHAR(255) NOT NULL,
  name                        VARCHAR(255) NOT NULL,
  password_hash               VARCHAR(255) NOT NULL,
  org_id                      INTEGER,
  status                      VARCHAR(255) DEFAULT 'active'::character varying,
  last_login_at               TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS jm_accounts_email_key ON public.jm_accounts USING btree (email);
CREATE INDEX IF NOT EXISTS jm_accounts_org ON public.jm_accounts USING btree (org_id);
CREATE INDEX IF NOT EXISTS jm_accounts_tenant_role ON public.jm_accounts USING btree (tenant_id, role);

CREATE TABLE IF NOT EXISTS jm_build_plans (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  label                       VARCHAR(255),
  plan                        JSONB NOT NULL,
  evidence                    JSONB,
  counts                      JSONB,
  verification                JSONB,
  composed_by                 VARCHAR(255) DEFAULT 'deterministic'::character varying,
  is_simulated                BOOLEAN DEFAULT true,
  model                       VARCHAR(255),
  duration_ms                 INTEGER,
  created_by                  INTEGER,
  created_at                  TIMESTAMPTZ,
  kind                        VARCHAR(64) DEFAULT 'build_plan'::character varying
);
CREATE INDEX IF NOT EXISTS jm_build_plans_tenant_created ON public.jm_build_plans USING btree (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS jm_build_plans_tenant_id ON public.jm_build_plans USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS jm_build_plans_tenant_id_created_at ON public.jm_build_plans USING btree (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS jm_leads (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  first_name                  VARCHAR(255) NOT NULL,
  last_name                   VARCHAR(255),
  email                       VARCHAR(255) NOT NULL,
  phone                       VARCHAR(255),
  role                        VARCHAR(255),
  message                     TEXT,
  source                      VARCHAR(255) DEFAULT 'landing'::character varying,
  ip_hash                     VARCHAR(255),
  status                      VARCHAR(255) DEFAULT 'new'::character varying,
  created_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jm_leads_tenant_created ON public.jm_leads USING btree (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS jm_leads_tenant_id ON public.jm_leads USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS jm_leads_tenant_id_created_at ON public.jm_leads USING btree (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS jm_matches (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  physician_id                INTEGER NOT NULL,
  position_id                 INTEGER NOT NULL,
  score                       INTEGER NOT NULL,
  dimensions                  JSONB NOT NULL,
  reasons                     JSONB DEFAULT '[]'::jsonb,
  gaps                        JSONB DEFAULT '[]'::jsonb,
  computed_at                 TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS jm_matches_pair ON public.jm_matches USING btree (physician_id, position_id);
CREATE INDEX IF NOT EXISTS jm_matches_physician ON public.jm_matches USING btree (physician_id);
CREATE INDEX IF NOT EXISTS jm_matches_position ON public.jm_matches USING btree (position_id);

CREATE TABLE IF NOT EXISTS jm_organizations (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  name                        VARCHAR(255) NOT NULL,
  org_type                    VARCHAR(255) DEFAULT 'hospital'::character varying,
  health_system               VARCHAR(255),
  city                        VARCHAR(255),
  state                       VARCHAR(255),
  facilities                  INTEGER,
  robotics_platforms          JSONB DEFAULT '[]'::jsonb,
  recruiting_priorities       TEXT,
  created_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jm_orgs_tenant_state ON public.jm_organizations USING btree (tenant_id, state);

CREATE TABLE IF NOT EXISTS jm_physicians (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  account_id                  INTEGER NOT NULL,
  specialty                   VARCHAR(255),
  subspecialty                VARCHAR(255),
  education                   TEXT,
  residency                   VARCHAR(255),
  fellowship                  VARCHAR(255),
  board_certified             BOOLEAN,
  board_certifications        JSONB DEFAULT '[]'::jsonb,
  licenses                    JSONB DEFAULT '[]'::jsonb,
  years_experience            INTEGER,
  current_organization        VARCHAR(255),
  previous_organizations      JSONB DEFAULT '[]'::jsonb,
  leadership                  TEXT,
  clinical_interests          JSONB DEFAULT '[]'::jsonb,
  procedure_expertise         JSONB DEFAULT '[]'::jsonb,
  robotic_platforms           JSONB DEFAULT '[]'::jsonb,
  robotic_years               INTEGER,
  robotic_cases_annual        INTEGER,
  robotics_program_leadership BOOLEAN,
  academic_experience         TEXT,
  publications                INTEGER,
  geographic_preferences      JSONB DEFAULT '[]'::jsonb,
  relocation_willing          BOOLEAN,
  compensation_expectation    INTEGER,
  employment_preference       VARCHAR(255),
  call_tolerance              VARCHAR(255),
  available_from              DATE,
  credentialing_notes         TEXT,
  recruitment_status          VARCHAR(255) DEFAULT 'open_to_offers'::character varying,
  recruiter_notes             TEXT,
  ai_summary                  TEXT,
  ai_summary_by               VARCHAR(255),
  cv_text                     TEXT,
  source                      VARCHAR(255) DEFAULT 'form'::character varying,
  created_at                  TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jm_physicians_account ON public.jm_physicians USING btree (account_id);
CREATE UNIQUE INDEX IF NOT EXISTS jm_physicians_account_id_key ON public.jm_physicians USING btree (account_id);
CREATE INDEX IF NOT EXISTS jm_physicians_tenant_specialty ON public.jm_physicians USING btree (tenant_id, specialty);

CREATE TABLE IF NOT EXISTS jm_pipeline (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  physician_id                INTEGER NOT NULL,
  position_id                 INTEGER NOT NULL,
  stage                       VARCHAR(255) DEFAULT 'Prospect'::character varying NOT NULL,
  set_by_kind                 VARCHAR(255) DEFAULT 'person'::character varying,
  set_by                      VARCHAR(255),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ,
  updated_at                  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS jm_pipeline_pair ON public.jm_pipeline USING btree (physician_id, position_id);
CREATE INDEX IF NOT EXISTS jm_pipeline_physician ON public.jm_pipeline USING btree (physician_id);
CREATE INDEX IF NOT EXISTS jm_pipeline_position ON public.jm_pipeline USING btree (position_id);

CREATE TABLE IF NOT EXISTS jm_pipeline_events (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  pipeline_id                 INTEGER NOT NULL,
  from_stage                  VARCHAR(255),
  to_stage                    VARCHAR(255) NOT NULL,
  actor_kind                  VARCHAR(255),
  actor                       VARCHAR(255),
  created_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jm_pipeline_events_pipeline ON public.jm_pipeline_events USING btree (pipeline_id);

CREATE TABLE IF NOT EXISTS jm_plan_runs (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  status                      VARCHAR(255) NOT NULL,
  composed_by                 VARCHAR(255),
  violations                  JSONB,
  rejected_rewrites           JSONB,
  duration_ms                 INTEGER,
  error                       TEXT,
  created_at                  TIMESTAMPTZ,
  kind                        VARCHAR(64) DEFAULT 'build_plan'::character varying
);
CREATE INDEX IF NOT EXISTS jm_plan_runs_tenant_created ON public.jm_plan_runs USING btree (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS jm_plan_runs_tenant_id ON public.jm_plan_runs USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS jm_plan_runs_tenant_id_created_at ON public.jm_plan_runs USING btree (tenant_id, created_at);

CREATE TABLE IF NOT EXISTS jm_positions (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  org_id                      INTEGER NOT NULL,
  title                       VARCHAR(255) NOT NULL,
  specialty                   VARCHAR(255) NOT NULL,
  subspecialty                VARCHAR(255),
  city                        VARCHAR(255),
  state                       VARCHAR(255),
  employment_model            VARCHAR(255),
  compensation_min            INTEGER,
  compensation_max            INTEGER,
  call_schedule               VARCHAR(255),
  relocation_assistance       BOOLEAN DEFAULT false,
  robotics_required           BOOLEAN DEFAULT false,
  robotic_platforms           JSONB DEFAULT '[]'::jsonb,
  min_years_experience        INTEGER DEFAULT 0,
  board_certification_requiredBOOLEAN DEFAULT true,
  procedures                  JSONB DEFAULT '[]'::jsonb,
  start_date                  DATE,
  status                      VARCHAR(255) DEFAULT 'open'::character varying,
  created_by                  INTEGER,
  created_at                  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS jm_positions_org ON public.jm_positions USING btree (org_id);
CREATE INDEX IF NOT EXISTS jm_positions_tenant_specialty ON public.jm_positions USING btree (tenant_id, specialty);
CREATE INDEX IF NOT EXISTS jm_positions_tenant_status ON public.jm_positions USING btree (tenant_id, status);

CREATE TABLE IF NOT EXISTS jm_users (
  id                          SERIAL,
  tenant_id                   INTEGER DEFAULT 1 NOT NULL,
  email                       VARCHAR(255) NOT NULL,
  name                        VARCHAR(255),
  role                        VARCHAR(255) DEFAULT 'admin'::character varying,
  password_hash               VARCHAR(255) NOT NULL,
  created_at                  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS jm_users_email_key ON public.jm_users USING btree (email);
CREATE INDEX IF NOT EXISTS jm_users_tenant ON public.jm_users USING btree (tenant_id);
CREATE INDEX IF NOT EXISTS jm_users_tenant_id ON public.jm_users USING btree (tenant_id);

