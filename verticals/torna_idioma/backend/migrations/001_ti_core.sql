-- Torna Idioma Core Schema
-- Users, settings, and base tables

CREATE TABLE IF NOT EXISTS ti_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  tenant_id VARCHAR(50) DEFAULT 'torna_idioma',
  role VARCHAR(30) NOT NULL DEFAULT 'student',
  full_name VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  organization VARCHAR(255),
  language_pref VARCHAR(5) DEFAULT 'en',
  avatar_url TEXT,
  status VARCHAR(20) DEFAULT 'active',
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ti_users_email ON ti_users(email);
CREATE INDEX IF NOT EXISTS idx_ti_users_role ON ti_users(role);
CREATE INDEX IF NOT EXISTS idx_ti_users_tenant ON ti_users(tenant_id);
