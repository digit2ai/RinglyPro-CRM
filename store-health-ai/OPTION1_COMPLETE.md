# Option 1: Business Logic Layer - COMPLETE ✅

## Overview

The complete business logic layer for the Store Health AI Agent has been implemented. This includes all Sequelize models, database configuration, and core service layer.

---

## What Was Built

### 📦 Database Layer (20 Sequelize Models)

All models are located in [`models/`](./models/) with full associations:

#### Core Entities (4 models)
- **[Organization.js](./models/Organization.js)** - Multi-tenant organizations
- **[Region.js](./models/Region.js)** - Geographic regions
- **[District.js](./models/District.js)** - Sub-regions
- **[Store.js](./models/Store.js)** - Individual store locations

#### KPI System (3 models)
- **[KpiDefinition.js](./models/KpiDefinition.js)** - KPI catalog (sales, traffic, labor, etc.)
- **[KpiThreshold.js](./models/KpiThreshold.js)** - Red/Yellow/Green thresholds
- **[KpiMetric.js](./models/KpiMetric.js)** - Time-series KPI data

#### Health & Alerts (4 models)
- **[StoreHealthSnapshot.js](./models/StoreHealthSnapshot.js)** - Daily health status
- **[Alert.js](./models/Alert.js)** - Threshold violation alerts
- **[Task.js](./models/Task.js)** - Manager action items
- **[Escalation.js](./models/Escalation.js)** - Escalation tracking

#### Escalation & AI Calls (3 models)
- **[EscalationRule.js](./models/EscalationRule.js)** - Escalation policies
- **[AiCall.js](./models/AiCall.js)** - AI voice call logging
- **[CallScript.js](./models/CallScript.js)** - Call script templates

#### Predictive & Supporting (6 models)
- **[RiskPrediction.js](./models/RiskPrediction.js)** - Predictive risk engine
- **[LaborSchedule.js](./models/LaborSchedule.js)** - Labor coverage planning
- **[LaborCallout.js](./models/LaborCallout.js)** - Employee absences
- **[InventoryLevel.js](./models/InventoryLevel.js)** - Stock tracking
- **[OutOfStockEvent.js](./models/OutOfStockEvent.js)** - Stockout incidents
- **[SystemConfig.js](./models/SystemConfig.js)** - Application configuration

---

### ⚙️ Configuration Files

- **[.sequelizerc](./.sequelizerc)** - Sequelize CLI configuration
- **[config/database.js](./config/database.js)** - Database connection config (dev/test/prod)
- **[models/index.js](./models/index.js)** - Model loader with associations

---

### 🔧 Service Layer (5 Core Services)

All services are located in [`src/services/`](./src/services/):

#### 1. KPI Calculator Service
**[kpi-calculator.js](./src/services/kpi-calculator.js)**

Calculates KPI values, rolling baselines, and determines status.

**Key Functions:**
- `calculateAndStoreKpi(storeId, kpiCode, metricDate, value, metadata)` - Calculate and store single KPI
- `batchCalculateKpis(storeId, metricDate, kpiValues)` - Batch calculate multiple KPIs
- `calculateRolling4WeekBaseline(storeId, kpiDefinitionId, targetDate)` - Rolling 4-week average
- `calculateSamePeriodLYBaseline(storeId, kpiDefinitionId, targetDate)` - Year-over-year comparison
- `determineStatus(variancePct, threshold)` - Green/Yellow/Red status determination
- `getLatestKpiStatus(storeId)` - Get current KPI status for a store

**Example Usage:**
```javascript
const kpiCalculator = require('./src/services/kpi-calculator');

// Calculate sales KPI
const result = await kpiCalculator.calculateAndStoreKpi(
  storeId: 1,
  kpiCode: 'sales',
  metricDate: new Date(),
  value: 15000,
  metadata: { day_of_week: 'Monday' }
);

// Batch calculate multiple KPIs
const results = await kpiCalculator.batchCalculateKpis(1, new Date(), {
  sales: 15000,
  traffic: 450,
  conversion_rate: 35.5
});
```

---

#### 2. Threshold Checker Service
**[threshold-checker.js](./src/services/threshold-checker.js)**

Monitors KPIs against thresholds and generates health snapshots.

**Key Functions:**
- `checkStoreHealth(storeId, date)` - Generate health snapshot for a store
- `checkAllStoresHealth(date)` - Check all active stores
- `getStoresRequiringAction(date)` - Get stores needing immediate attention
- `getDashboardOverview(date)` - Get dashboard summary stats
- `determineOverallStatus(statusCounts)` - Calculate overall store status
- `calculateHealthScore(statusCounts)` - Calculate 0-100 health score

**Example Usage:**
```javascript
const thresholdChecker = require('./src/services/threshold-checker');

// Check single store health
const health = await thresholdChecker.checkStoreHealth(1);
console.log(`Store status: ${health.snapshot.overall_status}`);
console.log(`Health score: ${health.snapshot.health_score}`);

// Get dashboard overview
const overview = await thresholdChecker.getDashboardOverview();
console.log(`${overview.red_stores} red, ${overview.yellow_stores} yellow, ${overview.green_stores} green`);
```

