-- PLANEA MVP: módulo administrativo, conocimiento de Maya, métricas.
-- Canónico. El código (admin.cjs / kb.cjs) crea lo mismo en el primer uso, de forma idempotente.

CREATE TABLE IF NOT EXISTS planea_kb_docs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  name TEXT NOT NULL,
  version INTEGER NOT NULL,
  mime TEXT NOT NULL,
  filename TEXT,
  size_bytes INTEGER NOT NULL,
  chars INTEGER NOT NULL,
  extracted_text TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  uploaded_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deactivated_at TIMESTAMPTZ,
  deactivated_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_kb_name_version ON planea_kb_docs (tenant_id, lower(name), version);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_kb_one_active ON planea_kb_docs (tenant_id, lower(name)) WHERE active;
CREATE INDEX IF NOT EXISTS idx_planea_kb_tenant ON planea_kb_docs (tenant_id, active);

-- Un evento por usuario, tipo y día (visit | score_view). Sin cifras ni contenido.
CREATE TABLE IF NOT EXISTS planea_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  event TEXT NOT NULL,
  day DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_events_once_a_day ON planea_events (tenant_id, user_id, event, day);

-- NPS: una respuesta por persona.
CREATE TABLE IF NOT EXISTS planea_nps (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_nps_once ON planea_nps (tenant_id, user_id);
