-- =====================================================
-- AI Jump Coach v2 — rubric upgrade.
-- Adds the coaching-rubric columns to the analyses table. Idempotent
-- (IF NOT EXISTS) so it is safe to re-run; the model layer also adds these via
-- sync on boot in fresh environments. Multi-tenant unchanged (tenant_id).
-- =====================================================

ALTER TABLE ai_jump_coach_rider_pose_analyzer_analyses
  ADD COLUMN IF NOT EXISTS height_category  VARCHAR(16),
  ADD COLUMN IF NOT EXISTS height_cm        INTEGER,
  ADD COLUMN IF NOT EXISTS horse_name       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS rider_name       VARCHAR(120),
  ADD COLUMN IF NOT EXISTS discipline       VARCHAR(32) DEFAULT 'show_jumping',
  ADD COLUMN IF NOT EXISTS rider_score      INTEGER,
  ADD COLUMN IF NOT EXISTS dimension_scores JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS phase_metrics    JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metrics          JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS manual_faults    JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS optimal_time_sec REAL,
  ADD COLUMN IF NOT EXISTS total_time_sec   REAL,
  ADD COLUMN IF NOT EXISTS journal          JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rubric_version   VARCHAR(16);

-- Speeds up per-binomio records + workload queries.
CREATE INDEX IF NOT EXISTS idx_ai_jump_coach_analyses_horse
  ON ai_jump_coach_rider_pose_analyzer_analyses (tenant_id, horse_name);
