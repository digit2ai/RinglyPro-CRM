-- =====================================================
-- Migration 006 — Calendar event invitee list
-- Tracks which email addresses have been invited (for re-send / display).
-- =====================================================

ALTER TABLE d2_calendar_events
  ADD COLUMN IF NOT EXISTS invited_emails TEXT[] DEFAULT '{}';
