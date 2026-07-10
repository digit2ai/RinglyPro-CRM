-- RinglyPro Lite — canonical schema (ISOLATED, separate database).
-- Sequelize sync({alter:false}) also creates these on boot; this file is the
-- manual-apply reference. All tables are tenant-scoped and `lite_`-prefixed.

CREATE TABLE IF NOT EXISTS lite_tenants (
  id                     SERIAL PRIMARY KEY,
  business_name          VARCHAR(255) NOT NULL,
  owner_name             VARCHAR(255),
  owner_phone            VARCHAR(32),
  owner_email            VARCHAR(255),
  country                VARCHAR(2)  DEFAULT 'US',
  locale                 VARCHAR(2)  DEFAULT 'en',
  timezone               VARCHAR(64) DEFAULT 'America/New_York',
  greeting               TEXT,
  transfer_number        VARCHAR(32),
  stripe_customer_id     VARCHAR(64),
  stripe_subscription_id VARCHAR(64),
  subscription_status    VARCHAR(24) DEFAULT 'trialing',
  trial_ends_at          TIMESTAMPTZ,
  suspended_at           TIMESTAMPTZ,
  active                 BOOLEAN DEFAULT TRUE,
  created_at             TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lite_tenants_stripe_customer ON lite_tenants(stripe_customer_id);

CREATE TABLE IF NOT EXISTS lite_users (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  name          VARCHAR(255),
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lite_users_tenant ON lite_users(tenant_id);

CREATE TABLE IF NOT EXISTS lite_numbers (
  id               SERIAL PRIMARY KEY,
  tenant_id        INTEGER NOT NULL,
  did              VARCHAR(32) NOT NULL UNIQUE,
  country          VARCHAR(2) DEFAULT 'US',
  provider         VARCHAR(24) DEFAULT 'twilio',
  provider_sid     VARCHAR(64),
  status           VARCHAR(24) DEFAULT 'active',
  monthly_cost_usd NUMERIC(6,2),
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lite_numbers_tenant ON lite_numbers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lite_numbers_did ON lite_numbers(did);

CREATE TABLE IF NOT EXISTS lite_calls (
  id                SERIAL PRIMARY KEY,
  tenant_id         INTEGER NOT NULL,
  call_sid          VARCHAR(64),
  caller            VARCHAR(32),
  did               VARCHAR(32),
  language          VARCHAR(2) DEFAULT 'en',
  started_at        TIMESTAMPTZ DEFAULT now(),
  ended_at          TIMESTAMPTZ,
  duration          INTEGER DEFAULT 0,
  disposition       VARCHAR(24) DEFAULT 'in_progress',
  recording_url     VARCHAR(512),
  transcript        TEXT,
  llm_input_tokens  INTEGER DEFAULT 0,
  llm_output_tokens INTEGER DEFAULT 0,
  turns             INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_lite_calls_tenant ON lite_calls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lite_calls_sid ON lite_calls(call_sid);

CREATE TABLE IF NOT EXISTS lite_messages (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  call_id         INTEGER,
  caller_name     VARCHAR(255),
  callback_number VARCHAR(32),
  body            TEXT,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lite_messages_tenant ON lite_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lite_messages_call ON lite_messages(call_id);

CREATE TABLE IF NOT EXISTS lite_availability_rules (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  weekday      INTEGER NOT NULL,          -- 0=Sun .. 6=Sat
  start        VARCHAR(5) NOT NULL,       -- 'HH:MM'
  "end"        VARCHAR(5) NOT NULL,       -- 'HH:MM'
  slot_minutes INTEGER DEFAULT 30,
  timezone     VARCHAR(64) DEFAULT 'America/New_York',
  active       BOOLEAN DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lite_avail_tenant ON lite_availability_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lite_avail_tenant_wd ON lite_availability_rules(tenant_id, weekday);

CREATE TABLE IF NOT EXISTS lite_appointments (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,
  call_id         INTEGER,
  caller_name     VARCHAR(255),
  callback_number VARCHAR(32),
  starts_at       TIMESTAMPTZ NOT NULL,
  ends_at         TIMESTAMPTZ NOT NULL,
  status          VARCHAR(24) DEFAULT 'confirmed',
  created_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lite_appts_tenant ON lite_appointments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_lite_appts_tenant_start ON lite_appointments(tenant_id, starts_at);

-- Atomic slot lock: no two live appointments may share a (tenant_id, starts_at).
-- Partial unique index ignores cancelled rows so a freed slot can be rebooked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lite_appts_slot
  ON lite_appointments(tenant_id, starts_at)
  WHERE status <> 'cancelled';

CREATE TABLE IF NOT EXISTS lite_call_transcripts (
  id         SERIAL PRIMARY KEY,
  tenant_id  INTEGER,
  call_sid   VARCHAR(64),
  role       VARCHAR(16) NOT NULL,     -- caller|agent|tool
  text       TEXT,
  tool_name  VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lite_transcripts_sid ON lite_call_transcripts(call_sid);
