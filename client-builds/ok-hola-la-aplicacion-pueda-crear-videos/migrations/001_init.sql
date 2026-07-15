-- OK Hola — Voice-to-Video Prompt Builder — initial schema
-- All tables multi-tenant (tenant_id) with an index on tenant_id.

CREATE TABLE IF NOT EXISTS ok_hola_la_aplicacion_pueda_crear_videos_users (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  email       VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_okhola_users_tenant ON ok_hola_la_aplicacion_pueda_crear_videos_users (tenant_id);
CREATE INDEX IF NOT EXISTS idx_okhola_users_email  ON ok_hola_la_aplicacion_pueda_crear_videos_users (email);

CREATE TABLE IF NOT EXISTS ok_hola_la_aplicacion_pueda_crear_videos_magic_links (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  email       VARCHAR(255) NOT NULL,
  token       VARCHAR(128) NOT NULL UNIQUE,
  expires_at  TIMESTAMP NOT NULL,
  used_at     TIMESTAMP,
  created_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_okhola_links_tenant ON ok_hola_la_aplicacion_pueda_crear_videos_magic_links (tenant_id);
CREATE INDEX IF NOT EXISTS idx_okhola_links_token  ON ok_hola_la_aplicacion_pueda_crear_videos_magic_links (token);

CREATE TABLE IF NOT EXISTS ok_hola_la_aplicacion_pueda_crear_videos_prompts (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  raw_text    TEXT NOT NULL,
  structured  JSONB NOT NULL,
  title       VARCHAR(255),
  source      VARCHAR(32) DEFAULT 'llm',
  created_at  TIMESTAMP DEFAULT NOW(),
  updated_at  TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_okhola_prompts_tenant ON ok_hola_la_aplicacion_pueda_crear_videos_prompts (tenant_id);
