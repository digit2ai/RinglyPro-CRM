CREATE TABLE IF NOT EXISTS ti_tutor_sessions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES ti_users(id),
  message_count INTEGER DEFAULT 0,
  level VARCHAR(10) DEFAULT 'beginner',
  last_active TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id)
);
CREATE INDEX IF NOT EXISTS idx_ti_tutor_sessions_user ON ti_tutor_sessions(user_id);
