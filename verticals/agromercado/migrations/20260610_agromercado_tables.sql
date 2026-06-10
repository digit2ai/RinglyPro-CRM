-- AgroMercadoDigital — canonical schema (ISTC). Multi-tenant, am_ prefix.
-- Tables auto-create on boot via Sequelize sync({alter:false}); this file is the
-- authoritative DDL of record for audits and manual provisioning.

CREATE TABLE IF NOT EXISTS am_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NOT NULL DEFAULT 1,
  cedula_rif VARCHAR(20) NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  role VARCHAR(15) NOT NULL DEFAULT 'buyer' CHECK (role IN ('admin','producer','buyer')),
  is_verified BOOLEAN DEFAULT FALSE,
  password_hash VARCHAR(255),
  phone VARCHAR(40),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (tenant_id, cedula_rif)
);

CREATE TABLE IF NOT EXISTS am_products (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  category_id VARCHAR(20) NOT NULL,
  price_usd NUMERIC(12,2) NOT NULL,
  location_state VARCHAR(50) NOT NULL,
  vendor_id UUID REFERENCES am_users(id),
  condition VARCHAR(20),
  metadata JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_products_tenant ON am_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_am_products_category ON am_products(category_id);
CREATE INDEX IF NOT EXISTS idx_am_products_state ON am_products(location_state);
CREATE INDEX IF NOT EXISTS idx_am_products_metadata_gin ON am_products USING GIN (metadata);

CREATE TABLE IF NOT EXISTS am_auctions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  title VARCHAR(255) NOT NULL,
  category_id VARCHAR(20) NOT NULL,
  lots INTEGER DEFAULT 1,
  start_price_usd NUMERIC(12,2) NOT NULL,
  current_bid_usd NUMERIC(12,2),
  base_increment_usd NUMERIC(12,2) NOT NULL DEFAULT 50,
  starts_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) DEFAULT 'scheduled',
  location VARCHAR(120),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_auctions_tenant ON am_auctions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_am_auctions_status ON am_auctions(status);

CREATE TABLE IF NOT EXISTS am_bids (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  auction_id BIGINT NOT NULL REFERENCES am_auctions(id),
  bidder_id UUID REFERENCES am_users(id),
  amount_usd NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_bids_auction ON am_bids(auction_id, created_at);
CREATE INDEX IF NOT EXISTS idx_am_bids_tenant ON am_bids(tenant_id);

CREATE TABLE IF NOT EXISTS am_fx_rates (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  bcv_ves NUMERIC(14,4) NOT NULL,
  parallel_ves NUMERIC(14,4),
  source VARCHAR(40),
  fetched_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_fx_tenant_time ON am_fx_rates(tenant_id, fetched_at);

CREATE TABLE IF NOT EXISTS am_kyc (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  user_id UUID REFERENCES am_users(id),
  cedula_rif VARCHAR(20) NOT NULL,
  doc_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  reviewed_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_kyc_tenant ON am_kyc(tenant_id);
CREATE INDEX IF NOT EXISTS idx_am_kyc_status ON am_kyc(status);

CREATE TABLE IF NOT EXISTS am_directory (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  nombre VARCHAR(120) NOT NULL,
  profession VARCHAR(60) NOT NULL,
  state VARCHAR(50),
  certification VARCHAR(120),
  contact VARCHAR(120),
  is_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_directory_tenant ON am_directory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_am_directory_profession ON am_directory(profession);

CREATE TABLE IF NOT EXISTS am_farms (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  owner_id UUID REFERENCES am_users(id),
  name VARCHAR(120),
  state VARCHAR(50),
  lat NUMERIC(9,6),
  lng NUMERIC(9,6),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_farms_tenant ON am_farms(tenant_id);

CREATE TABLE IF NOT EXISTS am_service_requests (
  id BIGSERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL DEFAULT 1,
  type VARCHAR(20) NOT NULL,
  requester_id UUID,
  payload JSONB DEFAULT '{}'::jsonb,
  status VARCHAR(20) DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_am_service_tenant ON am_service_requests(tenant_id);
CREATE INDEX IF NOT EXISTS idx_am_service_type ON am_service_requests(type);
