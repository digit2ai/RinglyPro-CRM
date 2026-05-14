-- Migration 013 — Project NDAs
-- One-off NDAs per stakeholder, signed via a per-token magic link.
-- Bound to a specific stakeholder email so each link signs exactly one person.

CREATE TABLE IF NOT EXISTS d2_project_ndas (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  project_id INTEGER NOT NULL,
  token UUID NOT NULL,
  stakeholder_email VARCHAR(255) NOT NULL,
  stakeholder_name VARCHAR(255),
  stakeholder_company VARCHAR(255),
  stakeholder_title VARCHAR(255),
  purpose TEXT,
  nda_text TEXT,
  signature_data TEXT,
  signed_at TIMESTAMPTZ,
  signed_ip VARCHAR(64),
  signed_user_agent TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by VARCHAR(255),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_d2_project_ndas_token
  ON d2_project_ndas (token);
CREATE INDEX IF NOT EXISTS idx_d2_project_ndas_project
  ON d2_project_ndas (project_id);
CREATE INDEX IF NOT EXISTS idx_d2_project_ndas_email
  ON d2_project_ndas (stakeholder_email);
