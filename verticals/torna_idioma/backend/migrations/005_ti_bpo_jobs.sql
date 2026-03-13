-- BPO Job Board tables

CREATE TABLE IF NOT EXISTS ti_bpo_jobs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES ti_bpo_companies(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description_en TEXT,
  description_es TEXT,
  description_fil TEXT,
  location VARCHAR(255) DEFAULT 'Makati City',
  job_type VARCHAR(30) DEFAULT 'full_time',
  salary_range VARCHAR(100),
  spanish_level_required VARCHAR(10) DEFAULT 'B1',
  requirements JSONB DEFAULT '[]',
  benefits JSONB DEFAULT '[]',
  slots INTEGER DEFAULT 1,
  applications_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'open',
  posted_at TIMESTAMPTZ DEFAULT NOW(),
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ti_bpo_applications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ti_users(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES ti_bpo_jobs(id) ON DELETE CASCADE,
  cover_note TEXT,
  status VARCHAR(20) DEFAULT 'submitted',
  applied_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  UNIQUE(user_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_ti_bpo_jobs_status ON ti_bpo_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ti_bpo_apps_user ON ti_bpo_applications(user_id);
