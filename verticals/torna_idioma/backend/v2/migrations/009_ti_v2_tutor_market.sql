-- Torna Idioma Learner Platform v2 — Step 10: Human Tutor Marketplace
-- Tutor profiles, availability, bookings, reviews, + WebRTC session rooms.
-- Isolation: ti_v2_* prefix.

CREATE TABLE IF NOT EXISTS ti_v2_tutors (
  id SERIAL PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES ti_users(id) ON DELETE SET NULL,
  display_name VARCHAR(120) NOT NULL,
  photo_url TEXT,
  bio TEXT,
  headline VARCHAR(200),
  accent VARCHAR(60) DEFAULT 'latin_american',  -- latin_american | filipino_spanish | spain | other
  native_language VARCHAR(40),
  languages_spoken JSONB DEFAULT '[]'::jsonb,
  specialties JSONB DEFAULT '[]'::jsonb,        -- ["bpo", "beginner", "business", "conversation"]
  certifications JSONB DEFAULT '[]'::jsonb,
  years_experience INTEGER DEFAULT 0,
  hourly_rate_usd NUMERIC(7,2) NOT NULL DEFAULT 25.00,
  stripe_connect_account_id VARCHAR(100),       -- acct_xxx from Stripe Connect
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending | approved | suspended | rejected
  timezone VARCHAR(60) DEFAULT 'Asia/Manila',
  rating_avg NUMERIC(3,2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  total_sessions INTEGER DEFAULT 0,
  total_students INTEGER DEFAULT 0,
  approved_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES ti_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_tutors_status ON ti_v2_tutors(status);
CREATE INDEX IF NOT EXISTS idx_ti_v2_tutors_rating ON ti_v2_tutors(rating_avg DESC);

-- Weekly availability (recurring slots in the tutor's timezone)
CREATE TABLE IF NOT EXISTS ti_v2_tutor_availability (
  id SERIAL PRIMARY KEY,
  tutor_id INTEGER NOT NULL REFERENCES ti_v2_tutors(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL,                -- 0=Sunday, 1=Monday, ..., 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_tutor_avail_tutor ON ti_v2_tutor_availability(tutor_id, day_of_week);

-- Bookings: learner reserves a slot with a tutor
CREATE TABLE IF NOT EXISTS ti_v2_tutor_bookings (
  id SERIAL PRIMARY KEY,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  tutor_id INTEGER NOT NULL REFERENCES ti_v2_tutors(id) ON DELETE RESTRICT,
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  price_usd NUMERIC(7,2) NOT NULL,
  platform_fee_usd NUMERIC(7,2) NOT NULL,        -- 20% of price
  tutor_payout_usd NUMERIC(7,2) NOT NULL,        -- 80% of price
  status VARCHAR(30) NOT NULL DEFAULT 'pending_payment',
    -- pending_payment | confirmed | in_progress | completed | cancelled | no_show
  stripe_payment_intent_id VARCHAR(120),
  stripe_charge_id VARCHAR(120),
  room_id VARCHAR(80) NOT NULL,                  -- Jitsi/WebRTC room identifier
  notes TEXT,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  actual_duration_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_bookings_learner ON ti_v2_tutor_bookings(learner_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_ti_v2_bookings_tutor ON ti_v2_tutor_bookings(tutor_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_ti_v2_bookings_status ON ti_v2_tutor_bookings(status);
CREATE INDEX IF NOT EXISTS idx_ti_v2_bookings_room ON ti_v2_tutor_bookings(room_id);

-- Reviews: post-session rating from learner
CREATE TABLE IF NOT EXISTS ti_v2_tutor_reviews (
  id SERIAL PRIMARY KEY,
  booking_id INTEGER NOT NULL UNIQUE REFERENCES ti_v2_tutor_bookings(id) ON DELETE CASCADE,
  tutor_id INTEGER NOT NULL REFERENCES ti_v2_tutors(id) ON DELETE CASCADE,
  learner_id INTEGER NOT NULL REFERENCES ti_v2_learners(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_v2_reviews_tutor ON ti_v2_tutor_reviews(tutor_id);
