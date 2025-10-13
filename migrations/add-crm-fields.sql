-- Migration: Add GoHighLevel CRM Integration Fields
-- Safe to run multiple times (uses IF NOT EXISTS)

-- Add ghl_api_key column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'ghl_api_key'
    ) THEN
        ALTER TABLE clients ADD COLUMN ghl_api_key VARCHAR(255);
        COMMENT ON COLUMN clients.ghl_api_key IS 'GoHighLevel Private Integration Token (PIT)';
        RAISE NOTICE '✅ Added ghl_api_key column';
    ELSE
        RAISE NOTICE 'ℹ️ Column ghl_api_key already exists';
    END IF;
END $$;

-- Add ghl_location_id column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'clients' AND column_name = 'ghl_location_id'
    ) THEN
        ALTER TABLE clients ADD COLUMN ghl_location_id VARCHAR(20);
        COMMENT ON COLUMN clients.ghl_location_id IS 'GoHighLevel Location ID (20 characters)';
        RAISE NOTICE '✅ Added ghl_location_id column';
    ELSE
        RAISE NOTICE 'ℹ️ Column ghl_location_id already exists';
    END IF;
END $$;

-- Verify columns were added
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'clients'
AND column_name IN ('ghl_api_key', 'ghl_location_id')
ORDER BY column_name;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '🎉 Migration completed successfully!';
    RAISE NOTICE 'You can now enable CRM fields in the Client model';
END $$;
