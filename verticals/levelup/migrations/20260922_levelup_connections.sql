-- Third-party credentials the creator supplies for the connectors we are
-- building. Secrets are stored ENCRYPTED (AES-256-GCM) in secrets_enc; plain
-- fields (an account id, a host) stay readable so the creator can check them.
-- There is deliberately NO column that could record "connected": nothing here
-- is connected until its connector ships and a real call succeeds.
CREATE TABLE IF NOT EXISTS lu_connections (
  id            SERIAL PRIMARY KEY,
  tenant_id     INTEGER NOT NULL,
  provider      TEXT    NOT NULL,
  fields        JSONB   NOT NULL DEFAULT '{}'::jsonb,
  secrets_enc   TEXT,
  secret_hints  JSONB   NOT NULL DEFAULT '{}'::jsonb,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lu_connections_tenant_provider ON lu_connections (tenant_id, provider);
CREATE INDEX IF NOT EXISTS lu_connections_tenant ON lu_connections (tenant_id);
