-- Torna Idioma Learner Platform v2 — Step 3: Cognate Engine
-- Filipino-Spanish cognate database (4,000+ target, 500+ in Step 3 seed)
-- Isolation: ti_v2_* prefix only. No modifications to v1 tables.

CREATE TABLE IF NOT EXISTS ti_v2_cognates (
  id SERIAL PRIMARY KEY,
  word_es VARCHAR(100) NOT NULL,
  word_tl VARCHAR(100) NOT NULL,
  category VARCHAR(40) NOT NULL DEFAULT 'general',
  cefr_level VARCHAR(4) DEFAULT 'A1',
  etymology_note TEXT,
  example_es TEXT,
  example_tl TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast search by Spanish or Tagalog word, by category, by CEFR level
CREATE INDEX IF NOT EXISTS idx_ti_v2_cognates_word_es ON ti_v2_cognates(LOWER(word_es));
CREATE INDEX IF NOT EXISTS idx_ti_v2_cognates_word_tl ON ti_v2_cognates(LOWER(word_tl));
CREATE INDEX IF NOT EXISTS idx_ti_v2_cognates_category ON ti_v2_cognates(category);
CREATE INDEX IF NOT EXISTS idx_ti_v2_cognates_cefr ON ti_v2_cognates(cefr_level);

-- Unique constraint to prevent duplicate pairs on re-seed.
-- Plain column-based unique (not expression-based) so ON CONFLICT works cleanly.
-- The seed file ensures consistent casing per word — seeding is additive via
-- ON CONFLICT DO NOTHING, so duplicate category entries are safely skipped.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_ti_v2_cognates_pair ON ti_v2_cognates(word_es, word_tl);
