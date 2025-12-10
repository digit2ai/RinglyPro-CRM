-- =====================================================
-- Add Vagaro ID Fields Migration
-- File: migrations/add-vagaro-id-fields.sql
-- Purpose: Add Vagaro integration fields to contacts and appointments tables
-- =====================================================

-- Add vagaro_id to contacts table
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS vagaro_id VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_contacts_vagaro_id ON contacts(vagaro_id);

-- Add vagaro_id to appointments table
ALTER TABLE appointments
ADD COLUMN IF NOT EXISTS vagaro_id VARCHAR(255) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_appointments_vagaro_id ON appointments(vagaro_id);

-- Add comments for documentation
COMMENT ON COLUMN contacts.vagaro_id IS 'Unique identifier from Vagaro customer record';
COMMENT ON COLUMN appointments.vagaro_id IS 'Unique identifier from Vagaro appointment record';

-- Display success message
SELECT 'Vagaro integration fields added successfully!' as message;
