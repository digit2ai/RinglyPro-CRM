-- Add IVR (Interactive Voice Response) configuration to clients table
-- Run this in production database

-- Step 1: Add ivr_enabled column
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS ivr_enabled BOOLEAN DEFAULT FALSE;

-- Step 2: Add ivr_options column (JSON array for up to 3 department transfer options)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS ivr_options JSONB DEFAULT NULL;

-- Step 3: Create index for performance
CREATE INDEX IF NOT EXISTS idx_clients_ivr_enabled ON clients(ivr_enabled);

-- Step 4: Add comments for documentation
COMMENT ON COLUMN clients.ivr_enabled IS 'Enable IVR (Interactive Voice Response) call transfer options';
COMMENT ON COLUMN clients.ivr_options IS 'IVR department transfer options: [{name: "Sales", phone: "+1234567890", enabled: true}, ...]';

-- Step 5: Verify the migration
SELECT
    COUNT(*) as total_clients,
    COUNT(CASE WHEN ivr_enabled = TRUE THEN 1 END) as clients_with_ivr_enabled,
    COUNT(ivr_options) as clients_with_ivr_configured
FROM clients;

-- Step 6: Show current IVR configuration
SELECT
    id,
    business_name,
    ivr_enabled,
    ivr_options
FROM clients
ORDER BY id
LIMIT 10;