---

#### 3. Alert Manager Service
**[alert-manager.js](./src/services/alert-manager.js)**

Creates and manages alerts when thresholds are crossed.

**Key Functions:**
- `createAlert(storeId, kpiMetric)` - Create alert for threshold violation
- `processStoreKpis(storeId, date)` - Process all KPIs and create alerts
- `acknowledgeAlert(alertId, acknowledgedBy)` - Acknowledge an alert
- `resolveAlert(alertId)` - Mark alert as resolved
- `getActiveAlerts(storeId)` - Get active alerts for a store
- `getOverdueAlerts()` - Get alerts past SLA deadline

**Example Usage:**
```javascript
const alertManager = require('./src/services/alert-manager');

// Process all KPIs for a store
const alerts = await alertManager.processStoreKpis(1);
console.log(`Created ${alerts.length} new alerts`);

// Get active alerts
const active = await alertManager.getActiveAlerts(1);
console.log(`Store has ${active.length} active alerts`);

// Acknowledge alert
await alertManager.acknowledgeAlert(alertId, 'John Doe');
```

---

#### 4. Escalation Engine Service
**[escalation-engine.js](./src/services/escalation-engine.js)**

Manages the 5-level escalation model (0-4) and SLA monitoring.

**Key Functions:**
- `monitorAndEscalate()` - Check all alerts and escalate as needed (run on schedule)
- `checkAndEscalateAlert(alert)` - Check if specific alert should escalate
- `executeEscalation(alert, rule, triggeredBy)` - Execute escalation action
- `scheduleAiCall(escalation, alert, store, kpiDefinition)` - Schedule Level 3 AI call
- `escalateToRegional(escalation, alert, store, kpiDefinition)` - Level 4 regional escalation
- `getPendingEscalations()` - Get all pending escalations

**Escalation Levels (Per Spec):**
- **Level 0** 🟩 - All green, silent monitoring
- **Level 1** 🟨 - Yellow status, create task
- **Level 2** 🟥 - Red status, create task + send alert + require acknowledgment
- **Level 3** 🔴 - Persistent red (>24hrs), automated AI voice call
- **Level 4** 🚨 - Regional escalation (>48hrs or revenue risk threshold)

**Example Usage:**
```javascript
const escalationEngine = require('./src/services/escalation-engine');

// Run escalation monitoring (schedule this every 15-30 minutes)
const escalations = await escalationEngine.monitorAndEscalate();
console.log(`${escalations.length} escalations created`);

// Get pending escalations
const pending = await escalationEngine.getPendingEscalations();
pending.forEach(e => {
  console.log(`${e.store.name}: Level ${e.to_level} - ${e.escalation_reason}`);
});
```

---

#### 5. Voice Call Manager Service (Stub)
**[voice-call-manager.js](./src/services/voice-call-manager.js)**

Stub implementation for AI voice calls. Will be fully implemented in Option 3.

**Key Functions:**
- `scheduleCall(escalation, alert, store, kpiDefinition)` - Schedule AI call
- `getCallScript(organizationId, callType)` - Get call script template
- `updateCallStatus(callId, status, updates)` - Update call status
- `getCallHistory(storeId)` - Get call history

**Status:** Stub created, full implementation pending Option 3 (Twilio/Vapi integration)

---

#### Service Layer Index
**[src/services/index.js](./src/services/index.js)**

Central export point for all services:
```javascript
const {
  kpiCalculator,
  thresholdChecker,
  alertManager,
  escalationEngine,
  voiceCallManager
} = require('./src/services');
```

---

## Testing the Services

### 1. Setup Database
```bash
cd store-health-ai
npm install
createdb store_health_ai
cp .env.example .env
# Edit .env with your database credentials
npm run db:migrate
npm run db:seed  # After creating seed file (see README.md)
```

### 2. Test KPI Calculation
```javascript
const { kpiCalculator } = require('./src/services');

// Calculate sales KPI for store 1
const result = await kpiCalculator.calculateAndStoreKpi(
  1, 'sales', new Date(), 15000
);

console.log(`Status: ${result.status}`);
console.log(`Variance: ${result.variance_pct}%`);
```

### 3. Test Health Checking
```javascript
const { thresholdChecker } = require('./src/services');

// Check store health
const health = await thresholdChecker.checkStoreHealth(1);

console.log(`Overall Status: ${health.snapshot.overall_status}`);
console.log(`Health Score: ${health.snapshot.health_score}`);
console.log(`Action Required: ${health.snapshot.action_required}`);
```

### 4. Test Alert Creation
```javascript
const { alertManager } = require('./src/services');

// Process store KPIs and create alerts
const alerts = await alertManager.processStoreKpis(1);

console.log(`Created ${alerts.filter(a => a.created).length} new alerts`);
```

### 5. Test Escalation Monitoring
```javascript
const { escalationEngine } = require('./src/services');

// Monitor and escalate (run on schedule)
const escalations = await escalationEngine.monitorAndEscalate();

console.log(`${escalations.length} escalations triggered`);
```

