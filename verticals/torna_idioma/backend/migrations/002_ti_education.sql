-- Torna Idioma Education Schema
-- Courses, lessons, enrollments, progress, certifications

CREATE TABLE IF NOT EXISTS ti_courses (
  id SERIAL PRIMARY KEY,
  title_en VARCHAR(255) NOT NULL,
  title_es VARCHAR(255),
  title_fil VARCHAR(255),
  description_en TEXT,
  description_es TEXT,
  description_fil TEXT,
  level VARCHAR(30) NOT NULL DEFAULT 'beginner',
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  duration_hours INTEGER DEFAULT 0,
  total_lessons INTEGER DEFAULT 0,
  thumbnail_url TEXT,
  is_published BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_by INTEGER REFERENCES ti_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ti_lessons (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL REFERENCES ti_courses(id) ON DELETE CASCADE,
  title_en VARCHAR(255) NOT NULL,
  title_es VARCHAR(255),
  title_fil VARCHAR(255),
  content_en TEXT,
  content_es TEXT,
  content_fil TEXT,
  lesson_type VARCHAR(30) DEFAULT 'reading',
  sort_order INTEGER DEFAULT 0,
  duration_minutes INTEGER DEFAULT 15,
  exercises JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ti_enrollments (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ti_users(id) ON DELETE CASCADE,
  course_id INTEGER NOT NULL REFERENCES ti_courses(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'active',
  enrolled_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  progress_pct NUMERIC(5,2) DEFAULT 0,
  UNIQUE(user_id, course_id)
);

CREATE TABLE IF NOT EXISTS ti_lesson_progress (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ti_users(id) ON DELETE CASCADE,
  lesson_id INTEGER NOT NULL REFERENCES ti_lessons(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'not_started',
  score NUMERIC(5,2),
  time_spent_sec INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS ti_certifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ti_users(id) ON DELETE CASCADE,
  cert_type VARCHAR(50) NOT NULL,
  cert_level VARCHAR(30),
  course_id INTEGER REFERENCES ti_courses(id),
  score NUMERIC(5,2),
  issued_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  certificate_url TEXT,
  status VARCHAR(20) DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_ti_enrollments_user ON ti_enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_ti_enrollments_course ON ti_enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_ti_lesson_progress_user ON ti_lesson_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_ti_certifications_user ON ti_certifications(user_id);
