-- Visionarium Foundation Platform - Initial Schema
-- Run against DATABASE_URL PostgreSQL

-- Sponsor Tiers (reference table)
CREATE TABLE IF NOT EXISTS visionarium_sponsor_tiers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  min_contribution DECIMAL(12,2) DEFAULT 0,
  benefits JSONB DEFAULT '{}',
  board_observer BOOLEAN DEFAULT false,
  named_fellowship BOOLEAN DEFAULT false,
  demo_day_speaking BOOLEAN DEFAULT false,
  custom_impact_dossier BOOLEAN DEFAULT false
);

-- Community Members
CREATE TABLE IF NOT EXISTS visionarium_community_members (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  age INTEGER,
  country VARCHAR(100),
  city VARCHAR(100),
  language_pref VARCHAR(2) DEFAULT 'en' CHECK (language_pref IN ('en','es')),
  phone VARCHAR(30),
  school_or_university VARCHAR(255),
  field_of_interest VARCHAR(255),
  registration_source VARCHAR(100),
  geo_detected_country VARCHAR(100),
  geo_detected_city VARCHAR(100),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  tier VARCHAR(20) DEFAULT 'community' CHECK (tier IN ('community','active_member','applicant','fellow','alumni')),
  total_badges INTEGER DEFAULT 0,
  total_challenges_completed INTEGER DEFAULT 0,
  engagement_score FLOAT DEFAULT 0,
  lina_conversation_count INTEGER DEFAULT 0,
  last_lina_interaction TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vcm_email ON visionarium_community_members(email);
CREATE INDEX IF NOT EXISTS idx_vcm_tier ON visionarium_community_members(tier);
CREATE INDEX IF NOT EXISTS idx_vcm_country ON visionarium_community_members(country);
CREATE INDEX IF NOT EXISTS idx_vcm_status ON visionarium_community_members(status);

-- Mentors
CREATE TABLE IF NOT EXISTS visionarium_mentors (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  bio TEXT,
  expertise_areas JSONB DEFAULT '[]',
  languages JSONB DEFAULT '["en"]',
  country VARCHAR(100),
  city VARCHAR(100),
  company VARCHAR(255),
  title VARCHAR(255),
  linkedin_url VARCHAR(500),
  availability_hours_per_month INTEGER DEFAULT 2,
  status VARCHAR(20) DEFAULT 'onboarding' CHECK (status IN ('active','inactive','onboarding')),
  total_fellows_mentored INTEGER DEFAULT 0,
  avg_fellow_rating FLOAT,
  onboarded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Sponsors
CREATE TABLE IF NOT EXISTS visionarium_sponsors (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(200),
  contact_title VARCHAR(200),
  tier VARCHAR(20) DEFAULT 'supporter' CHECK (tier IN ('founding','lead','program','supporter','in_kind')),
  contribution_amount DECIMAL(12,2) DEFAULT 0,
  contribution_type VARCHAR(10) DEFAULT 'cash' CHECK (contribution_type IN ('cash','in_kind','mixed')),
  logo_url VARCHAR(500),
  website_url VARCHAR(500),
  board_observer BOOLEAN DEFAULT false,
  named_fellowships_count INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'prospect' CHECK (status IN ('prospect','committed','active','churned')),
  contract_start TIMESTAMP,
  contract_end TIMESTAMP,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Cohorts
CREATE TABLE IF NOT EXISTS visionarium_cohorts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  year INTEGER NOT NULL,
  season VARCHAR(10) DEFAULT 'fall' CHECK (season IN ('fall','spring')),
  status VARCHAR(30) DEFAULT 'planning' CHECK (status IN ('planning','applications_open','selection','active','completed')),
  max_fellows INTEGER DEFAULT 40,
  current_fellows_count INTEGER DEFAULT 0,
  application_open_date TIMESTAMP,
  application_close_date TIMESTAMP,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  demo_day_date TIMESTAMP,
  city VARCHAR(100) DEFAULT 'Miami',
  total_applicants INTEGER DEFAULT 0,
  acceptance_rate FLOAT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Fellows
CREATE TABLE IF NOT EXISTS visionarium_fellows (
  id SERIAL PRIMARY KEY,
  community_member_id INTEGER NOT NULL REFERENCES visionarium_community_members(id),
  cohort_id INTEGER NOT NULL REFERENCES visionarium_cohorts(id),
  track VARCHAR(20) NOT NULL CHECK (track IN ('explorer_16_18','builder_18_22')),
  status VARCHAR(20) DEFAULT 'selected' CHECK (status IN ('selected','active','on_leave','completed','withdrawn')),
  mentor_id INTEGER REFERENCES visionarium_mentors(id),
  capstone_project_id INTEGER,
  scholarship_amount DECIMAL(10,2) DEFAULT 0,
  travel_funded BOOLEAN DEFAULT false,
  completion_rate FLOAT DEFAULT 0,
  bilingual_proficiency_score FLOAT,
  ai_fluency_score FLOAT,
  nps_score INTEGER,
  internship_placed BOOLEAN DEFAULT false,
  internship_company VARCHAR(255),
  demo_day_presented BOOLEAN DEFAULT false,
  sponsor_id INTEGER REFERENCES visionarium_sponsors(id),
  notes_admin TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vf_member ON visionarium_fellows(community_member_id);
CREATE INDEX IF NOT EXISTS idx_vf_cohort ON visionarium_fellows(cohort_id);
CREATE INDEX IF NOT EXISTS idx_vf_mentor ON visionarium_fellows(mentor_id);
CREATE INDEX IF NOT EXISTS idx_vf_status ON visionarium_fellows(status);

-- Applications
CREATE TABLE IF NOT EXISTS visionarium_applications (
  id SERIAL PRIMARY KEY,
  community_member_id INTEGER NOT NULL REFERENCES visionarium_community_members(id),
  cohort_id INTEGER NOT NULL REFERENCES visionarium_cohorts(id),
  status VARCHAR(20) DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','interview','accepted','waitlisted','rejected')),
  track_preference VARCHAR(10) CHECK (track_preference IN ('explorer','builder')),
  written_vision TEXT,
  video_url VARCHAR(500),
  challenge_submission JSONB,
  reviewer_notes TEXT,
  reviewer_id INTEGER,
  interview_date TIMESTAMP,
  interview_score FLOAT,
  scholarship_requested BOOLEAN DEFAULT false,
  submitted_at TIMESTAMP,
  reviewed_at TIMESTAMP,
  decided_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_va_member ON visionarium_applications(community_member_id);
CREATE INDEX IF NOT EXISTS idx_va_cohort ON visionarium_applications(cohort_id);
CREATE INDEX IF NOT EXISTS idx_va_status ON visionarium_applications(status);

-- Badges
CREATE TABLE IF NOT EXISTS visionarium_badges (
  id SERIAL PRIMARY KEY,
  name_en VARCHAR(200) NOT NULL,
  name_es VARCHAR(200) NOT NULL,
  description_en TEXT,
  description_es TEXT,
  icon_url VARCHAR(500),
  category VARCHAR(20) NOT NULL CHECK (category IN ('technology','leadership','community','execution')),
  criteria JSONB DEFAULT '{}',
  points INTEGER DEFAULT 10,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Member Badges
CREATE TABLE IF NOT EXISTS visionarium_member_badges (
  id SERIAL PRIMARY KEY,
  community_member_id INTEGER NOT NULL REFERENCES visionarium_community_members(id),
  badge_id INTEGER NOT NULL REFERENCES visionarium_badges(id),
  earned_at TIMESTAMP DEFAULT NOW()
);

-- Events
CREATE TABLE IF NOT EXISTS visionarium_events (
  id SERIAL PRIMARY KEY,
  cohort_id INTEGER REFERENCES visionarium_cohorts(id),
  title_en VARCHAR(300) NOT NULL,
  title_es VARCHAR(300) NOT NULL,
  description_en TEXT,
  description_es TEXT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('immersion','demo_day','webinar','workshop','hackathon','showcase')),
  format VARCHAR(10) DEFAULT 'virtual' CHECK (format IN ('virtual','in_person','hybrid')),
  city VARCHAR(100),
  venue VARCHAR(300),
  start_datetime TIMESTAMP,
  end_datetime TIMESTAMP,
  max_attendees INTEGER,
  current_rsvps INTEGER DEFAULT 0,
  recording_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'planned' CHECK (status IN ('planned','registration_open','in_progress','completed','cancelled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Projects (Capstones)
CREATE TABLE IF NOT EXISTS visionarium_projects (
  id SERIAL PRIMARY KEY,
  fellow_id INTEGER NOT NULL REFERENCES visionarium_fellows(id),
  cohort_id INTEGER NOT NULL REFERENCES visionarium_cohorts(id),
  title VARCHAR(300),
  description TEXT,
  sponsor_brief_id INTEGER REFERENCES visionarium_sponsors(id),
  tech_stack JSONB DEFAULT '[]',
  repo_url VARCHAR(500),
  demo_url VARCHAR(500),
  presentation_url VARCHAR(500),
  status VARCHAR(20) DEFAULT 'ideation' CHECK (status IN ('ideation','in_progress','review','presented','funded')),
  seed_funding_received BOOLEAN DEFAULT false,
  funding_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Opportunities (Marketplace)
CREATE TABLE IF NOT EXISTS visionarium_opportunities (
  id SERIAL PRIMARY KEY,
  sponsor_id INTEGER REFERENCES visionarium_sponsors(id),
  title VARCHAR(300) NOT NULL,
  description_en TEXT,
  description_es TEXT,
  type VARCHAR(20) NOT NULL CHECK (type IN ('internship','scholarship','incubation','mentorship','job')),
  location VARCHAR(200),
  remote_eligible BOOLEAN DEFAULT false,
  requirements JSONB DEFAULT '[]',
  compensation VARCHAR(200),
  application_url VARCHAR(500),
  deadline TIMESTAMP,
  status VARCHAR(10) DEFAULT 'open' CHECK (status IN ('open','closed','filled')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Impact Metrics
CREATE TABLE IF NOT EXISTS visionarium_impact_metrics (
  id SERIAL PRIMARY KEY,
  cohort_id INTEGER NOT NULL REFERENCES visionarium_cohorts(id),
  metric_name VARCHAR(200) NOT NULL,
  metric_value FLOAT,
  target_value FLOAT,
  category VARCHAR(30) NOT NULL CHECK (category IN ('completion','placement','capstone','bilingual','ai_fluency','sponsor_engagement','funding','nps')),
  measured_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Mentor Matches
CREATE TABLE IF NOT EXISTS visionarium_mentor_matches (
  id SERIAL PRIMARY KEY,
  fellow_id INTEGER NOT NULL REFERENCES visionarium_fellows(id),
  mentor_id INTEGER NOT NULL REFERENCES visionarium_mentors(id),
  cohort_id INTEGER NOT NULL REFERENCES visionarium_cohorts(id),
  status VARCHAR(20) DEFAULT 'proposed' CHECK (status IN ('proposed','active','paused','completed')),
  total_sessions INTEGER DEFAULT 0,
  avg_rating_by_fellow FLOAT,
  avg_rating_by_mentor FLOAT,
  matched_at TIMESTAMP DEFAULT NOW(),
  ended_at TIMESTAMP
);

-- Lina Conversations
CREATE TABLE IF NOT EXISTS visionarium_lina_conversations (
  id SERIAL PRIMARY KEY,
  community_member_id INTEGER REFERENCES visionarium_community_members(id),
  conversation_id VARCHAR(255),
  language VARCHAR(2) DEFAULT 'en' CHECK (language IN ('en','es')),
  summary TEXT,
  topics JSONB DEFAULT '[]',
  sentiment VARCHAR(10) CHECK (sentiment IN ('positive','neutral','negative')),
  escalated BOOLEAN DEFAULT false,
  escalation_reason VARCHAR(500),
  duration_seconds INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vlc_member ON visionarium_lina_conversations(community_member_id);
CREATE INDEX IF NOT EXISTS idx_vlc_escalated ON visionarium_lina_conversations(escalated);

-- Seed sponsor tiers
INSERT INTO visionarium_sponsor_tiers (name, min_contribution, board_observer, named_fellowship, demo_day_speaking, custom_impact_dossier, benefits)
VALUES
  ('founding', 250000, true, true, true, true, '{"board_observer":true,"named_fellowships":true,"prominent_recognition":true,"first_access_talent":true,"demo_day_speaking":true,"custom_dossier":true}'),
  ('lead', 100000, false, true, true, true, '{"named_track":true,"logo_on_materials":true,"sponsor_briefed_capstone":true,"demo_day_presence":true,"custom_dossier":true}'),
  ('program', 25000, false, false, false, false, '{"logo_recognition":true,"aggregate_impact_report":true,"mentor_slot_invitations":true,"talent_pipeline_access":true}'),
  ('supporter', 10000, false, false, false, false, '{"name_recognition":true,"aggregate_impact_report":true,"mentor_slot_invitations":true}'),
  ('in_kind', 0, false, false, false, false, '{"tier_equivalent_recognition":true}')
ON CONFLICT (name) DO NOTHING;

-- Seed Cohort 1
INSERT INTO visionarium_cohorts (name, year, season, status, max_fellows, city, application_open_date, start_date, end_date)
VALUES ('Cohort 1 -- Fall 2026', 2026, 'fall', 'planning', 40, 'Miami', '2026-07-01', '2026-09-01', '2027-05-31')
ON CONFLICT DO NOTHING;
