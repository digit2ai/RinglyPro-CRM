-- Torna Idioma — speaking progress + error log (Phase 2b, additive).

-- Per-learner error log: every correction Isabel makes becomes a reviewable item.
CREATE TABLE IF NOT EXISTS ti_speaking_errors (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES ti_users(id),
  unit_id      TEXT,
  learner_said TEXT,
  correct_form TEXT,
  tip          TEXT,
  resolved     BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ti_sperr_user ON ti_speaking_errors(user_id, resolved);

-- Per-unit speaking progress (formative gating: passed an oral assessment).
CREATE TABLE IF NOT EXISTS ti_speaking_progress (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES ti_users(id),
  unit_id      TEXT NOT NULL,
  best_score   INTEGER DEFAULT 0,
  passed       BOOLEAN DEFAULT false,
  attempts     INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, unit_id)
);
CREATE INDEX IF NOT EXISTS idx_ti_spprog_user ON ti_speaking_progress(user_id);
