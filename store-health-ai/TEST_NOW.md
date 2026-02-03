# 🧪 Test Store Health AI - Quick Start

## Run Tests in 5 Minutes

### Step 1: Setup (First Time Only)

```bash
cd store-health-ai
npm install
createdb store_health_ai
cp .env.example .env
```

**Edit `.env` with your database credentials:**
```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=store_health_ai
DB_USER=postgres
DB_PASSWORD=your_password
```

### Step 2: Initialize Database

```bash
npm run db:setup
```

This runs:
- ✓ All migrations (creates 20 tables)
- ✓ Seed data (3 stores, 5 KPIs, 30 days historical data)

### Step 3: Run Tests

```bash
npm test
```

---

## What You'll See

The test will run through 5 comprehensive scenarios:

### ✅ TEST 1: KPI Calculator Service
- Calculates KPIs with different values
- Determines Green/Yellow/Red status
- Shows variance calculations
- Batch processes multiple KPIs

**Sample Output:**
```
✓ Sales Performance: 13500 $
  Variance: +12.5% | Status: GREEN | Good sales day
✓ Store Traffic: 350
  Variance: -12.0% | Status: YELLOW | Low traffic
✓ Labor Coverage Ratio: 88 %
  Variance: -7.3% | Status: RED | Understaffed
✓ Conversion Rate: 35 %
  Variance: +5.0% | Status: GREEN | Good conversion
```

---

### ✅ TEST 2: Threshold Checker Service
- Checks store health
- Generates health snapshots
- Calculates health scores
- Creates dashboard overview

**Sample Output:**
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

Summary: Store requires immediate attention. Labor Coverage Ratio is
critical (-7.3% variance). Immediate action required.
```

---

### ✅ TEST 3: Alert Manager Service
- Creates alerts for threshold violations
- Generates tasks for store managers
- Sets SLA deadlines
- Demonstrates acknowledgment

**Sample Output:**
```
Alert #1: RED
  Severity: RED
  Title: 🔴 Labor Coverage Ratio 7.3% below target
  Escalation Level: 2
  Task Created: #1 (Due: 2026-02-03 23:59)
  Assigned to: Alice Martinez (store_manager)
```

---

### ✅ TEST 4: Escalation Engine Service
- Shows escalation history
- Lists pending escalations
- Demonstrates SLA monitoring

**Sample Output:**
```
NOTE: Escalation monitoring checks alert SLAs and escalates when needed.
In production, this runs every 15-30 minutes as a cron job.
For testing, alerts need to be 24+ hours old to trigger escalation.

✓ No escalations needed (all alerts within SLA)
```

---

### ✅ TEST 5: Complete Workflow Integration
- Full daily workflow simulation
- KPI → Health Check → Alerts → Escalation

**Sample Output:**
```
Step 1: Calculate today's KPIs for Dollar Tree - Queens Plaza...
  ✓ Calculated 4 KPIs

Step 2: Check store health...
  ✓ Store Status: RED
  ✓ Health Score: 62.5/100
  ✓ Escalation Level: 2

Step 3: Generate alerts for threshold violations...
  ✓ Created 2 new alerts
    - 🔴 Sales Performance 8.3% below target
    - 🟨 Store Traffic 5.0% below target

Step 4: Check for escalations (simulated)...
  ℹ️  In production, escalations trigger after SLA timeouts (24-48 hours)
  ℹ️  Current alerts are fresh, so no escalations expected yet
```

---

## Expected Test Results

At the end, you should see:

```
✅ All tests completed successfully!

Service Test Results:
  ✓ KPI Calculator: PASSED
  ✓ Threshold Checker: PASSED
  ✓ Alert Manager: PASSED
  ✓ Escalation Engine: PASSED
  ✓ Integration Workflow: PASSED

Next Steps:
  1. Review the alert and task records in the database
  2. Test escalation by manually aging alerts (update alert_date)
  3. Proceed to Option 2: Build REST API layer
  4. Proceed to Option 3: Integrate AI voice calling (Twilio/Vapi)
  5. Proceed to Option 4: Build Dashboard UI
```

---

## Verify in Database

After tests run, check the database:

```bash
psql store_health_ai
```

### Check Today's KPIs
```sql
SELECT
  s.name AS store,
  kd.name AS kpi,
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
  s.name AS store,
  shs.overall_status,
  shs.health_score,
  shs.escalation_level,
  shs.action_required
FROM store_health_snapshots shs
JOIN stores s ON shs.store_id = s.id
WHERE shs.snapshot_date = CURRENT_DATE;
```

### Check Active Alerts
```sql
SELECT
  s.name AS store,
  kd.name AS kpi,
  a.severity,
  a.status,
  a.title
FROM alerts a
JOIN stores s ON a.store_id = s.id
JOIN kpi_definitions kd ON a.kpi_definition_id = kd.id
WHERE a.status IN ('active', 'acknowledged')
ORDER BY a.severity DESC;
```

### Check Tasks
```sql
SELECT
  s.name AS store,
  t.title,
  t.assigned_to_name,
  t.status,
  t.due_date
FROM tasks t
JOIN stores s ON t.store_id = s.id
WHERE t.status = 'pending'
ORDER BY t.priority;
```

---

## Troubleshooting

### Error: "database does not exist"
```bash
createdb store_health_ai
```

### Error: "relation does not exist"
```bash
npm run db:migrate
```

### Error: "No stores found"
```bash
npm run db:seed
```

### Start Fresh
```bash
npm run db:reset
```

---

## What's Next?

After testing completes successfully:

### Option 2: REST API Layer
Build Express REST API with endpoints for:
- Store health status
- KPI metrics
- Alert management
- Task assignment
- Dashboard data

### Option 3: AI Voice Integration
Integrate Twilio/Vapi for:
- Automated Level 3 escalation calls
- Call script templating
- Response tracking
- Transcript logging

### Option 4: Dashboard UI
Build management interface with:
- Store health overview
- Alert inbox
- Task manager
- KPI trend charts
- Call history viewer

---

## Quick Reference

**Setup Database:**
```bash
npm run db:setup
```

**Run Tests:**
```bash
npm test
```

**Reset Everything:**
```bash
npm run db:reset
```

**Check Logs:**
All test output includes color-coded status indicators:
- 🟢 Green = Healthy/Passed
- 🟨 Yellow = Warning
- 🔴 Red = Critical/Failed

---

Ready to test? Run:
```bash
cd store-health-ai && npm run db:setup && npm test
```
