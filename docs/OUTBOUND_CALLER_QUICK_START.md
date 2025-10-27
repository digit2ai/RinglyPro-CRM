# Outbound Caller Quick Start Guide

## 🚀 How to Start the Automated Outbound Caller

### Prerequisites
- ✅ Prospects loaded in `business_directory` table with `call_status = 'TO_BE_CALLED'`
- ✅ Time: Between 9 AM - 5 PM EST, Monday-Friday
- ✅ Server deployed with latest code

---

## Starting the Scheduler

### Option 1: Using cURL (Command Line)

```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/start \
  -H "Content-Type: application/json" \
  -d '{"clientId": 15}'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Scheduler started successfully",
  "stats": {
    "totalProspects": 1049,
    "calledToday": 0,
    "remainingToday": 1049
  },
  "config": {
    "maxCallsPerDay": 200,
    "schedule": "*/2 9-17 * * 1-5"
  }
}
```

### Option 2: Using Your Browser

Open this URL in your browser:
```
https://ringlypro-crm.onrender.com/outbound-caller.html
```

Click the **"Start Automated Calling"** button.

### Option 3: Using Postman

1. Create a new POST request
2. URL: `https://ringlypro-crm.onrender.com/api/scheduled-caller/start`
3. Headers: `Content-Type: application/json`
4. Body (raw JSON):
```json
{
  "clientId": 15
}
```
5. Click **Send**

---

## Checking Status

### Check if Scheduler is Running

```bash
curl https://ringlypro-crm.onrender.com/api/scheduled-caller/status
```

**Response When Running:**
```json
{
  "isRunning": true,
  "isPaused": false,
  "isBusinessHours": true,
  "clientId": 15,
  "stats": {
    "totalProspects": 1049,
    "calledToday": 45,
    "remainingToday": 1004,
    "startedAt": "2025-10-27T14:00:00.000Z",
    "lastCallAt": "2025-10-27T15:30:00.000Z"
  },
  "config": {
    "maxCallsPerDay": 200,
    "schedule": "*/2 9-17 * * 1-5"
  },
  "nextCallTime": "Within 2 minutes"
}
```

**Response When Stopped:**
```json
{
  "isRunning": false,
  "isPaused": false,
  "isBusinessHours": true
}
```

---

## Stopping the Scheduler

### Stop Immediately

```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/stop
```

**Response:**
```json
{
  "success": true,
  "message": "Scheduler stopped",
  "finalStats": {
    "calledToday": 45
  }
}
```

### Pause (Can Resume Later)

```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/pause
```

### Resume After Pause

```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/resume
```

---

## Daily Operation Schedule

### What Happens Automatically

**9:00 AM EST** - Scheduler can be started (business hours begin)

**Every 2 Minutes** - Makes one call to next prospect in queue

**4:59 PM EST** - Scheduler stops (business hours end, before 5 PM)

**After 200 Calls** - Scheduler auto-pauses for the day

### What You Need to Do

**Each Morning at 9 AM:**
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/start \
  -H "Content-Type: application/json" \
  -d '{"clientId": 15}'
```

**That's it!** The scheduler handles everything else.

---

## Configuration Settings

Current settings (in `src/services/scheduled-auto-caller.js`):

```javascript
config: {
  schedule: '*/2 9-17 * * 1-5',  // Every 2 minutes, 9am-5pm EST, Mon-Fri
  timezone: 'America/New_York',
  minInterval: 2,                 // minutes between calls
  maxCallsPerHour: 30,           // safety limit
  maxCallsPerDay: 200            // hard limit
}
```

### What This Means:

| Setting | Value | Meaning |
|---------|-------|---------|
| **Schedule** | `*/2 9-17 * * 1-5` | Every 2 minutes, 9am-4:59pm, Mon-Fri |
| **Timezone** | `America/New_York` | Eastern Time (EST/EDT) |
| **Max Calls/Day** | 200 | Hard stop after 200 calls |
| **Max Calls/Hour** | 30 | Safety limit (not usually hit) |
| **Call Interval** | 2 minutes | Time between calls |

---

## Monitoring & Troubleshooting

### Check How Many Calls Made Today

```sql
-- In database
SELECT
  COUNT(*) FILTER (WHERE call_status = 'CALLED' AND DATE(last_called_at) = CURRENT_DATE) as called_today,
  COUNT(*) FILTER (WHERE call_status = 'TO_BE_CALLED') as remaining
