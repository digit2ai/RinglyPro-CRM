-- ========================================
-- RinglyPro GHL Sync Setup Script
-- ========================================
-- This script sets up GoHighLevel bidirectional sync
-- Run this in PgAdmin on the ringlypro-crm-database
-- ========================================

-- STEP 1: Add GHL sync fields to appointments table
-- ========================================
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS ghl_appointment_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_contact_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_calendar_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMP DEFAULT NULL;

-- Add indexes for GHL appointment fields
CREATE INDEX IF NOT EXISTS idx_appointments_ghl_appointment_id ON appointments(ghl_appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointments_ghl_contact_id ON appointments(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_ghl_synced_at ON appointments(ghl_synced_at);

-- Add 'ghl_sync' to the appointments.source ENUM type
-- First check if the value already exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'ghl_sync'
        AND enumtypid = (
            SELECT oid FROM pg_type WHERE typname = 'enum_appointments_source'
        )
    ) THEN
        ALTER TYPE enum_appointments_source ADD VALUE 'ghl_sync';
    END IF;
END$$;

-- Add unique constraint to prevent duplicate GHL appointments
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_ghl_id
ON appointments(client_id, ghl_appointment_id)
WHERE ghl_appointment_id IS NOT NULL;

-- STEP 2: Add GHL sync fields to contacts table
-- ========================================
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS ghl_contact_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMP DEFAULT NULL;

-- Add indexes for GHL contact fields
CREATE INDEX IF NOT EXISTS idx_contacts_ghl_contact_id ON contacts(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_ghl_synced_at ON contacts(ghl_synced_at);

-- Add unique constraint to prevent duplicate GHL contacts
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_ghl_id
ON contacts(client_id, ghl_contact_id)
WHERE ghl_contact_id IS NOT NULL;

-- STEP 3: Verify ghl_integrations table exists
-- ========================================
-- This table should already exist from a previous migration
-- If it doesn't, it will be created here

CREATE TABLE IF NOT EXISTS ghl_integrations (
  id SERIAL PRIMARY KEY,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  ghl_location_id VARCHAR(50) NOT NULL,
  ghl_company_id VARCHAR(50),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_type VARCHAR(20) DEFAULT 'Bearer',
  scope TEXT,
  expires_at TIMESTAMP,
  user_type VARCHAR(20),
  location_name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_ghl_integrations_client_id ON ghl_integrations(client_id);
CREATE INDEX IF NOT EXISTS idx_ghl_integrations_user_id ON ghl_integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_integrations_location_id ON ghl_integrations(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_integrations_is_active ON ghl_integrations(is_active);

-- ========================================
-- STEP 4: Find your client_id
-- ========================================
-- Run this query to find your client_id:
SELECT id, email, business_name, created_at
FROM clients
ORDER BY created_at DESC;

-- Copy your client_id from the result above

-- ========================================
-- STEP 5: Insert your GHL Location mapping
-- ========================================
-- IMPORTANT: You need to get your GHL Location ID first!
--
-- To find your GHL Location ID:
-- 1. Log into GoHighLevel
-- 2. Go to Settings > Business Profile
-- 3. Look for "Location ID" in the URL or on the page
--    (It usually looks like: ve9EPM4...........)
--
-- Then replace the placeholders below and run:

/*
INSERT INTO ghl_integrations (
  client_id,
  ghl_location_id,
  access_token,
  token_type,
  is_active,
  location_name,
  created_at,
  updated_at
) VALUES (
  YOUR_CLIENT_ID_HERE,                          -- Replace with your client_id from STEP 4
  'YOUR_GHL_LOCATION_ID_HERE',                  -- Replace with your GHL Location ID
  'pit-6ca3a228-5435-45d0-8cd4-2e03639f9d7e',  -- Your Private Integration API key
  'Bearer',
  true,
  'Your Business Name',                         -- Replace with your business name
  NOW(),
  NOW()
);
*/

-- ========================================
-- STEP 6: Verify the setup
-- ========================================
-- Run these queries to confirm everything is set up:

-- Check appointments table has GHL columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'appointments' AND column_name LIKE 'ghl_%';

-- Check contacts table has GHL columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'contacts' AND column_name LIKE 'ghl_%';

-- Verify 'ghl_sync' was added to the enum
SELECT enumlabel
FROM pg_enum
WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'enum_appointments_source')
ORDER BY enumlabel;

-- Check your GHL integration mapping
SELECT
  gi.id,
  gi.client_id,
  c.email,
  c.business_name,
  gi.ghl_location_id,
  gi.location_name,
  gi.is_active,
  gi.created_at
FROM ghl_integrations gi
JOIN clients c ON gi.client_id = c.id
WHERE gi.is_active = true;

-- ========================================
-- NOTES:
-- ========================================
-- After completing this setup:
-- 1. The webhook endpoint is: https://aiagent.ringlypro.com/api/webhooks/gohighlevel
-- 2. Test by booking an appointment in GHL
-- 3. Check the GHL workflow event log for success/errors
-- 4. Verify appointment appears in RinglyPro Dashboard with purple "GHL" badge
