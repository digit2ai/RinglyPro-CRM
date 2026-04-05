-- Torna Idioma Learner Platform v2 — Step 9: Lesson Player
-- Per-learner lesson session tracking. Reuses existing v1 ti_courses and
-- ti_lessons (72 UVEG lessons already seeded). Additive only.
-- Isolation: ti_v2_* prefix.

CREATE TABLE IF NOT EXISTS ti_v2_lesson_sessions (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES ti_lessons(id) ON DELETE CASCADE,
  course_id INTEGER REFERENCES ti_courses(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress', -- in_progress | completed | abandoned
  score NUMERIC(5,2),                                -- 0-100
  exercises_completed INTEGER NOT NULL DEFAULT 0,
  exercises_total INTEGER NOT NULL DEFAULT 0,
  time_spent_sec INTEGER NOT NULL DEFAULT 0,
  difficulty_level VARCHAR(4) DEFAULT 'A1',          -- CEFR level at start
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  UNIQUE(learner_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_lesson_sess_learner ON ti_v2_lesson_sessions(learner_id, status);
CREATE INDEX IF NOT EXISTS idx_ti_v2_lesson_sess_lesson ON ti_v2_lesson_sessions(lesson_id);

CREATE TABLE IF NOT EXISTS ti_v2_exercise_attempts (
  id BIGSERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES ti_v2_lesson_sessions(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  exercise_index INTEGER NOT NULL,
  exercise_type VARCHAR(30),                         -- multiple_choice | fill_blank | speaking | listening
  prompt TEXT,
  learner_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  time_ms INTEGER,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_attempts_session ON ti_v2_exercise_attempts(session_id, exercise_index);
CREATE INDEX IF NOT EXISTS idx_ti_v2_attempts_learner ON ti_v2_exercise_attempts(learner_id);
