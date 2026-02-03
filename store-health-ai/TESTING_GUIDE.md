# Testing Guide - Store Health AI

## Quick Start

### 1. Setup Database

```bash
# Navigate to project
cd store-health-ai

# Install dependencies
npm install

# Create PostgreSQL database
createdb store_health_ai

# Copy environment template
cp .env.example .env

# Edit .env with your database credentials
# Required: DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
nano .env
```

### 2. Run Migrations

```bash
# Run all migrations to create tables
npm run db:migrate

# Verify migration status
npx sequelize-cli db:migrate:status
```

### 3. Load Test Data

```bash
# Seed database with test data
npm run db:seed

# This creates:
# - 1 Organization (Dollar Tree Stores)
# - 1 Region, 1 District
# - 3 Stores (Manhattan, Brooklyn, Queens)
# - 5 KPI Definitions
# - KPI Thresholds
# - 30 days of historical metrics
# - Call scripts
# - Escalation rules
```

### 4. Run Tests

```bash
# Run complete service test suite
npm test

# This will test:
# ✓ KPI Calculator Service
# ✓ Threshold Checker Service
# ✓ Alert Manager Service
# ✓ Escalation Engine Service
# ✓ Complete workflow integration
```

---

## What Gets Tested

### Test 1: KPI Calculator Service

**Tests:**
- Calculate individual KPIs with different values
- Determine Green/Yellow/Red status based on thresholds
- Calculate variance against rolling 4-week baseline
- Batch calculate multiple KPIs at once

**Expected Results:**
- KPIs stored in database with correct status
- Variance calculated correctly
- Thresholds applied properly

**Example Output:**
```
✓ Sales Performance: 13500 $ | Variance: +12.5% | Status: GREEN
✓ Store Traffic: 350 | Variance: -12.0% | Status: YELLOW
✓ Labor Coverage Ratio: 88 % | Variance: -7.3% | Status: RED
✓ Conversion Rate: 35 % | Variance: +5.0% | Status: GREEN
```

---

### Test 2: Threshold Checker Service

**Tests:**
- Check single store health
- Generate health snapshots
- Calculate health scores (0-100)
- Determine escalation levels
- Check all stores in batch
- Generate dashboard overview

**Expected Results:**
- Store health snapshot created
- Overall status determined (green/yellow/red)
- Health score calculated
- Escalation level assigned (0-4)

**Example Output:**
```
Store: Dollar Tree - Manhattan 42nd St
Overall Status: RED
Health Score: 68.5/100
KPI Breakdown:
  🟢 Green: 2
  🟨 Yellow: 1
  🔴 Red: 1
Escalation Level: 2
Action Required: YES
```

---

### Test 3: Alert Manager Service

**Tests:**
- Create alerts for threshold violations
- Generate tasks for store managers
- Set SLA deadlines
- Acknowledge alerts
- Resolve alerts
- Get active and overdue alerts

**Expected Results:**
- Alerts created for Yellow/Red KPIs
- Tasks assigned to store managers
- SLA deadlines set correctly
- Alert acknowledgment works

**Example Output:**
```
Alert #1: RED
  Severity: RED
  Title: 🔴 Sales Performance 8.3% below target
  Escalation Level: 2
  Task Created: #1 (Due: 2026-02-03 23:59)
  Assigned to: Alice Martinez (store_manager)
```

---

### Test 4: Escalation Engine Service

**Tests:**
- Get store escalations
- Get pending escalations across all stores
- Monitor and escalate based on SLA
- Execute escalation actions

**Expected Results:**
- Escalation records created
- SLA monitoring works
- Escalation rules applied correctly

**Example Output:**
```
NOTE: Escalation monitoring checks alert SLAs and escalates when needed.
In production, this runs every 15-30 minutes as a cron job.
For testing, alerts need to be 24+ hours old to trigger escalation.

✓ No escalations needed (all alerts within SLA)
```

---

### Test 5: Complete Workflow Integration

**Tests:**
- Full daily workflow simulation
- KPI calculation → Health check → Alert generation → Escalation

**Workflow Steps:**
1. Calculate today's KPIs
2. Check store health and generate snapshot
3. Generate alerts for threshold violations
4. Check for escalations (SLA-based)

**Expected Results:**
- Complete workflow executes without errors
- Data flows correctly between services
- All services work together seamlessly

---

## Manual Testing Scenarios

### Scenario 1: Trigger a Yellow Alert

```javascript
const { kpiCalculator, thresholdChecker, alertManager } = require('./src/services');

// Store 1: Create a yellow status KPI (traffic down 5%)
await kpiCalculator.calculateAndStoreKpi(1, 'traffic', new Date(), 380);

// Check health
const health = await thresholdChecker.checkStoreHealth(1);
console.log(health.snapshot.overall_status); // Should be 'yellow'

// Generate alerts
const alerts = await alertManager.processStoreKpis(1);
console.log(alerts); // Should create 1 yellow alert
```

### Scenario 2: Trigger a Red Alert

```javascript
// Store 1: Create a red status KPI (sales down 10%)
await kpiCalculator.calculateAndStoreKpi(1, 'sales', new Date(), 10800);

// Check health
const health = await thresholdChecker.checkStoreHealth(1);
console.log(health.snapshot.overall_status); // Should be 'red'
console.log(health.snapshot.escalation_level); // Should be 2

// Generate alerts
const alerts = await alertManager.processStoreKpis(1);
// Should create red alert with task and require acknowledgment
```

### Scenario 3: Test Escalation (Level 2 → 3)

