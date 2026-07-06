-- =====================================================
-- AI Jump Coach v3.x — replay tracks.
-- Compact joint-coordinate tracks for the 2D animated slow-motion replay.
-- PRIVACY: joint coordinates only (rounded, downsampled) — never the video,
-- never faces. Idempotent; the model layer also adds these on boot.
-- =====================================================

ALTER TABLE ai_jump_coach_rider_pose_analyzer_analyses
  ADD COLUMN IF NOT EXISTS pose_track  JSONB,
  ADD COLUMN IF NOT EXISTS horse_track JSONB;