---

## Integration Flow

Here's how the services work together:

```
1. DATA INGESTION (External systems → KPI Metrics)
   └─> POS, Traffic Counter, Inventory → kpiCalculator.calculateAndStoreKpi()

2. HEALTH CHECKING (Daily job)
   └─> thresholdChecker.checkAllStoresHealth()
       ├─> Generates StoreHealthSnapshots
       └─> Identifies Red/Yellow KPIs

3. ALERT GENERATION (After health check)
   └─> alertManager.processStoreKpis()
       ├─> Creates Alerts for threshold violations
       └─> Creates Tasks for store managers

4. ESCALATION MONITORING (Hourly job)
   └─> escalationEngine.monitorAndEscalate()
       ├─> Checks alert SLAs
       ├─> Escalates Level 1 → 2 (Yellow → Red acknowledgment)
       ├─> Escalates Level 2 → 3 (AI voice call after 24hrs)
       └─> Escalates Level 3 → 4 (Regional after 48hrs)

5. AI VOICE CALLS (Level 3 escalation)
   └─> voiceCallManager.scheduleCall()
       └─> [To be implemented in Option 3]
```

---

## Scheduled Jobs Needed

Create these cron jobs (using node-cron or similar):

```javascript
const cron = require('node-cron');
const { kpiCalculator, thresholdChecker, alertManager, escalationEngine } = require('./src/services');

// Daily: Check store health (run at 1 AM)
cron.schedule('0 1 * * *', async () => {
  console.log('Running daily store health check...');
  await thresholdChecker.checkAllStoresHealth();
});

// Daily: Generate alerts (run at 1:30 AM, after health check)
cron.schedule('30 1 * * *', async () => {
  console.log('Processing alerts...');
  const stores = await Store.findAll({ where: { status: 'active' } });
  for (const store of stores) {
    await alertManager.processStoreKpis(store.id);
  }
});

// Hourly: Monitor escalations
cron.schedule('0 * * * *', async () => {
  console.log('Monitoring escalations...');
  await escalationEngine.monitorAndEscalate();
});

// Every 15 minutes: Check SLAs
cron.schedule('*/15 * * * *', async () => {
  console.log('Checking SLAs...');
  const overdue = await alertManager.getOverdueAlerts();
  console.log(`${overdue.length} overdue alerts`);
});
```

---

## File Structure

```
store-health-ai/
├── config/
│   └── database.js              ✅ Database connection config
├── models/                      ✅ 20 Sequelize models
│   ├── Organization.js
│   ├── Region.js
│   ├── District.js
│   ├── Store.js
│   ├── KpiDefinition.js
│   ├── KpiThreshold.js
│   ├── KpiMetric.js
│   ├── StoreHealthSnapshot.js
│   ├── Alert.js
│   ├── Task.js
│   ├── Escalation.js
│   ├── EscalationRule.js
│   ├── AiCall.js
│   ├── CallScript.js
│   ├── RiskPrediction.js
│   ├── LaborSchedule.js
│   ├── LaborCallout.js
│   ├── InventoryLevel.js
│   ├── OutOfStockEvent.js
│   ├── SystemConfig.js
│   └── index.js
├── src/
│   └── services/                ✅ 5 core services
│       ├── kpi-calculator.js
│       ├── threshold-checker.js
│       ├── alert-manager.js
│       ├── escalation-engine.js
│       ├── voice-call-manager.js (stub)
│       └── index.js
├── migrations/                  ✅ 14 migration files
├── .sequelizerc                 ✅
├── package.json                 ✅
└── .env.example                 ✅
```

---

## What's Next: Option 2 - API Layer

Now that the business logic is complete, the next step is to build the REST API layer:

### Option 2 Tasks:
1. **Express server setup**
2. **API routes:**
   - `GET /api/stores/:id/health` - Get store health
   - `GET /api/stores/:id/kpis` - Get KPI metrics
   - `GET /api/stores/:id/alerts` - Get alerts
   - `GET /api/stores/:id/tasks` - Get tasks
   - `POST /api/alerts/:id/acknowledge` - Acknowledge alert
   - `POST /api/tasks/:id/complete` - Complete task
   - `GET /api/dashboard/overview` - Dashboard summary
   - `GET /api/escalations` - Get escalations
3. **Middleware:**
   - Authentication (JWT)
   - Error handling
   - Request validation
   - Rate limiting
4. **API documentation (Swagger/OpenAPI)**
5. **Unit tests**

---

## Success Criteria ✅

All Option 1 requirements completed:

- ✅ 20 Sequelize models with full associations
- ✅ Database configuration (dev/test/prod)
- ✅ KPI Calculator service
- ✅ Threshold Checker service
- ✅ Alert Manager service
- ✅ Escalation Engine service
- ✅ Voice Call Manager stub
- ✅ Service layer index
- ✅ Comprehensive documentation

---

**Ready for Option 2?** Let me know when you want to build the API layer!
