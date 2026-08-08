-- AI Readiness Department — canonical schema.
--
-- Tables are created on boot by sequelize.sync({ alter: false }) in
-- verticals/ai-readiness/src/index.js; this file is the authoritative
-- reference and the path for applying the schema by hand.
--
-- Every table is multi-tenant. tenant_id is the sponsor's id, and the Brain
-- injects it from session context rather than accepting it from a caller.

CREATE TABLE IF NOT EXISTS air_sponsors (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER,
  email          VARCHAR(255) NOT NULL UNIQUE,
  name           VARCHAR(255),
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(64) DEFAULT 'sponsor',
  lang           VARCHAR(12) DEFAULT 'en',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
UPDATE air_sponsors SET tenant_id = id WHERE tenant_id IS NULL;

-- One CEO, one company, one run through the department.
CREATE TABLE IF NOT EXISTS air_engagements (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL DEFAULT 1,
  sponsor_id     INTEGER,
  company_name   VARCHAR(255) NOT NULL,
  ceo_name       VARCHAR(255),
  industry       VARCHAR(255),
  country        VARCHAR(255),
  headcount      INTEGER,
  revenue_band   VARCHAR(64),
  lang           VARCHAR(12) DEFAULT 'en',
  stage          VARCHAR(32) DEFAULT 'intake',
  decision       VARCHAR(64),
  decision_note  TEXT,
  decided_at     TIMESTAMPTZ,
  share_token    VARCHAR(255),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS air_engagements_tenant_idx ON air_engagements (tenant_id);
CREATE INDEX IF NOT EXISTS air_engagements_stage_idx ON air_engagements (tenant_id, stage);
-- Unique: the CEO's read-only link is the key to a document, so a collision
-- would be a cross-client disclosure rather than a cosmetic bug.
CREATE UNIQUE INDEX IF NOT EXISTS air_engagements_share_token_idx ON air_engagements (share_token);

-- The interview. THE ONLY SOURCE OF FACTS: every figure the department reports
-- traces to a row here or to an assumption listed with its basis.
CREATE TABLE IF NOT EXISTS air_answers (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL DEFAULT 1,
  engagement_id  INTEGER NOT NULL,
  section        VARCHAR(32) NOT NULL,
  payload        JSONB DEFAULT '{}'::jsonb,
  answered_by    VARCHAR(32),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS air_answers_eng_idx ON air_answers (tenant_id, engagement_id);

-- One agent's output for one engagement. Re-running an agent replaces its row,
-- so a scorecard can never be assembled from a mix of old and new lanes.
CREATE TABLE IF NOT EXISTS air_findings (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL DEFAULT 1,
  engagement_id  INTEGER NOT NULL,
  agent          VARCHAR(64) NOT NULL,
  lane           VARCHAR(32),
  score          INTEGER,
  rating         VARCHAR(16),
  payload        JSONB DEFAULT '{}'::jsonb,
  computed_by    VARCHAR(32) DEFAULT 'deterministic',
  narrative_by   VARCHAR(32) DEFAULT 'heuristic',
  is_simulated   BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS air_findings_eng_idx ON air_findings (tenant_id, engagement_id);

-- The deliverable, frozen per version: a document already put in front of a
-- CEO must not change under them afterwards.
CREATE TABLE IF NOT EXISTS air_roadmaps (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL DEFAULT 1,
  engagement_id     INTEGER NOT NULL,
  version           INTEGER DEFAULT 1,
  scorecard         JSONB DEFAULT '{}'::jsonb,
  phases            JSONB DEFAULT '[]'::jsonb,
  safe_next_step    JSONB DEFAULT '{}'::jsonb,
  talk_track        JSONB DEFAULT '[]'::jsonb,
  executive_summary TEXT,
  narrative_by      VARCHAR(32) DEFAULT 'heuristic',
  is_simulated      BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS air_roadmaps_eng_idx ON air_roadmaps (tenant_id, engagement_id);

-- Every tool call through the Brain, including the denied ones. Because every
-- capability crosses one gateway this is a complete record.
CREATE TABLE IF NOT EXISTS air_calls (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL DEFAULT 1,
  engagement_id     INTEGER,
  agent             VARCHAR(64),
  tool              VARCHAR(128),
  channel           VARCHAR(32),
  actor             VARCHAR(255),
  arguments         JSONB DEFAULT '{}'::jsonb,
  success           BOOLEAN DEFAULT TRUE,
  error             TEXT,
  requires_approval BOOLEAN DEFAULT FALSE,
  latency_ms        INTEGER DEFAULT 0,
  cost_cents        INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS air_calls_tenant_idx ON air_calls (tenant_id);
CREATE INDEX IF NOT EXISTS air_calls_eng_idx ON air_calls (tenant_id, engagement_id);

-- The human-in-the-loop queue. A department whose pitch is "AI does not act
-- without a person" obeys that rule about its own most consequential action.
CREATE TABLE IF NOT EXISTS air_approvals (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL DEFAULT 1,
  engagement_id  INTEGER,
  agent          VARCHAR(64),
  tool           VARCHAR(128),
  arguments      JSONB DEFAULT '{}'::jsonb,
  reason         TEXT,
  status         VARCHAR(32) DEFAULT 'pending',
  result         JSONB,
  decided_by     INTEGER,
  decided_at     TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS air_approvals_status_idx ON air_approvals (tenant_id, status);
