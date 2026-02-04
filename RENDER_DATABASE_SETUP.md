# Render Database Setup Guide - Store Health AI

## Phase 1: Create PostgreSQL Database on Render

### Step 1: Create Database
1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **"New +"** → **"PostgreSQL"**
3. Configure database:
   - **Name**: `store-health-ai-db`
   - **Database**: `store_health_ai`
   - **User**: `store_health_user`
   - **Region**: `Oregon (US West)` (same as your service)
   - **PostgreSQL Version**: `16`
   - **Plan**: **Starter** ($7/month) or **Free** (expires in 90 days)
4. Click **"Create Database"**
5. Wait 2-3 minutes for database to provision

### Step 2: Get Database Connection String
1. Once created, click on your new database
2. Find **"Internal Database URL"** section
3. Copy the connection string (starts with `postgresql://`)
   ```
   postgresql://store_health_user:password@dpg-xxxxx-a.oregon-postgres.render.com/store_health_ai
   ```

### Step 3: Add DATABASE_URL to Your Service
1. Go to your **ringlypro-crm** service on Render
2. Click **"Environment"** tab
3. Add new environment variable:
   - **Key**: `DATABASE_URL`
   - **Value**: Paste the Internal Database URL you copied
4. Click **"Save Changes"**

---

## Phase 2: Deploy with Auto-Migration

### What Happens on Next Deploy:
The updated `build.sh` will automatically:
1. ✅ Run all 14 database migrations (creates 23 tables)
2. ✅ Seed database with **1 month of dummy data**:
   - 10 stores (Dollar Tree locations in NYC)
   - 5 KPIs per store (Sales, Labor, Conversion, Inventory, Traffic)
   - 1,500 KPI metrics (30 days × 10 stores × 5 KPIs)
   - 300 daily health snapshots
   - ~100 alerts and tasks

### Trigger Deployment:
**Option A: Commit and push** (triggers auto-deploy):
```bash
git add .
git commit -m "Add Store Health AI database setup and 1-month seeder

- Add database migrations to build.sh
- Create seeder with 30 days of realistic dummy data
- 10 stores, 5 KPIs, 1500+ metrics

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"
git push origin main
```

**Option B: Manual deploy** (from Render dashboard):
1. Go to your service → **"Manual Deploy"** → **"Deploy latest commit"**

---

## Phase 3: Verify Database Connection

### Check 1: Health Endpoint
Visit: https://aiagent.ringlypro.com/aiastore/health

**Expected Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-02-04T...",
  "uptime": 123.45,
  "database": "connected",
  "environment": "production"
}
```

### Check 2: Dashboard Overview
Visit: https://aiagent.ringlypro.com/aiastore/

**Expected**: Dashboard shows real data instead of zeros:
- Total Stores: 10
- Green/Yellow/Red counts
- Real metrics in charts
- Status should show "Connected" (not "Disconnected")

### Check 3: API Endpoints
Test the API:
```bash
# Get all stores
curl https://aiagent.ringlypro.com/aiastore/api/v1/stores

# Get dashboard overview
curl https://aiagent.ringlypro.com/aiastore/api/v1/dashboard/overview
```

---

## Troubleshooting

### Issue: "Database connection failed"
**Solution**:
1. Verify `DATABASE_URL` is set in Render environment
2. Check database is running (Render dashboard → Database → Status)
3. Check database user has correct permissions

### Issue: "Migrations failed"
**Solution**:
1. Check Render build logs for specific error
2. Common issues:
   - Database not accessible (check internal URL)
   - Missing sequelize-cli dependency (should auto-install)
   - Syntax error in migration file

### Issue: "Seeding failed"
**Solution**:
1. Seeding is non-critical - migrations are enough
2. You can manually seed later:
   ```bash
   # In Render Shell
   cd store-health-ai
   npx sequelize-cli db:seed --seed 20260204-one-month-data.js
   ```

### Issue: "Dashboard still shows Disconnected"
**Solution**:
1. Hard refresh browser (Cmd+Shift+R)
2. Check health endpoint first
3. Check browser console for API errors

---

## Database Schema Summary

### 23 Tables Created:
1. **organizations** - Top-level entity
2. **regions** - Regional subdivisions
3. **districts** - District subdivisions
4. **stores** - Individual store locations
5. **kpi_definitions** - KPI templates
6. **kpi_thresholds** - Status thresholds
7. **kpi_metrics** - Actual measurements
8. **store_health_snapshots** - Daily health rollups
9. **alerts** - Generated alerts
10. **tasks** - Action items
11. **escalations** - Escalation tracking
12. **escalation_rules** - Escalation rules
13. **ai_calls** - AI voice call records
14. **call_scripts** - Call scripts
15. **risk_predictions** - Predictive risk
16. **labor_schedules** - Labor scheduling
17. **labor_callouts** - Callout tracking
18. **inventory_levels** - Inventory levels
19. **out_of_stock_events** - Out-of-stock tracking
20. **system_config** - System configuration
21-23. **Additional supporting tables**

### Dummy Data Overview:
- **Organization**: Dollar Tree Stores
- **Stores**: 10 NYC locations (DT-001 through DT-010)
- **Date Range**: Last 30 days
- **KPIs**: Sales, Labor Hours, Conversion Rate, Inventory, Traffic
- **Metrics**: Realistic variance (70-120% of target)
- **Alerts**: Generated for red/yellow status
- **Tasks**: Action items for recent alerts

---

## Next Steps After Database Setup

1. ✅ Verify dashboard shows real data
2. Configure voice calling (ElevenLabs/Twilio)
3. Set up scheduled jobs (KPI calculations, alert checks)
4. Configure email/SMS alerts
5. Connect real data sources (POS, Labor, Inventory systems)

---

## Environment Variables Needed

### Required (for database):
```
DATABASE_URL=postgresql://user:pass@host/database
NODE_ENV=production
PORT=10000
```

### Optional (for full functionality):
```
# Voice Calling
ELEVENLABS_API_KEY=sk_xxxxx
ELEVENLABS_AGENT_ID=agent_xxxxx
ELEVENLABS_PHONE_NUMBER_ID=phnum_xxxxx

# Twilio (alternative)
TWILIO_ACCOUNT_SID=ACxxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx

# Alerts
ENABLE_SMS_ALERTS=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@example.com
SMTP_PASSWORD=app_password

# Scheduling
CRON_DAILY_KPI_CALCULATION=0 1 * * *
CRON_HOURLY_ALERT_CHECK=0 * * * *
```

---

## Ready to Deploy?

1. Create PostgreSQL database on Render ✅
2. Add DATABASE_URL to environment ✅
3. Commit and push changes ✅
4. Wait for auto-deploy (3-5 minutes)
5. Visit dashboard and verify data! 🎉
