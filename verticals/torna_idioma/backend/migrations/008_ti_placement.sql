-- Torna Idioma — placement (additive). Records the learner's placed CEFR level.
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS cefr_level VARCHAR(8);
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS placed_at  TIMESTAMPTZ;
