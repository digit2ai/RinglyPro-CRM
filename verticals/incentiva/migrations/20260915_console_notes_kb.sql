-- BuyersLine console: notes and documents on a lead, and the internal knowledge base.
-- Idempotent: src/db.js runs every migrations/*.sql file on boot, in filename order.
--
-- nca_kb_entries is NOT nca_kb. nca_kb belongs to the SME capture pipeline; these rows are
-- research and policy notes the admin and the licensed agent type in the console for internal use.
-- File bytes live in Postgres (BYTEA) because the Render disk is wiped on every deploy.

CREATE TABLE IF NOT EXISTS nca_lead_notes (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  lead_id INTEGER NOT NULL REFERENCES nca_leads(id) ON DELETE CASCADE,
  author_user_id INTEGER,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_lead_notes_lead_idx ON nca_lead_notes (tenant_id, lead_id, created_at DESC);

CREATE TABLE IF NOT EXISTS nca_kb_entries (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  title VARCHAR(300) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by INTEGER,
  updated_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS nca_kb_entries_tenant_idx ON nca_kb_entries (tenant_id, archived_at, updated_at DESC);

CREATE TABLE IF NOT EXISTS nca_kb_links (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  entry_id INTEGER NOT NULL REFERENCES nca_kb_entries(id) ON DELETE CASCADE,
  url VARCHAR(2000) NOT NULL CHECK (url ~* '^https?://'),
  label VARCHAR(300),
  created_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_kb_links_entry_idx ON nca_kb_links (tenant_id, entry_id);

CREATE TABLE IF NOT EXISTS nca_files (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  owner_type VARCHAR(10) NOT NULL CHECK (owner_type IN ('lead','kb')),
  owner_id INTEGER NOT NULL,
  filename VARCHAR(200) NOT NULL,
  content_type VARCHAR(120) NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256 CHAR(64) NOT NULL,
  data BYTEA NOT NULL,
  uploaded_by INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nca_files_owner_idx ON nca_files (tenant_id, owner_type, owner_id);
