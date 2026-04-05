-- Torna Idioma Learner Platform v2 — Step 4: Spaced Repetition System (SM-2)
-- Vocabulary flashcard deck per learner with SM-2 algorithm tracking.
-- Isolation: ti_v2_* prefix. References ti_v2_learners(id) and ti_v2_cognates(id).

CREATE TABLE IF NOT EXISTS ti_v2_vocabulary_cards (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  word_es VARCHAR(100) NOT NULL,
  word_tl_cognate VARCHAR(100),
  translation_en VARCHAR(200),
  example_sentence TEXT,
  audio_url TEXT,
  source VARCHAR(30) DEFAULT 'manual',           -- manual | cognate | lesson | isabel
  source_cognate_id INTEGER REFERENCES ti_v2_cognates(id) ON DELETE SET NULL,

  -- SM-2 algorithm fields
  ease_factor NUMERIC(4,2) NOT NULL DEFAULT 2.5,  -- multiplier for next interval
  interval_days INTEGER NOT NULL DEFAULT 0,       -- days until next review
  repetitions INTEGER NOT NULL DEFAULT 0,         -- successful review streak
  next_review_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_reviewed_at TIMESTAMPTZ,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  lapses INTEGER NOT NULL DEFAULT 0,              -- times failed after being learned

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(learner_id, word_es)
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_cards_learner ON ti_v2_vocabulary_cards(learner_id);
CREATE INDEX IF NOT EXISTS idx_ti_v2_cards_due ON ti_v2_vocabulary_cards(learner_id, next_review_at);
CREATE INDEX IF NOT EXISTS idx_ti_v2_cards_source ON ti_v2_vocabulary_cards(source);

-- Review history (every answer logged for analytics + SRS state recovery)
CREATE TABLE IF NOT EXISTS ti_v2_reviews (
  id SERIAL PRIMARY KEY,
  card_id INTEGER NOT NULL REFERENCES ti_v2_vocabulary_cards(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  quality SMALLINT NOT NULL CHECK (quality BETWEEN 0 AND 5),  -- SM-2 grade
  prev_ease NUMERIC(4,2),
  prev_interval INTEGER,
  new_ease NUMERIC(4,2),
  new_interval INTEGER,
  time_taken_ms INTEGER,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_reviews_learner ON ti_v2_reviews(learner_id, reviewed_at);
CREATE INDEX IF NOT EXISTS idx_ti_v2_reviews_card ON ti_v2_reviews(card_id);
