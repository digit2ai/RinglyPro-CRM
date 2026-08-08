-- =====================================================
-- 001_create_agents.sql — saved agent definitions, one row per agent.
--
-- APPLIED ON EVERY BOOT by lib/store.js, so every statement is idempotent
-- (IF NOT EXISTS throughout). This is deliberate and replaces sequelize.sync():
-- sync() regenerates index names from the table name, and this table name is
-- long enough that generated names truncate at Postgres's 63-character
-- identifier limit and collide with the previous boot's — which would throw on
-- every restart after the first and drop the app into its in-memory fallback
-- permanently. Short explicit index names below avoid that entirely.
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_agent_prompt_builder_for_data_writing_agents (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL,
  name             VARCHAR(200) NOT NULL,
  role             VARCHAR(500),
  goal             TEXT,
  description      TEXT,
  data_sources     JSONB NOT NULL DEFAULT '[]'::jsonb,
  instructions     JSONB NOT NULL DEFAULT '[]'::jsonb,
  constraints      JSONB NOT NULL DEFAULT '[]'::jsonb,
  output_schema    JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_template  VARCHAR(100),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tenant isolation is enforced in every query; this index is what keeps that
-- filter cheap as the table grows across tenants.
CREATE INDEX IF NOT EXISTS apb_agents_tenant_idx
  ON ai_agent_prompt_builder_for_data_writing_agents (tenant_id);

-- The list view is "my agents, newest first" — a composite index serves it
-- without a sort.
CREATE INDEX IF NOT EXISTS apb_agents_tenant_created_idx
  ON ai_agent_prompt_builder_for_data_writing_agents (tenant_id, created_at DESC);
