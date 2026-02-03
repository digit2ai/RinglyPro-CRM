# Store Health AI - Quick Start

## What Was Created

### 📋 Documentation
- **[DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)** - Complete database schema design with 20 tables
- **[README.md](./README.md)** - Comprehensive setup guide with seed data examples
- **QUICK_START.md** - This file

### 🗄️ Database Migrations (14 files)
All located in `migrations/`:

1. `20260202-01-create-organizations.js` - Multi-tenant organizations
2. `20260202-02-create-regions-districts.js` - Organizational hierarchy
3. `20260202-03-create-stores.js` - Store master data
4. `20260202-04-create-kpi-definitions.js` - KPI catalog
5. `20260202-05-create-kpi-thresholds.js` - Red/Yellow/Green thresholds
6. `20260202-06-create-kpi-metrics.js` - Time-series KPI data
7. `20260202-07-create-store-health-snapshots.js` - Daily health status
8. `20260202-08-create-alerts.js` - Alert management
9. `20260202-09-create-tasks.js` - Task assignment
10. `20260202-10-create-escalations.js` - Escalation tracking & rules
11. `20260202-11-create-ai-calls.js` - AI voice call logging & scripts
12. `20260202-12-create-risk-predictions.js` - Predictive risk engine
13. `20260202-13-create-labor-inventory.js` - Supporting operational data
14. `20260202-14-create-system-config.js` - Configuration management

### ⚙️ Configuration Files
- **package.json** - Node.js dependencies and scripts
- **.env.example** - Environment variable template

---

## Get Started in 5 Minutes

### Step 1: Install Dependencies
```bash
cd store-health-ai
npm install
```

### Step 2: Setup Database
```bash
# Create PostgreSQL database
createdb store_health_ai

# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
nano .env
```

### Step 3: Run Migrations
```bash
npm run db:migrate
```

### Step 4: Load Sample Data
```bash
# See README.md for seed file creation instructions
npm run db:seed
```

---

## Database Schema Overview

### Core Tables (6)
- `organizations` - Retail chains
- `regions` - Geographic regions
- `districts` - Sub-regions
- `stores` - Individual locations
- `kpi_definitions` - Metrics catalog
- `kpi_thresholds` - Status thresholds

### Operational Tables (8)
- `kpi_metrics` - Time-series data
- `store_health_snapshots` - Daily status
- `alerts` - Threshold violations
- `tasks` - Manager actions
- `escalations` - Escalation chain
- `escalation_rules` - Escalation policies
- `ai_calls` - Voice call log
- `call_scripts` - Call templates

### Supporting Tables (6)
- `risk_predictions` - Predictive analytics
- `labor_schedules` - Coverage planning
- `labor_callouts` - Employee absences
- `inventory_levels` - Stock tracking
- `out_of_stock_events` - Stockout log
- `system_config` - App configuration

**Total: 20 tables**

---

## KPI Definitions Included

Per your spec, the system tracks 7 core KPIs:

1. **Sales Performance** (vs Rolling 4W)
   - 🟩 Green: ≥ -2%
   - 🟨 Yellow: -2% to -6%
   - 🟥 Red: < -6%

2. **Traffic**
   - 🟩 Green: ≥ -3%
   - 🟨 Yellow: -3% to -8%
   - 🟥 Red: < -8%

3. **Conversion Rate**
   - 🟩 Green: ≥ -1.5 pts
   - 🟨 Yellow: -1.5 to -3 pts
   - 🟥 Red: > -3 pts

4. **Labor Capacity** (Most Critical)
   - 🟩 Green: ≥ 95%
   - 🟨 Yellow: 90-94%
   - 🟥 Red: < 90%

5. **Inventory - Out-of-Stock Rate**
   - 🟩 Green: < 3%
   - 🟨 Yellow: 3-6%
   - 🟥 Red: > 6%

6. **Transactions/Ticket Volume**
   - 🟩 Green: ≥ -2%
   - 🟨 Yellow: -2% to -5%
   - 🟥 Red: < -5%

7. **HR Health** (Open Positions)
   - 🟩 Green: 0-1
   - 🟨 Yellow: 2
   - 🟥 Red: ≥ 3

---

## Escalation Model Implementation

The database supports all 5 escalation levels from your spec:

### Level 0 - 🟩 GREEN
- **Trigger**: All KPIs green
- **Action**: Silent monitoring
- **Tables**: `store_health_snapshots`

### Level 1 - 🟨 YELLOW
- **Trigger**: Any KPI yellow OR predicted risk ≥ 65%
- **Action**: Create task
- **Tables**: `alerts` (severity=yellow), `tasks`

### Level 2 - 🟥 RED
- **Trigger**: Any KPI red OR multiple yellow
- **Action**: Create task + send alert + require acknowledgment
- **Tables**: `alerts` (severity=red, requires_acknowledgment=true), `tasks`

### Level 3 - 🔴 PERSISTENT RED
- **Trigger**: Red persists beyond SLA OR predicted red ≥ 80%
- **Action**: Automated AI voice call
- **Tables**: `escalations` (to_level=3), `ai_calls`

