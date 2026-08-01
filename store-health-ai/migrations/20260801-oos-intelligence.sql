-- =====================================================
-- Store Health AI — OOS Intelligence columns
--
-- Adds the Shelf-Confidence attribution layer to the existing out_of_stock_events
-- table and an optional economics/signal bag to inventory_levels.
--
-- Fully idempotent. Applied automatically on first use of the OOS intelligence
-- service (ensureSchema in src/services/oos-intelligence.js) and safe to run by
-- hand. sync({alter:false}) never adds columns to an existing table, which is
-- why these are explicit ALTERs.
-- =====================================================

-- ---------------------------------------------------------------------------
-- PART 1 — reconcile the live tables with their Sequelize models.
--
-- The deployed inventory_levels and out_of_stock_events tables never matched
-- models/InventoryLevel.js and models/OutOfStockEvent.js: the live tables were
-- created without the columns migration 20260202-13 declares (quantity_on_hand,
-- average_daily_sales, snapshot_date, ...). Nothing in the codebase read those
-- fields and both tables held zero rows, so the mismatch went unnoticed —
-- but it makes every model-driven insert fail, which is why this had to be
-- fixed before OOS intelligence could store or read anything.
--
-- All additive, all nullable-or-defaulted, both tables empty at time of writing.
-- ---------------------------------------------------------------------------
ALTER TABLE inventory_levels
  ADD COLUMN IF NOT EXISTS product_name        VARCHAR(255),
  ADD COLUMN IF NOT EXISTS category            VARCHAR(100),
  ADD COLUMN IF NOT EXISTS snapshot_date       DATE,
  ADD COLUMN IF NOT EXISTS quantity_on_hand    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS average_daily_sales NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS days_of_cover       NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS is_top_sku          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS is_out_of_stock     BOOLEAN NOT NULL DEFAULT FALSE;

-- Legacy column: NOT NULL with no default, and the model does not declare it,
-- so every model-driven insert would fail on it. Default it to 0 rather than
-- dropping it — dropping a column is not reversible if some external job writes
-- to it. quantity_on_hand is the canonical field going forward.
ALTER TABLE inventory_levels
  ALTER COLUMN quantity SET DEFAULT 0;

ALTER TABLE out_of_stock_events
  ADD COLUMN IF NOT EXISTS product_name          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS estimated_lost_sales  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_top_sku            BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_inventory_levels_store_date
  ON inventory_levels (store_id, snapshot_date);

-- ---------------------------------------------------------------------------
-- PART 2 — the Shelf-Confidence attribution layer.
-- ---------------------------------------------------------------------------

-- Attribution + dollarization on each stockout.
ALTER TABLE out_of_stock_events
  ADD COLUMN IF NOT EXISTS lost_gross_profit      NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS root_cause             VARCHAR(64),
  ADD COLUMN IF NOT EXISTS oos_layer              VARCHAR(16),
  ADD COLUMN IF NOT EXISTS root_cause_confidence  NUMERIC(4,2),
  ADD COLUMN IF NOT EXISTS root_cause_why         TEXT,
  ADD COLUMN IF NOT EXISTS recommended_action     TEXT;

COMMENT ON COLUMN out_of_stock_events.root_cause IS
  'One of seven categories: Product Data Accuracy, Order and Inventory Accuracy, Demand Forecast Accuracy, Replenishment and Allocation, Shelf Space Allocation, Planogram Compliance, Item Management';
COMMENT ON COLUMN out_of_stock_events.oos_layer IS
  'shelf | store | upstream. Gruen & Corsten (2022) find 70-75% of out-of-stocks originate at store level (shelf + store).';

CREATE INDEX IF NOT EXISTS idx_oos_events_root_cause
  ON out_of_stock_events (root_cause);
CREATE INDEX IF NOT EXISTS idx_oos_events_layer
  ON out_of_stock_events (oos_layer);

-- Optional per-SKU economics + attribution signals.
ALTER TABLE inventory_levels
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN inventory_levels.metadata IS
  'Optional: unit_price, margin, oos_days, shelf_empty, planogram_violation, shelf_capacity, min_shelf_qty, po_open, po_filled, recent_delivery, forecast_velocity. Missing keys fall back to org defaults and the dollar figure is labelled as estimated.';
