-- Migration 016: Partner dashboard sessions (T3.1)
--
-- Magic-link auth for /champion-dashboard.html. A Partner enters their
-- email + slug, the server creates a session row with a random token,
-- emails the magic URL (or surfaces it in the response if SendGrid
-- transport is unavailable). Clicking the URL validates the token,
-- sets an HttpOnly cookie, and shows the dashboard.
--
-- Token is a 32-byte hex random — never re-issued. Expires after 7 days.
-- Single-partner-slug-per-session so re-login under a different slug
-- doesn't leak the previous partner's data.

CREATE TABLE IF NOT EXISTS d2_partner_sessions (
  token         VARCHAR(64) PRIMARY KEY,
  partner_slug  VARCHAR(120) NOT NULL,
  email         VARCHAR(255) NOT NULL,
  name          VARCHAR(255),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at    TIMESTAMPTZ NOT NULL,
  last_used_at  TIMESTAMPTZ,
  used_count    INTEGER DEFAULT 0,
  ip_hash       VARCHAR(64),
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_d2_partner_sessions_email ON d2_partner_sessions (email);
CREATE INDEX IF NOT EXISTS idx_d2_partner_sessions_slug ON d2_partner_sessions (partner_slug);
CREATE INDEX IF NOT EXISTS idx_d2_partner_sessions_expires ON d2_partner_sessions (expires_at);
