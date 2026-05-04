-- =====================================================
-- Migration 004 — Meeting Minutes
-- Stores meeting notes (e.g. pasted Zoom transcripts) optionally linked to a project.
-- =====================================================

CREATE TABLE IF NOT EXISTS d2_meeting_minutes (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  project_id INTEGER REFERENCES d2_projects(id) ON DELETE SET NULL,
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  subject VARCHAR(500) NOT NULL,
  notes TEXT,
  created_by_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_d2_meeting_minutes_ws ON d2_meeting_minutes(workspace_id);
CREATE INDEX IF NOT EXISTS idx_d2_meeting_minutes_project ON d2_meeting_minutes(project_id);
CREATE INDEX IF NOT EXISTS idx_d2_meeting_minutes_date ON d2_meeting_minutes(meeting_date DESC);
