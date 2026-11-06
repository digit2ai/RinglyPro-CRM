-- del Calor al Sabor (Delca) — products, ordering sessions, orders.
-- Runs on every boot under an advisory lock: every statement is idempotent.
CREATE TABLE IF NOT EXISTS dlc_products (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  code VARCHAR(80) NOT NULL,
  category VARCHAR(60) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  kind VARCHAR(20) NOT NULL DEFAULT 'product',
  options JSONB,
  available BOOLEAN NOT NULL DEFAULT TRUE,
  sort INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dlc_products_tenant_code ON dlc_products (tenant_id, code);
CREATE INDEX IF NOT EXISTS ix_dlc_products_tenant ON dlc_products (tenant_id);

CREATE TABLE IF NOT EXISTS dlc_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  sid_hash CHAR(64) NOT NULL,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_dlc_sessions_tenant_sid ON dlc_sessions (tenant_id, sid_hash);
CREATE INDEX IF NOT EXISTS ix_dlc_sessions_tenant ON dlc_sessions (tenant_id);

CREATE TABLE IF NOT EXISTS dlc_orders (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  number VARCHAR(20),
  session_id INTEGER,
  customer_name VARCHAR(80) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  mode VARCHAR(12) NOT NULL,
  address TEXT,
  notes TEXT,
  total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  status VARCHAR(20) NOT NULL DEFAULT 'nuevo',
  whatsapp_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  whatsapp_detail TEXT,
  composed_by VARCHAR(20),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_dlc_orders_tenant_created ON dlc_orders (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS dlc_order_items (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  order_id INTEGER NOT NULL REFERENCES dlc_orders(id) ON DELETE CASCADE,
  product_code VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price_cents INTEGER NOT NULL,
  line_cents INTEGER NOT NULL,
  note VARCHAR(160)
);
CREATE INDEX IF NOT EXISTS ix_dlc_order_items_tenant_order ON dlc_order_items (tenant_id, order_id);
