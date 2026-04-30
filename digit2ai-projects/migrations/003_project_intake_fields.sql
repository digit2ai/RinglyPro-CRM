-- =====================================================
-- Migration 003: Project Intake Fields + AI Plan + Business Plan
-- Promotes prospect-submitted intake answers from d2_question_responses
-- onto first-class columns in d2_projects so the Inbox view, Claude
-- milestone-generator, and Claude business-plan-generator can read
-- them in one query.
-- =====================================================

-- Submitter / contact identity
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS submitter_name VARCHAR(255);
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS submitter_email VARCHAR(255);
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS submitter_phone VARCHAR(50);
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS country VARCHAR(100);

-- Intake long-form answers
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS target_users TEXT;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS current_process TEXT;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS data_sources TEXT;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS timeline VARCHAR(255);
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS budget_range VARCHAR(100);
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS success_metrics TEXT;

-- AI Category is a MULTI-SELECT picker so we store as TEXT[] (Postgres array)
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS ai_category TEXT[] DEFAULT '{}'::TEXT[];

ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS sensitive_data BOOLEAN DEFAULT FALSE;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS sensitive_data_detail VARCHAR(255);
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS existing_stack TEXT;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS heard_from VARCHAR(255);
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS best_contact_time VARCHAR(255);

-- Inbox status (mirrors d2_project_intake.intake_status but on the project row
-- itself for cheap inbox listing without a join)
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS intake_status VARCHAR(30) DEFAULT 'none';

-- AI artifact storage
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS business_plan_json JSONB;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS business_plan_generated_at TIMESTAMPTZ;
ALTER TABLE d2_projects ADD COLUMN IF NOT EXISTS ai_milestone_generation_at TIMESTAMPTZ;

-- Constraint on intake_status (drop & recreate so re-runs are idempotent)
ALTER TABLE d2_projects DROP CONSTRAINT IF EXISTS chk_d2_projects_intake_status;
ALTER TABLE d2_projects ADD CONSTRAINT chk_d2_projects_intake_status
  CHECK (intake_status IN ('pending_review','approved','rejected','converted','none'));

-- Index for fast inbox listing
CREATE INDEX IF NOT EXISTS idx_d2_projects_intake_status ON d2_projects(intake_status);

-- Backfill: existing rows get 'none' so they don't appear in the inbox.
-- New prospect submissions write 'pending_review' explicitly.
UPDATE d2_projects SET intake_status = 'none' WHERE intake_status IS NULL;
