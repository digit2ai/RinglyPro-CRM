-- JobMD.io — canonical schema.
-- Tables auto-create on boot via sync({alter:false}); this file is the
-- authoritative DDL. Every table carries tenant_id and is indexed on it.
-- Shared CRM database, so every table is `jm_` prefixed.

CREATE TABLE IF NOT EXISTS jm_users (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL DEFAULT 1,
  email         VARCHAR(255) NOT NULL UNIQUE,
  name          VARCHAR(255),
  role          VARCHAR(255) DEFAULT 'admin',
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jm_users_tenant ON jm_users(tenant_id);

CREATE TABLE IF NOT EXISTS jm_build_plans (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL DEFAULT 1,
  label        VARCHAR(255),
  kind         VARCHAR(64) DEFAULT 'build_plan',   -- build_plan | architecture_record
  plan         JSONB NOT NULL,
  evidence     JSONB,
  counts       JSONB,
  verification JSONB,
  composed_by  VARCHAR(255) DEFAULT 'deterministic',
  is_simulated BOOLEAN DEFAULT TRUE,
  model        VARCHAR(255),
  duration_ms  INTEGER,
  created_by   INTEGER,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jm_build_plans_tenant ON jm_build_plans(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jm_build_plans_tenant_created ON jm_build_plans(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS jm_plan_runs (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL DEFAULT 1,
  status            VARCHAR(255) NOT NULL,
  kind              VARCHAR(64) DEFAULT 'build_plan',
  composed_by       VARCHAR(255),
  violations        JSONB,
  rejected_rewrites JSONB,
  duration_ms       INTEGER,
  error             TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jm_plan_runs_tenant ON jm_plan_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jm_plan_runs_tenant_created ON jm_plan_runs(tenant_id, created_at);

-- Landing-page inquiries. Deliberately unreachable from the architect service:
-- a lead is a real person's contact detail, and the build plan describes
-- structures only.
CREATE TABLE IF NOT EXISTS jm_leads (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER NOT NULL DEFAULT 1,
  first_name VARCHAR(255) NOT NULL,
  last_name  VARCHAR(255),
  email      VARCHAR(255) NOT NULL,
  phone      VARCHAR(255),
  role       VARCHAR(255),
  message    TEXT,
  source     VARCHAR(255) DEFAULT 'landing',
  ip_hash    VARCHAR(255),
  status     VARCHAR(255) DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_jm_leads_tenant ON jm_leads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_jm_leads_tenant_created ON jm_leads(tenant_id, created_at);
