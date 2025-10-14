# Admin Console - Referral Fields Setup

## Issue
The "Referred By" field is not showing in the admin console because the database columns don't exist in production yet.

## Database Columns Required
The following columns need to be added to the `clients` table:
1. `referred_by` - INTEGER (foreign key to clients.id)
2. `referral_code` - VARCHAR(10) UNIQUE

## How to Fix

### Option 1: Run Migration via Render Dashboard (Recommended)

1. Go to your Render Dashboard: https://dashboard.render.com
2. Click on your PostgreSQL database
3. Click on "Connect" → "PSQL Command"
4. Copy the connection string
5. Run the migration script:

```bash
# Connect to your database
psql <connection-string-from-render>

# Then run this SQL:
\i scripts/migrate-referral-fields.sql

# Or copy-paste the SQL from the file
```

### Option 2: Run via Local Connection

If you have the database connection string:

```bash
# From project root
psql <your-database-url> -f scripts/migrate-referral-fields.sql
```

### Option 3: Manual SQL Execution

Copy and run this SQL in your database:

```sql
-- Add referred_by column
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES clients(id);

-- Add referral_code column
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referral_code VARCHAR(10) UNIQUE;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_clients_referral_code ON clients(referral_code);
CREATE INDEX IF NOT EXISTS idx_clients_referred_by ON clients(referred_by);

-- Generate referral codes for existing clients
DO $$
DECLARE
    client_record RECORD;
    new_code VARCHAR(10);
    code_exists BOOLEAN;
BEGIN
    FOR client_record IN SELECT id FROM clients WHERE referral_code IS NULL
    LOOP
        LOOP
            new_code := UPPER(SUBSTRING(MD5(RANDOM()::TEXT || client_record.id::TEXT) FROM 1 FOR 8));
            SELECT EXISTS(SELECT 1 FROM clients WHERE referral_code = new_code) INTO code_exists;
            IF NOT code_exists THEN
                UPDATE clients SET referral_code = new_code WHERE id = client_record.id;
                EXIT;
            END IF;
        END LOOP;
    END LOOP;
END $$;
```

## What the Migration Does

1. **Adds `referred_by` column**: Stores the ID of the client who referred this client
2. **Adds `referral_code` column**: Generates unique 8-character code for each client
3. **Creates indexes**: For performance on referral lookups
4. **Generates codes**: Creates referral codes for all existing clients

## After Migration

Once the migration is complete:

1. Restart your Render service (optional, but recommended)
2. Visit https://aiagent.ringlypro.com/admin
3. Click on any client
4. You should now see:
   - **Twilio Number SID**: Shows the Twilio number assigned
   - **Referred By**: Shows which client referred this one (or "Direct signup")

## How Referrals Work

### Setting a Referral
When a new client signs up with a referral code:

```sql
-- Example: Client 5 was referred by Client 2
UPDATE clients SET referred_by = 2 WHERE id = 5;
```

### Viewing Referrals in Admin
The admin console will automatically show:
- Client 5's profile will show "Referred By: [Client 2's Business Name]"
- If no referrer: Shows "Direct signup"

### Generating Referral Links
Each client gets a unique referral code. Their referral link is:
```
https://aiagent.ringlypro.com/signup?ref=[CLIENT_REFERRAL_CODE]
```

## Verification

After running the migration, verify with:

```sql
-- Check columns exist
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'clients'
AND column_name IN ('referred_by', 'referral_code');

-- Check data
SELECT
    id,
    business_name,
    referral_code,
    referred_by,
    (SELECT business_name FROM clients WHERE id = c.referred_by) as referrer_name
FROM clients c
LIMIT 10;
```

Expected output:
- All clients should have a `referral_code`
- `referred_by` will be NULL for direct signups
- `referrer_name` shows the business name of the referrer (if any)

## Troubleshooting

### "Column already exists" error
Safe to ignore - the migration is idempotent and won't add columns twice.

### "Referred By" still shows "Direct signup" for everyone
This is expected! The migration doesn't automatically assign referrers. You need to:
1. Have clients sign up with referral codes, OR
2. Manually set referrers in the database

### Setting Referrers Manually
```sql
-- Example: Mark that Client 5 was referred by Client 2
UPDATE clients
SET referred_by = 2
WHERE id = 5;
```

## Files Modified

1. **src/routes/admin.js** - Backend query with JOIN for referrer name
2. **views/admin.ejs** - Frontend display of referral fields
3. **scripts/migrate-referral-fields.sql** - Migration script (NEW)

## Next Steps

1. Run the migration on production database
2. Test by viewing a client in admin console
3. (Optional) Set up referral tracking in signup flow
4. (Optional) Create admin UI to manually set referrers
