-- =====================================================
-- Evaluación del Caballo de Paso Fino — initial schema.
-- Shared Postgres (process.env.DATABASE_URL). Tables prefixed
-- evaluacion_del_caballo_de_paso_fino_*, each with tenant_id + index.
-- IF NOT EXISTS everywhere; never drops/alters tables outside this prefix.
-- Sequelize sync({alter:false}) also creates these on boot; this file is the
-- canonical, auditable DDL.
-- =====================================================

CREATE TABLE IF NOT EXISTS evaluacion_del_caballo_de_paso_fino_horses (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  name        VARCHAR(160) NOT NULL,
  breed       VARCHAR(160),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecpf_horses_tenant
  ON evaluacion_del_caballo_de_paso_fino_horses (tenant_id);

CREATE TABLE IF NOT EXISTS evaluacion_del_caballo_de_paso_fino_evaluations (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  horse_id        INTEGER NOT NULL,
  cadence_bpm     DOUBLE PRECISION,
  regularity_cv   DOUBLE PRECISION,
  verdict         VARCHAR(40) NOT NULL,
  recommendation  TEXT,
  beat_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecpf_evaluations_tenant
  ON evaluacion_del_caballo_de_paso_fino_evaluations (tenant_id);

CREATE INDEX IF NOT EXISTS idx_ecpf_evaluations_horse
  ON evaluacion_del_caballo_de_paso_fino_evaluations (horse_id);
