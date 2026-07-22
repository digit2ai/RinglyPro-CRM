-- SpeakUp — canonical schema (auto-created on boot via sync({alter:false});
-- this file is the source of truth). All tables multi-tenant (tenant_id), su_ prefix.

CREATE TABLE IF NOT EXISTS su_users (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(255),
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(40) DEFAULT 'member',
  lang          VARCHAR(12) DEFAULT 'es',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS su_recordings (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  user_id      INTEGER,
  title        VARCHAR(255) DEFAULT 'Grabación',
  source       VARCHAR(20) DEFAULT 'mic',   -- mic|meeting|upload|import
  lang         VARCHAR(12),
  duration_sec INTEGER,
  status       VARCHAR(20) DEFAULT 'done',  -- recording|processing|done|error
  engine       VARCHAR(20),                 -- webspeech|stub|whispercpp|vosk|sample
  file_path    VARCHAR(500),
  mime         VARCHAR(120),
  error        TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_su_recordings_tenant ON su_recordings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_su_recordings_status ON su_recordings(status);
CREATE INDEX IF NOT EXISTS idx_su_recordings_user ON su_recordings(user_id);

CREATE TABLE IF NOT EXISTS su_transcripts (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL DEFAULT 1,
  recording_id  INTEGER NOT NULL,
  text          TEXT DEFAULT '',
  segments      JSONB DEFAULT '[]',
  lang_detected VARCHAR(12),
  engine        VARCHAR(20),
  is_simulated  BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_su_transcripts_tenant ON su_transcripts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_su_transcripts_rec ON su_transcripts(recording_id);

CREATE TABLE IF NOT EXISTS su_summaries (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  recording_id INTEGER NOT NULL,
  summary      TEXT,
  bullets      JSONB DEFAULT '[]',
  action_items JSONB DEFAULT '[]',
  model        VARCHAR(60),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_su_summaries_tenant ON su_summaries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_su_summaries_rec ON su_summaries(recording_id);

CREATE TABLE IF NOT EXISTS su_translations (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  recording_id INTEGER,
  source_lang  VARCHAR(12),
  target_lang  VARCHAR(40) NOT NULL,
  text         TEXT,
  model        VARCHAR(60),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_su_translations_tenant ON su_translations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_su_translations_rec ON su_translations(recording_id);

CREATE TABLE IF NOT EXISTS su_edits (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  recording_id INTEGER,
  kind         VARCHAR(40),
  prompt       TEXT,
  input_text   TEXT,
  output_text  TEXT,
  model        VARCHAR(60),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_su_edits_tenant ON su_edits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_su_edits_rec ON su_edits(recording_id);

CREATE TABLE IF NOT EXISTS su_documents (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  recording_id INTEGER NOT NULL,
  kind         VARCHAR(40),   -- minutes|details|next_steps|presentation|project_plan|custom
  title        VARCHAR(255),
  prompt       TEXT,          -- free-form instruction (kind=custom)
  content      TEXT,
  model        VARCHAR(60),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_su_documents_tenant ON su_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_su_documents_rec ON su_documents(recording_id);
CREATE INDEX IF NOT EXISTS idx_su_documents_kind ON su_documents(kind);

CREATE TABLE IF NOT EXISTS su_usage (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL DEFAULT 1,
  user_id    INTEGER,
  kind       VARCHAR(30),
  units      REAL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_su_usage_tenant ON su_usage(tenant_id);
CREATE INDEX IF NOT EXISTS idx_su_usage_kind ON su_usage(kind);
