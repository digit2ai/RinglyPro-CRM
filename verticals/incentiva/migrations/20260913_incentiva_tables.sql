-- Incentiva: new-construction buyer platform (Tampa Bay launch).
-- Canonical schema. src/db.js executes THIS FILE on boot, so the migration and
-- the running schema cannot drift. Every statement must stay idempotent.
-- Prefix nca_. Every table carries tenant_id NOT NULL. Indexes are named.

CREATE TABLE IF NOT EXISTS nca_markets (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  slug VARCHAR(60) NOT NULL,
  name VARCHAR(120) NOT NULL,
  timezone VARCHAR(60) NOT NULL DEFAULT 'America/New_York',
  counties TEXT[] NOT NULL DEFAULT '{}',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  default_agent_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_markets_tenant_slug_uq ON nca_markets (tenant_id, slug);

CREATE TABLE IF NOT EXISTS nca_brokerages (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  license_no VARCHAR(60),
  address TEXT,
  approval_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_brokerages_tenant_idx ON nca_brokerages (tenant_id);

CREATE TABLE IF NOT EXISTS nca_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  email VARCHAR(200) NOT NULL,
  name VARCHAR(160) NOT NULL,
  password_hash VARCHAR(200) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin','agent')),
  title VARCHAR(160),
  license_no VARCHAR(60),
  brokerage_id INTEGER,
  phone VARCHAR(40),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_users_tenant_email_uq ON nca_users (tenant_id, email);

CREATE TABLE IF NOT EXISTS nca_builders (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  website TEXT,
  co_broke_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  automated_access VARCHAR(30) NOT NULL DEFAULT 'unknown',
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_builders_tenant_name_uq ON nca_builders (tenant_id, name);

CREATE TABLE IF NOT EXISTS nca_communities (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  market_id INTEGER NOT NULL,
  builder_id INTEGER NOT NULL,
  name VARCHAR(200) NOT NULL,
  division_name VARCHAR(160),
  status VARCHAR(20) NOT NULL DEFAULT 'selling',
  address TEXT,
  city VARCHAR(120),
  county VARCHAR(80),
  zip VARCHAR(10),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  age_restricted BOOLEAN NOT NULL DEFAULT false,
  price_from NUMERIC(12,2),
  price_to NUMERIC(12,2),
  price_observed_at TIMESTAMPTZ,
  url TEXT,
  sales_counselor_name VARCHAR(160),
  sales_counselor_phone VARCHAR(40),
  sales_counselor_email VARCHAR(200),
  co_broke_display VARCHAR(120),
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_communities_tenant_market_idx ON nca_communities (tenant_id, market_id);
CREATE INDEX IF NOT EXISTS nca_communities_tenant_zip_idx ON nca_communities (tenant_id, zip);

-- amount_usd NULL means NOT YET CONFIRMED. It is never read as zero.
CREATE TABLE IF NOT EXISTS nca_community_fees (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  community_id INTEGER NOT NULL,
  fee_type VARCHAR(20) NOT NULL CHECK (fee_type IN ('hoa','cdd_om','cdd_debt','amenity','other')),
  amount_usd NUMERIC(10,2),
  period VARCHAR(10) NOT NULL DEFAULT 'month' CHECK (period IN ('month','year','one_time')),
  source_url TEXT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_community_fees_uq ON nca_community_fees (tenant_id, community_id, fee_type);

CREATE TABLE IF NOT EXISTS nca_homes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  community_id INTEGER NOT NULL,
  label VARCHAR(200) NOT NULL,
  plan_name VARCHAR(160),
  beds NUMERIC(4,1),
  baths NUMERIC(4,1),
  sqft INTEGER,
  stories INTEGER,
  features TEXT[] NOT NULL DEFAULT '{}',
  list_price NUMERIC(12,2),
  est_completion VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'available',
  source_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_homes_tenant_community_idx ON nca_homes (tenant_id, community_id);

CREATE TABLE IF NOT EXISTS nca_sources (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  community_id INTEGER NOT NULL,
  kind VARCHAR(30) NOT NULL,
  url TEXT,
  css_scope TEXT,
  cadence_minutes INTEGER NOT NULL DEFAULT 1440,
  health VARCHAR(20) NOT NULL DEFAULT 'ok',
  health_reason TEXT,
  last_hash VARCHAR(64),
  last_fetched_at TIMESTAMPTZ,
  last_changed_at TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_sources_tenant_community_idx ON nca_sources (tenant_id, community_id);

CREATE TABLE IF NOT EXISTS nca_snapshots (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  source_id INTEGER,
  community_id INTEGER NOT NULL,
  kind VARCHAR(30) NOT NULL,
  url TEXT,
  http_status INTEGER,
  content_hash VARCHAR(64),
  text TEXT,
  changed BOOLEAN NOT NULL DEFAULT true,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_snapshots_tenant_source_idx ON nca_snapshots (tenant_id, source_id);

CREATE TABLE IF NOT EXISTS nca_incentives (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  market_id INTEGER NOT NULL,
  community_id INTEGER NOT NULL,
  scope VARCHAR(20) NOT NULL DEFAULT 'community',
  audience VARCHAR(10) NOT NULL DEFAULT 'buyer',
  type VARCHAR(40) NOT NULL,
  -- current_version_id = the version a buyer could be shown (or the withdrawn
  -- marker). Pending versions never become current until an agent confirms.
  current_version_id INTEGER,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_incentives_tenant_community_idx ON nca_incentives (tenant_id, community_id);

CREATE TABLE IF NOT EXISTS nca_incentive_versions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  incentive_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL,
  type VARCHAR(40) NOT NULL,
  audience VARCHAR(10) NOT NULL DEFAULT 'buyer' CHECK (audience IN ('buyer','broker')),
  value_kind VARCHAR(30) NOT NULL DEFAULT 'none_stated',
  value_usd NUMERIC(12,2),
  value_percent NUMERIC(6,3),
  value_cap_usd NUMERIC(12,2),
  rate NUMERIC(6,3),
  buydown_schedule INTEGER[],
  use_restriction VARCHAR(30),
  requires_affiliated_lender BOOLEAN,
  requires_affiliated_title BOOLEAN,
  contract_by DATE,
  close_by DATE,
  expires_on DATE,
  combinable_with VARCHAR(20) NOT NULL DEFAULT 'not_stated',
  choice_group VARCHAR(60),
  applies_to_home_ids INTEGER[],
  headline TEXT NOT NULL,
  conditions_text TEXT,
  source_id INTEGER,
  snapshot_id INTEGER,
  source_url TEXT,
  source_span INTEGER[],
  extraction_confidence NUMERIC(4,3),
  extracted_by VARCHAR(20),
  verifier_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  change_kind VARCHAR(20) NOT NULL DEFAULT 'new'
    CHECK (change_kind IN ('new','increase','decrease','terms_changed','removed','reconfirmed')),
  verification_status VARCHAR(30) NOT NULL DEFAULT 'pending_verification'
    CHECK (verification_status IN ('pending_verification','verified','rejected','superseded','withdrawn')),
  verification_method VARCHAR(40),
  verified_by INTEGER,
  last_verified_at TIMESTAMPTZ,
  fresh_until TIMESTAMPTZ,
  rejected_reason TEXT,
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_incentive_versions_no_uq ON nca_incentive_versions (incentive_id, version_no);
CREATE INDEX IF NOT EXISTS nca_incentive_versions_tenant_status_idx ON nca_incentive_versions (tenant_id, verification_status);

-- THE ONLY PATH FROM INCENTIVES TO A BUYER. The report builder reads this view,
-- never the tables. Verified, buyer audience, fresh, and not past expiry in ET.
CREATE OR REPLACE VIEW nca_v_incentives_buyer_safe AS
SELECT v.*, i.community_id, i.market_id, i.is_demo
FROM nca_incentives i
JOIN nca_incentive_versions v ON v.id = i.current_version_id AND v.tenant_id = i.tenant_id
WHERE v.audience = 'buyer'
  AND v.verification_status = 'verified'
  AND v.last_verified_at IS NOT NULL
  AND v.fresh_until IS NOT NULL
  AND v.fresh_until > now()
  AND (v.expires_on IS NULL OR v.expires_on >= (now() AT TIME ZONE 'America/New_York')::date);

CREATE TABLE IF NOT EXISTS nca_buyers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  market_id INTEGER NOT NULL,
  agent_id INTEGER,
  first_name VARCHAR(120) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(40),
  preferred_language VARCHAR(2) NOT NULL DEFAULT 'en',
  stage VARCHAR(30) NOT NULL DEFAULT 'intake_complete',
  has_other_agent VARCHAR(30) NOT NULL DEFAULT 'no',
  ip_hash VARCHAR(64),
  stage_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_buyers_tenant_agent_idx ON nca_buyers (tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS nca_buyers_tenant_stage_idx ON nca_buyers (tenant_id, stage);

CREATE TABLE IF NOT EXISTS nca_buyer_criteria (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL DEFAULT 1,
  criteria JSONB NOT NULL,
  prior_builder_visits JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_buyer_criteria_tenant_buyer_idx ON nca_buyer_criteria (tenant_id, buyer_id);

CREATE TABLE IF NOT EXISTS nca_consents (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email','sms','share_with_agent')),
  granted BOOLEAN NOT NULL,
  method VARCHAR(20) NOT NULL DEFAULT 'web_form',
  consent_text TEXT NOT NULL,
  consent_version VARCHAR(40) NOT NULL,
  ip_hash VARCHAR(64),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS nca_consents_tenant_buyer_idx ON nca_consents (tenant_id, buyer_id);

CREATE TABLE IF NOT EXISTS nca_reports (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  agent_id INTEGER,
  criteria_id INTEGER NOT NULL,
  language VARCHAR(2) NOT NULL DEFAULT 'en',
  status VARCHAR(20) NOT NULL DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','compliance_hold','ready','superseded')),
  token VARCHAR(64) NOT NULL,
  report_no VARCHAR(20) NOT NULL,
  payload JSONB NOT NULL,
  generated_by VARCHAR(20) NOT NULL DEFAULT 'heuristic',
  compliance_verdict VARCHAR(10),
  approved_by INTEGER,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_reports_token_uq ON nca_reports (token);
CREATE INDEX IF NOT EXISTS nca_reports_tenant_status_idx ON nca_reports (tenant_id, status);

-- Pins exactly which incentive versions a report showed.
CREATE TABLE IF NOT EXISTS nca_report_incentives (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  report_id INTEGER NOT NULL,
  incentive_version_id INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS nca_report_incentives_tenant_version_idx ON nca_report_incentives (tenant_id, incentive_version_id);
CREATE INDEX IF NOT EXISTS nca_report_incentives_report_idx ON nca_report_incentives (report_id);

CREATE TABLE IF NOT EXISTS nca_appointments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  agent_id INTEGER,
  report_id INTEGER,
  kind VARCHAR(20) NOT NULL DEFAULT 'consult',
  channel VARCHAR(10),
  preferred_times TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','scheduled','held','no_show','cancelled')),
  held_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_appointments_tenant_buyer_idx ON nca_appointments (tenant_id, buyer_id);

-- Revision 1: the platform bills an agent per consult held and for NOTHING
-- that depends on a transaction. The CHECK is the second lock; billing.js is the first.
CREATE TABLE IF NOT EXISTS nca_conversion_events (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  appointment_id INTEGER NOT NULL,
  event VARCHAR(30) NOT NULL CHECK (event IN ('consult_held')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  billable BOOLEAN NOT NULL,
  fee_usd NUMERIC(10,2) NOT NULL DEFAULT 0,
  waiver_reason VARCHAR(60),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_conversion_events_appt_uq ON nca_conversion_events (appointment_id);
CREATE INDEX IF NOT EXISTS nca_conversion_events_tenant_agent_idx ON nca_conversion_events (tenant_id, agent_id, occurred_at);

CREATE TABLE IF NOT EXISTS nca_activity (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  buyer_id INTEGER NOT NULL,
  actor_type VARCHAR(20) NOT NULL,
  actor_id INTEGER,
  event VARCHAR(60) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_activity_tenant_buyer_idx ON nca_activity (tenant_id, buyer_id);

CREATE TABLE IF NOT EXISTS nca_compliance_reviews (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  subject_type VARCHAR(20) NOT NULL,
  subject_id INTEGER NOT NULL,
  verdict VARCHAR(10) NOT NULL CHECK (verdict IN ('pass','hold','block')),
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','released','closed')),
  resolved_by INTEGER,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_compliance_reviews_tenant_status_idx ON nca_compliance_reviews (tenant_id, status);

CREATE TABLE IF NOT EXISTS nca_geocode_cache (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  query VARCHAR(200) NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_geocode_cache_uq ON nca_geocode_cache (tenant_id, query);

CREATE TABLE IF NOT EXISTS nca_audit_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  actor_type VARCHAR(20) NOT NULL,
  actor_id INTEGER,
  action VARCHAR(80) NOT NULL,
  subject_type VARCHAR(40),
  subject_id INTEGER,
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_audit_log_tenant_idx ON nca_audit_log (tenant_id, created_at);
