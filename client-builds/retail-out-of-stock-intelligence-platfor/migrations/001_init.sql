-- =====================================================
-- Retail Out-of-Stock Intelligence Platform — canonical schema
--
-- Applied idempotently by lib/store.js via sequelize.sync({alter:false}) on
-- boot. This file is the source of truth for a manual/DBA-run migration and
-- must stay in step with models/*.js.
--
-- Multi-tenant: every table carries tenant_id NOT NULL + an index on it.
-- =====================================================

-- ---------------------------------------------------------------------------
-- Ingest audit trail: one row per daily batch.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retail_out_of_stock_intelligence_platfor_batches (
  id                     SERIAL PRIMARY KEY,
  tenant_id              INTEGER NOT NULL DEFAULT 1,
  batch_id               VARCHAR(64) NOT NULL UNIQUE,
  store_id               VARCHAR(64),
  row_count              INTEGER NOT NULL DEFAULT 0,
  oos_detected           INTEGER NOT NULL DEFAULT 0,
  total_skus             INTEGER NOT NULL DEFAULT 0,
  skipped                INTEGER NOT NULL DEFAULT 0,
  lost_sales_usd         NUMERIC(14,2),
  lost_gross_profit_usd  NUMERIC(14,2),
  source                 VARCHAR(32),
  ingested_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_roosip_batches_tenant
  ON retail_out_of_stock_intelligence_platfor_batches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_roosip_batches_tenant_store
  ON retail_out_of_stock_intelligence_platfor_batches (tenant_id, store_id);

-- ---------------------------------------------------------------------------
-- Raw ingested POS + inventory rows, retained so an attribution can be
-- re-derived when better classifier rules ship.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retail_out_of_stock_intelligence_platfor_inventory (
  id                 SERIAL PRIMARY KEY,
  tenant_id          INTEGER NOT NULL DEFAULT 1,
  batch_id           VARCHAR(64),
  store_id           VARCHAR(64) NOT NULL,
  sku                VARCHAR(100) NOT NULL,
  product_name       VARCHAR(255),
  category           VARCHAR(100),
  on_hand            INTEGER,
  unit_price         NUMERIC(12,2),
  margin             NUMERIC(6,4),
  avg_velocity       NUMERIC(12,3),
  forecast_velocity  NUMERIC(12,3),
  shelf_capacity     INTEGER,
  min_shelf_qty      INTEGER,
  shelf_empty        BOOLEAN,
  po_open            BOOLEAN,
  po_filled          BOOLEAN,
  recent_delivery    BOOLEAN,
  is_out_of_stock    BOOLEAN NOT NULL DEFAULT FALSE,
  snapshot_date      DATE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_roosip_inventory_tenant
  ON retail_out_of_stock_intelligence_platfor_inventory (tenant_id);
CREATE INDEX IF NOT EXISTS idx_roosip_inventory_tenant_store
  ON retail_out_of_stock_intelligence_platfor_inventory (tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_roosip_inventory_batch
  ON retail_out_of_stock_intelligence_platfor_inventory (batch_id);

-- ---------------------------------------------------------------------------
-- The product: every stockout, priced and root-caused.
--   root_cause is one of the seven categories (see lib/classifier.js).
--   layer is shelf | store | upstream — the Store vs Shelf split.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS retail_out_of_stock_intelligence_platfor_oos_events (
  id                     SERIAL PRIMARY KEY,
  tenant_id              INTEGER NOT NULL DEFAULT 1,
  batch_id               VARCHAR(64),
  store_id               VARCHAR(64) NOT NULL,
  sku                    VARCHAR(100) NOT NULL,
  product_name           VARCHAR(255),
  category               VARCHAR(100),

  on_hand                INTEGER,
  avg_velocity           NUMERIC(12,3),
  unit_price             NUMERIC(12,2),
  margin                 NUMERIC(6,4),
  oos_days               NUMERIC(8,2) NOT NULL DEFAULT 1,
  on_shelf_stockout      BOOLEAN NOT NULL DEFAULT FALSE,

  lost_units             NUMERIC(14,3),
  lost_sales_usd         NUMERIC(14,2),
  lost_gross_profit_usd  NUMERIC(14,2),
  net_retailer_loss_usd  NUMERIC(14,2),
  brand_loss_usd         NUMERIC(14,2),
  recoverable_usd        NUMERIC(14,2),

  root_cause             VARCHAR(64) NOT NULL,
  layer                  VARCHAR(16),
  confidence             NUMERIC(4,2),
  rule                   VARCHAR(16),
  why                    TEXT,
  action                 TEXT,

  event_date             DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_roosip_events_tenant
  ON retail_out_of_stock_intelligence_platfor_oos_events (tenant_id);
CREATE INDEX IF NOT EXISTS idx_roosip_events_tenant_store
  ON retail_out_of_stock_intelligence_platfor_oos_events (tenant_id, store_id);
CREATE INDEX IF NOT EXISTS idx_roosip_events_batch
  ON retail_out_of_stock_intelligence_platfor_oos_events (batch_id);
CREATE INDEX IF NOT EXISTS idx_roosip_events_root_cause
  ON retail_out_of_stock_intelligence_platfor_oos_events (root_cause);
