-- Migration 014: Partner attribution + UTM tracking on d2_projects
--
-- Adds 7 columns so every prospect submission can be attributed back to
-- the Partner who drove the traffic (and to the campaign / medium / etc).
-- Drives commission tracking + the funnel analytics in Tier 3.
--
-- All columns are nullable so existing rows are untouched. Index on
-- partner_slug because the partner dashboard reads
--    WHERE partner_slug = $1
-- on every page load.

ALTER TABLE d2_projects
  ADD COLUMN IF NOT EXISTS partner_slug   VARCHAR(120),
  ADD COLUMN IF NOT EXISTS utm_source     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS utm_campaign   VARCHAR(255),
  ADD COLUMN IF NOT EXISTS utm_medium     VARCHAR(120),
  ADD COLUMN IF NOT EXISTS utm_content    VARCHAR(255),
  ADD COLUMN IF NOT EXISTS utm_term       VARCHAR(255),
  ADD COLUMN IF NOT EXISTS referrer_url   TEXT;

CREATE INDEX IF NOT EXISTS idx_d2_projects_partner_slug
  ON d2_projects (partner_slug)
  WHERE partner_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_d2_projects_utm_source
  ON d2_projects (utm_source)
  WHERE utm_source IS NOT NULL;
