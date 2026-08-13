-- Bank Opportunity Tracker — canonical schema.
-- Multi-employer: `employer` scopes every requisition-bearing table, and
-- uniqueness is keyed on (…, employer, req_id). Citi ids are 8 digits and
-- JPMorgan's are 9, but a scheme that merely happens not to collide today is
-- not an invariant.
-- Applied idempotently on boot by verticals/citijobs/src/index.js init().
-- This file is the source of truth for a manual/DBA apply.

CREATE TABLE IF NOT EXISTS cj_users (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER,
  email          VARCHAR(255) NOT NULL UNIQUE,
  name           VARCHAR(255),
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(50) DEFAULT 'owner',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cj_profiles (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL,
  slug              VARCHAR(120) NOT NULL,
  display_name      VARCHAR(255) NOT NULL,
  headline          VARCHAR(500),
  resume_json       JSONB DEFAULT '{}'::jsonb,
  resume_text       TEXT,
  target_titles     JSONB DEFAULT '[]'::jsonb,
  target_locations  JSONB DEFAULT '[]'::jsonb,
  countries         JSONB DEFAULT '["United States"]'::jsonb,
  internal          BOOLEAN DEFAULT FALSE,
  score_threshold   INTEGER DEFAULT 70,
  -- Pay floor, compared against the TOP of a stated range. hide_unpriced is
  -- FALSE by default: a posting with no stated range is not known to be below
  -- the floor, and most Citi postings state nothing.
  min_salary_cents  BIGINT DEFAULT 14000000,
  hide_unpriced     BOOLEAN DEFAULT FALSE,
  active            BOOLEAN DEFAULT TRUE,
  settings          JSONB DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cj_profiles_tenant_slug_uq ON cj_profiles (tenant_id, slug);

-- The shared requisition pool. salary_source is 'stated' or the salary columns
-- are NULL. There is deliberately no 'estimated'.
CREATE TABLE IF NOT EXISTS cj_reqs (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL DEFAULT 1,
  employer          VARCHAR(40) NOT NULL DEFAULT 'citi',
  req_id            VARCHAR(40) NOT NULL,
  title             TEXT,
  external_path     TEXT,
  url_workday       TEXT,
  url_citi_careers  TEXT,          -- pasted by a human or NULL; never constructed
  location          TEXT,
  address           TEXT,
  remote_type       VARCHAR(60),
  time_type         VARCHAR(60),
  job_family        VARCHAR(80),
  job_family_group  VARCHAR(80),
  posted_on         DATE,
  close_date        DATE,
  salary_min_cents  BIGINT,
  salary_max_cents  BIGINT,
  salary_source     VARCHAR(20),
  description_text  TEXT,
  detail_fetched    BOOLEAN DEFAULT FALSE,
  feed_status       VARCHAR(30) DEFAULT 'open',
  first_seen_at     TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at      TIMESTAMPTZ DEFAULT NOW(),
  source            VARCHAR(20) DEFAULT 'agent',
  raw               JSONB DEFAULT '{}'::jsonb
);
CREATE UNIQUE INDEX IF NOT EXISTS cj_reqs_tenant_emp_req_uq ON cj_reqs (tenant_id, employer, req_id);
CREATE INDEX IF NOT EXISTS cj_reqs_close_idx ON cj_reqs (tenant_id, close_date);

CREATE TABLE IF NOT EXISTS cj_tracked (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL,
  profile_id        INTEGER NOT NULL,
  employer          VARCHAR(40) NOT NULL DEFAULT 'citi',
  req_id            VARCHAR(40) NOT NULL,
  status            VARCHAR(30) DEFAULT 'new',
  status_reason     VARCHAR(40),
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),
  applied_at        TIMESTAMPTZ,
  next_action       TEXT,
  next_action_due   DATE,
  notes             TEXT,
  contacts          TEXT,
  source            VARCHAR(20) DEFAULT 'agent',
  archived          BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cj_tracked_prof_emp_req_uq ON cj_tracked (profile_id, employer, req_id);
CREATE INDEX IF NOT EXISTS cj_tracked_status_idx ON cj_tracked (tenant_id, profile_id, status);

CREATE TABLE IF NOT EXISTS cj_matches (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  profile_id    INTEGER NOT NULL,
  employer      VARCHAR(40) NOT NULL DEFAULT 'citi',
  req_id        VARCHAR(40) NOT NULL,
  score         INTEGER DEFAULT 0,
  rationale     TEXT,
  scored_by     VARCHAR(20) DEFAULT 'heuristic',
  is_simulated  BOOLEAN DEFAULT TRUE,
  model         VARCHAR(80),
  cost_cents    REAL DEFAULT 0,
  scored_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cj_matches_prof_emp_req_uq ON cj_matches (profile_id, employer, req_id);

CREATE TABLE IF NOT EXISTS cj_queries (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  profile_id   INTEGER,
  employer     VARCHAR(40) NOT NULL DEFAULT 'citi',
  label        VARCHAR(160),
  search_text  VARCHAR(200) NOT NULL,
  max_pages    INTEGER DEFAULT 5,
  enabled      BOOLEAN DEFAULT TRUE,
  weight       REAL DEFAULT 1.0,
  source       VARCHAR(20) DEFAULT 'seed',
  last_run_at  TIMESTAMPTZ,
  last_total   INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cj_queries_tenant_emp_text_uq ON cj_queries (tenant_id, employer, search_text);

CREATE TABLE IF NOT EXISTS cj_runs (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL,
  run_date       DATE NOT NULL,
  started_at     TIMESTAMPTZ DEFAULT NOW(),
  finished_at    TIMESTAMPTZ,
  ok             BOOLEAN DEFAULT FALSE,
  trigger        VARCHAR(20) DEFAULT 'manual',
  queries_run    INTEGER DEFAULT 0,
  http_requests  INTEGER DEFAULT 0,
  reqs_seen      INTEGER DEFAULT 0,
  reqs_new       INTEGER DEFAULT 0,
  scored         INTEGER DEFAULT 0,
  boarded        INTEGER DEFAULT 0,
  closed_swept   INTEGER DEFAULT 0,
  cost_cents     REAL DEFAULT 0,
  budget_hit     BOOLEAN DEFAULT FALSE,
  errors         JSONB DEFAULT '[]'::jsonb,
  notes          TEXT
);
-- THE DAILY CLAIM. Partial so a SCHEDULED run is claimed once per tenant per
-- day across every Render instance, while manual runs stay unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS cj_runs_daily_claim_uq
  ON cj_runs (tenant_id, run_date) WHERE trigger = 'schedule';

-- kind is the safety boundary of the whole application:
--   verified   may appear on a resume; reachable only via human confirmation
--   vocabulary may only widen the daily search
--   rejected   never suggested again
CREATE TABLE IF NOT EXISTS cj_skills (
  id                 SERIAL PRIMARY KEY,
  tenant_id          INTEGER NOT NULL,
  profile_id         INTEGER NOT NULL,
  term               VARCHAR(200) NOT NULL,
  norm               VARCHAR(200) NOT NULL,
  kind               VARCHAR(20) DEFAULT 'vocabulary',
  evidence           TEXT,
  first_seen_req_id  VARCHAR(40),
  confirmed_at       TIMESTAMPTZ,
  weight             REAL DEFAULT 1.0,
  hits               INTEGER DEFAULT 1,
  source             VARCHAR(20) DEFAULT 'tailoring',
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cj_skills_profile_norm_uq ON cj_skills (profile_id, norm);

-- Immutable and versioned: the document sent to Citi for a req id must always
-- be recoverable. The CONTENT is stored, not a file path — Render's disk is
-- ephemeral and the PDF is re-rendered on demand from this row.
CREATE TABLE IF NOT EXISTS cj_tailorings (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL,
  profile_id        INTEGER NOT NULL,
  employer          VARCHAR(40) NOT NULL DEFAULT 'citi',
  employer          VARCHAR(40) NOT NULL DEFAULT 'citi',
  req_id            VARCHAR(40) NOT NULL,
  version           INTEGER DEFAULT 1,
  content           JSONB DEFAULT '{}'::jsonb,
  keyword_coverage  JSONB DEFAULT '{}'::jsonb,
  gaps              JSONB DEFAULT '[]'::jsonb,
  tailored_by       VARCHAR(20) DEFAULT 'heuristic',
  is_simulated      BOOLEAN DEFAULT TRUE,
  model             VARCHAR(80),
  dropped           JSONB DEFAULT '[]'::jsonb,
  sent              BOOLEAN DEFAULT FALSE,
  sent_at           TIMESTAMPTZ,
  generated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS cj_tail_prof_emp_req_v_uq ON cj_tailorings (profile_id, employer, req_id, version);
