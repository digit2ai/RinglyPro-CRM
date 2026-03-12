-- RinglyPro Logistics - AI Brokerage Platform Schema
-- Derived from Functional & System Architecture document
-- MVP modules: Load matching, Carrier matching, Rate intelligence, Analytics, Data ingestion, Demo workspace

-- ============================================================
-- LOADS TABLE (core planning, matching, quoting, billing, analytics)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_loads (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  load_ref VARCHAR(50) UNIQUE,
  external_ref VARCHAR(100),
  customer_id INTEGER,
  shipper_name VARCHAR(255),
  origin_city VARCHAR(255),
  origin_state VARCHAR(10),
  origin_zip VARCHAR(20),
  origin_full VARCHAR(500),
  destination_city VARCHAR(255),
  destination_state VARCHAR(10),
  destination_zip VARCHAR(20),
  destination_full VARCHAR(500),
  pickup_date DATE,
  pickup_window_start TIMESTAMP,
  pickup_window_end TIMESTAMP,
  delivery_date DATE,
  delivery_window_start TIMESTAMP,
  delivery_window_end TIMESTAMP,
  equipment_type VARCHAR(50) DEFAULT 'dry_van',
  trailer_type VARCHAR(50),
  weight_lbs NUMERIC(10,2),
  pieces INTEGER,
  commodity VARCHAR(255),
  miles NUMERIC(8,1),
  buy_rate NUMERIC(12,2),
  sell_rate NUMERIC(12,2),
  margin NUMERIC(12,2),
  margin_pct NUMERIC(5,2),
  rate_per_mile NUMERIC(8,2),
  assigned_carrier_id INTEGER,
  assigned_driver VARCHAR(255),
  dispatcher_id INTEGER,
  status VARCHAR(30) DEFAULT 'open' CHECK (status IN ('open','quoted','covered','dispatched','in_transit','delivered','invoiced','paid','cancelled')),
  priority VARCHAR(20) DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  temperature_min NUMERIC(5,1),
  temperature_max NUMERIC(5,1),
  hazmat BOOLEAN DEFAULT false,
  hazmat_class VARCHAR(20),
  special_instructions TEXT,
  source VARCHAR(30) DEFAULT 'manual' CHECK (source IN ('manual','upload','api','webhook','quote')),
  upload_batch_id INTEGER,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_loads_tenant ON lg_loads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lg_loads_status ON lg_loads(status);
CREATE INDEX IF NOT EXISTS idx_lg_loads_origin ON lg_loads(origin_state, origin_city);
CREATE INDEX IF NOT EXISTS idx_lg_loads_dest ON lg_loads(destination_state, destination_city);
CREATE INDEX IF NOT EXISTS idx_lg_loads_pickup ON lg_loads(pickup_date);
CREATE INDEX IF NOT EXISTS idx_lg_loads_carrier ON lg_loads(assigned_carrier_id);

-- ============================================================
-- CARRIERS TABLE (ranking, outreach, performance reporting)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_carriers (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  carrier_name VARCHAR(255) NOT NULL,
  mc_number VARCHAR(20),
  dot_number VARCHAR(20),
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  equipment_types TEXT[] DEFAULT '{}',
  service_lanes JSONB DEFAULT '[]',
  service_regions TEXT[] DEFAULT '{}',
  home_city VARCHAR(255),
  home_state VARCHAR(10),
  home_zip VARCHAR(20),
  total_loads_completed INTEGER DEFAULT 0,
  total_loads_offered INTEGER DEFAULT 0,
  acceptance_rate NUMERIC(5,2) DEFAULT 0,
  on_time_delivery_pct NUMERIC(5,2) DEFAULT 0,
  avg_rate_per_mile NUMERIC(8,2),
  preferred_min_rate NUMERIC(8,2),
  safety_rating VARCHAR(50),
  insurance_expiry DATE,
  operating_status VARCHAR(50) DEFAULT 'active',
  reliability_score NUMERIC(5,2) DEFAULT 50,
  last_load_date DATE,
  notes TEXT,
  source VARCHAR(30) DEFAULT 'manual' CHECK (source IN ('manual','upload','api','fmcsa')),
  upload_batch_id INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_carriers_tenant ON lg_carriers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lg_carriers_mc ON lg_carriers(mc_number);
CREATE INDEX IF NOT EXISTS idx_lg_carriers_dot ON lg_carriers(dot_number);
CREATE INDEX IF NOT EXISTS idx_lg_carriers_state ON lg_carriers(home_state);

-- ============================================================
-- CUSTOMERS TABLE (margin analysis, service prioritization, invoicing)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_customers (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  customer_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  phone VARCHAR(50),
  email VARCHAR(255),
  billing_address TEXT,
  payment_terms VARCHAR(50) DEFAULT 'net_30',
  credit_limit NUMERIC(12,2),
  total_loads INTEGER DEFAULT 0,
  total_revenue NUMERIC(14,2) DEFAULT 0,
  avg_margin_pct NUMERIC(5,2),
  top_lanes JSONB DEFAULT '[]',
  default_equipment VARCHAR(50),
  service_level VARCHAR(30) DEFAULT 'standard',
  penalty_exposure NUMERIC(12,2) DEFAULT 0,
  notes TEXT,
  source VARCHAR(30) DEFAULT 'manual',
  upload_batch_id INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_customers_tenant ON lg_customers(tenant_id);

-- ============================================================
-- RATE BENCHMARKS (suggested pricing and quote confidence)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_rate_benchmarks (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  origin_state VARCHAR(10),
  origin_city VARCHAR(255),
  destination_state VARCHAR(10),
  destination_city VARCHAR(255),
  equipment_type VARCHAR(50) DEFAULT 'dry_van',
  mileage_band VARCHAR(20),
  benchmark_source VARCHAR(50) DEFAULT 'internal' CHECK (benchmark_source IN ('internal','dat','truckstop','greenscreens','manual','upload')),
  rate_date DATE,
  avg_rate NUMERIC(12,2),
  min_rate NUMERIC(12,2),
  max_rate NUMERIC(12,2),
  rate_per_mile_avg NUMERIC(8,2),
  rate_per_mile_p25 NUMERIC(8,2),
  rate_per_mile_p75 NUMERIC(8,2),
  sample_size INTEGER DEFAULT 0,
  confidence VARCHAR(20) DEFAULT 'medium' CHECK (confidence IN ('low','medium','high','very_high')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_benchmarks_lane ON lg_rate_benchmarks(origin_state, destination_state);
CREATE INDEX IF NOT EXISTS idx_lg_benchmarks_date ON lg_rate_benchmarks(rate_date);

-- ============================================================
-- SHIPMENT EVENTS (track and trace, SLA tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_shipment_events (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  load_id INTEGER NOT NULL,
  event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('pickup_scheduled','picked_up','in_transit','checkpoint','delay','exception','arrived','delivered','pod_received','invoiced')),
  status VARCHAR(50),
  location VARCHAR(500),
  latitude NUMERIC(10,7),
  longitude NUMERIC(10,7),
  eta TIMESTAMP,
  actor VARCHAR(255),
  source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual','driver','carrier','tracking','voice','api')),
  notes TEXT,
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_events_load ON lg_shipment_events(load_id);
CREATE INDEX IF NOT EXISTS idx_lg_events_type ON lg_shipment_events(event_type);

-- ============================================================
-- CALL INTERACTIONS (voice automation outcomes, audit trail)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_call_interactions (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  call_id VARCHAR(100),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('inbound','outbound')),
  caller VARCHAR(255),
  callee VARCHAR(255),
  load_id INTEGER,
  carrier_id INTEGER,
  customer_id INTEGER,
  intent VARCHAR(100),
  outcome VARCHAR(50) CHECK (outcome IN ('accepted','rejected','voicemail','no_answer','transferred','callback','info_gathered','quote_given','booked','escalated')),
  duration_seconds INTEGER,
  transcript_summary TEXT,
  structured_data JSONB DEFAULT '{}',
  agent_name VARCHAR(50),
  transferred_to VARCHAR(255),
  recording_url VARCHAR(1000),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_calls_load ON lg_call_interactions(load_id);
CREATE INDEX IF NOT EXISTS idx_lg_calls_carrier ON lg_call_interactions(carrier_id);
CREATE INDEX IF NOT EXISTS idx_lg_calls_direction ON lg_call_interactions(direction);

-- ============================================================
-- BILLING DOCUMENTS (carrier payable, customer receivable)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_billing_documents (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  load_id INTEGER NOT NULL,
  doc_type VARCHAR(30) NOT NULL CHECK (doc_type IN ('carrier_invoice','customer_invoice','pod','bol','rate_confirmation','credit_memo')),
  invoice_number VARCHAR(100),
  amount NUMERIC(12,2),
  carrier_id INTEGER,
  customer_id INTEGER,
  validation_status VARCHAR(30) DEFAULT 'pending' CHECK (validation_status IN ('pending','validated','flagged','approved','rejected')),
  flagged_issues JSONB DEFAULT '[]',
  pod_verified BOOLEAN DEFAULT false,
  payment_status VARCHAR(30) DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','pending','paid','overdue','disputed')),
  due_date DATE,
  paid_date DATE,
  notes TEXT,
  file_url VARCHAR(1000),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_billing_load ON lg_billing_documents(load_id);
CREATE INDEX IF NOT EXISTS idx_lg_billing_status ON lg_billing_documents(validation_status);

-- ============================================================
-- LOAD PAIRS (load-to-load matching results)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_load_pairs (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  load_a_id INTEGER NOT NULL,
  load_b_id INTEGER NOT NULL,
  pair_type VARCHAR(30) NOT NULL CHECK (pair_type IN ('backhaul','chain','round_trip','relay')),
  match_score NUMERIC(5,2) DEFAULT 0,
  route_score NUMERIC(5,2) DEFAULT 0,
  timing_score NUMERIC(5,2) DEFAULT 0,
  equipment_score NUMERIC(5,2) DEFAULT 0,
  deadhead_miles NUMERIC(8,1),
  total_miles NUMERIC(8,1),
  combined_revenue NUMERIC(12,2),
  combined_rpm NUMERIC(8,2),
  utilization_improvement_pct NUMERIC(5,2),
  status VARCHAR(20) DEFAULT 'suggested' CHECK (status IN ('suggested','accepted','rejected','expired')),
  accepted_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_pairs_score ON lg_load_pairs(match_score DESC);
CREATE INDEX IF NOT EXISTS idx_lg_pairs_loads ON lg_load_pairs(load_a_id, load_b_id);

-- ============================================================
-- DATA UPLOADS (file ingestion tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_data_uploads (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('csv','excel','json')),
  file_size INTEGER,
  data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('loads','carriers','customers','rates','events','billing','mixed')),
  total_rows INTEGER DEFAULT 0,
  imported_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  validation_errors JSONB DEFAULT '[]',
  column_mapping JSONB DEFAULT '{}',
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','partial')),
  uploaded_by INTEGER,
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  raw_file_path VARCHAR(1000),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_uploads_tenant ON lg_data_uploads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lg_uploads_status ON lg_data_uploads(status);

-- ============================================================
-- ANALYTICS SNAPSHOTS (pre-computed KPI snapshots)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_analytics_snapshots (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  snapshot_date DATE NOT NULL,
  period VARCHAR(10) NOT NULL CHECK (period IN ('daily','weekly','monthly')),
  metrics JSONB NOT NULL DEFAULT '{}',
  -- Pre-computed metrics stored in JSONB:
  -- total_loads, open_loads, covered_loads, delivered_loads
  -- total_revenue, total_cost, total_margin, avg_margin_pct
  -- avg_rate_per_mile, total_miles
  -- carrier_count, active_carriers, new_carriers
  -- customer_count, top_customers, top_lanes
  -- call_count, call_outcomes, avg_call_duration
  -- on_time_pct, exception_count, penalty_amount
  -- upload_count, upload_rows
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_analytics_date ON lg_analytics_snapshots(snapshot_date, period);

-- ============================================================
-- DEMO WORKSPACES (prospect-facing demo environments)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_demo_workspaces (
  id SERIAL PRIMARY KEY,
  workspace_name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_name VARCHAR(255),
  access_code VARCHAR(20) UNIQUE NOT NULL,
  tier VARCHAR(30) DEFAULT 'demo',
  modules_enabled TEXT[] DEFAULT '{loads,carriers,pricing,analytics,matching}',
  data_uploaded BOOLEAN DEFAULT false,
  upload_count INTEGER DEFAULT 0,
  last_activity TIMESTAMP,
  expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '30 days'),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','expired','converted','archived')),
  notes TEXT,
  lead_source VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_demos_code ON lg_demo_workspaces(access_code);
CREATE INDEX IF NOT EXISTS idx_lg_demos_status ON lg_demo_workspaces(status);

-- ============================================================
-- USER FEEDBACK (recommendation acceptance tracking)
-- ============================================================
CREATE TABLE IF NOT EXISTS lg_user_feedback (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  feedback_type VARCHAR(50) NOT NULL CHECK (feedback_type IN ('match_accepted','match_rejected','quote_accepted','quote_rejected','pair_accepted','pair_rejected','carrier_reassigned','load_delayed','rate_override')),
  reference_type VARCHAR(30),
  reference_id INTEGER,
  user_id INTEGER,
  original_value JSONB,
  new_value JSONB,
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_feedback_type ON lg_user_feedback(feedback_type);
