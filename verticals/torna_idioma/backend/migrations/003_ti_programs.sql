-- Torna Idioma Programs Schema
-- BPO program, schools, partners, events, advocacy

-- Schools participating in the program
CREATE TABLE IF NOT EXISTS ti_schools (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  school_type VARCHAR(30) DEFAULT 'public',
  barangay VARCHAR(100),
  address TEXT,
  principal_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  total_students INTEGER DEFAULT 0,
  enrolled_students INTEGER DEFAULT 0,
  program_status VARCHAR(20) DEFAULT 'pilot',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BPO partner companies
CREATE TABLE IF NOT EXISTS ti_bpo_companies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(100),
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  spanish_positions INTEGER DEFAULT 0,
  avg_salary_increase NUMERIC(10,2),
  partnership_status VARCHAR(20) DEFAULT 'prospect',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- BPO job placements
CREATE TABLE IF NOT EXISTS ti_bpo_placements (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ti_users(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES ti_bpo_companies(id),
  position_title VARCHAR(255),
  salary_before NUMERIC(12,2),
  salary_after NUMERIC(12,2),
  salary_increase_pct NUMERIC(5,2),
  placed_at TIMESTAMPTZ DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'active'
);

-- University / institutional partners
CREATE TABLE IF NOT EXISTS ti_partners (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  country VARCHAR(100) NOT NULL,
  country_flag VARCHAR(10),
  partner_type VARCHAR(50) DEFAULT 'university',
  description_en TEXT,
  description_es TEXT,
  contact_name VARCHAR(255),
  contact_email VARCHAR(255),
  programs_offered JSONB DEFAULT '[]',
  partnership_status VARCHAR(20) DEFAULT 'active',
  signed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cultural events
CREATE TABLE IF NOT EXISTS ti_events (
  id SERIAL PRIMARY KEY,
  title_en VARCHAR(255) NOT NULL,
  title_es VARCHAR(255),
  title_fil VARCHAR(255),
  description_en TEXT,
  description_es TEXT,
  description_fil TEXT,
  event_type VARCHAR(50) DEFAULT 'cultural',
  location VARCHAR(255),
  event_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ,
  capacity INTEGER,
  registered_count INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT true,
  created_by INTEGER REFERENCES ti_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ti_event_registrations (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES ti_events(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES ti_users(id) ON DELETE SET NULL,
  guest_name VARCHAR(255),
  guest_email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'registered',
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Supporters / advocacy
CREATE TABLE IF NOT EXISTS ti_supporters (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  supporter_type VARCHAR(30) DEFAULT 'individual',
  organization VARCHAR(255),
  message TEXT,
  is_newsletter BOOLEAN DEFAULT true,
  signed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Donations / sponsorships
CREATE TABLE IF NOT EXISTS ti_donations (
  id SERIAL PRIMARY KEY,
  supporter_id INTEGER REFERENCES ti_supporters(id),
  donor_name VARCHAR(255),
  donor_email VARCHAR(255),
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(5) DEFAULT 'PHP',
  donation_type VARCHAR(30) DEFAULT 'one_time',
  purpose VARCHAR(100),
  status VARCHAR(20) DEFAULT 'received',
  donated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_schools_status ON ti_schools(program_status);
CREATE INDEX IF NOT EXISTS idx_ti_bpo_placements_user ON ti_bpo_placements(user_id);
CREATE INDEX IF NOT EXISTS idx_ti_events_date ON ti_events(event_date);
CREATE INDEX IF NOT EXISTS idx_ti_supporters_email ON ti_supporters(email);
