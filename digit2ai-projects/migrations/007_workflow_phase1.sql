-- Migration 007 - Workflow Phase 1
-- Adds:
--   1. Business Requirements detail field on projects (captured after the
--      human kickoff meeting).
--   2. AI-extracted action items + summary on meeting minutes (drives
--      auto-task creation).
--   3. Project contracts table (10% deposit + monthly recurring + signoff
--      magic-link). Phase 1 stores the contract record; payment-rail wiring
--      (Stripe) is a phase 2 follow-on.
--   4. Workflow status columns on projects so the dashboard can show how
--      far each request has progressed through the auto-pipeline.

ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS business_requirements TEXT;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS kickoff_event_id INTEGER;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS kickoff_scheduled_at TIMESTAMP;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS contract_status VARCHAR(40) DEFAULT 'none';
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS workflow_phase VARCHAR(40) DEFAULT 'pending_review';

ALTER TABLE d2_meeting_minutes ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE d2_meeting_minutes ADD COLUMN IF NOT EXISTS action_items_json JSONB DEFAULT '[]'::jsonb;
ALTER TABLE d2_meeting_minutes ADD COLUMN IF NOT EXISTS ai_processed_at TIMESTAMP;
ALTER TABLE d2_meeting_minutes ADD COLUMN IF NOT EXISTS auto_tasks_created INTEGER DEFAULT 0;

CREATE TABLE IF NOT EXISTS d2_project_contracts (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  project_id INTEGER NOT NULL REFERENCES d2_projects(id) ON DELETE CASCADE,
  total_amount_usd NUMERIC(12, 2),
  deposit_percent NUMERIC(5, 2) DEFAULT 10.00,
  deposit_amount_usd NUMERIC(12, 2),
  monthly_amount_usd NUMERIC(12, 2),
  currency VARCHAR(10) DEFAULT 'USD',
  status VARCHAR(40) NOT NULL DEFAULT 'draft',
  signoff_token UUID DEFAULT gen_random_uuid() UNIQUE,
  signed_by_name VARCHAR(255),
  signed_by_email VARCHAR(255),
  signed_at TIMESTAMP,
  deposit_paid_at TIMESTAMP,
  contract_html TEXT,
  scope_summary TEXT,
  terms_summary TEXT,
  sent_at TIMESTAMP,
  created_by_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_d2_contracts_project ON d2_project_contracts(project_id);
CREATE INDEX IF NOT EXISTS idx_d2_contracts_token ON d2_project_contracts(signoff_token);
CREATE INDEX IF NOT EXISTS idx_d2_contracts_status ON d2_project_contracts(status);

CREATE INDEX IF NOT EXISTS idx_d2_projects_workflow_phase ON d2_projects(workflow_phase);
