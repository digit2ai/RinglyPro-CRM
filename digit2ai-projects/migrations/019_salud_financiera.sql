-- Salud Financiera (owner-only personal finance module in the Projects Hub).
-- Idempotent: runs on first use of the module, safe to run again.
-- Prefix sf_ because the Hub database is shared with every other module
-- (the spec named the tables `movimientos` and `conversaciones_lina`).

CREATE TABLE IF NOT EXISTS sf_movimientos (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  fecha       DATE NOT NULL,
  concepto    TEXT NOT NULL,
  tipo        TEXT NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  monto_real  NUMERIC(12,2) CHECK (monto_real IS NULL OR monto_real >= 0),
  categoria   TEXT NOT NULL CHECK (categoria IN ('ahorro','salario','ingreso_extra','inversion','corte','pago_lina','hija','gasto_semanal','gasto_personal','otro')),
  origen      TEXT NOT NULL CHECK (origen IN ('plan','real')),
  estado      TEXT CHECK (estado IS NULL OR estado IN ('pendiente','cumplido')),
  nota        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sf_movimientos_tenant_idx ON sf_movimientos (tenant_id);
CREATE INDEX IF NOT EXISTS sf_movimientos_user_fecha_idx ON sf_movimientos (user_id, fecha);

CREATE TABLE IF NOT EXISTS sf_conversaciones_lina (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  pregunta    TEXT NOT NULL,
  respuesta   TEXT NOT NULL,
  canal       TEXT NOT NULL CHECK (canal IN ('voz','texto')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sf_conversaciones_tenant_idx ON sf_conversaciones_lina (tenant_id);
CREATE INDEX IF NOT EXISTS sf_conversaciones_user_idx ON sf_conversaciones_lina (user_id, id);

CREATE TABLE IF NOT EXISTS sf_config (
  user_id             INTEGER PRIMARY KEY,
  tenant_id           INTEGER NOT NULL,
  colchon_meta        NUMERIC(12,2) NOT NULL DEFAULT 1000.00,
  presupuesto_semanal NUMERIC(12,2) NOT NULL DEFAULT 100.00,
  seeded_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sf_config_tenant_idx ON sf_config (tenant_id);

-- Lina's conversation state: one pending change awaiting "sí", and the date
-- or month last discussed (so "¿y cómo se calcula eso?" knows what "eso" is).
ALTER TABLE sf_config ADD COLUMN IF NOT EXISTS pendiente JSONB;
ALTER TABLE sf_config ADD COLUMN IF NOT EXISTS pendiente_at TIMESTAMPTZ;
ALTER TABLE sf_config ADD COLUMN IF NOT EXISTS contexto JSONB;
