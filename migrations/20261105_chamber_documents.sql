-- Documentacion de camara (/:slug/api/documentos). El router la crea sola en
-- el primer uso; este archivo es la fuente canonica desde cero.
CREATE TABLE IF NOT EXISTS chamber_documents (
  id SERIAL PRIMARY KEY,
  chamber_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT,
  filename VARCHAR(255) NOT NULL,
  kind VARCHAR(10) NOT NULL,
  mime VARCHAR(120) NOT NULL,
  size_bytes INTEGER NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_by INTEGER
);
CREATE INDEX IF NOT EXISTS idx_chamber_documents_chamber
  ON chamber_documents (chamber_id, deleted_at, created_at DESC);
