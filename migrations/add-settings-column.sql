-- =====================================================
-- Add settings JSON column to clients table
-- File: migrations/add-settings-column.sql
-- Purpose: Store JSON configuration for integrations (Vagaro, WhatsApp, Zelle, etc.)
-- =====================================================

-- Add settings JSONB column if it doesn't exist
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}';

COMMENT ON COLUMN clients.settings IS 'JSON configuration for integrations: vagaro, whatsapp, zelle, etc.';

-- Create index for JSON queries
CREATE INDEX IF NOT EXISTS idx_clients_settings ON clients USING GIN (settings);

SELECT 'Settings column added to clients table!' as message;
