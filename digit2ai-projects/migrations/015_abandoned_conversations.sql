-- Migration 015: Abandoned conversation capture (T2.3)
--
-- When a prospect ends the orb session (Esc / click-stop / 10-min
-- timeout) BEFORE the run_partnership_triage tool fires, we surface
-- a "want us to follow up?" modal. Their transcript + email lands
-- here so Manuel can review warm-but-uncommitted leads later.
--
-- Stored separately from d2_projects because these are NOT real
-- submissions yet — they have not been triaged or qualified, and
-- we do not want them mixed into the regular intake pipeline.

CREATE TABLE IF NOT EXISTS d2_abandoned_conversations (
  id              SERIAL PRIMARY KEY,
  email           VARCHAR(255) NOT NULL,
  name            VARCHAR(255),
  company         VARCHAR(255),
  country         VARCHAR(120),
  transcript      JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcript_len  INTEGER DEFAULT 0,
  language        VARCHAR(8) DEFAULT 'en',
  partner_slug    VARCHAR(120),
  utm_source      VARCHAR(120),
  utm_campaign    VARCHAR(255),
  utm_medium      VARCHAR(120),
  utm_content     VARCHAR(255),
  utm_term        VARCHAR(255),
  referrer_url    TEXT,
  user_agent      TEXT,
  ip_hash         VARCHAR(64),
  status          VARCHAR(40) DEFAULT 'new', -- new | contacted | converted | ignored
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  contacted_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_d2_abandoned_email ON d2_abandoned_conversations (email);
CREATE INDEX IF NOT EXISTS idx_d2_abandoned_status ON d2_abandoned_conversations (status);
CREATE INDEX IF NOT EXISTS idx_d2_abandoned_partner ON d2_abandoned_conversations (partner_slug) WHERE partner_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_d2_abandoned_created ON d2_abandoned_conversations (created_at DESC);
