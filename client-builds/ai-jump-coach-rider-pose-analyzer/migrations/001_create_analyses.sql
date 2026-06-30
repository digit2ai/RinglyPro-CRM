-- =====================================================
-- AI Jump Coach — Rider Pose Analyzer
-- Canonical schema. The model layer also creates this table via
-- Model.sync({alter:false}) on boot, so this file is the source of truth /
-- audit copy. Multi-tenant: tenant_id NOT NULL + index.
-- =====================================================

CREATE TABLE IF NOT EXISTS ai_jump_coach_rider_pose_analyzer_analyses (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  filename      VARCHAR(255),
  duration_sec  REAL,
  frame_count   INTEGER NOT NULL DEFAULT 0,
  apex_sec      REAL,
  faults        JSONB NOT NULL DEFAULT '[]'::jsonb,
  lang          VARCHAR(8) NOT NULL DEFAULT 'es',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_jump_coach_analyses_tenant
  ON ai_jump_coach_rider_pose_analyzer_analyses (tenant_id);
