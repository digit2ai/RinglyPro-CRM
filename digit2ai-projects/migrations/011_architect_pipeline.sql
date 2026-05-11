-- =====================================================
-- Migration 011 — Architect pipeline (post-payment build orchestration)
--
-- Adds the columns the autonomous-build orchestrator reads/writes
-- after the Stripe deposit clears. Push #1 only uses the orchestration
-- side (gates, queue, email, magic-link feedback) and leaves the
-- autonomous Claude agent loop for a follow-up push.
-- =====================================================

ALTER TABLE d2_projects
  ADD COLUMN IF NOT EXISTS short_name           VARCHAR(60),
  ADD COLUMN IF NOT EXISTS human_greenlight     BOOLEAN     DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS production_url       TEXT,
  ADD COLUMN IF NOT EXISTS architect_prompt     TEXT,
  ADD COLUMN IF NOT EXISTS sit_report_md        TEXT,
  ADD COLUMN IF NOT EXISTS build_status         VARCHAR(40),
  ADD COLUMN IF NOT EXISTS build_iterations     INTEGER     DEFAULT 0,
  ADD COLUMN IF NOT EXISTS build_started_at     TIMESTAMP,
  ADD COLUMN IF NOT EXISTS build_completed_at   TIMESTAMP,
  ADD COLUMN IF NOT EXISTS uat_approved_at      TIMESTAMP,
  ADD COLUMN IF NOT EXISTS uat_approved_by      VARCHAR(255);

-- Enforce uniqueness on short_name within the workspace (used in the public URL)
CREATE UNIQUE INDEX IF NOT EXISTS d2_projects_short_name_uq
  ON d2_projects (workspace_id, short_name)
  WHERE short_name IS NOT NULL;
