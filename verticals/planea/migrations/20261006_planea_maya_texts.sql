-- Planea: textos de pantalla que redacta Maya (Inicio, Puntaje Planea, Mis metas, saludo del chat).
-- Idempotente. La misma definición se crea en código al primer uso (maya-texts.cjs).
-- Una fila VIGENTE por usuario; se conservan las últimas 5 versiones.
-- Guarda textos ya verificados y los hechos con que se escribieron (puntajes y pilares);
-- no guarda montos ni conversaciones.
CREATE TABLE IF NOT EXISTS planea_maya_texts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  user_id INTEGER NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  cause TEXT NOT NULL,
  texts JSONB NOT NULL,
  facts JSONB NOT NULL,
  facts_hash TEXT NOT NULL,
  kb_version TEXT NOT NULL,
  composed_by TEXT NOT NULL DEFAULT 'maya',
  rejected JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_planea_maya_texts_current ON planea_maya_texts (tenant_id, user_id) WHERE is_current;
CREATE INDEX IF NOT EXISTS idx_planea_maya_texts_user ON planea_maya_texts (tenant_id, user_id, created_at);
