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
