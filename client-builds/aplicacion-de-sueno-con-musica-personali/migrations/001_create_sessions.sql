-- =====================================================
-- 001_create_sessions.sql
-- Sleep-session history for the bedtime player.
--
-- Idempotent: safe to re-run. models/index.js also calls sync() + these same
-- CREATE INDEX IF NOT EXISTS statements on boot, so applying this file by hand
-- is optional — it exists as the canonical schema of record.
--
-- No PII: anon_token is a random client-generated UUID, never a name/email/phone.
-- =====================================================

CREATE TABLE IF NOT EXISTS aplicacion_de_sueno_con_musica_personali_sessions (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER      NOT NULL,
  anon_token     VARCHAR(64)  NOT NULL,
  track_id       VARCHAR(64)  NOT NULL,
  track_title    VARCHAR(160),
  timer_minutes  INTEGER      NOT NULL,
  played_seconds INTEGER      DEFAULT 0,
  completed      BOOLEAN      DEFAULT FALSE,
  language       VARCHAR(8)   DEFAULT 'es',
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN aplicacion_de_sueno_con_musica_personali_sessions.tenant_id
  IS 'Multi-tenant isolation. Every query filters on this column.';
COMMENT ON COLUMN aplicacion_de_sueno_con_musica_personali_sessions.anon_token
  IS 'Client-generated random UUID that owns the row. Not personally identifying; never logged at full length.';

CREATE INDEX IF NOT EXISTS idx_aplicacion_sueno_sessions_tenant
  ON aplicacion_de_sueno_con_musica_personali_sessions (tenant_id);

CREATE INDEX IF NOT EXISTS idx_aplicacion_sueno_sessions_anon
  ON aplicacion_de_sueno_con_musica_personali_sessions (tenant_id, anon_token);
