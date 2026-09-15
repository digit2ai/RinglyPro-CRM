-- BuyersLine MVP revision after the 2026-09-15 review (idempotent; runs on every boot after 20260913).
--   * A search is created the moment the five intake questions are answered, so the report shows before
--     any contact details are asked. A lead is created later, from the contact form under the report.
--   * Every answer except the area can be skipped, so the lead columns that held them become nullable.
--   * "Are you working with an agent?" and "Have you visited a new-construction site?" are plain yes/no.
--   * Research never ends in a failure screen: a run that cannot reach the model falls back to the last good
--     run for the area, and every promotion row carries the compliance agent's decision.
--   * The private-preview sign-in gets real accounts (email + password), approved by the owner.

CREATE TABLE IF NOT EXISTS nca_searches (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  token VARCHAR(40) NOT NULL,
  lang VARCHAR(2) NOT NULL DEFAULT 'en',
  area_input VARCHAR(200),
  zip VARCHAR(10),
  city VARCHAR(120),
  county VARCHAR(120),
  state VARCHAR(40),
  max_price NUMERIC(12,2),
  max_monthly NUMERIC(10,2),
  down_payment NUMERIC(12,2),
  move_timeline VARCHAR(20),
  financing_type VARCHAR(20),
  research_run_id INTEGER REFERENCES nca_research_runs(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES nca_leads(id) ON DELETE SET NULL,
  ip_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_searches_token_uq ON nca_searches (token);
CREATE INDEX IF NOT EXISTS nca_searches_tenant_idx ON nca_searches (tenant_id, created_at DESC);

ALTER TABLE nca_leads ALTER COLUMN max_price DROP NOT NULL;
ALTER TABLE nca_leads ALTER COLUMN move_timeline DROP NOT NULL;
ALTER TABLE nca_leads ALTER COLUMN financing_type DROP NOT NULL;
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS visited_site BOOLEAN;
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS contact_preference VARCHAR(10);
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS search_id INTEGER;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nca_leads_has_agent_check'
             AND pg_get_constraintdef(oid) NOT LIKE '%''yes''%') THEN
    ALTER TABLE nca_leads DROP CONSTRAINT nca_leads_has_agent_check;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'nca_leads_has_agent_check') THEN
    ALTER TABLE nca_leads ADD CONSTRAINT nca_leads_has_agent_check CHECK (has_agent IN ('no','yes','yes_under_agreement','yes_informal'));
  END IF;
END $$;

ALTER TABLE nca_research_runs ADD COLUMN IF NOT EXISTS fallback_run_id INTEGER;
ALTER TABLE nca_research_runs ADD COLUMN IF NOT EXISTS schools JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE nca_research_runs ADD COLUMN IF NOT EXISTS trigger VARCHAR(12) NOT NULL DEFAULT 'buyer';
ALTER TABLE nca_research_rows ADD COLUMN IF NOT EXISTS compliance_status VARCHAR(10);
ALTER TABLE nca_research_rows ADD COLUMN IF NOT EXISTS compliance_notes JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Once-a-day jobs (the morning research refresh): one row per job per Eastern date, so two instances
-- cannot both run it.
CREATE TABLE IF NOT EXISTS nca_job_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  job VARCHAR(40) NOT NULL,
  run_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_job_runs_uq ON nca_job_runs (tenant_id, job, run_date);

-- Private-preview accounts. A person creates one (maker); it stays pending until the owner approves it
-- (checker). Password resets are stateless tokens signed with the current password hash, so nothing to store.
CREATE TABLE IF NOT EXISTS nca_site_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  email VARCHAR(200) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','disabled')),
  decided_by VARCHAR(200),
  decided_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_site_users_email_uq ON nca_site_users (tenant_id, LOWER(email));
CREATE INDEX IF NOT EXISTS nca_site_users_status_idx ON nca_site_users (tenant_id, status);
