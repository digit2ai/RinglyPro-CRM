-- =====================================================
-- Migration 005 — Zoom Meeting on calendar events
-- Stores the Zoom meeting metadata for events that opted in.
-- =====================================================

ALTER TABLE d2_calendar_events
  ADD COLUMN IF NOT EXISTS zoom_meeting_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS zoom_join_url   TEXT,
  ADD COLUMN IF NOT EXISTS zoom_start_url  TEXT,
  ADD COLUMN IF NOT EXISTS zoom_password   VARCHAR(64);
