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

-- srcaf_magic_tokens is DEPRECATED and no longer created or read.
-- Sign-in is the Projects Hub session (see routes/auth.js), so there are no
-- local sign-in tokens to store. Any existing table can be dropped by hand:
--   DROP TABLE IF EXISTS srcaf_magic_tokens;
-- It is left in place rather than auto-dropped, because a migration that
-- destroys data on boot is worse than one stale empty table.

-- No user table and no seeded row. Identity comes from the Digit2AI Projects
-- Hub session, and which Projects accounts may open the model is configured in
-- SRCAF_ALLOWED_EMAILS (default: eriksen.greg@yahoo.com, mstagg@digit2ai.com).
-- Storing a local user row would duplicate an identity we do not own.