```javascript
const { Alert } = require('./models');
const { escalationEngine } = require('./src/services');

// Find an active red alert
const alert = await Alert.findOne({
  where: { severity: 'red', status: 'active' }
});

// Manually age the alert by 25 hours (past 24hr SLA)
await alert.update({
  alert_date: new Date(Date.now() - 25 * 60 * 60 * 1000)
});

// Run escalation monitoring
const escalations = await escalationEngine.monitorAndEscalate();

// Should create Level 3 escalation and schedule AI call
console.log(escalations);
```

### Scenario 4: Get Dashboard Overview

```javascript
const { thresholdChecker } = require('./src/services');

// Get dashboard summary
const dashboard = await thresholdChecker.getDashboardOverview();

console.log(`Total Stores: ${dashboard.total_stores}`);
console.log(`Green: ${dashboard.green_stores}`);
console.log(`Yellow: ${dashboard.yellow_stores}`);
console.log(`Red: ${dashboard.red_stores}`);
console.log(`Average Health Score: ${dashboard.average_health_score}`);
console.log(`Critical Stores:`, dashboard.critical_stores);
```

---

## Database Inspection

### Check KPI Metrics

```sql
SELECT
  s.name AS store_name,
  kd.name AS kpi_name,
  km.metric_date,
  km.value,
  km.variance_pct,
  km.status
FROM kpi_metrics km
JOIN stores s ON km.store_id = s.id
JOIN kpi_definitions kd ON km.kpi_definition_id = kd.id
WHERE km.metric_date = CURRENT_DATE
ORDER BY s.name, kd.name;
```

### Check Store Health

```sql
SELECT
  s.name AS store_name,
  shs.snapshot_date,
  shs.overall_status,
  shs.health_score,
  shs.red_kpi_count,
  shs.yellow_kpi_count,
  shs.green_kpi_count,
  shs.escalation_level,
  shs.action_required
FROM store_health_snapshots shs
JOIN stores s ON shs.store_id = s.id
WHERE shs.snapshot_date = CURRENT_DATE
ORDER BY shs.health_score ASC;
```

### Check Active Alerts

```sql
SELECT
  s.name AS store_name,
  kd.name AS kpi_name,
  a.severity,
  a.title,
  a.status,
  a.escalation_level,
  a.alert_date,
  a.expires_at
FROM alerts a
JOIN stores s ON a.store_id = s.id
JOIN kpi_definitions kd ON a.kpi_definition_id = kd.id
WHERE a.status IN ('active', 'acknowledged')
ORDER BY a.escalation_level DESC, a.alert_date DESC;
```

### Check Tasks

```sql
SELECT
  s.name AS store_name,
  t.title,
  t.task_type,
  t.priority,
  t.assigned_to_name,
  t.status,
  t.due_date
FROM tasks t
JOIN stores s ON t.store_id = s.id
WHERE t.status IN ('pending', 'in_progress')
ORDER BY t.priority ASC, t.due_date ASC;
```

---

## Troubleshooting

### Issue: "No stores found"

**Solution:**
```bash
# Run the seeder
npm run db:seed
```

### Issue: "Connection refused" or database errors

**Solution:**
1. Check PostgreSQL is running: `pg_isready`
2. Verify database exists: `psql -l | grep store_health_ai`
3. Check .env configuration
4. Verify credentials work: `psql -U [user] -d store_health_ai`

### Issue: "Table doesn't exist"

**Solution:**
```bash
# Run migrations
npm run db:migrate

# Check migration status
npx sequelize-cli db:migrate:status
```

### Issue: "No historical data for baseline"

**Solution:**
The seeder creates 30 days of historical data. If missing:
```bash
# Re-run seeder
npm run db:seed:undo
npm run db:seed
```

---

## Test Data Overview

### Organizations
- **Dollar Tree Stores** - Multi-tenant organization

### Stores
1. **Dollar Tree - Manhattan 42nd St** (DT-001)
   - Manager: Alice Martinez
   - Phone: +1-555-0202

2. **Dollar Tree - Brooklyn Heights** (DT-002)
   - Manager: Robert Kim
   - Phone: +1-555-0204

3. **Dollar Tree - Queens Plaza** (DT-003)
   - Manager: Jennifer Lopez
   - Phone: +1-555-0206

### KPIs Tracked
1. **Sales Performance** - Daily sales vs rolling 4-week avg
2. **Store Traffic** - Customer count
3. **Conversion Rate** - % of visitors who purchase
4. **Labor Coverage** - Available hours vs required hours
5. **Out-of-Stock Rate** - % of top SKUs unavailable

### Thresholds (Per Spec)
- **Sales**: Green ≥-2%, Yellow -2% to -6%, Red <-6%
- **Traffic**: Green ≥-3%, Yellow -3% to -8%, Red <-8%
- **Conversion**: Green ≥-1.5pts, Yellow -1.5 to -3pts, Red >-3pts
- **Labor**: Green ≥95%, Yellow 90-94%, Red <90%
- **Inventory OOS**: Green <3%, Yellow 3-6%, Red >6%

---

## Next Steps After Testing

Once all tests pass:

1. ✅ **Option 1 Complete** - Business Logic Layer working
2. ⏭️ **Option 2** - Build REST API Layer
3. ⏭️ **Option 3** - Integrate AI Voice Calling (Twilio/Vapi)
4. ⏭️ **Option 4** - Build Dashboard UI

---

## Support

For issues or questions:
- Review [OPTION1_COMPLETE.md](./OPTION1_COMPLETE.md) for service documentation
- Check [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) for schema details
- Review [README.md](./README.md) for setup instructions
