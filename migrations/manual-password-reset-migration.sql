-- =====================================================
-- Manual Database Migration: Add Password Reset Fields
-- File: migrations/manual-password-reset-migration.sql
-- Created: 2025-10-03
-- =====================================================

-- This is a standalone SQL file you can run directly in your PostgreSQL database
-- if you cannot run `npm run migrate`

-- =====================================================
-- MIGRATION: Add password reset fields to users table
-- =====================================================

-- Check if columns already exist before adding them
DO $$
BEGIN
    -- Add password_reset_token column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'password_reset_token'
    ) THEN
        ALTER TABLE users ADD COLUMN password_reset_token VARCHAR(255);
        RAISE NOTICE 'Added password_reset_token column';
    ELSE
        RAISE NOTICE 'Column password_reset_token already exists';
    END IF;

    -- Add password_reset_expires column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'users'
        AND column_name = 'password_reset_expires'
    ) THEN
        ALTER TABLE users ADD COLUMN password_reset_expires TIMESTAMP;
        RAISE NOTICE 'Added password_reset_expires column';
    ELSE
        RAISE NOTICE 'Column password_reset_expires already exists';
    END IF;
END $$;

-- =====================================================
-- OPTIONAL: Add indexes for better performance
-- =====================================================

-- Create index on password_reset_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_password_reset_token
ON users(password_reset_token);

-- Create index on password_reset_expires for faster expiration checks
CREATE INDEX IF NOT EXISTS idx_password_reset_expires
ON users(password_reset_expires);

-- =====================================================
-- VERIFICATION: Check if migration was successful
-- =====================================================

-- Display the users table structure
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users'
AND column_name IN ('password_reset_token', 'password_reset_expires')
ORDER BY ordinal_position;

-- =====================================================
-- SUCCESS MESSAGE
-- =====================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Password reset migration completed successfully!';
    RAISE NOTICE '📊 Columns added: password_reset_token, password_reset_expires';
    RAISE NOTICE '🔍 Indexes created: idx_password_reset_token, idx_password_reset_expires';
END $$;
