-- ============================================================================
-- Torna Idioma — MÉTODO RIZAL schema (Phase 0)
-- Additive only. Tables are ti_-prefixed (shared Postgres DB — avoid collisions).
-- Implements PART A §7 of Torna_Idioma_Rizal_Method_MASTER_PROMPT.md
-- Idempotent: safe to re-run on every boot (CREATE TABLE/INDEX IF NOT EXISTS,
-- ADD COLUMN IF NOT EXISTS).
-- ============================================================================

-- --- 1. Vocabulary roots (the Cinco Raíces dataset) -------------------------
CREATE TABLE IF NOT EXISTS ti_vocab_roots (
  id            TEXT PRIMARY KEY,            -- e.g. 'm1-saludar'
  module        INTEGER NOT NULL,
  level         VARCHAR(10),
  theme         TEXT,
  element       VARCHAR(20),
  root_lemma    TEXT NOT NULL,
  pos           TEXT,
  derived_forms JSONB DEFAULT '[]'::jsonb,
  gloss_en      TEXT,
  gloss_fil     TEXT,                         -- review-gated (G3): hidden until native sign-off
  example_es    TEXT,
  example_en    TEXT,
  example_fil   TEXT,                         -- review-gated (G3)
  sort_order    INTEGER DEFAULT 0,            -- stable session/root ordering
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ti_vocab_roots_module ON ti_vocab_roots(module);
CREATE INDEX IF NOT EXISTS idx_ti_vocab_roots_order ON ti_vocab_roots(module, sort_order);
CREATE INDEX IF NOT EXISTS idx_ti_vocab_roots_element ON ti_vocab_roots(element);

-- --- 1b. Staging mirror for QA-held generated content (Modules 2–12) --------
-- Generated Tagalog/Spanish lives here until Gate G3 promotes it to ti_vocab_roots.
CREATE TABLE IF NOT EXISTS ti_vocab_roots_staging (
  id            TEXT PRIMARY KEY,
  module        INTEGER NOT NULL,
  level         VARCHAR(10),
  theme         TEXT,
  element       VARCHAR(20),
  root_lemma    TEXT NOT NULL,
  pos           TEXT,
  derived_forms JSONB DEFAULT '[]'::jsonb,
  gloss_en      TEXT,
  gloss_fil     TEXT,
  example_es    TEXT,
  example_en    TEXT,
  example_fil   TEXT,
  sort_order    INTEGER DEFAULT 0,
  qa_status     VARCHAR(20) DEFAULT 'pending', -- pending | g3_approved | rejected
  qa_notes      TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ti_vocab_staging_module ON ti_vocab_roots_staging(module);
CREATE INDEX IF NOT EXISTS idx_ti_vocab_staging_status ON ti_vocab_roots_staging(qa_status);

-- --- 2. Per-user SRS progress (SM-2) ----------------------------------------
CREATE TABLE IF NOT EXISTS ti_user_vocab_progress (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES ti_users(id),
  root_id       TEXT NOT NULL REFERENCES ti_vocab_roots(id),
  ease          REAL DEFAULT 2.5,
  interval_days INTEGER DEFAULT 0,
  due_date      DATE,
  reps          INTEGER DEFAULT 0,
  lapses        INTEGER DEFAULT 0,
  mastered_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, root_id)
);
CREATE INDEX IF NOT EXISTS idx_ti_uvp_user ON ti_user_vocab_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_ti_uvp_due ON ti_user_vocab_progress(user_id, due_date);

-- --- 3. Daily session log ---------------------------------------------------
CREATE TABLE IF NOT EXISTS ti_user_daily_session (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES ti_users(id),
  session_date DATE NOT NULL,
  new_roots    JSONB DEFAULT '[]'::jsonb,
  reviews_done INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, session_date)
);
CREATE INDEX IF NOT EXISTS idx_ti_uds_user ON ti_user_daily_session(user_id);

-- --- 4. Emperador score (gamification, tenant/school scoped) -----------------
CREATE TABLE IF NOT EXISTS ti_emperador_score (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES ti_users(id),
  tenant_id       VARCHAR(50) DEFAULT 'torna_idioma',
  points          INTEGER DEFAULT 0,
  components_json JSONB DEFAULT '{}'::jsonb,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_ti_emp_tenant_points ON ti_emperador_score(tenant_id, points DESC);

-- --- 5. Rizal Studies module progress ---------------------------------------
CREATE TABLE IF NOT EXISTS ti_rizal_module_progress (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES ti_users(id),
  section      VARCHAR(50) NOT NULL,          -- rz1..rz5
  status       VARCHAR(20) DEFAULT 'not_started', -- not_started | in_progress | completed
  score        INTEGER,
  completed_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, section)
);
CREATE INDEX IF NOT EXISTS idx_ti_rzp_user ON ti_rizal_module_progress(user_id);

-- --- 6. Additive learner columns on ti_users --------------------------------
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS current_streak        INTEGER DEFAULT 0;
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS longest_streak        INTEGER DEFAULT 0;
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS last_session_date     DATE;
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS immersion_level       INTEGER DEFAULT 1;
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS current_module        INTEGER DEFAULT 1;
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS anonymous_leaderboard BOOLEAN DEFAULT false;
ALTER TABLE ti_users ADD COLUMN IF NOT EXISTS display_handle        VARCHAR(60);
