-- LevelUp Media Marketing — canonical schema. Runs on every boot under an
-- advisory lock, so every statement must stay idempotent. Prefix lu_.
-- tenant_id = the creator's account id. Platform-wide knowledge uses tenant 0.

CREATE TABLE IF NOT EXISTS lu_users (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER,
  email VARCHAR(200) NOT NULL,
  name VARCHAR(200),
  password_hash VARCHAR(200) NOT NULL,
  lang VARCHAR(4) NOT NULL DEFAULT 'en',
  is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  created_by_seed BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lu_users_email_uq ON lu_users (lower(email));
CREATE INDEX IF NOT EXISTS lu_users_tenant_idx ON lu_users (tenant_id);

-- The living creator profile every agent reads (one per tenant).
CREATE TABLE IF NOT EXISTS lu_profiles (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  niche TEXT,
  offer TEXT,
  voice TEXT,
  pillars JSONB NOT NULL DEFAULT '[]'::jsonb,
  accounts JSONB NOT NULL DEFAULT '[]'::jsonb,
  rate_card JSONB NOT NULL DEFAULT '[]'::jsonb,
  negotiation_template TEXT,
  plan TEXT,
  composed_by VARCHAR(20),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lu_profiles_tenant_uq ON lu_profiles (tenant_id);

-- Training: knowledge documents and rules. agent = 'all' or one agent id.
CREATE TABLE IF NOT EXISTS lu_knowledge (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  kind VARCHAR(10) NOT NULL,
  agent VARCHAR(40) NOT NULL DEFAULT 'all',
  title VARCHAR(200) NOT NULL,
  body TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  author_id INTEGER,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lu_knowledge_kind_ck CHECK (kind IN ('doc','rule'))
);
CREATE INDEX IF NOT EXISTS lu_knowledge_tenant_idx ON lu_knowledge (tenant_id, active, agent);

-- Calendar + pipeline. A post is an idea until it has a script.
CREATE TABLE IF NOT EXISTS lu_posts (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  title VARCHAR(300) NOT NULL,
  pillar VARCHAR(120),
  purpose VARCHAR(20),
  format VARCHAR(40),
  effort VARCHAR(10),
  needs TEXT,
  setup VARCHAR(120),
  account VARCHAR(120),
  destinations JSONB NOT NULL DEFAULT '[]'::jsonb,
  links JSONB NOT NULL DEFAULT '[]'::jsonb,
  hook TEXT,
  script TEXT,
  script_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  caption_drafts JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'idea',
  scheduled_date DATE,
  source VARCHAR(20) NOT NULL DEFAULT 'manual',
  posted_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lu_posts_tenant_idx ON lu_posts (tenant_id, status);
CREATE INDEX IF NOT EXISTS lu_posts_tenant_date_idx ON lu_posts (tenant_id, scheduled_date);

-- Editing jobs. A job is never "complete" unless an export exists.
CREATE TABLE IF NOT EXISTS lu_edit_jobs (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  post_id INTEGER,
  source_name VARCHAR(300) NOT NULL,
  output_name VARCHAR(320),
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  blocker TEXT,
  rules_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  export_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lu_edit_jobs_tenant_idx ON lu_edit_jobs (tenant_id, status);

-- "This keeps happening" counters per issue code.
CREATE TABLE IF NOT EXISTS lu_edit_issues (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  code VARCHAR(40) NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  rule_proposed BOOLEAN NOT NULL DEFAULT false,
  rule_id INTEGER,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lu_edit_issues_uq ON lu_edit_issues (tenant_id, code);

-- Brand deals from pasted emails. Nothing here is ever sent by LevelUp.
CREATE TABLE IF NOT EXISTS lu_deals (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  brand VARCHAR(200),
  sender VARCHAR(200),
  subject VARCHAR(300),
  body TEXT NOT NULL,
  account VARCHAR(120),
  suggested_rate NUMERIC(12,2),
  rate_source VARCHAR(200),
  red_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  injection_flag BOOLEAN NOT NULL DEFAULT false,
  lead_quality VARCHAR(12),
  draft_reply TEXT,
  composed_by VARCHAR(20),
  status VARCHAR(20) NOT NULL DEFAULT 'drafted',
  approved_at TIMESTAMPTZ,
  sent_marked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lu_deals_tenant_idx ON lu_deals (tenant_id, status);

CREATE TABLE IF NOT EXISTS lu_retainers (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  brand VARCHAR(200) NOT NULL,
  monthly_rate NUMERIC(12,2),
  deliverables_per_month INTEGER,
  deliverables_done INTEGER NOT NULL DEFAULT 0,
  due_day INTEGER,
  renewal_date DATE,
  payment_status VARCHAR(20) NOT NULL DEFAULT 'unknown',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lu_retainers_tenant_idx ON lu_retainers (tenant_id);

-- Top Picks lists. share_token is the public page key.
CREATE TABLE IF NOT EXISTS lu_pick_lists (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  title VARCHAR(200) NOT NULL,
  intro TEXT,
  share_token VARCHAR(40) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT false,
  post_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lu_pick_lists_token_uq ON lu_pick_lists (share_token);
CREATE INDEX IF NOT EXISTS lu_pick_lists_tenant_idx ON lu_pick_lists (tenant_id);

CREATE TABLE IF NOT EXISTS lu_pick_items (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  list_id INTEGER NOT NULL,
  name VARCHAR(300) NOT NULL,
  url TEXT NOT NULL,
  image_url TEXT,
  price VARCHAR(40),
  retailer VARCHAR(120),
  note TEXT,
  clicks INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lu_pick_items_list_idx ON lu_pick_items (tenant_id, list_id);

-- MCP API keys: SHA-256 at rest, plaintext shown once.
CREATE TABLE IF NOT EXISTS lu_api_keys (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  label VARCHAR(120),
  prefix VARCHAR(20) NOT NULL,
  key_hash VARCHAR(64) NOT NULL,
  scopes JSONB NOT NULL DEFAULT '["agent"]'::jsonb,
  revoked BOOLEAN NOT NULL DEFAULT false,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lu_api_keys_hash_uq ON lu_api_keys (key_hash);
CREATE INDEX IF NOT EXISTS lu_api_keys_tenant_idx ON lu_api_keys (tenant_id);

-- Brain audit: every call, denials included. No body text is stored.
CREATE TABLE IF NOT EXISTS lu_calls (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  actor_id INTEGER,
  channel VARCHAR(12) NOT NULL,
  tool VARCHAR(80) NOT NULL,
  outcome VARCHAR(12) NOT NULL,
  reason VARCHAR(300),
  model_calls INTEGER NOT NULL DEFAULT 0,
  composed_by VARCHAR(20),
  ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lu_calls_tenant_day_idx ON lu_calls (tenant_id, created_at);
