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

-- Listing search (RentCast). The cache is what keeps the paid plan affordable:
-- one upstream request per area per TTL, every filter applied locally.
CREATE TABLE IF NOT EXISTS nca_listing_cache (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  provider VARCHAR(20) NOT NULL DEFAULT 'rentcast',
  cache_key VARCHAR(120) NOT NULL,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  radius_miles NUMERIC(6,2),
  listings JSONB NOT NULL DEFAULT '[]'::jsonb,
  upstream_count INTEGER NOT NULL DEFAULT 0,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_listing_cache_key_uq ON nca_listing_cache (tenant_id, provider, cache_key);

-- Upstream request meter, so a monthly cap can refuse before a bill arrives.
CREATE TABLE IF NOT EXISTS nca_api_usage (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  provider VARCHAR(20) NOT NULL,
  month VARCHAR(7) NOT NULL,
  requests INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_api_usage_uq ON nca_api_usage (tenant_id, provider, month);

-- ── Conversational intake (Ana) + builder-promotion research (2026-09-14) ──
-- Spec names map: buyersline_leads -> nca_leads, buyersline_consents -> nca_lead_consents,
-- buyersline_visited_offices -> nca_lead_visited_offices, buyersline_research_runs ->
-- nca_research_runs, buyersline_research_rows -> nca_research_rows,
-- buyersline_lead_selections -> nca_lead_selections. The vertical keeps one prefix.

-- ZIP / place resolution cache (keyless lookups are slow and rate limited).
CREATE TABLE IF NOT EXISTS nca_area_cache (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  query VARCHAR(200) NOT NULL,
  result JSONB,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_area_cache_uq ON nca_area_cache (tenant_id, query);

-- One research run per area, cached (expires_at). Runs are public market information,
-- never buyer data, so a run is shared by every buyer searching the same area.
CREATE TABLE IF NOT EXISTS nca_research_runs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  token VARCHAR(40) NOT NULL,
  cache_key VARCHAR(120) NOT NULL,
  zip VARCHAR(10),
  area_label VARCHAR(160),
  city VARCHAR(120),
  county VARCHAR(120),
  state VARCHAR(40),
  status VARCHAR(20) NOT NULL CHECK (status IN ('running','done','failed')),
  source VARCHAR(20) NOT NULL DEFAULT 'model' CHECK (source IN ('model','registry')),
  notice VARCHAR(80),
  progress JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_json JSONB,
  top_deals JSONB NOT NULL DEFAULT '[]'::jsonb,
  inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
  model VARCHAR(60),
  searches INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_research_runs_token_uq ON nca_research_runs (token);
CREATE INDEX IF NOT EXISTS nca_research_runs_key_idx ON nca_research_runs (tenant_id, cache_key, ran_at DESC);

CREATE TABLE IF NOT EXISTS nca_research_rows (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  run_id INTEGER NOT NULL REFERENCES nca_research_runs(id) ON DELETE CASCADE,
  origin VARCHAR(20) NOT NULL CHECK (origin IN ('ai_research','agent_verified')),
  builder VARCHAR(160) NOT NULL,
  community VARCHAR(200),
  starting_price TEXT,
  starting_price_usd NUMERIC(12,2),
  promotion TEXT,
  rate TEXT,
  closing_credit TEXT,
  other_incentives TEXT,
  expiration TEXT,
  expiration_date DATE,
  restrictions TEXT,
  hoa TEXT,
  cdd TEXT,
  scope VARCHAR(20),
  source_url TEXT,
  date_checked VARCHAR(40),
  verified BOOLEAN NOT NULL DEFAULT false,
  verified_basis VARCHAR(40),
  hidden_reason VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_research_rows_run_idx ON nca_research_rows (tenant_id, run_id);

CREATE TABLE IF NOT EXISTS nca_leads (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  token VARCHAR(40) NOT NULL,
  lang VARCHAR(2) NOT NULL DEFAULT 'en',
  first_name VARCHAR(120) NOT NULL,
  email VARCHAR(200),
  phone VARCHAR(40),
  area_input VARCHAR(200),
  zip VARCHAR(10),
  city VARCHAR(120),
  county VARCHAR(120),
  state VARCHAR(40),
  max_price NUMERIC(12,2) NOT NULL,
  max_monthly NUMERIC(10,2),
  down_payment NUMERIC(12,2),
  move_timeline VARCHAR(20) NOT NULL,
  financing_type VARCHAR(20) NOT NULL,
  has_agent VARCHAR(30) NOT NULL CHECK (has_agent IN ('no','yes_under_agreement','yes_informal')),
  agent_agreement_signed BOOLEAN NOT NULL DEFAULT false,
  referral_consent BOOLEAN NOT NULL DEFAULT false,
  research_run_id INTEGER REFERENCES nca_research_runs(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','working','closed','lost')),
  assigned_agent_id INTEGER,
  notified_agent_id INTEGER,
  ip_hash VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_leads_token_uq ON nca_leads (token);
CREATE INDEX IF NOT EXISTS nca_leads_tenant_idx ON nca_leads (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS nca_leads_agent_idx ON nca_leads (tenant_id, assigned_agent_id);

CREATE TABLE IF NOT EXISTS nca_lead_visited_offices (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES nca_leads(id) ON DELETE CASCADE,
  builder VARCHAR(160),
  community VARCHAR(200)
);
CREATE INDEX IF NOT EXISTS nca_lead_visited_offices_lead_idx ON nca_lead_visited_offices (tenant_id, lead_id);

-- The exact consent text shown, stored per channel. The raw IP is kept here (and only
-- here) because it is consent evidence; it is shown only in the agent console.
CREATE TABLE IF NOT EXISTS nca_lead_consents (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES nca_leads(id) ON DELETE CASCADE,
  channel VARCHAR(20) NOT NULL CHECK (channel IN ('email','sms','agent_referral')),
  granted BOOLEAN NOT NULL,
  consent_text TEXT NOT NULL,
  consent_version VARCHAR(40) NOT NULL,
  ip VARCHAR(64),
  user_agent VARCHAR(300),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_via VARCHAR(40)
);
CREATE INDEX IF NOT EXISTS nca_lead_consents_lead_idx ON nca_lead_consents (tenant_id, lead_id);

CREATE TABLE IF NOT EXISTS nca_lead_selections (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES nca_leads(id) ON DELETE CASCADE,
  research_row_id INTEGER NOT NULL REFERENCES nca_research_rows(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_lead_selections_uq ON nca_lead_selections (lead_id, research_row_id);
CREATE INDEX IF NOT EXISTS nca_lead_selections_tenant_idx ON nca_lead_selections (tenant_id, lead_id);

-- ── Agents 5-7: Rachel follow-up, Hand-off, Scheduler (2026-09-14) ─────────
-- Readiness is computed by rules (engines/readiness.js), never by a model.
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS readiness_score INTEGER;
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS readiness_tier VARCHAR(10);
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS readiness_reasons JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS agent_brief TEXT;
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS agent_opening TEXT;
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS no_response_alerted_at TIMESTAMPTZ;
ALTER TABLE nca_leads ADD COLUMN IF NOT EXISTS unsubscribe_token VARCHAR(40);
CREATE UNIQUE INDEX IF NOT EXISTS nca_leads_unsub_uq ON nca_leads (unsubscribe_token) WHERE unsubscribe_token IS NOT NULL;

-- Every follow-up touch Rachel plans, one row per channel. Consent is re-checked at SEND time.
CREATE TABLE IF NOT EXISTS nca_followups (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES nca_leads(id) ON DELETE CASCADE,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('cadence','promo_change')),
  day_offset INTEGER,
  channel VARCHAR(10) NOT NULL CHECK (channel IN ('email','sms')),
  scheduled_for TIMESTAMPTZ NOT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sending','sent','skipped','failed')),
  reason VARCHAR(80),
  change_key VARCHAR(200),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_followups_due_idx ON nca_followups (tenant_id, status, scheduled_for);
CREATE INDEX IF NOT EXISTS nca_followups_lead_idx ON nca_followups (tenant_id, lead_id);
CREATE UNIQUE INDEX IF NOT EXISTS nca_followups_uq ON nca_followups (lead_id, kind, channel, COALESCE(day_offset, -1), COALESCE(change_key, ''));

-- The licensed agent's weekly booking hours, minutes after midnight Eastern time.
CREATE TABLE IF NOT EXISTS nca_agent_hours (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  agent_id INTEGER NOT NULL,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_min SMALLINT NOT NULL CHECK (start_min BETWEEN 0 AND 1440),
  end_min SMALLINT NOT NULL CHECK (end_min BETWEEN 0 AND 1440),
  CHECK (end_min > start_min)
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_agent_hours_uq ON nca_agent_hours (tenant_id, agent_id, weekday);

CREATE TABLE IF NOT EXISTS nca_lead_meetings (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES nca_leads(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL,
  token VARCHAR(40) NOT NULL,
  starts_at TIMESTAMPTZ NOT NULL,
  duration_min SMALLINT NOT NULL DEFAULT 30,
  kind VARCHAR(20) NOT NULL DEFAULT 'consult' CHECK (kind IN ('consult','phone')),
  status VARCHAR(12) NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','cancelled','held','no_show')),
  reminder_24h_at TIMESTAMPTZ,
  reminder_2h_at TIMESTAMPTZ,
  feedback_requested_at TIMESTAMPTZ,
  buyer_rating SMALLINT CHECK (buyer_rating BETWEEN 1 AND 5),
  buyer_comment TEXT,
  buyer_feedback_at TIMESTAMPTZ,
  agent_outcome VARCHAR(30),
  agent_note TEXT,
  agent_feedback_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_lead_meetings_token_uq ON nca_lead_meetings (token);
CREATE UNIQUE INDEX IF NOT EXISTS nca_lead_meetings_slot_uq ON nca_lead_meetings (tenant_id, agent_id, starts_at) WHERE status = 'booked';
CREATE INDEX IF NOT EXISTS nca_lead_meetings_lead_idx ON nca_lead_meetings (tenant_id, lead_id);

-- Double opt-in (security review 2026-09-14): texts start only after the buyer replies YES to one
-- confirmation text; marketing follow-up emails start only after the buyer opens their emailed report link.
ALTER TABLE nca_lead_consents ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;

-- ── SME knowledge capture (2026-09-15) ─────────────────────────────────────────
-- Spec names map to the vertical prefix: sme_* -> nca_sme_*, buyersline_kb -> nca_kb,
-- buyersline_rules -> nca_rules. Accounts here are separate from the agent console accounts.
CREATE TABLE IF NOT EXISTS nca_sme_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  name VARCHAR(160) NOT NULL,
  email VARCHAR(200) NOT NULL,
  phone VARCHAR(40),
  password_hash VARCHAR(100),
  role VARCHAR(10) NOT NULL CHECK (role IN ('admin','sme')),
  language VARCHAR(2) NOT NULL DEFAULT 'en' CHECK (language IN ('en','es')),
  status VARCHAR(12) NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_sme_users_email_uq ON nca_sme_users (tenant_id, lower(email));

-- Server-side sessions: the cookie holds a random token, the database holds only its hash.
CREATE TABLE IF NOT EXISTS nca_sme_auth_sessions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES nca_sme_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  csrf_token VARCHAR(64) NOT NULL,
  ip_hash VARCHAR(64),
  user_agent VARCHAR(300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_sme_auth_sessions_token_uq ON nca_sme_auth_sessions (token_hash);
CREATE INDEX IF NOT EXISTS nca_sme_auth_sessions_user_idx ON nca_sme_auth_sessions (tenant_id, user_id);

CREATE TABLE IF NOT EXISTS nca_sme_magic_links (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES nca_sme_users(id) ON DELETE CASCADE,
  token_hash VARCHAR(64) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_sme_magic_links_token_uq ON nca_sme_magic_links (token_hash);

CREATE TABLE IF NOT EXISTS nca_sme_sections (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  code VARCHAR(20) NOT NULL,
  title_en TEXT NOT NULL,
  title_es TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_sme_sections_code_uq ON nca_sme_sections (tenant_id, code);

CREATE TABLE IF NOT EXISTS nca_sme_questions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  section_id INTEGER NOT NULL REFERENCES nca_sme_sections(id) ON DELETE CASCADE,
  code VARCHAR(20) NOT NULL,
  text_en TEXT NOT NULL,
  text_es TEXT NOT NULL,
  help_en TEXT,
  help_es TEXT,
  answer_type VARCHAR(20) NOT NULL DEFAULT 'long_text' CHECK (answer_type IN ('long_text','short_text','number','choice','multi_choice','table')),
  options_json JSONB,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_sme_questions_code_uq ON nca_sme_questions (tenant_id, code);
CREATE INDEX IF NOT EXISTS nca_sme_questions_section_idx ON nca_sme_questions (tenant_id, section_id, sort_order);

CREATE TABLE IF NOT EXISTS nca_sme_answers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES nca_sme_users(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES nca_sme_questions(id) ON DELETE CASCADE,
  answer_text TEXT,
  answer_json JSONB,
  language VARCHAR(2) NOT NULL DEFAULT 'en' CHECK (language IN ('en','es')),
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER,
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_sme_answers_uq ON nca_sme_answers (tenant_id, user_id, question_id);

CREATE TABLE IF NOT EXISTS nca_sme_answer_versions (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  answer_id INTEGER NOT NULL REFERENCES nca_sme_answers(id) ON DELETE CASCADE,
  answer_text TEXT,
  answer_json JSONB,
  status VARCHAR(12),
  saved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_sme_answer_versions_answer_idx ON nca_sme_answer_versions (tenant_id, answer_id, saved_at DESC);

CREATE TABLE IF NOT EXISTS nca_sme_attachments (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  answer_id INTEGER NOT NULL REFERENCES nca_sme_answers(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type VARCHAR(100) NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp','image/heic')),
  size_bytes INTEGER NOT NULL CHECK (size_bytes <= 10485760),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_sme_attachments_answer_idx ON nca_sme_attachments (tenant_id, answer_id);

CREATE TABLE IF NOT EXISTS nca_sme_sessions_log (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES nca_sme_users(id) ON DELETE CASCADE,
  auth_session_id INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  questions_answered INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS nca_sme_sessions_log_user_idx ON nca_sme_sessions_log (tenant_id, user_id, started_at DESC);

CREATE TABLE IF NOT EXISTS nca_sme_section_status (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES nca_sme_users(id) ON DELETE CASCADE,
  section_id INTEGER NOT NULL REFERENCES nca_sme_sections(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS nca_sme_section_status_uq ON nca_sme_section_status (tenant_id, user_id, section_id);

-- Knowledge base and rules built from submitted SME answers (pipeline in a later phase).
CREATE TABLE IF NOT EXISTS nca_kb (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('sme')),
  source_id INTEGER NOT NULL,
  section VARCHAR(160),
  topic VARCHAR(300),
  content_en TEXT,
  content_es TEXT,
  en_machine_translated BOOLEAN NOT NULL DEFAULT false,
  es_machine_translated BOOLEAN NOT NULL DEFAULT false,
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  confidence NUMERIC(4,3),
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','retired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_kb_source_idx ON nca_kb (tenant_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS nca_rules (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  rule_text TEXT NOT NULL,
  applies_to_builder VARCHAR(160),
  applies_to_community VARCHAR(200),
  source_answer_id INTEGER REFERENCES nca_sme_answers(id) ON DELETE SET NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by INTEGER
);
CREATE INDEX IF NOT EXISTS nca_rules_status_idx ON nca_rules (tenant_id, status);
