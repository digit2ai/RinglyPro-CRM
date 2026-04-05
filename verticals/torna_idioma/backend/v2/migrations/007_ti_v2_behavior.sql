-- Torna Idioma Learner Platform v2 — Step 8: Behavior & Engagement Analytics
-- Privacy-respecting event log. Only aggregate signals stored, never raw face/audio data.
-- Isolation: ti_v2_* prefix.

CREATE TABLE IF NOT EXISTS ti_v2_behavior_events (
  id BIGSERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  session_id VARCHAR(64),                      -- groups events within a learning session
  event_type VARCHAR(40) NOT NULL,             -- lesson_started | exercise_skipped | hint_used
                                               -- audio_replayed | session_abandoned | engagement_sample
                                               -- fatigue_signal | emotion_sample | etc.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,  -- aggregate signals only — NO raw face/audio data
  engagement_score SMALLINT,                   -- 0-100 at time of event (nullable)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_behavior_learner_time ON ti_v2_behavior_events(learner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ti_v2_behavior_event_type ON ti_v2_behavior_events(event_type);
CREATE INDEX IF NOT EXISTS idx_ti_v2_behavior_session ON ti_v2_behavior_events(session_id) WHERE session_id IS NOT NULL;