### Level 4 - REGIONAL ESCALATION
- **Trigger**: Red persists 2+ cycles OR revenue risk threshold exceeded
- **Action**: Escalate to district/regional ops
- **Tables**: `escalations` (to_level=4), tasks assigned to regional_manager

---

## AI Voice Call Integration

The system is ready for voice call integration:

### Call Types Supported
- 🟩 Green calls (optional, disabled by default)
- 🟨 Yellow calls (configurable)
- 🟥 Red calls (mandatory at Level 3)

### Call Scripts Table
Stores templated scripts with dynamic variables:
- `{store_name}`
- `{kpi_name}`
- `{variance}`
- `{recommended_action}`

### Call Logging
Every call is logged in `ai_calls` table with:
- Transcript
- Sentiment analysis
- Response (yes/later/no_answer)
- Duration and outcome

### Providers Supported
- Twilio (recommended)
- Vapi
- Custom (extensible)

---

## Next Development Steps

### Phase 1: Core Application (Week 1-2)
1. Create Sequelize models with associations
2. Build KPI Calculator service
3. Build Threshold Checker service
4. Build Alert Manager service
5. Create basic REST API

### Phase 2: Escalation Engine (Week 3)
1. Build Escalation Engine service
2. Implement SLA monitoring
3. Integrate voice call provider (Twilio)
4. Build Voice Call Manager service

### Phase 3: Dashboard & UI (Week 4)
1. Build dashboard UI
2. Store health overview page
3. Alert inbox and task manager
4. KPI trend charts
5. Call history viewer

### Phase 4: Data Integration (Week 5-6)
1. Build POS connector
2. Build inventory connector
3. Build labor management connector
4. Set up scheduled ETL jobs

### Phase 5: Predictive Engine (Week 7-8)
1. Build risk prediction model
2. Train on historical data
3. Integrate predictions into alerts
4. Tune confidence thresholds

---

## File Structure After Full Build

```
store-health-ai/
├── config/
│   └── database.js
├── migrations/              # ✅ DONE (14 files)
├── seeders/                 # ⏳ TODO (create seed files)
├── models/                  # ⏳ TODO (20 Sequelize models)
├── src/
│   ├── services/           # ⏳ TODO
│   │   ├── kpi-calculator.js
│   │   ├── threshold-checker.js
│   │   ├── alert-manager.js
│   │   ├── escalation-engine.js
│   │   ├── voice-call-manager.js
│   │   └── risk-predictor.js
│   ├── routes/             # ⏳ TODO
│   │   ├── stores.js
│   │   ├── alerts.js
│   │   ├── tasks.js
│   │   └── dashboard.js
│   ├── controllers/        # ⏳ TODO
│   ├── middleware/         # ⏳ TODO
│   ├── utils/              # ⏳ TODO
│   ├── jobs/               # ⏳ TODO (cron jobs)
│   └── index.js            # ⏳ TODO (Express app)
├── tests/                  # ⏳ TODO
├── .env                    # ⏳ TODO (copy from .env.example)
├── .env.example            # ✅ DONE
├── .sequelizerc            # ⏳ TODO
├── package.json            # ✅ DONE
├── DATABASE_SCHEMA.md      # ✅ DONE
├── README.md               # ✅ DONE
└── QUICK_START.md          # ✅ DONE
```

---

## Useful Commands

```bash
# Database
npm run db:migrate          # Run all pending migrations
npm run db:migrate:undo     # Rollback last migration
npm run db:seed             # Run all seed files
npm run db:reset            # Reset database (undo all + migrate + seed)

# Development
npm run dev                 # Start with nodemon
npm start                   # Start production

# Check migration status
npx sequelize-cli db:migrate:status
```

---

## Key Design Decisions

1. **Multi-tenant**: Organization-level separation for multiple retail chains
2. **Time-series optimized**: KPI metrics designed for high-frequency writes
3. **Configurable**: Thresholds and rules in database, not hard-coded
4. **Audit trail**: Complete history of alerts, escalations, and AI calls
5. **Extensible**: JSONB metadata fields for future flexibility
6. **Production-ready**: Proper indexes, constraints, and relationships

---

## What You Have Now

✅ Complete database schema (20 tables)
✅ All migrations ready to run
✅ Comprehensive documentation
✅ Configuration templates
✅ Clear implementation roadmap

## What You Need Next

⏳ Sequelize models
⏳ Business logic services
⏳ REST API
⏳ Dashboard UI
⏳ Data connectors
⏳ Scheduled jobs
⏳ Voice call integration

---

**Ready to build?** Start with the README.md setup instructions.

**Questions?** Review DATABASE_SCHEMA.md for detailed table specifications.

**Next layer?** Let me know if you want:
1. Sequelize model definitions with associations
2. Service layer implementation (KPI calculator, alert manager, etc.)
3. REST API endpoints with Express
4. Dashboard UI components (React/Vue)
5. Data connector templates
6. Voice call integration guide (Twilio/Vapi)
