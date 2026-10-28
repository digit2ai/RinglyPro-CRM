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

-- 2026-10-25: 'servicios' category for monthly bills, and the owner's monthly
-- recurring items (AT&T, Render, ...). Recurrences are data, never code.
ALTER TABLE sf_movimientos DROP CONSTRAINT IF EXISTS sf_movimientos_categoria_check;
ALTER TABLE sf_movimientos ADD CONSTRAINT sf_movimientos_categoria_check CHECK (categoria IN ('ahorro','salario','ingreso_extra','inversion','corte','pago_lina','hija','gasto_semanal','gasto_personal','servicios','otro'));

CREATE TABLE IF NOT EXISTS sf_recurrentes (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  concepto    TEXT NOT NULL,
  tipo        TEXT NOT NULL DEFAULT 'egreso' CHECK (tipo IN ('ingreso','egreso')),
  monto       NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  categoria   TEXT NOT NULL DEFAULT 'servicios',
  dia         INTEGER CHECK (dia IS NULL OR (dia BETWEEN 1 AND 31)),
  fin_de_mes  BOOLEAN NOT NULL DEFAULT FALSE,
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sf_recurrentes_tenant_idx ON sf_recurrentes (tenant_id);
CREATE INDEX IF NOT EXISTS sf_recurrentes_user_idx ON sf_recurrentes (user_id);

-- 2026-10-25: Lina's brain. Every write she makes is recorded so it can be
-- undone; the owner's standing rules live in sf_config.preferencias; each
-- conversation row records which engine answered and what tools it used.
CREATE TABLE IF NOT EXISTS sf_cambios (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  accion         TEXT NOT NULL,
  descripcion    TEXT NOT NULL,
  datos          JSONB NOT NULL DEFAULT '{}'::jsonb,
  deshecho       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sf_cambios_tenant_idx ON sf_cambios (tenant_id);
CREATE INDEX IF NOT EXISTS sf_cambios_user_idx ON sf_cambios (user_id, id);
ALTER TABLE sf_config ADD COLUMN IF NOT EXISTS preferencias JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE sf_conversaciones_lina ADD COLUMN IF NOT EXISTS motor TEXT;
ALTER TABLE sf_conversaciones_lina ADD COLUMN IF NOT EXISTS detalle JSONB;

-- 2026-10-26: Bank of America via Plaid, READ-ONLY. One row per bank login
-- (Plaid Item). access_token_enc is AES-256-GCM and no read route selects it.
CREATE TABLE IF NOT EXISTS sf_plaid_items (
  id                 SERIAL PRIMARY KEY,
  tenant_id          INTEGER NOT NULL,
  user_id            INTEGER NOT NULL,
  item_id            TEXT NOT NULL,
  institution_id     TEXT,
  institution_name   TEXT,
  access_token_enc   TEXT NOT NULL,
  cursor             TEXT,
  estado             TEXT NOT NULL DEFAULT 'activo' CHECK (estado IN ('activo','login_requerido','por_desconectar','desconectado')),
  importar_desde     DATE NOT NULL,
  consent_expira     TIMESTAMPTZ,
  historial_completo BOOLEAN NOT NULL DEFAULT FALSE,
  recurrencia        TEXT NOT NULL DEFAULT 'plaid' CHECK (recurrencia IN ('plaid','detector')),
  ultimo_sync        TIMESTAMPTZ,
  ultimo_error       TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sf_plaid_items_item_uq ON sf_plaid_items (item_id);
CREATE INDEX IF NOT EXISTS sf_plaid_items_tenant_idx ON sf_plaid_items (tenant_id);
CREATE INDEX IF NOT EXISTS sf_plaid_items_user_idx ON sf_plaid_items (user_id);

CREATE TABLE IF NOT EXISTS sf_plaid_accounts (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  item_id     TEXT NOT NULL,
  account_id  TEXT NOT NULL,
  nombre      TEXT,
  mask        TEXT,
  tipo        TEXT,
  subtipo     TEXT,
  incluir     BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE UNIQUE INDEX IF NOT EXISTS sf_plaid_accounts_acct_uq ON sf_plaid_accounts (account_id);
CREATE INDEX IF NOT EXISTS sf_plaid_accounts_tenant_idx ON sf_plaid_accounts (tenant_id);
CREATE INDEX IF NOT EXISTS sf_plaid_accounts_user_idx ON sf_plaid_accounts (user_id, item_id);

-- Every bank transaction, every account, every date (the history feeds the
-- recurring detector). Only included accounts from importar_desde onward
-- become rows in sf_movimientos; mov_id points at the row it became or matched.
CREATE TABLE IF NOT EXISTS sf_plaid_txn (
  id                      SERIAL PRIMARY KEY,
  tenant_id               INTEGER NOT NULL,
  user_id                 INTEGER NOT NULL,
  item_id                 TEXT NOT NULL,
  account_id              TEXT NOT NULL,
  transaction_id          TEXT NOT NULL,
  fecha                   DATE NOT NULL,
  nombre                  TEXT,
  comercio                TEXT,
  monto_cents             BIGINT NOT NULL,
  pending                 BOOLEAN NOT NULL DEFAULT FALSE,
  pfc_primary             TEXT,
  pfc_detailed            TEXT,
  mov_id                  INTEGER,
  enlace                  TEXT CHECK (enlace IS NULL OR enlace IN ('nuevo','plan','manual')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sf_plaid_txn_tx_uq ON sf_plaid_txn (transaction_id);
CREATE INDEX IF NOT EXISTS sf_plaid_txn_tenant_idx ON sf_plaid_txn (tenant_id);
CREATE INDEX IF NOT EXISTS sf_plaid_txn_user_idx ON sf_plaid_txn (user_id, account_id, fecha);
CREATE INDEX IF NOT EXISTS sf_plaid_txn_mov_idx ON sf_plaid_txn (mov_id);

-- Webhook inbox: stored first, processed after the 200, deduped on the body hash.
CREATE TABLE IF NOT EXISTS sf_plaid_webhooks (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL,
  item_id        TEXT,
  tipo           TEXT,
  codigo         TEXT,
  cuerpo_sha256  TEXT NOT NULL,
  payload        JSONB,
  procesado_at   TIMESTAMPTZ,
  error          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sf_plaid_webhooks_sha_uq ON sf_plaid_webhooks (cuerpo_sha256);
CREATE INDEX IF NOT EXISTS sf_plaid_webhooks_tenant_idx ON sf_plaid_webhooks (tenant_id);

-- Recurring charges / subscriptions: Plaid's streams, or our own detector's.
CREATE TABLE IF NOT EXISTS sf_plaid_recurrentes (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL,
  user_id        INTEGER NOT NULL,
  stream_id      TEXT NOT NULL,
  fuente         TEXT NOT NULL CHECK (fuente IN ('plaid','detector')),
  direccion      TEXT NOT NULL CHECK (direccion IN ('entrada','salida')),
  descripcion    TEXT,
  comercio       TEXT,
  frecuencia     TEXT,
  status         TEXT,
  activo         BOOLEAN,
  monto_promedio NUMERIC(12,2),
  monto_ultimo   NUMERIC(12,2),
  proxima_fecha  DATE,
  categoria      TEXT,
  visto_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS sf_plaid_rec_stream_uq ON sf_plaid_recurrentes (user_id, stream_id);
CREATE INDEX IF NOT EXISTS sf_plaid_rec_tenant_idx ON sf_plaid_recurrentes (tenant_id);

-- In-app alerts only (new subscription, amount changed, reconnect). Nothing is sent outside the app.
CREATE TABLE IF NOT EXISTS sf_alertas (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  tipo        TEXT NOT NULL,
  ref         TEXT,
  texto       TEXT NOT NULL,
  leida       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sf_alertas_tenant_idx ON sf_alertas (tenant_id);
CREATE INDEX IF NOT EXISTS sf_alertas_user_idx ON sf_alertas (user_id, leida, id);
CREATE UNIQUE INDEX IF NOT EXISTS sf_alertas_ref_uq ON sf_alertas (user_id, tipo, ref) WHERE ref IS NOT NULL;

-- Category overrides: 'merchant:<name>' -> our category. A manual rule beats the PFC map.
CREATE TABLE IF NOT EXISTS sf_categoria_reglas (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  clave       TEXT NOT NULL,
  categoria   TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS sf_cat_reglas_uq ON sf_categoria_reglas (user_id, clave);
CREATE INDEX IF NOT EXISTS sf_cat_reglas_tenant_idx ON sf_categoria_reglas (tenant_id);

ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS fuente TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS pendiente_banco BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS comercio TEXT;
ALTER TABLE sf_movimientos ADD COLUMN IF NOT EXISTS categoria_manual BOOLEAN NOT NULL DEFAULT FALSE;
-- review 2026-10-26: a webhook is claimed, then marked done only on success (failures retry);
-- 'cumplido' = the bank confirmed a plan row the owner had already marked paid (link only).
ALTER TABLE sf_plaid_webhooks ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
ALTER TABLE sf_plaid_webhooks ADD COLUMN IF NOT EXISTS intentos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sf_plaid_txn DROP CONSTRAINT IF EXISTS sf_plaid_txn_enlace_check;
ALTER TABLE sf_plaid_txn ADD CONSTRAINT sf_plaid_txn_enlace_check CHECK (enlace IS NULL OR enlace IN ('nuevo','plan','cumplido','manual'));

-- 2026-10-26: bank balances per account (from /accounts/get, free with Transactions), the account's role
-- (corte = receives the paycheck and pays the Corte; gastos = everything else) and the Corte cushion
ALTER TABLE sf_plaid_accounts ADD COLUMN IF NOT EXISTS saldo_actual NUMERIC(12,2);
ALTER TABLE sf_plaid_accounts ADD COLUMN IF NOT EXISTS saldo_disponible NUMERIC(12,2);
ALTER TABLE sf_plaid_accounts ADD COLUMN IF NOT EXISTS saldo_at TIMESTAMPTZ;
ALTER TABLE sf_plaid_accounts ADD COLUMN IF NOT EXISTS rol TEXT;
ALTER TABLE sf_config ADD COLUMN IF NOT EXISTS colchon_corte NUMERIC(12,2) DEFAULT 200;

-- STALL warning: alarm keys the owner acknowledged (2026-10-28)
ALTER TABLE sf_config ADD COLUMN IF NOT EXISTS alarmas_vistas JSONB NOT NULL DEFAULT '[]'::jsonb;
