-- Migration 012 — Stakeholder share tokens
-- Adds per-project magic-link tokens so a stakeholder can view exactly one
-- project (filtered against team_members) without needing a CRM account.
--
-- Flow:
--   1. Admin clicks "Share Link" on the project detail page.
--   2. Backend mints a token + URL: /projects/share/{token}.
--   3. Stakeholder opens the link, enters their email.
--   4. Server verifies the email is in d2_projects.team_members.
--   5. Server returns project read-only payload + signed view-session.
--
-- No account creation. No password. Token can be rotated or revoked.

ALTER TABLE d2_projects
  ADD COLUMN IF NOT EXISTS stakeholder_share_token UUID,
  ADD COLUMN IF NOT EXISTS stakeholder_share_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stakeholder_share_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_d2_projects_stakeholder_share_token
  ON d2_projects (stakeholder_share_token)
  WHERE stakeholder_share_token IS NOT NULL;
