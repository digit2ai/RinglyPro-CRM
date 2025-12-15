-- =====================================================
-- Add client_id column to users table
-- File: migrations/add-client-id-to-users.sql
-- Purpose: Link users to clients for multi-tenant settings
-- =====================================================

-- Add client_id column if it doesn't exist
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id);

-- Link manuelstagg@gmail.com to client 30 (Manuel's Photos)
UPDATE users SET client_id = 30 WHERE email = 'manuelstagg@gmail.com' AND client_id IS NULL;

SELECT 'client_id column added to users table!' as message;
