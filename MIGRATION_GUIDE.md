# Database Migration Guide

## How to Run the Password Reset Migration

Since Node.js is not currently installed or available in your PATH, you have several options:

---

## Option 1: Install Node.js First (Recommended)

### On macOS:

```bash
# Using Homebrew (recommended)
brew install node

# Or download installer from nodejs.org
open https://nodejs.org/
```

### After Installing Node.js:

```bash
# Install dependencies
npm install

# Run the migration
npm run migrate
```

---

## Option 2: Run Manual SQL Migration

If you prefer not to install Node.js right now, you can run the SQL migration manually.

### Using psql Command Line:

```bash
# Connect to your database
psql -U your_username -d ringlypro

# Run the migration file
\i migrations/manual-password-reset-migration.sql

# Or in one command:
psql -U your_username -d ringlypro -f migrations/manual-password-reset-migration.sql
```

### Using a GUI Tool (pgAdmin, DBeaver, etc.):

1. Open your database tool
2. Connect to your RinglyPro database
3. Open the file: `migrations/manual-password-reset-migration.sql`
4. Execute the SQL script

### Using Direct SQL:

Connect to your database and run:

```sql
-- Add password reset columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMP;

-- Add indexes (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_password_reset_token ON users(password_reset_token);
CREATE INDEX IF NOT EXISTS idx_password_reset_expires ON users(password_reset_expires);
```

---

## Option 3: Using Docker (if PostgreSQL is in Docker)

```bash
# Copy migration file into container
docker cp migrations/manual-password-reset-migration.sql postgres_container:/tmp/

# Execute migration
docker exec -it postgres_container psql -U postgres -d ringlypro -f /tmp/manual-password-reset-migration.sql
```

---

## Option 4: Find Existing Node.js Installation

Sometimes Node.js is installed but not in the PATH. Check these locations:

```bash
# Check common locations
/usr/local/bin/node --version
~/.nvm/versions/node/*/bin/node --version

# If found, use full path:
/usr/local/bin/node node_modules/.bin/sequelize-cli db:migrate
```

---

## Verify Migration Success

After running the migration, verify it worked:

### Using psql:

```sql
-- Check if columns exist
\d users

-- Or use this query:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('password_reset_token', 'password_reset_expires');
```

Expected output:
```
       column_name        |       data_type
--------------------------+------------------------
 password_reset_token     | character varying
 password_reset_expires   | timestamp without time zone
```

### Check Indexes:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users'
  AND indexname LIKE '%password_reset%';
```

---

## Troubleshooting

### "Table 'users' does not exist"

The users table hasn't been created yet. You need to:

1. Run initial database setup: `npm run setup-db`
2. Or create tables manually from your Sequelize models

### "Column already exists"

The migration has already been run. You're good to go!

### "Permission denied"

You don't have permission to alter the table. Connect as a database superuser or user with ALTER TABLE privileges.

### "Cannot connect to database"

Check your database connection:
- Is PostgreSQL running?
- Is the connection string correct?
- Check `DATABASE_URL` in your `.env` file

---

## What This Migration Does

The migration adds two new columns to the `users` table:

1. **`password_reset_token`** (VARCHAR 255)
   - Stores the secure random token for password reset
   - Used to verify password reset requests
   - Single-use token

2. **`password_reset_expires`** (TIMESTAMP)
   - Stores when the reset token expires
   - Tokens are valid for 1 hour
   - Prevents old tokens from being used

### Indexes Created:

- **`idx_password_reset_token`** - Speeds up token lookups
- **`idx_password_reset_expires`** - Speeds up expiration checks

---

## Alternative: Use Sequelize Sync

If you're in development and okay with syncing models (not recommended for production):

```javascript
// In your code or a script
const { syncDatabase } = require('./src/models');

syncDatabase({ alter: true }).then(() => {
    console.log('Database synced');
});
```

**Warning:** This can be dangerous in production as it may alter/drop columns.

---

## After Migration

Once the migration is complete, you can:

1. ✅ Test password reset flow
2. ✅ Start the server: `npm start`
3. ✅ Visit: `http://localhost:3000/forgot-password`
4. ✅ Request password reset
5. ✅ Check server console for reset link (dev mode)

---

## Need Help?

If you're stuck:

1. **Check database logs** for error messages
2. **Verify PostgreSQL is running**: `psql --version`
3. **Check connection**: `psql -U user -d ringlypro -c "SELECT 1"`
4. **Review .env file** for correct DATABASE_URL

---

## Quick Start (TL;DR)

**If you have psql:**
```bash
psql -d ringlypro -f migrations/manual-password-reset-migration.sql
```

**If you need to install Node.js first:**
```bash
brew install node
npm install
npm run migrate
```

**Verify it worked:**
```sql
\d users
```

You should see `password_reset_token` and `password_reset_expires` in the list!

---

**Status:** Ready to run!

**Files:**
- Migration: `migrations/manual-password-reset-migration.sql`
- JS Migration: `migrations/add-password-reset-fields.js`
