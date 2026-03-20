-- ============================================================
-- ImprintIQ - Core Database Schema
-- Promotional Products AI Ecosystem
-- All tables use iq_ prefix for namespace isolation
-- ============================================================

-- 1. USERS & AUTH
CREATE TABLE IF NOT EXISTS iq_users (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  role            VARCHAR(32) DEFAULT 'user',
  full_name       VARCHAR(255),
  phone           VARCHAR(32),
  department      VARCHAR(64),
  status          VARCHAR(16) DEFAULT 'active',
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_users_email ON iq_users(email);
CREATE INDEX IF NOT EXISTS idx_iq_users_tenant ON iq_users(tenant_id);

-- 2. CUSTOMERS (B2B clients who buy promo products)
CREATE TABLE IF NOT EXISTS iq_customers (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  company_name    VARCHAR(255) NOT NULL,
  contact_name    VARCHAR(255),
  contact_email   VARCHAR(255),
  contact_phone   VARCHAR(32),
  industry        VARCHAR(128),
  address         TEXT,
  city            VARCHAR(128),
  state           VARCHAR(64),
  zip             VARCHAR(16),
  country         VARCHAR(64) DEFAULT 'US',
  account_type    VARCHAR(32) DEFAULT 'standard',
  credit_limit    NUMERIC(12,2) DEFAULT 0,
  payment_terms   VARCHAR(32) DEFAULT 'net30',
  lifetime_value  NUMERIC(14,2) DEFAULT 0,
  last_order_date TIMESTAMPTZ,
  notes           TEXT,
  tags            TEXT[],
  status          VARCHAR(16) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_customers_tenant ON iq_customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_customers_company ON iq_customers(company_name);
CREATE INDEX IF NOT EXISTS idx_iq_customers_status ON iq_customers(status);

-- 3. PRODUCTS (catalog items — decorated promotional merchandise)
CREATE TABLE IF NOT EXISTS iq_products (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  sku             VARCHAR(64),
  name            VARCHAR(255) NOT NULL,
  description     TEXT,
  category        VARCHAR(128),
  subcategory     VARCHAR(128),
  brand           VARCHAR(128),
  base_price      NUMERIC(10,2),
  cost            NUMERIC(10,2),
  min_qty         INTEGER DEFAULT 1,
  decoration_methods TEXT[],
  available_colors TEXT[],
  material        VARCHAR(128),
  weight_oz       NUMERIC(8,2),
  dimensions      VARCHAR(128),
  imprint_area    VARCHAR(128),
  max_colors      INTEGER DEFAULT 4,
  setup_charge    NUMERIC(8,2) DEFAULT 0,
  rush_available  BOOLEAN DEFAULT true,
  eco_friendly    BOOLEAN DEFAULT false,
  made_in_usa     BOOLEAN DEFAULT false,
  supplier_id     INTEGER,
  supplier_sku    VARCHAR(64),
  image_url       TEXT,
  stock_qty       INTEGER DEFAULT 0,
  reorder_point   INTEGER DEFAULT 0,
  lead_time_days  INTEGER DEFAULT 5,
  status          VARCHAR(16) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_products_tenant ON iq_products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_products_sku ON iq_products(sku);
CREATE INDEX IF NOT EXISTS idx_iq_products_category ON iq_products(category);

-- 4. SUPPLIERS (upstream vendors — blank goods, overseas factories)
CREATE TABLE IF NOT EXISTS iq_suppliers (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  name            VARCHAR(255) NOT NULL,
  contact_name    VARCHAR(255),
  contact_email   VARCHAR(255),
  contact_phone   VARCHAR(32),
  country         VARCHAR(64) DEFAULT 'US',
  region          VARCHAR(64),
  lead_time_days  INTEGER DEFAULT 7,
  moq             INTEGER DEFAULT 1,
  quality_score   NUMERIC(4,2) DEFAULT 0,
  on_time_rate    NUMERIC(5,2) DEFAULT 0,
  defect_rate     NUMERIC(5,2) DEFAULT 0,
  asi_number      VARCHAR(32),
  ppai_number     VARCHAR(32),
  certifications  TEXT[],
  notes           TEXT,
  status          VARCHAR(16) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_suppliers_tenant ON iq_suppliers(tenant_id);

-- 5. QUOTES (proposals sent to customers)
CREATE TABLE IF NOT EXISTS iq_quotes (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  quote_number    VARCHAR(32) UNIQUE,
  customer_id     INTEGER REFERENCES iq_customers(id),
  assigned_rep_id INTEGER REFERENCES iq_users(id),
  title           VARCHAR(255),
  event_name      VARCHAR(255),
  event_date      DATE,
  total_amount    NUMERIC(14,2) DEFAULT 0,
  margin_pct      NUMERIC(5,2) DEFAULT 0,
  discount_pct    NUMERIC(5,2) DEFAULT 0,
  rush_order      BOOLEAN DEFAULT false,
  ship_by_date    DATE,
  notes           TEXT,
  stage           VARCHAR(32) DEFAULT 'draft',
  source          VARCHAR(64),
  lost_reason     VARCHAR(255),
  converted_order_id INTEGER,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_quotes_tenant ON iq_quotes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_quotes_customer ON iq_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_iq_quotes_stage ON iq_quotes(stage);

-- 6. QUOTE LINE ITEMS
CREATE TABLE IF NOT EXISTS iq_quote_items (
  id              SERIAL PRIMARY KEY,
  quote_id        INTEGER REFERENCES iq_quotes(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES iq_products(id),
  product_name    VARCHAR(255),
  quantity        INTEGER NOT NULL,
  unit_price      NUMERIC(10,2),
  unit_cost       NUMERIC(10,2),
  setup_charge    NUMERIC(8,2) DEFAULT 0,
  decoration      VARCHAR(64),
  imprint_colors  INTEGER DEFAULT 1,
  imprint_location VARCHAR(128),
  line_total      NUMERIC(12,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_quote_items_quote ON iq_quote_items(quote_id);

-- 7. ORDERS (converted quotes or direct orders)
CREATE TABLE IF NOT EXISTS iq_orders (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  order_number    VARCHAR(32) UNIQUE,
  quote_id        INTEGER REFERENCES iq_quotes(id),
  customer_id     INTEGER REFERENCES iq_customers(id),
  assigned_rep_id INTEGER REFERENCES iq_users(id),
  title           VARCHAR(255),
  total_amount    NUMERIC(14,2) DEFAULT 0,
  cost_total      NUMERIC(14,2) DEFAULT 0,
  margin_pct      NUMERIC(5,2) DEFAULT 0,
  rush_order      BOOLEAN DEFAULT false,
  ship_by_date    DATE,
  shipped_date    DATE,
  delivered_date  DATE,
  payment_status  VARCHAR(32) DEFAULT 'unpaid',
  payment_terms   VARCHAR(32) DEFAULT 'net30',
  ship_to_name    VARCHAR(255),
  ship_to_address TEXT,
  ship_to_city    VARCHAR(128),
  ship_to_state   VARCHAR(64),
  ship_to_zip     VARCHAR(16),
  tracking_number VARCHAR(128),
  carrier         VARCHAR(64),
  notes           TEXT,
  stage           VARCHAR(32) DEFAULT 'received',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_orders_tenant ON iq_orders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_orders_customer ON iq_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_iq_orders_stage ON iq_orders(stage);

-- 8. ORDER LINE ITEMS
CREATE TABLE IF NOT EXISTS iq_order_items (
  id              SERIAL PRIMARY KEY,
  order_id        INTEGER REFERENCES iq_orders(id) ON DELETE CASCADE,
  product_id      INTEGER REFERENCES iq_products(id),
  product_name    VARCHAR(255),
  quantity        INTEGER NOT NULL,
  unit_price      NUMERIC(10,2),
  unit_cost       NUMERIC(10,2),
  setup_charge    NUMERIC(8,2) DEFAULT 0,
  decoration      VARCHAR(64),
  imprint_colors  INTEGER DEFAULT 1,
  imprint_location VARCHAR(128),
  line_total      NUMERIC(12,2),
  production_status VARCHAR(32) DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_order_items_order ON iq_order_items(order_id);

-- 9. ARTWORK (submitted art files + proofing workflow)
CREATE TABLE IF NOT EXISTS iq_artwork (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  order_id        INTEGER REFERENCES iq_orders(id),
  quote_id        INTEGER REFERENCES iq_quotes(id),
  customer_id     INTEGER REFERENCES iq_customers(id),
  file_name       VARCHAR(255),
  file_url        TEXT,
  file_type       VARCHAR(32),
  dpi             INTEGER,
  is_vector       BOOLEAN DEFAULT false,
  color_mode      VARCHAR(16),
  dimensions_px   VARCHAR(64),
  fonts_outlined  BOOLEAN,
  ai_preflight    JSONB DEFAULT '{}',
  proof_url       TEXT,
  proof_status    VARCHAR(32) DEFAULT 'pending',
  revision_count  INTEGER DEFAULT 0,
  approved_at     TIMESTAMPTZ,
  approved_by     VARCHAR(255),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_artwork_order ON iq_artwork(order_id);
CREATE INDEX IF NOT EXISTS idx_iq_artwork_status ON iq_artwork(proof_status);

-- 10. PRODUCTION JOBS (decoration / manufacturing work)
CREATE TABLE IF NOT EXISTS iq_production_jobs (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  order_id        INTEGER REFERENCES iq_orders(id),
  order_item_id   INTEGER REFERENCES iq_order_items(id),
  decoration_method VARCHAR(64),
  machine_line    VARCHAR(64),
  operator        VARCHAR(128),
  quantity_target INTEGER,
  quantity_good   INTEGER DEFAULT 0,
  quantity_defect INTEGER DEFAULT 0,
  setup_time_min  INTEGER DEFAULT 0,
  run_time_min    INTEGER DEFAULT 0,
  color_count     INTEGER DEFAULT 1,
  stitch_count    INTEGER,
  pantone_colors  TEXT[],
  priority        VARCHAR(16) DEFAULT 'normal',
  scheduled_start TIMESTAMPTZ,
  actual_start    TIMESTAMPTZ,
  actual_end      TIMESTAMPTZ,
  qc_passed       BOOLEAN,
  qc_notes        TEXT,
  stage           VARCHAR(32) DEFAULT 'queued',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_production_tenant ON iq_production_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_production_order ON iq_production_jobs(order_id);
CREATE INDEX IF NOT EXISTS idx_iq_production_stage ON iq_production_jobs(stage);

-- 11. INVENTORY (blank goods stock tracking)
CREATE TABLE IF NOT EXISTS iq_inventory (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  product_id      INTEGER REFERENCES iq_products(id),
  sku             VARCHAR(64),
  warehouse       VARCHAR(64) DEFAULT 'main',
  qty_on_hand     INTEGER DEFAULT 0,
  qty_reserved    INTEGER DEFAULT 0,
  qty_on_order    INTEGER DEFAULT 0,
  reorder_point   INTEGER DEFAULT 0,
  reorder_qty     INTEGER DEFAULT 0,
  last_counted    TIMESTAMPTZ,
  last_received   TIMESTAMPTZ,
  unit_cost       NUMERIC(10,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_inventory_tenant ON iq_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_inventory_product ON iq_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_iq_inventory_sku ON iq_inventory(sku);

-- 12. CALLS (voice AI call logs)
CREATE TABLE IF NOT EXISTS iq_calls (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id     INTEGER REFERENCES iq_customers(id),
  direction       VARCHAR(16) DEFAULT 'inbound',
  phone_from      VARCHAR(32),
  phone_to        VARCHAR(32),
  agent_name      VARCHAR(64),
  duration_sec    INTEGER DEFAULT 0,
  outcome         VARCHAR(32),
  transcript      TEXT,
  summary         TEXT,
  intent          VARCHAR(64),
  sentiment       VARCHAR(16),
  quote_generated BOOLEAN DEFAULT false,
  order_placed    BOOLEAN DEFAULT false,
  follow_up_needed BOOLEAN DEFAULT false,
  follow_up_date  DATE,
  recording_url   TEXT,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_calls_tenant ON iq_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_calls_customer ON iq_calls(customer_id);
CREATE INDEX IF NOT EXISTS idx_iq_calls_created ON iq_calls(created_at);

-- 13. INVOICES (billing)
CREATE TABLE IF NOT EXISTS iq_invoices (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  invoice_number  VARCHAR(32) UNIQUE,
  order_id        INTEGER REFERENCES iq_orders(id),
  customer_id     INTEGER REFERENCES iq_customers(id),
  amount          NUMERIC(14,2),
  tax_amount      NUMERIC(10,2) DEFAULT 0,
  total_amount    NUMERIC(14,2),
  paid_amount     NUMERIC(14,2) DEFAULT 0,
  due_date        DATE,
  paid_date       DATE,
  payment_method  VARCHAR(32),
  status          VARCHAR(16) DEFAULT 'pending',
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_invoices_tenant ON iq_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_invoices_order ON iq_invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_iq_invoices_status ON iq_invoices(status);

-- 14. SHIPMENTS (fulfillment tracking)
CREATE TABLE IF NOT EXISTS iq_shipments (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  order_id        INTEGER REFERENCES iq_orders(id),
  carrier         VARCHAR(64),
  service_level   VARCHAR(64),
  tracking_number VARCHAR(128),
  ship_date       DATE,
  estimated_delivery DATE,
  actual_delivery DATE,
  weight_lbs      NUMERIC(8,2),
  cost            NUMERIC(10,2),
  ship_to_name    VARCHAR(255),
  ship_to_address TEXT,
  ship_to_city    VARCHAR(128),
  ship_to_state   VARCHAR(64),
  ship_to_zip     VARCHAR(16),
  status          VARCHAR(32) DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_shipments_tenant ON iq_shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_shipments_order ON iq_shipments(order_id);

-- 15. NEURAL INSIGHTS (diagnostic findings)
CREATE TABLE IF NOT EXISTS iq_neural_insights (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  category        VARCHAR(64) NOT NULL,
  title           VARCHAR(255),
  summary         TEXT,
  evidence        JSONB DEFAULT '{}',
  impact          VARCHAR(16) DEFAULT 'medium',
  impact_estimate VARCHAR(255),
  recommended_action TEXT,
  analysis_date   DATE DEFAULT CURRENT_DATE,
  status          VARCHAR(16) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, category, analysis_date)
);
CREATE INDEX IF NOT EXISTS idx_iq_neural_tenant ON iq_neural_insights(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_neural_category ON iq_neural_insights(category);

-- 16. NEURAL TREATMENTS (activated automation workflows)
CREATE TABLE IF NOT EXISTS iq_neural_treatments (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  treatment_type  VARCHAR(64) NOT NULL,
  trigger_event   VARCHAR(64),
  actions         JSONB DEFAULT '[]',
  is_active       BOOLEAN DEFAULT false,
  activated_at    TIMESTAMPTZ,
  deactivated_at  TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  last_executed   TIMESTAMPTZ,
  config          JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, treatment_type)
);
CREATE INDEX IF NOT EXISTS idx_iq_treatments_tenant ON iq_neural_treatments(tenant_id);

-- 17. TREATMENT EXECUTION LOG
CREATE TABLE IF NOT EXISTS iq_treatment_log (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  treatment_id    INTEGER REFERENCES iq_neural_treatments(id),
  treatment_type  VARCHAR(64),
  trigger_event   VARCHAR(64),
  target_ref      VARCHAR(255),
  actions_executed JSONB DEFAULT '[]',
  status          VARCHAR(16) DEFAULT 'success',
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_treatment_log_tenant ON iq_treatment_log(tenant_id);

-- 18. AI AGENT SESSIONS (tracks agent activity)
CREATE TABLE IF NOT EXISTS iq_agent_sessions (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  agent_type      VARCHAR(64) NOT NULL,
  session_ref     VARCHAR(128),
  input_data      JSONB DEFAULT '{}',
  output_data     JSONB DEFAULT '{}',
  tokens_used     INTEGER DEFAULT 0,
  duration_ms     INTEGER DEFAULT 0,
  status          VARCHAR(16) DEFAULT 'completed',
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_agent_sessions_tenant ON iq_agent_sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_iq_agent_sessions_type ON iq_agent_sessions(agent_type);

-- 19. REORDER PREDICTIONS (AI-generated reorder forecasts)
CREATE TABLE IF NOT EXISTS iq_reorder_predictions (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  customer_id     INTEGER REFERENCES iq_customers(id),
  product_id      INTEGER REFERENCES iq_products(id),
  predicted_date  DATE,
  confidence      NUMERIC(5,2),
  predicted_qty   INTEGER,
  last_order_date DATE,
  order_frequency_days INTEGER,
  triggered       BOOLEAN DEFAULT false,
  triggered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_reorder_customer ON iq_reorder_predictions(customer_id);

-- 20. COMPLIANCE RECORDS
CREATE TABLE IF NOT EXISTS iq_compliance (
  id              SERIAL PRIMARY KEY,
  tenant_id       VARCHAR(32) DEFAULT 'imprint_iq',
  product_id      INTEGER REFERENCES iq_products(id),
  supplier_id     INTEGER REFERENCES iq_suppliers(id),
  compliance_type VARCHAR(64),
  standard        VARCHAR(128),
  status          VARCHAR(16) DEFAULT 'pending',
  expires_at      DATE,
  certificate_url TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_iq_compliance_product ON iq_compliance(product_id);
