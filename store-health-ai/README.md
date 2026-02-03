# Store Health AI Agent - Setup Guide

## Overview

This is a standalone retail operations AI manager that monitors store health, predicts operational risk, and guides store managers through a Red/Yellow/Green status system with automated escalations and AI voice calls.

## Quick Start

### Prerequisites

- Node.js 16+ and npm
- PostgreSQL 12+
- (Optional) Twilio/Vapi account for AI voice calls

### Installation

```bash
# 1. Create project directory
cd store-health-ai

# 2. Initialize Node.js project
npm init -y

# 3. Install dependencies
npm install \
  sequelize \
  pg pg-hstore \
  express \
  dotenv \
  date-fns

# 4. Install dev dependencies
npm install --save-dev \
  sequelize-cli \
  nodemon
```

### Database Setup

#### 1. Create PostgreSQL database

```bash
# Using psql
createdb store_health_ai

# Or via SQL
psql -U postgres -c "CREATE DATABASE store_health_ai;"
```

#### 2. Configure database connection

Create `.env` file:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=store_health_ai
DB_USER=postgres
DB_PASSWORD=your_password

# Application
NODE_ENV=development
PORT=3000

# AI Voice Calling (optional)
VOICE_PROVIDER=twilio
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PHONE_NUMBER=+1234567890

# Timezone
DEFAULT_TIMEZONE=America/New_York
```

#### 3. Configure Sequelize

Create `.sequelizerc` in project root:

```javascript
const path = require('path');

module.exports = {
  'config': path.resolve('config', 'database.js'),
  'models-path': path.resolve('models'),
  'seeders-path': path.resolve('seeders'),
  'migrations-path': path.resolve('migrations')
};
```

Create `config/database.js`:

```javascript
require('dotenv').config();

module.exports = {
  development: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: console.log
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000
    }
  }
};
```

#### 4. Run migrations

```bash
# Run all migrations
npx sequelize-cli db:migrate

# Check migration status
npx sequelize-cli db:migrate:status

