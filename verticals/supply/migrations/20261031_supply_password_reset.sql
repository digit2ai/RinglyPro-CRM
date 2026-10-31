-- Forgot password: a 6-digit code sent by email. Only hashes are stored.
ALTER TABLE sup_users ADD COLUMN IF NOT EXISTS reset_code_hash VARCHAR(128);
ALTER TABLE sup_users ADD COLUMN IF NOT EXISTS reset_expires TIMESTAMPTZ;
ALTER TABLE sup_users ADD COLUMN IF NOT EXISTS reset_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sup_users ADD COLUMN IF NOT EXISTS reset_sent_at TIMESTAMPTZ;
ALTER TABLE sup_users ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ;
