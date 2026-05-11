-- =====================================================
-- Migration 010 — Switch delivery target from months to weeks
-- Delivery timeframe is naturally expressed in weeks for sub-quarter
-- projects (e.g., 2-week sprints, 6-week MVP). The 12-month service
-- contract term is unaffected — only the delivery window changes.
-- =====================================================

-- Add the new column if it doesn't exist
ALTER TABLE d2_projects
  ADD COLUMN IF NOT EXISTS target_delivery_weeks INTEGER;

-- Backfill from target_delivery_months when present (1 month ≈ 4 weeks)
UPDATE d2_projects
   SET target_delivery_weeks = target_delivery_months * 4
 WHERE target_delivery_weeks IS NULL
   AND target_delivery_months IS NOT NULL;

-- Drop the old months column
ALTER TABLE d2_projects
  DROP COLUMN IF EXISTS target_delivery_months;