# Rollback last migration (if needed)
npx sequelize-cli db:migrate:undo
```

---

## Seed Data Setup

### 1. Create seed file

```bash
npx sequelize-cli seed:generate --name demo-data
```

### 2. Example seed data

Create `seeders/YYYYMMDDHHMMSS-demo-data.js`:

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // 1. Create organization
    const [org] = await queryInterface.bulkInsert('organizations', [{
      name: 'Dollar Tree',
      timezone: 'America/New_York',
      config: JSON.stringify({
        fiscal_year_start: '02-01',
        currency: 'USD'
      }),
      created_at: new Date(),
      updated_at: new Date()
    }], { returning: true });

    // 2. Create region
    const [region] = await queryInterface.bulkInsert('regions', [{
      organization_id: org.id,
      name: 'Northeast Region',
      manager_name: 'Jane Smith',
      manager_email: 'jane.smith@example.com',
      manager_phone: '+1-555-0101',
      created_at: new Date(),
      updated_at: new Date()
    }], { returning: true });

    // 3. Create district
    const [district] = await queryInterface.bulkInsert('districts', [{
      organization_id: org.id,
      region_id: region.id,
      name: 'NYC District',
      manager_name: 'John Doe',
      manager_email: 'john.doe@example.com',
      manager_phone: '+1-555-0102',
      created_at: new Date(),
      updated_at: new Date()
    }], { returning: true });

    // 4. Create stores
    await queryInterface.bulkInsert('stores', [
      {
        organization_id: org.id,
        region_id: region.id,
        district_id: district.id,
        store_code: 'DT-001',
        name: 'Dollar Tree - Manhattan',
        address: '123 Main St',
        city: 'New York',
        state: 'NY',
        zip_code: '10001',
        timezone: 'America/New_York',
        phone: '+1-555-0201',
        manager_name: 'Alice Johnson',
        manager_phone: '+1-555-0202',
        manager_email: 'alice.j@example.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        region_id: region.id,
        district_id: district.id,
        store_code: 'DT-002',
        name: 'Dollar Tree - Brooklyn',
        address: '456 Park Ave',
        city: 'Brooklyn',
        state: 'NY',
        zip_code: '11201',
        timezone: 'America/New_York',
        phone: '+1-555-0203',
        manager_name: 'Bob Williams',
        manager_phone: '+1-555-0204',
        manager_email: 'bob.w@example.com',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // 5. Create KPI definitions
    await queryInterface.bulkInsert('kpi_definitions', [
      {
        organization_id: org.id,
        kpi_code: 'sales',
        name: 'Sales Performance',
        description: 'Total daily sales vs rolling 4-week average',
        unit: '$',
        calculation_method: 'sum',
        category: 'sales',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_code: 'traffic',
        name: 'Store Traffic',
        description: 'Daily customer traffic count',
        unit: 'count',
        calculation_method: 'sum',
        category: 'traffic',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_code: 'conversion_rate',
        name: 'Conversion Rate',
        description: 'Percentage of visitors who make a purchase',
        unit: '%',
        calculation_method: 'percentage',
        category: 'sales',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_code: 'labor_coverage',
        name: 'Labor Coverage',
        description: 'Available labor hours vs required hours',
        unit: 'ratio',
        calculation_method: 'ratio',
        category: 'labor',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // 6. Create default thresholds
    const kpis = await queryInterface.sequelize.query(
      `SELECT id, kpi_code FROM kpi_definitions WHERE organization_id = ${org.id}`,
      { type: queryInterface.sequelize.QueryTypes.SELECT }
    );

    const thresholds = kpis.map(kpi => {
      let thresholdConfig;

      switch(kpi.kpi_code) {
        case 'sales':
          thresholdConfig = { green_min: -2, yellow_min: -6, red_threshold: -6 };
          break;
        case 'traffic':
          thresholdConfig = { green_min: -3, yellow_min: -8, red_threshold: -8 };
          break;
        case 'conversion_rate':
          thresholdConfig = { green_min: -1.5, yellow_min: -3, red_threshold: -3 };
          break;
        case 'labor_coverage':
          thresholdConfig = { green_min: 95, yellow_min: 90, red_threshold: 90 };
          break;
        default:
          thresholdConfig = { green_min: -2, yellow_min: -5, red_threshold: -5 };
      }

      return {
        kpi_definition_id: kpi.id,
        organization_id: org.id,
        store_id: null, // Org-level default
        comparison_basis: 'rolling_4w',
        priority: 3,
        ...thresholdConfig,
        created_at: new Date(),
        updated_at: new Date()
      };
    });

    await queryInterface.bulkInsert('kpi_thresholds', thresholds);

    // 7. Create call scripts
    await queryInterface.bulkInsert('call_scripts', [
      {
        organization_id: org.id,
        script_type: 'green',
        version: 1,
        script_content: 'Good morning. Your store is green across all core KPIs today. Sales, staffing, and inventory are tracking within healthy ranges. No action is required right now. I\'ll continue monitoring and notify you only if something changes.',
        variables: JSON.stringify(['store_name']),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        script_type: 'red',
        version: 1,
        script_content: 'Good morning. I\'m calling because your store is at risk today. {kpi_name} is below the safe threshold at {variance}%. If unaddressed, this may result in lost sales or customer impact. I\'ve created a priority task that needs action now. Say \'yes\' if you want me to assist, or \'later\' if you\'ll handle it manually.',
        variables: JSON.stringify(['store_name', 'kpi_name', 'variance', 'recommended_action']),
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);

    // 8. Create escalation rules
    const salesKpi = kpis.find(k => k.kpi_code === 'sales');
    const laborKpi = kpis.find(k => k.kpi_code === 'labor_coverage');

    await queryInterface.bulkInsert('escalation_rules', [
      {
        organization_id: org.id,
        kpi_definition_id: salesKpi.id,
        trigger_condition: 'status_red',
        duration_hours: 24,
        from_level: 2,
        to_level: 3,
        action: 'ai_call',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_definition_id: laborKpi.id,
        trigger_condition: 'status_red',
        duration_hours: 24,
        from_level: 2,
        to_level: 3,
        action: 'ai_call',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        organization_id: org.id,
        kpi_definition_id: null, // Applies to all
        trigger_condition: 'status_red',
        duration_hours: 48,
        from_level: 3,
        to_level: 4,
        action: 'regional_escalation',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    ]);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.bulkDelete('escalation_rules', null, {});
    await queryInterface.bulkDelete('call_scripts', null, {});
    await queryInterface.bulkDelete('kpi_thresholds', null, {});
    await queryInterface.bulkDelete('kpi_definitions', null, {});
    await queryInterface.bulkDelete('stores', null, {});
    await queryInterface.bulkDelete('districts', null, {});
    await queryInterface.bulkDelete('regions', null, {});
    await queryInterface.bulkDelete('organizations', null, {});
  }
};
```

### 3. Run seeds

```bash
npx sequelize-cli db:seed:all
```

---

## Project Structure

```
store-health-ai/
├── config/
│   └── database.js          # Sequelize config
├── migrations/              # Database migrations (14 files)
├── models/                  # Sequelize models (to be created)
├── seeders/                 # Seed data
├── src/
│   ├── services/           # Business logic
│   │   ├── kpi-calculator.js
│   │   ├── threshold-checker.js
│   │   ├── alert-manager.js
│   │   ├── escalation-engine.js
│   │   └── voice-call-manager.js
│   ├── routes/             # API routes
│   ├── controllers/        # Request handlers
│   └── utils/              # Helpers
├── .env
├── .sequelizerc
├── package.json
└── README.md
```

