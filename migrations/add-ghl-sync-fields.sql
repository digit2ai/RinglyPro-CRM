-- Migration: Add GoHighLevel sync fields to appointments and contacts tables
-- Created: 2025-01-25
-- Purpose: Enable bidirectional sync between GHL and RinglyPro

-- Add GHL sync fields to appointments table
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS ghl_appointment_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_contact_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_calendar_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMP DEFAULT NULL;

-- Add indexes for GHL appointment fields
CREATE INDEX IF NOT EXISTS idx_appointments_ghl_appointment_id ON appointments(ghl_appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointments_ghl_contact_id ON appointments(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_appointments_ghl_synced_at ON appointments(ghl_synced_at);

-- Update source enum to include ghl_sync
ALTER TABLE appointments
DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE appointments
ADD CONSTRAINT appointments_source_check
CHECK (source IN ('voice_booking', 'online', 'manual', 'walk-in', 'ghl_sync'));

-- Add GHL sync fields to contacts table
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS ghl_contact_id VARCHAR(255) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS ghl_synced_at TIMESTAMP DEFAULT NULL;

-- Add indexes for GHL contact fields
CREATE INDEX IF NOT EXISTS idx_contacts_ghl_contact_id ON contacts(ghl_contact_id);
CREATE INDEX IF NOT EXISTS idx_contacts_ghl_synced_at ON contacts(ghl_synced_at);

-- Add unique constraint to prevent duplicate GHL appointments
CREATE UNIQUE INDEX IF NOT EXISTS idx_appointments_unique_ghl_id
ON appointments(client_id, ghl_appointment_id)
WHERE ghl_appointment_id IS NOT NULL;

-- Add unique constraint to prevent duplicate GHL contacts
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_ghl_id
ON contacts(client_id, ghl_contact_id)
WHERE ghl_contact_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN appointments.ghl_appointment_id IS 'GoHighLevel appointment event ID for synced appointments';
COMMENT ON COLUMN appointments.ghl_contact_id IS 'GoHighLevel contact ID associated with this appointment';
COMMENT ON COLUMN appointments.ghl_calendar_id IS 'GoHighLevel calendar ID where appointment was created';
COMMENT ON COLUMN appointments.ghl_synced_at IS 'Last time this appointment was synced from GHL';

COMMENT ON COLUMN contacts.ghl_contact_id IS 'GoHighLevel contact ID for synced contacts';
COMMENT ON COLUMN contacts.ghl_synced_at IS 'Last time this contact was synced from GHL';

-- Verification queries (run these to confirm migration)
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'appointments' AND column_name LIKE 'ghl_%';
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'contacts' AND column_name LIKE 'ghl_%';
