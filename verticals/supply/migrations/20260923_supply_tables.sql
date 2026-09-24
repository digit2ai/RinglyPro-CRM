-- RinglyPro Supply — canonical schema. Runs on every boot under an advisory
-- lock (src/db.js), so the migration IS the schema. Every statement must stay
-- idempotent. Prefix sup_. tenant_id = the supplier (sup_tenants.id); every
-- tenant-owned table carries it NOT NULL and indexed.

CREATE TABLE IF NOT EXISTS sup_tenants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(80) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'America/New_York',
  status VARCHAR(20) NOT NULL DEFAULT 'trial',          -- trial | active | suspended | cancelled
  is_demo BOOLEAN NOT NULL DEFAULT false,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,           -- calling hours, disclosure, commission default
  ghl JSONB NOT NULL DEFAULT '{}'::jsonb,                -- location id, workflow ids, field keys, pipeline ids (no secrets)
  ghl_secret_enc TEXT,                                   -- AES-256-GCM private-integration token
  webhook_token VARCHAR(80) NOT NULL,
  billing JSONB NOT NULL DEFAULT '{}'::jsonb,            -- plan, seats, locations, usage meters (model not decided)
  onboarding JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sup_tenants_slug_uq ON sup_tenants (slug);
CREATE UNIQUE INDEX IF NOT EXISTS sup_tenants_webhook_uq ON sup_tenants (webhook_token);

CREATE TABLE IF NOT EXISTS sup_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER,                                     -- NULL only for a platform super admin
  email VARCHAR(200) NOT NULL,
  name VARCHAR(200),
  password_hash VARCHAR(200) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',             -- owner | admin | rep | viewer
  is_super_admin BOOLEAN NOT NULL DEFAULT false,
  created_by_seed BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sup_users_email_uq ON sup_users (lower(email));
CREATE INDEX IF NOT EXISTS sup_users_tenant_idx ON sup_users (tenant_id);