FROM business_directory
WHERE client_id = 15;
```

### Check Server Logs

View live logs on Render dashboard:
```
https://dashboard.render.com
```

Look for:
- ✅ `🚀 Scheduled Auto-Caller started`
- ✅ `📞 Calling prospect: [name] ([phone])`
- ✅ `✅ Call initiated: [callSid]`
- ⚠️ `⚠️ Daily call limit reached (200)`
- ⏰ `⏰ Outside business hours, skipping call`

### Common Issues

#### Issue: "Scheduler is already running"
**Solution:** Stop it first, then start:
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/stop
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/start \
  -H "Content-Type: application/json" \
  -d '{"clientId": 15}'
```

#### Issue: "No prospects found with status TO_BE_CALLED"
**Solution:** Add prospects to the database first using Business Collector.

#### Issue: "Outside business hours"
**Solution:** Wait until 9 AM - 5 PM EST on a weekday (Mon-Fri).

#### Issue: Scheduler stopped unexpectedly
**Reasons:**
1. ✅ Reached 200 calls for the day (normal)
2. ✅ Ran out of prospects (normal)
3. ✅ Hit 5 PM EST (normal)
4. ❌ Server restarted (need to manually restart scheduler)

---

## Call Status Workflow

### Database Status Values

| Status | Meaning |
|--------|---------|
| `TO_BE_CALLED` | Queued, not yet called |
| `CALLED` | Successfully called |
| `FAILED` | Call attempt failed |
| `SKIPPED` | Manually skipped |

### What Happens During a Call

1. **Fetch Next Prospect**
   ```sql
   SELECT * FROM business_directory
   WHERE call_status = 'TO_BE_CALLED' AND client_id = 15
   ORDER BY created_at ASC
   LIMIT 1
   ```

2. **Make Call via Twilio**
   - Rachel Premium Voice delivers voicemail
   - TCPA-compliant message played

3. **Update Database**
   ```sql
   UPDATE business_directory
   SET call_status = 'CALLED',
       call_attempts = call_attempts + 1,
       last_called_at = CURRENT_TIMESTAMP,
       call_result = 'voicemail'
   WHERE id = [prospect_id]
   ```

4. **Increment Counter**
   - `calledToday` increases by 1
   - Check if limit (200) reached

---

## Daily Checklist

### Morning (9:00 AM EST)
- [ ] Check Render deployment is running
- [ ] Start scheduler via API
- [ ] Verify first call goes through (check logs)

### Midday (12:00 PM EST)
- [ ] Check status API - verify calls are being made
- [ ] Monitor call success rate in database
- [ ] Check for any error logs

### Afternoon (4:00 PM EST)
- [ ] Check how many calls made today
- [ ] Verify scheduler will stop by 5 PM
- [ ] Review any failed calls

### End of Day (5:00 PM EST)
- [ ] Confirm scheduler stopped
- [ ] Review final statistics
- [ ] Check total prospects called vs remaining

---

## Performance Expectations

### Typical Day (8 hours, 9am-5pm)

**Maximum Possible:**
- 8 hours × 30 calls/hour = 240 calls

**Actual Limit:**
- Hard capped at **200 calls**

**Timeline:**
```
9:00 AM  - Call #1
9:02 AM  - Call #2
...
~4:30 PM - Call #200 (auto-stop)
```

**Pace:**
- 25 calls per hour (200 ÷ 8 hours)
- 1 call every 2.4 minutes

---

## Safety Features

✅ **Time Restrictions**
- Only 9 AM - 4:59 PM EST
- Monday - Friday only
- No weekend calling

✅ **Call Limits**
- 200 calls per day maximum
- 30 calls per hour maximum
- 2 minute minimum between calls

✅ **Duplicate Prevention**
- Won't call same number twice
- Updates status after each call
- Queues oldest prospects first

✅ **TCPA Compliance**
- Voicemail includes opt-out instructions
- Callback number provided (813-212-4888)
- "Reply STOP" option mentioned

---

## Quick Reference Commands

```bash
# Start calling
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/start \
  -H "Content-Type: application/json" \
  -d '{"clientId": 15}'

# Check status
curl https://ringlypro-crm.onrender.com/api/scheduled-caller/status

# Stop calling
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/stop

# Pause (can resume)
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/pause

# Resume after pause
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/resume
```

---

## Support & Documentation

- **Main Docs:** `/docs/AI_COPILOT_BUTTON_FIX.md`
- **Architecture:** `SYSTEM_ARCHITECTURE.md`
- **Code:** `src/services/scheduled-auto-caller.js`
- **Routes:** `src/routes/scheduled-caller.js`

---

**Last Updated:** 2025-10-27
**Status:** ✅ Production Ready
**Daily Limit:** 200 calls
**Hours:** 9 AM - 5 PM EST, Mon-Fri
