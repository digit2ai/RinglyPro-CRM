-- =====================================================
-- 002_create_templates.sql — the seeded, read-only gallery.
--
-- Idempotent, applied on every boot alongside 001. See that file's header for
-- why the schema lives in SQL rather than sequelize.sync().
--
-- The UNIQUE (tenant_id, slug) constraint is load-bearing: seeds/templates.js
-- re-seeds on every boot via ON CONFLICT ... DO UPDATE, so editing a template's
-- copy and redeploying updates the gallery in place instead of stacking a
-- seventh, eighth and ninth copy of "Extract".
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_agent_prompt_builder_for_data_writing_templates (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 0,
  slug         VARCHAR(100) NOT NULL,
  title        VARCHAR(200) NOT NULL,
  category     VARCHAR(60),
  summary      TEXT,
  definition   JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS apb_templates_tenant_idx
  ON ai_agent_prompt_builder_for_data_writing_templates (tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS apb_templates_tenant_slug_idx
  ON ai_agent_prompt_builder_for_data_writing_templates (tenant_id, slug);
