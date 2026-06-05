-- ============================================================================
-- VERITAS — AI Deepfake Detection & Takedown
-- Schema for the Digit2AI deepfake-protection vertical (mounted at /veritas).
-- All tables are multi-tenant via tenant_id.
-- Note: Sequelize sync({alter:false}) also creates these on boot; this file is
-- the canonical reference / manual-apply migration.
-- ============================================================================

CREATE TABLE IF NOT EXISTS df_tenants (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(255) NOT NULL,
  plan          VARCHAR(50)  DEFAULT 'starter',     -- starter|growth|enterprise
  seats         INTEGER      DEFAULT 1,
  contact_email VARCHAR(255),
  created_at    TIMESTAMP    DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS df_monitors (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  type            VARCHAR(50)  NOT NULL,            -- brand|person|keyword
  target_label    VARCHAR(255) NOT NULL,
  query_terms     JSONB        DEFAULT '[]',
  platforms       JSONB        DEFAULT '[]',        -- ['facebook','instagram',...]
  cadence         VARCHAR(50)  DEFAULT 'daily',     -- hourly|daily|weekly
  status          VARCHAR(50)  DEFAULT 'active',    -- active|paused
  last_scanned_at TIMESTAMP,
  created_at      TIMESTAMP    DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_df_monitors_tenant ON df_monitors(tenant_id);

CREATE TABLE IF NOT EXISTS df_assets (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  monitor_id      INTEGER,
  source_platform VARCHAR(50),                      -- facebook|instagram|tiktok|youtube|web
  source_url      TEXT,
  media_type      VARCHAR(20),                      -- image|video|audio
  thumbnail_url   TEXT,
  captured_at     TIMESTAMP DEFAULT NOW(),
  raw_meta        JSONB     DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_df_assets_tenant  ON df_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_assets_monitor ON df_assets(monitor_id);

CREATE TABLE IF NOT EXISTS df_detections (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL,
  asset_id         INTEGER,
  provider         VARCHAR(50),                     -- hive|reality_defender|sensity|stub
  provider_score   REAL,
  confidence       INTEGER,                         -- 0-100 normalized
  verdict          VARCHAR(20),                     -- clean|suspect|deepfake
  targeted_person  VARCHAR(255),
  deepfakes_impact TEXT,
  evidence         JSONB DEFAULT '{}',
  created_at       TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_df_detections_tenant  ON df_detections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_detections_verdict ON df_detections(verdict);

CREATE TABLE IF NOT EXISTS df_takedowns (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  detection_id INTEGER,
  platform     VARCHAR(50),
  method       VARCHAR(50),                         -- dmca|impersonation|trademark
  status       VARCHAR(50) DEFAULT 'draft',         -- draft|submitted|acknowledged|removed|rejected
  reference_id VARCHAR(100),
  notes        TEXT,
  submitted_at TIMESTAMP,
  removed_at   TIMESTAMP,
  created_at   TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_df_takedowns_tenant ON df_takedowns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_df_takedowns_status ON df_takedowns(status);

CREATE TABLE IF NOT EXISTS df_usage (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  month           VARCHAR(7),                        -- YYYY-MM
  scans_count     INTEGER DEFAULT 0,
  takedowns_count INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_df_usage_tenant ON df_usage(tenant_id);
