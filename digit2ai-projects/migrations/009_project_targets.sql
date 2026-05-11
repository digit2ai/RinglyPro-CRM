-- =====================================================
-- Migration 009 — Project delivery & price targets
-- Captured up front (before AI plan generation) so the
-- AI plan and the service contract both honor the user's
-- intended delivery window and total price.
-- =====================================================

ALTER TABLE d2_projects
  ADD COLUMN IF NOT EXISTS target_delivery_months INTEGER,
  ADD COLUMN IF NOT EXISTS target_total_usd       DECIMAL(12, 2);
