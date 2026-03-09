-- RinglyPro Logistics Platform - Schema Migration
-- Tier 1: Core + Shipper Portal + Carrier Portal + Document Vault + FMCSA + Freight Matching

CREATE TABLE IF NOT EXISTS lg_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  role VARCHAR(20) NOT NULL DEFAULT 'admin' CHECK (role IN ('admin','dispatcher','shipper','carrier','driver')),
  full_name VARCHAR(255),
  company_name VARCHAR(255),
  phone VARCHAR(50),
  carrier_id INTEGER,
  shipper_id INTEGER,
  status VARCHAR(20) DEFAULT 'active',
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS lg_documents (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  doc_type VARCHAR(50) NOT NULL CHECK (doc_type IN ('bol','pod','rate_confirmation','insurance_cert','contract','w9','carrier_agreement','invoice','other')),
  filename VARCHAR(500) NOT NULL,
  original_name VARCHAR(500),
  mime_type VARCHAR(100),
  file_size INTEGER,
  storage_path VARCHAR(1000),
  storage_url VARCHAR(1000),
  load_id INTEGER,
  carrier_id INTEGER,
  shipper_id INTEGER,
  contact_id INTEGER,
  uploaded_by INTEGER,
  ocr_data JSONB,
  metadata JSONB,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_docs_load ON lg_documents(load_id);
CREATE INDEX IF NOT EXISTS idx_lg_docs_carrier ON lg_documents(carrier_id);
CREATE INDEX IF NOT EXISTS idx_lg_docs_type ON lg_documents(doc_type);

CREATE TABLE IF NOT EXISTS lg_carrier_compliance (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  contact_id INTEGER,
  dot_number VARCHAR(20),
  mc_number VARCHAR(20),
  legal_name VARCHAR(255),
  dba_name VARCHAR(255),
  entity_type VARCHAR(50),
  operating_status VARCHAR(50),
  out_of_service_date DATE,
  power_units INTEGER,
  drivers INTEGER,
  safety_rating VARCHAR(50),
  safety_rating_date DATE,
  carrier_operation TEXT[],
  cargo_carried TEXT[],
  bipd_insurance_required BOOLEAN DEFAULT false,
  bipd_insurance_on_file BOOLEAN DEFAULT false,
  bipd_policy_number VARCHAR(100),
  bipd_coverage_from DATE,
  bipd_coverage_to DATE,
  cargo_insurance_required BOOLEAN DEFAULT false,
  cargo_insurance_on_file BOOLEAN DEFAULT false,
  cargo_policy_number VARCHAR(100),
  cargo_coverage_from DATE,
  cargo_coverage_to DATE,
  bond_surety_required BOOLEAN DEFAULT false,
  bond_surety_on_file BOOLEAN DEFAULT false,
  csa_unsafe_driving INTEGER,
  csa_hours_of_service INTEGER,
  csa_driver_fitness INTEGER,
  csa_controlled_substances INTEGER,
  csa_vehicle_maintenance INTEGER,
  csa_hazmat INTEGER,
  csa_crash_indicator INTEGER,
  onboarding_status VARCHAR(30) DEFAULT 'pending' CHECK (onboarding_status IN ('pending','in_progress','approved','rejected','expired')),
  w9_on_file BOOLEAN DEFAULT false,
  carrier_agreement_on_file BOOLEAN DEFAULT false,
  onboarding_completed_at TIMESTAMP,
  last_fmcsa_check TIMESTAMP,
  last_insurance_alert TIMESTAMP,
  raw_fmcsa_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_compliance_dot ON lg_carrier_compliance(dot_number);
CREATE INDEX IF NOT EXISTS idx_lg_compliance_mc ON lg_carrier_compliance(mc_number);

CREATE TABLE IF NOT EXISTS lg_freight_matches (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  load_id INTEGER NOT NULL,
  carrier_contact_id INTEGER NOT NULL,
  match_score NUMERIC(5,2) DEFAULT 0,
  lane_score NUMERIC(5,2) DEFAULT 0,
  rate_score NUMERIC(5,2) DEFAULT 0,
  proximity_score NUMERIC(5,2) DEFAULT 0,
  reliability_score NUMERIC(5,2) DEFAULT 0,
  safety_score NUMERIC(5,2) DEFAULT 0,
  equipment_score NUMERIC(5,2) DEFAULT 0,
  estimated_rate NUMERIC(12,2),
  distance_to_pickup_miles NUMERIC(8,1),
  historical_loads_in_lane INTEGER DEFAULT 0,
  avg_historical_rate NUMERIC(12,2),
  on_time_delivery_pct NUMERIC(5,2),
  campaign_id VARCHAR(50),
  campaign_status VARCHAR(20) DEFAULT 'pending' CHECK (campaign_status IN ('pending','calling','contacted','interested','booked','declined','no_answer')),
  called_at TIMESTAMP,
  call_result TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_matches_load ON lg_freight_matches(load_id);
CREATE INDEX IF NOT EXISTS idx_lg_matches_score ON lg_freight_matches(match_score DESC);

CREATE TABLE IF NOT EXISTS lg_shipper_quotes (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  shipper_contact_id INTEGER,
  shipper_user_id INTEGER,
  origin VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,
  freight_type VARCHAR(100),
  equipment_type VARCHAR(50),
  weight_lbs NUMERIC(10,2),
  pickup_date DATE,
  delivery_date DATE,
  special_instructions TEXT,
  quoted_rate NUMERIC(12,2),
  rate_per_mile NUMERIC(8,2),
  estimated_miles NUMERIC(8,1),
  pricing_method VARCHAR(30) DEFAULT 'ai' CHECK (pricing_method IN ('ai','manual','market','contract')),
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','quoted','accepted','booked','expired','declined')),
  load_id INTEGER,
  valid_until TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_quotes_status ON lg_shipper_quotes(status);

CREATE TABLE IF NOT EXISTS lg_carrier_availability (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  carrier_contact_id INTEGER NOT NULL,
  carrier_user_id INTEGER,
  equipment_type VARCHAR(50),
  available_date DATE,
  available_city VARCHAR(255),
  available_state VARCHAR(10),
  available_zip VARCHAR(20),
  preferred_lanes JSONB,
  max_distance_miles INTEGER,
  min_rate_per_mile NUMERIC(8,2),
  notes TEXT,
  status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available','booked','offline')),
  last_known_lat NUMERIC(10,7),
  last_known_lng NUMERIC(10,7),
  last_location_update TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_avail_carrier ON lg_carrier_availability(carrier_contact_id);

CREATE TABLE IF NOT EXISTS lg_mcp_tool_log (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  tool_name VARCHAR(100) NOT NULL,
  input JSONB,
  output JSONB,
  user_id INTEGER,
  duration_ms INTEGER,
  status VARCHAR(20) DEFAULT 'success',
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lg_mcp_log_tool ON lg_mcp_tool_log(tool_name);

CREATE TABLE IF NOT EXISTS lg_claims (
  id SERIAL PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL DEFAULT 'logistics',
  load_id INTEGER NOT NULL,
  shipper_contact_id INTEGER,
  claim_type VARCHAR(50) CHECK (claim_type IN ('damage','shortage','delay','billing','other')),
  description TEXT,
  amount_claimed NUMERIC(12,2),
  amount_approved NUMERIC(12,2),
  status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open','investigating','approved','denied','settled')),
  resolution_notes TEXT,
  filed_by INTEGER,
  resolved_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