---

## Next Steps: Building the Application Layer

### 1. Create Sequelize Models

Generate models for each table:

```bash
npx sequelize-cli model:generate --name Organization --attributes name:string,timezone:string
# Repeat for each table...
```

Or create them manually in `models/` directory with associations.

### 2. Build Core Services

#### KPI Calculator Service (`src/services/kpi-calculator.js`)

```javascript
// Calculate KPI variance against rolling 4-week baseline
// Determine green/yellow/red status
// Store results in kpi_metrics table
```

#### Threshold Checker Service (`src/services/threshold-checker.js`)

```javascript
// Monitor KPIs against thresholds
// Generate alerts when thresholds crossed
// Track status changes in kpi_status_history
```

#### Alert Manager Service (`src/services/alert-manager.js`)

```javascript
// Create alerts for threshold violations
// Manage alert lifecycle (active -> acknowledged -> resolved)
// Create tasks for store managers
```

#### Escalation Engine (`src/services/escalation-engine.js`)

```javascript
// Monitor alert SLAs
// Trigger escalations per escalation_rules
// Initiate AI voice calls at Level 3
// Escalate to regional at Level 4
```

#### Voice Call Manager (`src/services/voice-call-manager.js`)

```javascript
// Integrate with Twilio/Vapi
// Use call_scripts templates
// Log calls in ai_calls table
// Handle responses and follow-ups
```

### 3. Build REST API

Create Express API endpoints:

```
GET    /api/stores/:id/health         # Current health snapshot
GET    /api/stores/:id/kpis           # Current KPI values
GET    /api/stores/:id/alerts         # Active alerts
GET    /api/stores/:id/tasks          # Pending tasks
POST   /api/alerts/:id/acknowledge    # Acknowledge alert
POST   /api/tasks/:id/complete        # Mark task complete
GET    /api/dashboard/overview        # Multi-store overview
```

### 4. Build Dashboard UI

- Daily store health view (Green/Yellow/Red cards)
- KPI trend charts
- Alert inbox
- Task management
- Call history

### 5. Set Up Scheduled Jobs

Use node-cron or similar:

```javascript
// Daily jobs
- Calculate daily KPIs (end of day)
- Generate store health snapshots
- Check thresholds and create alerts
- Run predictive risk model

// Hourly jobs
- Monitor alert SLAs
- Trigger escalations
- Initiate AI voice calls

// Real-time
- Process incoming data (sales, traffic, inventory)
- Update labor schedules and call-outs
```

---

## Configuration Examples

### System Config Records

Insert into `system_config` table:

```sql
INSERT INTO system_config (organization_id, config_key, config_value, description)
VALUES
  (1, 'voice_provider', '{"provider": "twilio", "enabled": true}', 'AI voice call provider'),
  (1, 'alert_channels', '{"push": true, "sms": true, "email": true}', 'Alert delivery channels'),
  (1, 'sla_hours', '{"sales": 24, "labor": 24, "inventory": 72}', 'SLA hours by category'),
  (1, 'green_call_enabled', '{"enabled": false}', 'Enable optional green status calls'),
  (1, 'predictive_threshold', '{"yellow": 65, "red": 80}', 'Prediction confidence thresholds');
```

---

## Data Ingestion

You'll need to build data connectors for:

1. **POS System**: Daily sales, transactions, ticket values
2. **People Counter**: Store traffic data
3. **Inventory System**: Stock levels, out-of-stock events
4. **Labor Management System**: Schedules, call-outs, coverage
5. **HR System**: Open positions, time-to-fill

Create ETL jobs to populate:
- `kpi_metrics` (daily)
- `labor_schedules` & `labor_callouts` (real-time)
- `inventory_levels` & `out_of_stock_events` (daily)

---

## Testing

### 1. Test KPI Status Detection

Manually insert test data into `kpi_metrics` with various variance percentages to trigger different statuses.

### 2. Test Alert Generation

Ensure alerts are created when KPIs cross thresholds.

### 3. Test Escalation Flow

Simulate alerts persisting beyond SLA to trigger escalations.

### 4. Test Voice Call Integration

Use Twilio sandbox to test AI call scripts.

---

## Deployment Checklist

- [ ] Database migrations run
- [ ] Seed data loaded
- [ ] Environment variables configured
- [ ] Data connectors set up
- [ ] Scheduled jobs configured
- [ ] Voice provider integrated
- [ ] Dashboard deployed
- [ ] Monitoring/logging configured
- [ ] Alert channels tested

---

## Support & Documentation

- **Database Schema**: See [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
- **API Docs**: (To be created with Swagger/OpenAPI)
- **Architecture**: (To be created)

---

## License

Proprietary - All Rights Reserved
