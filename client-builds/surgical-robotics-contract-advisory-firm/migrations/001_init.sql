-- =====================================================
-- RoboNegotiate — surgical-robotics-contract-advisory-firm
-- Canonical schema. The app also creates these idempotently on boot
-- (models/index.js), so this file is the reference rather than a required step.
--
-- WHY THE PREFIX IS `srcaf_` AND NOT THE FULL SLUG:
-- Postgres truncates identifiers at 63 bytes. Sequelize builds index and
-- constraint names by appending to the table name, so a table called
-- surgical_robotics_contract_advisory_firm_scenarios would generate
-- surgical_robotics_contract_advisory_firm_scenarios_tenant_id_idx (64 bytes),
-- which truncates — and two different indexes can truncate onto the same name.
-- The mount path keeps the long slug; only SQL identifiers shorten.
--
-- Every index below is named explicitly for the same reason.
-- =====================================================

CREATE TABLE IF NOT EXISTS srcaf_scenarios (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER      NOT NULL,
  owner_email    VARCHAR(255),
  name           VARCHAR(200) NOT NULL,
  notes          TEXT,
  inputs         JSONB        NOT NULL,
  projections    JSONB        NOT NULL,
  model_version  VARCHAR(20)  NOT NULL,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_srcaf_scenarios_tenant
  ON srcaf_scenarios (tenant_id);

CREATE TABLE IF NOT EXISTS srcaf_magic_tokens (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER      NOT NULL,
  email       VARCHAR(255) NOT NULL,
  token       VARCHAR(128) NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_srcaf_tokens_tenant
  ON srcaf_magic_tokens (tenant_id);

CREATE INDEX IF NOT EXISTS idx_srcaf_tokens_token
  ON srcaf_magic_tokens (token);

-- No user table and no seeded row.
-- The allow-list of addresses that may request a sign-in link lives in
-- SRCAF_ALLOWED_EMAILS (default: eriksen.greg@yahoo.com, mstagg@digit2ai.com).
-- A magic-link flow needs no stored password and therefore no user record;
-- adding one would store a personal email address for no functional gain.
