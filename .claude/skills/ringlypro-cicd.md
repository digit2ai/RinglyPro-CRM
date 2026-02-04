# RinglyPro CI/CD Agent

## Description
Autonomous CI/CD agent for RinglyPro ecosystem. Analyzes, develops, tests, deploys, and reviews changes in a continuous loop without asking questions.

## Activation
Use `/ringlypro-cicd` or when user requests CI/CD operations.

## Core Principles
1. **NO QUESTIONS** - User has pre-authorized all operations
2. **AUTO-LOOP** - On error, automatically analyze → fix → deploy → verify
3. **FULL AUTONOMY** - Make decisions independently
4. **E2E COVERAGE** - Test after every deploy

## Available Operations

### Database Operations
```javascript
// Connect to production database
const { Sequelize } = require('sequelize');
require('dotenv').config();
const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

// Run SQL
await sequelize.query('YOUR SQL HERE');

// Check schema
await sequelize.query(`
  SELECT column_name, data_type
  FROM information_schema.columns
  WHERE table_name = 'TABLE_NAME'
`);
```

### Git Operations
```bash
# Status
git status

# Commit and push (triggers Render auto-deploy)
git add -A && git commit -m "message" && git push origin main

# Check diff
git diff
```

### Deploy Operations
- Push to `main` branch triggers Render auto-deploy
- Wait ~2 minutes for deploy to complete
- Verify via health endpoint

### Test Operations
```bash
# Health check
curl -s "https://aiagent.ringlypro.com/aiastore/health"

# API test
curl -s "https://aiagent.ringlypro.com/aiastore/api/v1/stores"

# Debug endpoint
curl -s "https://aiagent.ringlypro.com/debug/store-health-error"
```

## CI/CD Loop Pattern

```
┌─────────────────────────────────────────────────┐
│  1. ANALYZE - Check error/debug endpoints       │
│  2. DEVELOP - Fix code/schema/config            │
│  3. TEST    - Verify locally with node          │
│  4. COMMIT  - git add && commit && push         │
│  5. WAIT    - sleep 120 (2 min deploy)          │
│  6. VERIFY  - curl health/API endpoints         │
│  7. LOOP    - If error, go to step 1            │
└─────────────────────────────────────────────────┘
```

## Key Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/health` | Main app health |
| `/aiastore/health` | Store Health AI status |
| `/aiastore/health/debug` | Model/DB diagnostics |
| `/aiastore/health/seed` | Seed data to DB |
| `/debug/store-health-error` | See loading errors |
| `/aiastore/api/v1/stores` | Test stores API |
| `/aiastore/api/v1/dashboard/overview` | Test dashboard API |

## Database Connection
- **Local .env**: `DATABASE_URL` points to `ringlypro_crm_production`
- **Render**: Uses `ringlypro_crm_database`
- **Important**: Data must be seeded to Render's database via API endpoint

## Common Issues & Fixes

### Missing Dependency
```bash
# Check error
curl -s "https://aiagent.ringlypro.com/debug/store-health-error"
# If "Cannot find module 'X'"
# Edit package.json to add dependency, commit, push
```

### Schema Mismatch
```bash
# Run SQL to add missing columns
/opt/homebrew/bin/node -e "
const { Sequelize } = require('sequelize');
require('dotenv').config();
const sequelize = new Sequelize(process.env.DATABASE_URL, {...});
await sequelize.query('ALTER TABLE x ADD COLUMN y TYPE');
"
```

### Empty Data
```bash
# Seed via API endpoint
curl -s "https://aiagent.ringlypro.com/aiastore/health/seed"
```

## Node.js Path
Use `/opt/homebrew/bin/node` for running Node.js scripts locally.
