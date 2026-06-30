-- Solicitud por Voz — Comercializadora de Palma
-- Canonical migration. The Sequelize model also creates this table on boot via
-- sync({alter:false}); this file is the source of truth / manual-apply path.

CREATE TABLE IF NOT EXISTS solicitud_por_voz_contexto_del_cliente_e_transactions (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  type          VARCHAR(16) NOT NULL DEFAULT 'sale',   -- sale | purchase | import
  amount_usd    NUMERIC(16,2) NOT NULL DEFAULT 0,
  counterparty  VARCHAR(255),
  note          VARCHAR(500),
  source        VARCHAR(16) NOT NULL DEFAULT 'form',    -- form | voice
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitud_por_voz_transactions_tenant
  ON solicitud_por_voz_contexto_del_cliente_e_transactions (tenant_id);
