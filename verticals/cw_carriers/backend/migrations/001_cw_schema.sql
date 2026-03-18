-- CW Carriers USA - Database Schema
-- Tenant: cw_carriers
-- All tables use cw_ prefix for isolation

-- Contacts: shippers, carriers, drivers, prospects
CREATE TABLE IF NOT EXISTS cw_contacts (
  id              SERIAL PRIMARY KEY,
  hubspot_id      VARCHAR(64) UNIQUE,
  contact_type    VARCHAR(20) NOT NULL CHECK (contact_type IN ('shipper','carrier','driver','prospect')),
  company_name    VARCHAR(255),
  full_name       VARCHAR(255),
  email           VARCHAR(255),
  phone           VARCHAR(32),
  freight_types   TEXT[],
  lanes           TEXT[],
  volume_estimate VARCHAR(64),
  hubspot_synced_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_contacts_type ON cw_contacts(contact_type);
CREATE INDEX IF NOT EXISTS idx_cw_contacts_email ON cw_contacts(email);

-- Loads / Deals
CREATE TABLE IF NOT EXISTS cw_loads (
  id              SERIAL PRIMARY KEY,
  hubspot_deal_id VARCHAR(64) UNIQUE,
  load_ref        VARCHAR(64),
  origin          VARCHAR(255),
  destination     VARCHAR(255),
  freight_type    VARCHAR(32),
  weight_lbs      INTEGER,
  pickup_date     DATE,
  delivery_date   DATE,
  rate_usd        NUMERIC(10,2),
  status          VARCHAR(32) DEFAULT 'open'
                  CHECK (status IN ('open','covered','in_transit','delivered','cancelled')),
  shipper_id      INTEGER REFERENCES cw_contacts(id),
  carrier_id      INTEGER REFERENCES cw_contacts(id),
  broker_notes    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_loads_status ON cw_loads(status);
CREATE INDEX IF NOT EXISTS idx_cw_loads_pickup ON cw_loads(pickup_date);

-- AI Call Logs
CREATE TABLE IF NOT EXISTS cw_call_logs (
  id              SERIAL PRIMARY KEY,
  call_sid        VARCHAR(64) UNIQUE,
  direction       VARCHAR(8) CHECK (direction IN ('inbound','outbound')),
  call_type       VARCHAR(32),
  contact_id      INTEGER REFERENCES cw_contacts(id),
  load_id         INTEGER REFERENCES cw_loads(id),
  from_number     VARCHAR(32),
  to_number       VARCHAR(32),
  duration_sec    INTEGER,
  transcript      TEXT,
  ai_summary      TEXT,
  outcome         VARCHAR(32),
  hubspot_logged  BOOLEAN DEFAULT FALSE,
  escalated_to    VARCHAR(255),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_call_logs_contact ON cw_call_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_cw_call_logs_load ON cw_call_logs(load_id);

-- HubSpot Sync Log
CREATE TABLE IF NOT EXISTS cw_hubspot_sync (
  id              SERIAL PRIMARY KEY,
  object_type     VARCHAR(32),
  object_id       VARCHAR(64),
  action          VARCHAR(16),
  payload         JSONB,
  status          VARCHAR(16) DEFAULT 'pending',
  error_msg       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_hubspot_sync_status ON cw_hubspot_sync(status);

-- NLP Command Log
CREATE TABLE IF NOT EXISTS cw_nlp_commands (
  id              SERIAL PRIMARY KEY,
  user_input      TEXT NOT NULL,
  parsed_intent   VARCHAR(64),
  parsed_entities JSONB,
  action_taken    TEXT,
  result_summary  TEXT,
  success         BOOLEAN,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Analytics Snapshots
CREATE TABLE IF NOT EXISTS cw_analytics (
  id              SERIAL PRIMARY KEY,
  metric_type     VARCHAR(64),
  metric_date     DATE,
  value_json      JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Contact fields extension (MC number, title/role, insurance)
DO $$ BEGIN
  ALTER TABLE cw_contacts ADD COLUMN mc_number VARCHAR(32);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_contacts ADD COLUMN dot_number VARCHAR(32);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_contacts ADD COLUMN title VARCHAR(128);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_contacts ADD COLUMN insurance_expiry DATE;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_contacts ADD COLUMN safety_rating VARCHAR(16);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Loads extension: shipper_rate (what shipper pays) vs carrier_rate (what carrier gets paid)
DO $$ BEGIN
  ALTER TABLE cw_loads ADD COLUMN shipper_rate NUMERIC(10,2);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_loads ADD COLUMN commodity VARCHAR(255);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_loads ADD COLUMN equipment_type VARCHAR(64);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_loads ADD COLUMN dimensions VARCHAR(128);
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE cw_loads ADD COLUMN posted_to_board BOOLEAN DEFAULT FALSE;
  EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Carrier Offers / Bids per load
CREATE TABLE IF NOT EXISTS cw_carrier_offers (
  id              SERIAL PRIMARY KEY,
  load_id         INTEGER NOT NULL REFERENCES cw_loads(id),
  carrier_id      INTEGER REFERENCES cw_contacts(id),
  carrier_name    VARCHAR(255),
  mc_number       VARCHAR(32),
  phone           VARCHAR(32),
  rate_offered    NUMERIC(10,2),
  status          VARCHAR(20) DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','declined','counter','expired')),
  notes           TEXT,
  offered_at      TIMESTAMPTZ DEFAULT NOW(),
  responded_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_carrier_offers_load ON cw_carrier_offers(load_id);
CREATE INDEX IF NOT EXISTS idx_cw_carrier_offers_status ON cw_carrier_offers(status);

-- Check Calls / Transit Tracking
CREATE TABLE IF NOT EXISTS cw_check_calls (
  id              SERIAL PRIMARY KEY,
  load_id         INTEGER NOT NULL REFERENCES cw_loads(id),
  contact_id      INTEGER REFERENCES cw_contacts(id),
  call_type       VARCHAR(32) DEFAULT 'check_call'
                  CHECK (call_type IN ('check_call','pickup_confirm','delivery_confirm','eta_update','exception')),
  location        VARCHAR(255),
  eta             TIMESTAMPTZ,
  status_reported VARCHAR(64),
  notes           TEXT,
  called_by       VARCHAR(64) DEFAULT 'rachel_ai',
  call_sid        VARCHAR(64),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_check_calls_load ON cw_check_calls(load_id);

-- Invoices / Billing (dual-sided: shipper invoice + carrier payment)
CREATE TABLE IF NOT EXISTS cw_invoices (
  id              SERIAL PRIMARY KEY,
  load_id         INTEGER REFERENCES cw_loads(id),
  invoice_type    VARCHAR(16) NOT NULL CHECK (invoice_type IN ('shipper','carrier')),
  invoice_number  VARCHAR(64),
  contact_id      INTEGER REFERENCES cw_contacts(id),
  amount          NUMERIC(10,2) NOT NULL,
  status          VARCHAR(20) DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','paid','overdue','disputed','void')),
  due_date        DATE,
  paid_date       DATE,
  payment_method  VARCHAR(32),
  pod_received    BOOLEAN DEFAULT FALSE,
  pod_notes       TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_invoices_load ON cw_invoices(load_id);
CREATE INDEX IF NOT EXISTS idx_cw_invoices_type ON cw_invoices(invoice_type);
CREATE INDEX IF NOT EXISTS idx_cw_invoices_status ON cw_invoices(status);

-- Alert Log
CREATE TABLE IF NOT EXISTS cw_alert_log (
  id              SERIAL PRIMARY KEY,
  channel         VARCHAR(16) NOT NULL,
  recipient       VARCHAR(255),
  message         TEXT,
  status          VARCHAR(16) DEFAULT 'sent',
  external_id     VARCHAR(128),
  error_msg       TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cw_alert_log_created ON cw_alert_log(created_at);

-- Neural Treatments (workflow automations activated from Neural Intelligence)
CREATE TABLE IF NOT EXISTS neural_treatments (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL DEFAULT 0,
  treatment_type  VARCHAR(50) NOT NULL,
  trigger_event   VARCHAR(100) NOT NULL,
  actions         JSONB NOT NULL DEFAULT '[]',
  crm_target      VARCHAR(20) DEFAULT 'auto',
  is_active       BOOLEAN DEFAULT FALSE,
  activated_at    TIMESTAMPTZ,
  deactivated_at  TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  last_executed_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_neural_treatments_unique ON neural_treatments(client_id, treatment_type);
CREATE INDEX IF NOT EXISTS idx_neural_treatments_active ON neural_treatments(client_id, is_active);

-- Treatment Execution Log
CREATE TABLE IF NOT EXISTS treatment_execution_log (
  id              SERIAL PRIMARY KEY,
  client_id       INTEGER NOT NULL DEFAULT 0,
  treatment_id    INTEGER,
  treatment_type  VARCHAR(50) NOT NULL,
  trigger_event   VARCHAR(100) NOT NULL,
  contact_phone   VARCHAR(30),
  actions_executed JSONB DEFAULT '[]',
  status          VARCHAR(20) DEFAULT 'completed',
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_treatment_log_client ON treatment_execution_log(client_id, created_at DESC);

-- CW Users table for auth
CREATE TABLE IF NOT EXISTS cw_users (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  tenant_id       VARCHAR(32) DEFAULT 'cw_carriers',
  role            VARCHAR(32) DEFAULT 'admin',
  full_name       VARCHAR(255),
  status          VARCHAR(16) DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
