-- MaraPet (ISTC x Digit2AI) — canine health monitoring.
-- THE MIGRATION IS THE SCHEMA: src/db.js runs every file in this directory on
-- every boot under a Postgres advisory lock, so this file and production cannot
-- drift. Every statement must stay idempotent.
--
-- Every table carries tenant_id NOT NULL. tenant_id is the owner account's own
-- id (self-tenant), so tenant_id IS the isolation boundary here, and account_id
-- is kept beside it on child rows for a cheap join rather than as a second
-- access check.

CREATE TABLE IF NOT EXISTS mp_accounts (
  id             SERIAL PRIMARY KEY,
  tenant_id      INTEGER NOT NULL,
  email          TEXT NOT NULL,
  password_hash  TEXT NOT NULL,
  name           TEXT,
  lang           TEXT NOT NULL DEFAULT 'en',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_accounts_email ON mp_accounts (lower(email));
CREATE INDEX IF NOT EXISTS ix_mp_accounts_tenant ON mp_accounts (tenant_id);

-- tenant_id IS the isolation boundary, and an account whose tenant is not its
-- own id would share a bucket with every other such account. This makes that
-- structurally impossible rather than a property the application remembers.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_mp_accounts_self_tenant') THEN
    ALTER TABLE mp_accounts ADD CONSTRAINT ck_mp_accounts_self_tenant CHECK (tenant_id = id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS mp_pets (
  id           SERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  account_id   INTEGER NOT NULL,
  name         TEXT NOT NULL,
  breed        TEXT,
  breed_size   TEXT,                      -- toy|small|medium|large|giant, drives the normal bands
  birth_date   DATE,
  weight_kg    NUMERIC(6,2),
  sex          TEXT,                      -- male|female|unknown
  neutered     BOOLEAN,                   -- NULL = not answered, never false-by-default
  conditions   TEXT,
  photo_mime   TEXT,
  photo_bytes  BYTEA,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_mp_pets_tenant ON mp_pets (tenant_id);
CREATE INDEX IF NOT EXISTS ix_mp_pets_account ON mp_pets (tenant_id, account_id);

CREATE TABLE IF NOT EXISTS mp_devices (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  account_id    INTEGER NOT NULL,
  pet_id        INTEGER,
  label         TEXT NOT NULL,
  hardware_id   TEXT,                     -- ISTC board serial / ODM module id, as reported
  firmware      TEXT,
  key_hash      TEXT NOT NULL,            -- SHA-256 of the plaintext key. No reveal endpoint.
  key_prefix    TEXT NOT NULL,            -- first 12 chars, for the owner to recognise a row
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_devices_keyhash ON mp_devices (key_hash);
CREATE INDEX IF NOT EXISTS ix_mp_devices_tenant ON mp_devices (tenant_id);
CREATE INDEX IF NOT EXISTS ix_mp_devices_pet ON mp_devices (tenant_id, pet_id);

-- One row per metric per instant. metric and source are allow-listed in
-- src/ingest.js and the CHECKs below are the second lock, so a row the
-- application would refuse cannot be inserted by hand either.
CREATE TABLE IF NOT EXISTS mp_readings (
  id           BIGSERIAL PRIMARY KEY,
  tenant_id    INTEGER NOT NULL,
  pet_id       INTEGER NOT NULL,
  device_id    INTEGER,                   -- NULL for source 'manual' and 'video'
  metric       TEXT NOT NULL,
  value        NUMERIC(10,3) NOT NULL,
  source       TEXT NOT NULL,
  confidence   TEXT,                      -- high|medium|low; NULL only where the source cannot say
  recorded_at  TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  dedupe_key   TEXT NOT NULL,
  CONSTRAINT ck_mp_readings_metric CHECK (metric IN
    ('heart_rate_bpm','resp_rate_bpm','hrv_ms','activity','temp_c','spo2_pct')),
  CONSTRAINT ck_mp_readings_source CHECK (source IN ('device','video','manual')),
  CONSTRAINT ck_mp_readings_conf CHECK (confidence IS NULL OR confidence IN ('high','medium','low'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_readings_dedupe ON mp_readings (tenant_id, dedupe_key);
CREATE INDEX IF NOT EXISTS ix_mp_readings_pet_time ON mp_readings (tenant_id, pet_id, metric, recorded_at DESC);

CREATE TABLE IF NOT EXISTS mp_alert_rules (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  pet_id      INTEGER NOT NULL,
  metric      TEXT NOT NULL,
  min_value   NUMERIC(10,3),
  max_value   NUMERIC(10,3),
  enabled     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ck_mp_rules_metric CHECK (metric IN
    ('heart_rate_bpm','resp_rate_bpm','hrv_ms','activity','temp_c','spo2_pct'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_rules_pet_metric ON mp_alert_rules (tenant_id, pet_id, metric);
CREATE INDEX IF NOT EXISTS ix_mp_rules_tenant ON mp_alert_rules (tenant_id);

CREATE TABLE IF NOT EXISTS mp_alerts (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  pet_id      INTEGER NOT NULL,
  rule_id     INTEGER,
  metric      TEXT NOT NULL,
  value       NUMERIC(10,3) NOT NULL,
  direction   TEXT NOT NULL,              -- above|below
  fired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at     TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_mp_alerts_tenant ON mp_alerts (tenant_id, pet_id, fired_at DESC);

-- A report is written from computed facts. facts is the exact input the prose
-- was allowed to see, kept so a sentence can always be checked against it.
CREATE TABLE IF NOT EXISTS mp_reports (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  pet_id        INTEGER NOT NULL,
  report_date   DATE NOT NULL,
  lang          TEXT NOT NULL DEFAULT 'en',
  body          TEXT NOT NULL,
  facts         JSONB NOT NULL,
  composed_by   TEXT NOT NULL,            -- model|heuristic
  is_simulated  BOOLEAN NOT NULL DEFAULT FALSE,
  rejected      JSONB,                    -- why a model draft was discarded, if it was
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_reports_day ON mp_reports (tenant_id, pet_id, report_date, lang);
CREATE INDEX IF NOT EXISTS ix_mp_reports_tenant ON mp_reports (tenant_id);

-- A vet share link is a capability URL: the token is stored as a hash only and
-- is never returned by a read endpoint after it is minted.
CREATE TABLE IF NOT EXISTS mp_share_links (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  pet_id      INTEGER NOT NULL,
  token_hash  TEXT NOT NULL,
  from_date   DATE NOT NULL,
  to_date     DATE NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_share_token ON mp_share_links (token_hash);
CREATE INDEX IF NOT EXISTS ix_mp_share_tenant ON mp_share_links (tenant_id, pet_id);

CREATE TABLE IF NOT EXISTS mp_push_subs (
  id          SERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  account_id  INTEGER NOT NULL,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_push_endpoint ON mp_push_subs (endpoint);
CREATE INDEX IF NOT EXISTS ix_mp_push_tenant ON mp_push_subs (tenant_id);

CREATE TABLE IF NOT EXISTS mp_events (
  id          BIGSERIAL PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  account_id  INTEGER,
  kind        TEXT NOT NULL,
  detail      JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_mp_events_tenant ON mp_events (tenant_id, created_at DESC);
