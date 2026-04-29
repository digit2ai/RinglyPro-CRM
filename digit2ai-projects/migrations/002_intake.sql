-- =====================================================
-- Migration 002: Project Intake & Discussion Module
-- Adds pre-execution discussion layer on top of d2_projects
-- =====================================================

-- 1. Intake Batches (one per meeting / submission)
CREATE TABLE IF NOT EXISTS d2_intake_batches (
  id SERIAL PRIMARY KEY,
  workspace_id INTEGER NOT NULL DEFAULT 1,
  company_id INTEGER NOT NULL REFERENCES d2_companies(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  meeting_date DATE,
  submitted_by_email VARCHAR(255),
  submitted_by_name VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  share_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_d2_intake_batches_company ON d2_intake_batches(company_id);
CREATE INDEX IF NOT EXISTS idx_d2_intake_batches_token ON d2_intake_batches(share_token);

-- 2. Project Intake (one-to-one extension of d2_projects)
CREATE TABLE IF NOT EXISTS d2_project_intake (
  id SERIAL PRIMARY KEY,
  project_id INTEGER UNIQUE NOT NULL REFERENCES d2_projects(id) ON DELETE CASCADE,
  batch_id INTEGER NOT NULL REFERENCES d2_intake_batches(id) ON DELETE CASCADE,
  feasibility VARCHAR(20),
  feasibility_notes TEXT,
  risk_level VARCHAR(20),
  risk_notes TEXT,
  contacts_notes TEXT,
  intake_status VARCHAR(30) NOT NULL DEFAULT 'discussion',
  priority_avg NUMERIC(4,2),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_feasibility CHECK (feasibility IS NULL OR feasibility IN ('HIGH','MEDIUM','LOW')),
  CONSTRAINT chk_risk_level CHECK (risk_level IS NULL OR risk_level IN ('HIGH','MEDIUM','LOW')),
  CONSTRAINT chk_intake_status CHECK (intake_status IN ('discussion','reviewed','approved','rejected','converted'))
);

CREATE INDEX IF NOT EXISTS idx_d2_project_intake_batch ON d2_project_intake(batch_id);
CREATE INDEX IF NOT EXISTS idx_d2_project_intake_status ON d2_project_intake(intake_status);

-- 3. Project Questions
CREATE TABLE IF NOT EXISTS d2_project_questions (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES d2_projects(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  created_by_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_d2_project_questions_project ON d2_project_questions(project_id);

-- 4. Question Responses
CREATE TABLE IF NOT EXISTS d2_question_responses (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES d2_project_questions(id) ON DELETE CASCADE,
  responder_email VARCHAR(255),
  responder_name VARCHAR(255),
  response_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_d2_question_responses_question ON d2_question_responses(question_id);

-- 5. Project Comments
CREATE TABLE IF NOT EXISTS d2_project_comments (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES d2_projects(id) ON DELETE CASCADE,
  parent_comment_id INTEGER REFERENCES d2_project_comments(id) ON DELETE CASCADE,
  author_email VARCHAR(255),
  author_name VARCHAR(255),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_d2_project_comments_project ON d2_project_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_d2_project_comments_parent ON d2_project_comments(parent_comment_id);

-- 6. Priority Votes (one vote per email per project)
CREATE TABLE IF NOT EXISTS d2_priority_votes (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES d2_projects(id) ON DELETE CASCADE,
  voter_email VARCHAR(255) NOT NULL,
  voter_name VARCHAR(255),
  score INTEGER NOT NULL,
  rationale TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_priority_score CHECK (score BETWEEN 1 AND 10),
  CONSTRAINT uq_priority_vote UNIQUE (project_id, voter_email)
);

CREATE INDEX IF NOT EXISTS idx_d2_priority_votes_project ON d2_priority_votes(project_id);

-- 7. Company Access Tokens (magic-link company scoping)
CREATE TABLE IF NOT EXISTS d2_company_access_tokens (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES d2_companies(id) ON DELETE CASCADE,
  batch_id INTEGER REFERENCES d2_intake_batches(id) ON DELETE CASCADE,
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  grantee_email VARCHAR(255),
  grantee_name VARCHAR(255),
  role VARCHAR(20) NOT NULL DEFAULT 'reviewer',
  expires_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_d2_company_access_tokens_token ON d2_company_access_tokens(token);
CREATE INDEX IF NOT EXISTS idx_d2_company_access_tokens_company ON d2_company_access_tokens(company_id);
