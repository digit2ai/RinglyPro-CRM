-- ============================================================================
-- AI RADAR — canonical schema (ar_*)
-- Personal capture log for AI products spotted on social media.
-- Multi-tenant: every row carries tenant_id (= the owning user's id).
-- Tables auto-create on boot via sequelize sync({alter:false}); this file is the
-- source of truth for a clean database or a manual provision.
-- ============================================================================

CREATE TABLE IF NOT EXISTS ar_users (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER,
  email          VARCHAR(255) NOT NULL UNIQUE,
  name           VARCHAR(255),
  password_hash  VARCHAR(255) NOT NULL,
  role           VARCHAR(32) DEFAULT 'member',
  lang           VARCHAR(12) DEFAULT 'en',
  capture_token  VARCHAR(255),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ar_users_capture_token_idx ON ar_users (capture_token);

CREATE TABLE IF NOT EXISTS ar_items (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL DEFAULT 1,
  user_id         INTEGER,

  company_name    VARCHAR(255),
  company_url     VARCHAR(255),
  description     TEXT,

  source_url      TEXT,
  source_platform VARCHAR(32),
  source_title    TEXT,
  shared_text     TEXT,

  category        VARCHAR(64),
  tags            JSONB DEFAULT '[]'::jsonb,
  status          VARCHAR(32) DEFAULT 'inbox',
  rating          INTEGER DEFAULT 0,
  notes           TEXT,
  thumbnail_url   TEXT,

  enriched_by     VARCHAR(32) DEFAULT 'manual',
  is_simulated    BOOLEAN DEFAULT false,
  needs_review    BOOLEAN DEFAULT false,
  enrich_status   VARCHAR(16) DEFAULT 'none',

  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ar_items_tenant_idx    ON ar_items (tenant_id);
CREATE INDEX IF NOT EXISTS ar_items_status_idx    ON ar_items (status);
CREATE INDEX IF NOT EXISTS ar_items_category_idx  ON ar_items (category);
CREATE INDEX IF NOT EXISTS ar_items_platform_idx  ON ar_items (source_platform);
CREATE INDEX IF NOT EXISTS ar_items_user_idx      ON ar_items (user_id);
CREATE INDEX IF NOT EXISTS ar_items_tags_gin      ON ar_items USING GIN (tags);

CREATE TABLE IF NOT EXISTS ar_enrichments (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL DEFAULT 1,
  item_id       INTEGER,
  input_url     TEXT,
  page_meta     JSONB DEFAULT '{}'::jsonb,
  suggestion    JSONB DEFAULT '{}'::jsonb,
  model         VARCHAR(128),
  is_simulated  BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ar_enrichments_tenant_idx ON ar_enrichments (tenant_id);
CREATE INDEX IF NOT EXISTS ar_enrichments_item_idx   ON ar_enrichments (item_id);
