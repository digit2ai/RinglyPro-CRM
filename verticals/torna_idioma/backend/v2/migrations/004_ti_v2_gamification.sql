-- Torna Idioma Learner Platform v2 — Step 5: Gamification
-- XP log, streaks, badges. All scoped to ti_v2_learners.
-- Isolation: ti_v2_* prefix. No v1 tables modified.

-- XP transaction log (immutable, append-only)
CREATE TABLE IF NOT EXISTS ti_v2_xp_log (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  event_type VARCHAR(40) NOT NULL,     -- signup | card_reviewed | card_mastered | lesson_complete | streak_bonus | isabel_chat | etc.
  xp_amount INTEGER NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_xp_log_learner ON ti_v2_xp_log(learner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ti_v2_xp_log_event ON ti_v2_xp_log(event_type);

-- Streaks (one row per learner)
CREATE TABLE IF NOT EXISTS ti_v2_streaks (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL UNIQUE REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_activity_date DATE,
  streak_started_at DATE,
  freeze_available BOOLEAN NOT NULL DEFAULT true,    -- one free streak save per week
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_streaks_learner ON ti_v2_streaks(learner_id);

-- Badge catalog (seeded; admins can add more)
CREATE TABLE IF NOT EXISTS ti_v2_badges (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name_en VARCHAR(100) NOT NULL,
  name_es VARCHAR(100),
  name_fil VARCHAR(100),
  description TEXT,
  icon VARCHAR(20),                 -- letter/emoji-free glyph code (we render with CSS)
  color VARCHAR(20) DEFAULT 'gold', -- gold | emerald | sapphire | ruby | amethyst
  category VARCHAR(30) DEFAULT 'progress',
  xp_reward INTEGER DEFAULT 0,      -- bonus XP when earned
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Earned badges (learner -> badge, with timestamp)
CREATE TABLE IF NOT EXISTS ti_v2_user_badges (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  badge_id INTEGER NOT NULL REFERENCES ti_v2_badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(learner_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_user_badges_learner ON ti_v2_user_badges(learner_id);
