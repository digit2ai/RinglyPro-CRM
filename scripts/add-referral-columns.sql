-- Add referral system columns to clients table
-- Run this in production database

-- Step 1: Add referral_code column
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS referral_code VARCHAR(10) UNIQUE;

-- Step 2: Add referred_by column (foreign key to clients.id)
ALTER TABLE clients
ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES clients(id);

-- Step 3: Create index for performance
CREATE INDEX IF NOT EXISTS idx_clients_referral_code ON clients(referral_code);
CREATE INDEX IF NOT EXISTS idx_clients_referred_by ON clients(referred_by);

-- Step 4: Generate unique referral codes for existing clients
-- This function generates random 8-character codes
DO $$
DECLARE
    client_record RECORD;
    new_code VARCHAR(10);
    code_exists BOOLEAN;
BEGIN
    FOR client_record IN SELECT id FROM clients WHERE referral_code IS NULL
    LOOP
        -- Keep trying until we get a unique code
        LOOP
            -- Generate random 8-character code (uppercase letters and numbers, excluding O,0,I,1,L)
            new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || client_record.id::TEXT) FROM 1 FOR 8));

            -- Check if code already exists
            SELECT EXISTS(SELECT 1 FROM clients WHERE referral_code = new_code) INTO code_exists;

            -- If unique, use it
            IF NOT code_exists THEN
                UPDATE clients SET referral_code = new_code WHERE id = client_record.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- Step 5: Verify the migration
SELECT
    COUNT(*) as total_clients,
    COUNT(referral_code) as clients_with_codes,
    COUNT(referred_by) as clients_referred
FROM clients;

-- Step 6: Show sample referral links
SELECT
    id,
    business_name,
    owner_email,
    referral_code,
    CONCAT('https://aiagent.ringlypro.com/signup?ref=', referral_code) as referral_link
FROM clients
WHERE referral_code IS NOT NULL
ORDER BY id
LIMIT 10;
