-- Digit2AI Growth — internal AI CMO for our own portfolio.
-- Tables auto-create on boot via sync(); this is the canonical reference.

CREATE TABLE IF NOT EXISTS gr_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  role VARCHAR(32) DEFAULT 'owner',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gr_brands (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  slug VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  url VARCHAR(255),
  tagline VARCHAR(255),
  positioning TEXT,
  icp TEXT,
  voice VARCHAR(255),
  keywords JSONB DEFAULT '[]',
  channels JSONB DEFAULT '["seo","x","linkedin","geo","content"]',
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gr_brands_owner ON gr_brands(owner_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gr_brands_owner_slug ON gr_brands(owner_id, slug);

CREATE TABLE IF NOT EXISTS gr_drafts (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  brand_id INTEGER NOT NULL,
  agent VARCHAR(64) NOT NULL,
  channel VARCHAR(32),
  kind VARCHAR(32),
  title VARCHAR(255),
  body TEXT,
  meta JSONB DEFAULT '{}',
  status VARCHAR(32) DEFAULT 'draft',
  is_simulated BOOLEAN DEFAULT false,
  run_id INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gr_drafts_owner_brand ON gr_drafts(owner_id, brand_id);
CREATE INDEX IF NOT EXISTS idx_gr_drafts_status ON gr_drafts(status);

CREATE TABLE IF NOT EXISTS gr_runs (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  brand_id INTEGER NOT NULL,
  trigger VARCHAR(32) DEFAULT 'manual',
  agents JSONB DEFAULT '[]',
  drafts_created INTEGER DEFAULT 0,
  cost_usd DOUBLE PRECISION DEFAULT 0,
  status VARCHAR(32) DEFAULT 'ok',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gr_runs_owner_brand ON gr_runs(owner_id, brand_id);

CREATE TABLE IF NOT EXISTS gr_settings (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL UNIQUE,
  seo JSONB DEFAULT '{}',
  content JSONB DEFAULT '{}',
  x JSONB DEFAULT '{}',
  linkedin JSONB DEFAULT '{}',
  geo JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gr_posts (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  brand_id INTEGER NOT NULL,
  slug VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  meta_description VARCHAR(255),
  html TEXT,
  source_markdown TEXT,
  keywords JSONB DEFAULT '[]',
  status VARCHAR(32) DEFAULT 'published',
  draft_id INTEGER,
  published_at TIMESTAMPTZ,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gr_posts_brand_slug ON gr_posts(brand_id, slug);

CREATE TABLE IF NOT EXISTS gr_metrics (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  brand_id INTEGER NOT NULL,
  source VARCHAR(32),
  snapshot JSONB DEFAULT '{}',
  captured_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gr_metrics_owner_brand ON gr_metrics(owner_id, brand_id);
