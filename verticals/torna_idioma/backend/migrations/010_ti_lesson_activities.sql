-- Practice packs for the 72 curriculum lessons.
--
-- Additive: ti_lessons is untouched, and deleting this table leaves the reading
-- curriculum working exactly as before. One row per lesson; the pack is rebuilt
-- from the lesson content by services/activity-pack.js, so it is derived data and
-- safe to regenerate.

CREATE TABLE IF NOT EXISTS ti_lesson_activities (
  id           SERIAL PRIMARY KEY,
  lesson_id    INTEGER NOT NULL UNIQUE REFERENCES ti_lessons(id) ON DELETE CASCADE,
  pack         JSONB   NOT NULL DEFAULT '{}'::jsonb,
  -- 'derived'  = built deterministically from the lesson + practice bank
  -- 'ai'       = a model deepened the authored fields
  -- 'manual'   = a human edited it; the AI pass must not overwrite this
  source       VARCHAR(16) NOT NULL DEFAULT 'derived',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_lesson_activities_lesson ON ti_lesson_activities(lesson_id);
CREATE INDEX IF NOT EXISTS idx_ti_lesson_activities_source ON ti_lesson_activities(source);
