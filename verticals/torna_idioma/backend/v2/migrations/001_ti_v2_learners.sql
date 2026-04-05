-- Torna Idioma Learner Platform v2 — Step 2: Learner Profile
-- Isolation: ti_v2_* prefix, references v1 ti_users(id) via foreign key
-- Additive only — v1 tables untouched

CREATE TABLE IF NOT EXISTS ti_v2_learners (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES ti_users(id) ON DELETE CASCADE,
  native_language VARCHAR(20) NOT NULL DEFAULT 'tagalog',
  target_dialect VARCHAR(30) NOT NULL DEFAULT 'latin_american_spanish',
  cefr_level VARCHAR(4) NOT NULL DEFAULT 'A1',
  daily_goal_minutes INTEGER NOT NULL DEFAULT 10,
  reminder_time TIME,
  timezone VARCHAR(50) DEFAULT 'Asia/Manila',
  onboarded BOOLEAN NOT NULL DEFAULT false,
  total_xp INTEGER NOT NULL DEFAULT 0,
  voice_preference VARCHAR(30) DEFAULT 'isabel_default',
  cognate_highlighting BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_learners_user ON ti_v2_learners(user_id);
CREATE INDEX IF NOT EXISTS idx_ti_v2_learners_cefr ON ti_v2_learners(cefr_level);
