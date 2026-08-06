-- JobUp canonical schema.
-- sync({alter:false}) creates these on boot in development; production applies
-- this file explicitly. New columns need a new migration, never `alter`.

CREATE TABLE IF NOT EXISTS subscribers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  phone TEXT,
  language TEXT DEFAULT 'en',
  password_hash TEXT,
  email_verified_at TIMESTAMPTZ,
  address TEXT UNIQUE,
  status TEXT DEFAULT 'pending',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SHARED pool: no tenant_id, by design. One fetch serves every tenant.
CREATE TABLE IF NOT EXISTS employers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  ats TEXT,
  token TEXT,
  status TEXT DEFAULT 'unverified',   -- live | unverified | closed | demo
  note TEXT,
  last_fetched_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  source TEXT,
  external_id TEXT,
  employer TEXT,
  title TEXT,
  location TEXT,
  url TEXT,
  description TEXT,
  compensation TEXT,                  -- ONLY when the posting states it
  posted_at TIMESTAMPTZ,
  dedupe_key TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jobs_dedupe ON jobs (dedupe_key);
CREATE INDEX IF NOT EXISTS idx_jobs_last_seen ON jobs (last_seen_at);

-- Per-subscriber tables. tenant_id = subscribers.id on every one.
CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
  resume_json JSONB, source_text TEXT, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS settings (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, settings JSONB DEFAULT '{}');

CREATE TABLE IF NOT EXISTS job_matches (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, job_id INTEGER NOT NULL,
  score INTEGER, explanation TEXT, missing JSONB DEFAULT '[]',
  stage TEXT DEFAULT 'new', is_simulated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS tailored_resumes (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, job_id INTEGER,
  content TEXT, diff JSONB DEFAULT '[]', flagged_terms JSONB DEFAULT '[]',
  confirmed BOOLEAN DEFAULT FALSE, is_simulated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW());

-- confirmed_by_subscriber_at is the ONLY thing that makes an application real.
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, job_id INTEGER,
  confirmed_by_subscriber_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS teasers (
  id SERIAL PRIMARY KEY, tenant_id INTEGER, token TEXT UNIQUE,
  email TEXT, name TEXT, language TEXT DEFAULT 'en', address_offer TEXT,
  payload JSONB DEFAULT '{}', narration JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending', cost_usd REAL DEFAULT 0, ip_hash TEXT,
  resume_purge_after TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE INDEX IF NOT EXISTS idx_teasers_purge ON teasers (resume_purge_after);
CREATE INDEX IF NOT EXISTS idx_teasers_ip ON teasers (ip_hash, created_at);

CREATE TABLE IF NOT EXISTS outreach (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, channel TEXT,
  subject TEXT, body TEXT,
  approved_at TIMESTAMPTZ,   -- only an explicit subscriber action sets this
  sent_at TIMESTAMPTZ,       -- only a send after approval sets this
  consent_snapshot JSONB, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS opportunities (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, source TEXT,
  company TEXT, role TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS sites (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, address TEXT,
  published_at TIMESTAMPTZ, health JSONB DEFAULT '{}');

CREATE TABLE IF NOT EXISTS agent_runs (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, agent TEXT, status TEXT,
  summary TEXT, cost_usd REAL DEFAULT 0, is_simulated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS invoices (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL, stripe_invoice_id TEXT,
  amount_cents INTEGER, status TEXT, dunning_stage INTEGER DEFAULT 0,
  paid_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());

CREATE TABLE IF NOT EXISTS notification_prefs (
  id SERIAL PRIMARY KEY, tenant_id INTEGER NOT NULL,
  prefs JSONB DEFAULT '{}', unsubscribed_all_at TIMESTAMPTZ);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY, tenant_id INTEGER, actor TEXT, action TEXT,
  reason TEXT, created_at TIMESTAMPTZ DEFAULT NOW());

-- Every tenant-scoped table gets its tenant index.
CREATE INDEX IF NOT EXISTS idx_profiles_tenant ON profiles (tenant_id);
CREATE INDEX IF NOT EXISTS idx_settings_tenant ON settings (tenant_id);
CREATE INDEX IF NOT EXISTS idx_job_matches_tenant ON job_matches (tenant_id);
CREATE INDEX IF NOT EXISTS idx_tailored_tenant ON tailored_resumes (tenant_id);
CREATE INDEX IF NOT EXISTS idx_applications_tenant ON applications (tenant_id);
CREATE INDEX IF NOT EXISTS idx_outreach_tenant ON outreach (tenant_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant ON opportunities (tenant_id);
CREATE INDEX IF NOT EXISTS idx_sites_tenant ON sites (tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant ON agent_runs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices (tenant_id);
CREATE INDEX IF NOT EXISTS idx_notif_tenant ON notification_prefs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log (tenant_id);

-- ---------------------------------------------------------------------------
-- Subscriber dashboard (added with the cv-admin-style console).
-- Every subscriber gets their own dashboard; these back its Analytics and
-- Opportunities tabs. Both are tenant-scoped.
-- ---------------------------------------------------------------------------

-- Traffic to a subscriber's own public site.
-- NO IP ADDRESS IS EVER STORED. visitor_hash is a salted digest of
-- (ip + user-agent + calendar day), so unique visitors can be counted for one
-- day and the same person is unrecognisable across days.
CREATE TABLE IF NOT EXISTS ju_page_views (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  path          VARCHAR(200),
  referrer      VARCHAR(300),
  visitor_hash  VARCHAR(64),
  is_agent      BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ju_page_views_tenant ON ju_page_views (tenant_id);
CREATE INDEX IF NOT EXISTS idx_ju_page_views_tenant_day ON ju_page_views (tenant_id, created_at);

-- Inbound interest — the subscriber's own inbox.
ALTER TABLE ju_opportunities ADD COLUMN IF NOT EXISTS from_name   VARCHAR(255);
ALTER TABLE ju_opportunities ADD COLUMN IF NOT EXISTS from_email  VARCHAR(255);
ALTER TABLE ju_opportunities ADD COLUMN IF NOT EXISTS status      VARCHAR(32) DEFAULT 'new';
ALTER TABLE ju_opportunities ADD COLUMN IF NOT EXISTS reply_draft TEXT;
ALTER TABLE ju_opportunities ADD COLUMN IF NOT EXISTS read_at     TIMESTAMPTZ;
ALTER TABLE ju_opportunities ADD COLUMN IF NOT EXISTS replied_at  TIMESTAMPTZ;
