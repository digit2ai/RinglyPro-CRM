# ⚠️ Setup Required - Install Node.js First

## Prerequisites Not Found

To run the Store Health AI tests, you need to install:
- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **PostgreSQL** (v12 or higher)

---

## Step 1: Install Node.js

### Option A: Using Homebrew (Recommended for macOS)

```bash
# Install Homebrew if you don't have it
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js
brew install node

# Verify installation
node --version  # Should show v16.x or higher
npm --version   # Should show 8.x or higher
```

### Option B: Download from nodejs.org

1. Go to https://nodejs.org/
2. Download the LTS version (recommended)
3. Run the installer
4. Verify installation:
   ```bash
   node --version
   npm --version
   ```

### Option C: Using nvm (Node Version Manager)

```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# Close and reopen your terminal, then:
nvm install 18
nvm use 18

# Verify
node --version
npm --version
```

---

## Step 2: Install PostgreSQL

### Option A: Using Homebrew

```bash
# Install PostgreSQL
brew install postgresql@14

# Start PostgreSQL service
brew services start postgresql@14

# Verify it's running
psql --version
pg_isready
```

### Option B: Download from postgresql.org

1. Go to https://www.postgresql.org/download/
2. Download the installer for macOS
3. Run the installer
4. Start PostgreSQL from the application or services

### Option C: Using Postgres.app (Easiest for macOS)

1. Download from https://postgresapp.com/
2. Move to Applications folder
3. Double-click to start
4. Add to PATH:
   ```bash
   echo 'export PATH="/Applications/Postgres.app/Contents/Versions/latest/bin:$PATH"' >> ~/.zshrc
   source ~/.zshrc
   ```

---

## Step 3: Create Database

```bash
# Create the database
createdb store_health_ai

# Verify it was created
psql -l | grep store_health_ai
```

---

## Step 4: Install Dependencies

```bash
cd /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/store-health-ai

# Install npm packages
npm install
```

---

## Step 5: Configure Environment

The `.env` file has already been created from the template. You may need to update it if you have custom PostgreSQL settings:

```bash
# Edit .env if needed
nano .env
```

Default settings (should work if you followed the steps above):
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=store_health_ai
DB_USER=postgres  # or your macOS username
DB_PASSWORD=      # leave empty if no password
```

---

## Step 6: Run Database Setup

```bash
# Run migrations and seed data
npm run db:setup
```

This will:
- ✅ Create all 20 tables
- ✅ Load test data (3 stores, 5 KPIs, 30 days historical data)

---

## Step 7: Run Tests

```bash
# Run the complete test suite
npm test
```

---

## Quick Install (All at Once)

If you have Homebrew installed:

```bash
# Install everything
brew install node postgresql@14
brew services start postgresql@14

# Create database
createdb store_health_ai

# Setup project
cd /Users/manuelstagg/Documents/GitHub/RinglyPro-CRM/store-health-ai
npm install
npm run db:setup

# Run tests
npm test
```

---

## Troubleshooting

### "command not found: npm"
- Node.js is not installed or not in PATH
- Solution: Install Node.js (see Step 1)

### "command not found: createdb"
- PostgreSQL is not installed or not in PATH
- Solution: Install PostgreSQL (see Step 2)

### "database does not exist"
- Database hasn't been created
- Solution: Run `createdb store_health_ai`

### "peer authentication failed"
- PostgreSQL authentication issue
- Solution: Update `.env` with correct username/password or configure PostgreSQL

### "ECONNREFUSED" or "Connection refused"
- PostgreSQL is not running
- Solution: Start PostgreSQL
  - Homebrew: `brew services start postgresql@14`
  - Postgres.app: Open the app
  - Check: `pg_isready`

---

## Need Help?

Once you've installed the prerequisites, run:

```bash
npm test
```

The test suite will validate that everything is working correctly!

---

## What You're Installing

**Node.js & npm**: JavaScript runtime and package manager
- Used to run the Store Health AI services
- Required for all JavaScript-based applications

**PostgreSQL**: Relational database
- Stores all Store Health AI data (KPIs, alerts, tasks, etc.)
- Industry-standard for production applications

**Total Install Time**: ~10-15 minutes
**Disk Space Required**: ~500 MB

---

After installation, return to [TEST_NOW.md](./TEST_NOW.md) to continue testing!
