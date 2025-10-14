-- Safe migration to add referral fields to clients table
-- This script is idempotent and can be run multiple times safely

-- Step 1: Check and add referred_by column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='clients' AND column_name='referred_by'
    ) THEN
        ALTER TABLE clients ADD COLUMN referred_by INTEGER REFERENCES clients(id);
        RAISE NOTICE 'Added referred_by column';
    ELSE
        RAISE NOTICE 'referred_by column already exists';
    END IF;
END $$;

-- Step 2: Check and add referral_code column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='clients' AND column_name='referral_code'
    ) THEN
        ALTER TABLE clients ADD COLUMN referral_code VARCHAR(10) UNIQUE;
        RAISE NOTICE 'Added referral_code column';
    ELSE
        RAISE NOTICE 'referral_code column already exists';
    END IF;
END $$;

-- Step 3: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_clients_referral_code ON clients(referral_code);
CREATE INDEX IF NOT EXISTS idx_clients_referred_by ON clients(referred_by);

-- Step 4: Generate referral codes for existing clients without one
DO $$
DECLARE
    client_record RECORD;
    new_code VARCHAR(10);
    code_exists BOOLEAN;
    counter INTEGER := 0;
BEGIN
    FOR client_record IN
        SELECT id FROM clients WHERE referral_code IS NULL
    LOOP
        -- Keep trying until we get a unique code
        LOOP
            -- Generate random 8-character code
            new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || client_record.id::TEXT || NOW()::TEXT) FROM 1 FOR 8));

            -- Check if code already exists
            SELECT EXISTS(SELECT 1 FROM clients WHERE referral_code = new_code) INTO code_exists;

            -- If unique, use it
            IF NOT code_exists THEN
                UPDATE clients SET referral_code = new_code WHERE id = client_record.id;
                counter := counter + 1;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;

    RAISE NOTICE 'Generated % referral codes', counter;
END $$;

-- Step 5: Verification - show current state
SELECT
    COUNT(*) as total_clients,
    COUNT(referral_code) as clients_with_codes,
    COUNT(referred_by) as clients_with_referrer
FROM clients;

-- Step 6: Show sample data
SELECT
    id,
    business_name,
    referral_code,
    referred_by,
    (SELECT business_name FROM clients WHERE id = c.referred_by) as referrer_name
FROM clients c
ORDER BY id
LIMIT 10;
