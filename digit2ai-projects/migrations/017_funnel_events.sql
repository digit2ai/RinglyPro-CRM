-- Migration 017: Funnel analytics events (T3.3)
--
-- Lightweight event log for measuring the champion-teaser funnel.
-- Each event captures one step a visitor took: orb_visible,
-- orb_clicked, mic_granted, triage_started, triage_completed,
-- submit_clicked, submit_succeeded, abandoned, transcript_emailed,
-- pdf_downloaded, hero_variant_shown (T3.4).
--
-- session_id is a client-generated random UUID stored in
-- localStorage so we can stitch a visitor's events into a funnel
-- without persisting user identity.

CREATE TABLE IF NOT EXISTS d2_funnel_events (
  id            BIGSERIAL PRIMARY KEY,
  session_id    VARCHAR(64) NOT NULL,
  event_name    VARCHAR(64) NOT NULL,
  partner_slug  VARCHAR(120),
  utm_source    VARCHAR(120),
  utm_campaign  VARCHAR(255),
  lang          VARCHAR(8),
  hero_variant  SMALLINT,
  metadata      JSONB,
  ip_hash       VARCHAR(64),
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_d2_funnel_session ON d2_funnel_events (session_id);
CREATE INDEX IF NOT EXISTS idx_d2_funnel_event ON d2_funnel_events (event_name);
CREATE INDEX IF NOT EXISTS idx_d2_funnel_partner ON d2_funnel_events (partner_slug) WHERE partner_slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_d2_funnel_created ON d2_funnel_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_d2_funnel_variant ON d2_funnel_events (hero_variant) WHERE hero_variant IS NOT NULL;