CREATE TABLE IF NOT EXISTS sup_sales_reps (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(40),
  user_id INTEGER,
  commission_pct NUMERIC(6,3),
  is_default BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_sales_reps_tenant_idx ON sup_sales_reps (tenant_id);

CREATE TABLE IF NOT EXISTS sup_categories (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(120) NOT NULL,
  keywords TEXT NOT NULL DEFAULT '',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_categories_tenant_idx ON sup_categories (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_categories_name_uq ON sup_categories (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS sup_products (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  sku VARCHAR(120),
  upc VARCHAR(40),
  name VARCHAR(300) NOT NULL,
  category VARCHAR(160),
  subcategory VARCHAR(160),
  description TEXT,
  brand VARCHAR(160),
  model VARCHAR(160),
  dimensions VARCHAR(160),
  material VARCHAR(160),
  unit VARCHAR(40),
  quantity_available NUMERIC(14,2),
  cost NUMERIC(14,4),
  selling_price NUMERIC(14,4),
  minimum_price NUMERIC(14,4),
  promotional_price NUMERIC(14,4),
  inventory_location VARCHAR(200),
  image TEXT,
  product_url TEXT,
  notes TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_products_tenant_idx ON sup_products (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_products_sku_uq ON sup_products (tenant_id, lower(sku)) WHERE sku IS NOT NULL AND sku <> '';

CREATE TABLE IF NOT EXISTS sup_product_relevance (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  relevance_score INTEGER NOT NULL,
  reasoning_summary TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'rules',           -- rules | model | manual
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_product_relevance_tenant_idx ON sup_product_relevance (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_product_relevance_uq ON sup_product_relevance (product_id, category_id);

CREATE TABLE IF NOT EXISTS sup_competitors (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(160) NOT NULL,
  kind VARCHAR(40) NOT NULL DEFAULT 'retailer',
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_competitors_tenant_idx ON sup_competitors (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_competitors_name_uq ON sup_competitors (tenant_id, lower(name));

CREATE TABLE IF NOT EXISTS sup_competitor_prices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  competitor_id INTEGER NOT NULL,
  competitor_product VARCHAR(300) NOT NULL,
  competitor_sku VARCHAR(120),
  competitor_upc VARCHAR(40),
  competitor_brand VARCHAR(160),
  competitor_model VARCHAR(160),
  competitor_price NUMERIC(14,4) NOT NULL,
  competitor_unit VARCHAR(40),
  competitor_url TEXT,
  date_checked DATE NOT NULL,
  match_confidence NUMERIC(4,3) NOT NULL,
  match_basis JSONB NOT NULL DEFAULT '[]'::jsonb,
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_by INTEGER,
  price_difference NUMERIC(14,4),
  savings_percentage NUMERIC(7,3),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_competitor_prices_tenant_idx ON sup_competitor_prices (tenant_id);
CREATE INDEX IF NOT EXISTS sup_competitor_prices_product_idx ON sup_competitor_prices (tenant_id, product_id);

CREATE TABLE IF NOT EXISTS sup_contractors (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  company_name VARCHAR(250) NOT NULL,
  company_key VARCHAR(250) NOT NULL,
  contact_name VARCHAR(200),
  phone VARCHAR(40),
  phone_e164 VARCHAR(20),
  email VARCHAR(200),
  website TEXT,
  business_type VARCHAR(160),
  category_id INTEGER,
  address VARCHAR(250),
  city VARCHAR(120),
  state VARCHAR(40),
  zip VARCHAR(20),
  timezone VARCHAR(64),
  products_likely_needed JSONB NOT NULL DEFAULT '[]'::jsonb,
  product_match_score INTEGER,
  last_contact TIMESTAMPTZ,
  call_status VARCHAR(40),
  interest_level VARCHAR(20),
  stage VARCHAR(40) NOT NULL DEFAULT 'target_contractor',
  assigned_rep_id INTEGER,
  source VARCHAR(80),
  notes TEXT,
  do_not_contact BOOLEAN NOT NULL DEFAULT false,
  consent_status VARCHAR(30) NOT NULL DEFAULT 'unknown', -- unknown | business_published | express | revoked
  consent_note TEXT,
  ghl_contact_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_contractors_tenant_idx ON sup_contractors (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_contractors_phone_uq ON sup_contractors (tenant_id, phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS sup_contractors_company_idx ON sup_contractors (tenant_id, company_key);
CREATE INDEX IF NOT EXISTS sup_contractors_ghl_idx ON sup_contractors (tenant_id, ghl_contact_id);

CREATE TABLE IF NOT EXISTS sup_suppression (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  phone_e164 VARCHAR(20) NOT NULL,
  reason VARCHAR(60) NOT NULL,                             -- do_not_call | opt_out | internal_block | national_dnc
  source VARCHAR(60),
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_suppression_tenant_idx ON sup_suppression (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_suppression_uq ON sup_suppression (tenant_id, phone_e164);

CREATE TABLE IF NOT EXISTS sup_campaigns (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  campaign_name VARCHAR(200) NOT NULL,
  product_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  geographic_target JSONB NOT NULL DEFAULT '{}'::jsonb,    -- { states:[], cities:[], zips:[] }
  offer JSONB NOT NULL DEFAULT '{}'::jsonb,
  talking_points JSONB NOT NULL DEFAULT '[]'::jsonb,
  call_objective TEXT,
  agent JSONB NOT NULL DEFAULT '{}'::jsonb,                -- { ghl_agent_id, ghl_workflow_id, name }
  sales_rep_id INTEGER,
  calling_schedule JSONB NOT NULL DEFAULT '{}'::jsonb,     -- { days:[1..5], start:'09:00', end:'18:00' }
  daily_call_limit INTEGER NOT NULL DEFAULT 50,
  minimum_match_score INTEGER NOT NULL DEFAULT 60,
  priority VARCHAR(20),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  generated_by VARCHAR(20) NOT NULL DEFAULT 'manual',      -- manual | rules | model
  rationale TEXT,
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_campaigns_tenant_idx ON sup_campaigns (tenant_id);

CREATE TABLE IF NOT EXISTS sup_campaign_targets (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  campaign_id INTEGER NOT NULL,
  contractor_id INTEGER NOT NULL,
  score INTEGER NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',            -- queued | dispatched | done | skipped
  skip_reason TEXT,
  call_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_campaign_targets_tenant_idx ON sup_campaign_targets (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_campaign_targets_uq ON sup_campaign_targets (campaign_id, contractor_id);

CREATE TABLE IF NOT EXISTS sup_calls (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  campaign_id INTEGER,
  contractor_id INTEGER,
  direction VARCHAR(10) NOT NULL,                          -- outbound | inbound
  status VARCHAR(20) NOT NULL DEFAULT 'dispatched',        -- dispatched | completed | failed
  outcome VARCHAR(40),
  outcome_source VARCHAR(20),                              -- extracted | rules | model | manual
  provider VARCHAR(30) NOT NULL,
  provider_call_id VARCHAR(120),
  ghl_contact_id VARCHAR(80),
  context_package JSONB,
  summary TEXT,
  transcript TEXT,
  extracted JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_sec INTEGER,
  is_simulated BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sup_calls_tenant_idx ON sup_calls (tenant_id);
CREATE INDEX IF NOT EXISTS sup_calls_contractor_idx ON sup_calls (tenant_id, contractor_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_calls_provider_uq ON sup_calls (tenant_id, provider, provider_call_id) WHERE provider_call_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS sup_buyers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  contractor_id INTEGER NOT NULL,
  product_id INTEGER,
  quantity VARCHAR(120),
  price_discussed VARCHAR(120),
  competitive_context TEXT,
  interest_level VARCHAR(20),
  buying_timeframe VARCHAR(120),
  call_summary TEXT,
  transcript_reference INTEGER,
  ai_notes TEXT,
  campaign_id INTEGER,
  original_call_id INTEGER,
  assigned_rep_id INTEGER,
  next_action TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'open',              -- open | won | lost
  ghl_opportunity_id VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_buyers_tenant_idx ON sup_buyers (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_buyers_open_uq ON sup_buyers (tenant_id, contractor_id, COALESCE(product_id, 0)) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS sup_transfers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  call_id INTEGER NOT NULL,
  contractor_id INTEGER,
  product_id INTEGER,
  campaign_id INTEGER,
  sales_rep_id INTEGER,
  transfer_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome VARCHAR(40)
);
CREATE INDEX IF NOT EXISTS sup_transfers_tenant_idx ON sup_transfers (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_transfers_call_uq ON sup_transfers (tenant_id, call_id);

CREATE TABLE IF NOT EXISTS sup_sales (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  buyer_id INTEGER,
  contractor_id INTEGER NOT NULL,
  product_id INTEGER,
  campaign_id INTEGER,
  original_call_id INTEGER,
  sales_rep_id INTEGER,
  sale_amount NUMERIC(14,2) NOT NULL,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_sales_tenant_idx ON sup_sales (tenant_id);

CREATE TABLE IF NOT EXISTS sup_commissions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  sale_id INTEGER NOT NULL,
  campaign_id INTEGER,
  original_call_id INTEGER,
  contact_id INTEGER,
  product_id INTEGER,
  sales_rep_id INTEGER,
  sale_amount NUMERIC(14,2) NOT NULL,
  commission_percentage NUMERIC(6,3) NOT NULL,
  commission_amount NUMERIC(14,2) NOT NULL,
  commission_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | paid | void
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_commissions_tenant_idx ON sup_commissions (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_commissions_sale_uq ON sup_commissions (sale_id);

CREATE TABLE IF NOT EXISTS sup_webhook_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  provider VARCHAR(30) NOT NULL,
  event_key VARCHAR(120) NOT NULL,
  event_type VARCHAR(80),
  payload JSONB NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'received',          -- received | processed | ignored | failed
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sup_webhook_events_tenant_idx ON sup_webhook_events (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_webhook_events_uq ON sup_webhook_events (tenant_id, provider, event_key);

CREATE TABLE IF NOT EXISTS sup_audit (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  actor_id INTEGER,
  action VARCHAR(80) NOT NULL,
  subject_type VARCHAR(40),
  subject_id INTEGER,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_audit_tenant_idx ON sup_audit (tenant_id);

CREATE TABLE IF NOT EXISTS sup_integration_health (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  provider VARCHAR(30) NOT NULL,
  ok BOOLEAN NOT NULL,
  last_error TEXT,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sup_integration_health_tenant_idx ON sup_integration_health (tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS sup_integration_health_uq ON sup_integration_health (tenant_id, provider);

-- Platform lease for the background loop (one instance at a time). Not tenant data.
CREATE TABLE IF NOT EXISTS sup_locks (
  name VARCHAR(60) PRIMARY KEY,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT now(),
  holder VARCHAR(80)
);
