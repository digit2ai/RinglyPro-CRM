# Daily Calling Routine - Manual Operation

## Your Daily Workflow

### Morning (9:00 AM EST) - START
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
    "calledToday": 0,
    "remainingToday": [number of prospects]
  }
}
```

---

### Afternoon (5:00 PM EST) - STOP
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/stop
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Scheduler stopped",
  "finalStats": {
    "calledToday": [number of calls made today]
  }
}
```

---

### Next Day (9:00 AM EST) - RESUME
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/start \
  -H "Content-Type: application/json" \
  -d '{"clientId": 15}'
```

**Note:** Counter resets to 0, you get another 200 calls for the day.

---

## Business Collector (Your Job - Anytime)

### Add New Prospects
Use Business Collector in AI Copilot interface whenever you want:
1. Click **"Business Collector"** button
2. Select category (e.g., "pool cleaning service")
3. Select state and city
4. Click **"Collect Leads"**
5. Businesses automatically get `call_status = 'TO_BE_CALLED'`

### Scheduler Will Call Them
- All businesses with `call_status = 'TO_BE_CALLED'` will be called
- Oldest prospects called first
- 200 calls per day maximum
- Automatically stops at 5 PM or after 200 calls

---

## Weekly Schedule

| Day | Action |
|-----|--------|
| **Monday 9 AM** | Start scheduler |
| **Monday 5 PM** | Stop scheduler |
| **Tuesday 9 AM** | Start scheduler (fresh 200-call limit) |
| **Tuesday 5 PM** | Stop scheduler |
| **Wednesday 9 AM** | Start scheduler (fresh 200-call limit) |
| **Wednesday 5 PM** | Stop scheduler |
| **Thursday 9 AM** | Start scheduler (fresh 200-call limit) |
| **Thursday 5 PM** | Stop scheduler |
| **Friday 9 AM** | Start scheduler (fresh 200-call limit) |
| **Friday 5 PM** | Stop scheduler |
| **Saturday-Sunday** | No calling (automatically blocked) |

---

## Quick Commands Reference

### Start
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/start \
  -H "Content-Type: application/json" \
  -d '{"clientId": 15}'
```

### Stop
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/stop
```

### Check Status
```bash
curl https://ringlypro-crm.onrender.com/api/scheduled-caller/status
```

### Pause (if needed during the day)
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/pause
```

### Resume (after pause)
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/resume
```

---

## What Happens Automatically

✅ **Calls every 2 minutes** (during business hours)
✅ **Stops at 200 calls** for the day
✅ **Won't call same number twice** (updates to `CALLED` status)
✅ **Calls oldest prospects first** (ordered by `created_at`)
✅ **Works independently** from Business Collector

---

## Separation of Duties

### Your Responsibility
- 📋 Use Business Collector to add prospects anytime
- 🕐 Start scheduler at 9 AM each weekday
- 🕔 Stop scheduler at 5 PM each weekday

### System's Responsibility
- 📞 Call all `TO_BE_CALLED` prospects automatically
- ⏱️ Make calls every 2 minutes
- 🛑 Stop after 200 calls or at 5 PM
- 📊 Track call status in database

---

## Expected Daily Results

**Typical Day:**
- Start: 9:00 AM → 0 calls made
- End: 5:00 PM → ~200 calls made
- Duration: 8 hours
- Pace: 25 calls/hour

**With 1,049 Prospects:**
- Day 1: 200 calls (849 remaining)
- Day 2: 200 calls (649 remaining)
- Day 3: 200 calls (449 remaining)
- Day 4: 200 calls (249 remaining)
- Day 5: 200 calls (49 remaining)
- Day 6: 49 calls (0 remaining)

**Then add more prospects with Business Collector!**

---

## Tomorrow's Plan

### Step 1: Add Prospects (Now or Tomorrow Morning)
- Use Business Collector to find businesses
- Add them to your queue

### Step 2: Start Calling (9:00 AM)
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/start \
  -H "Content-Type: application/json" \
  -d '{"clientId": 15}'
```

### Step 3: Monitor (Optional)
```bash
curl https://ringlypro-crm.onrender.com/api/scheduled-caller/status
```

### Step 4: Stop at 5 PM
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/scheduled-caller/stop
```

### Step 5: Repeat Tomorrow

---

## Notes

- Counter resets each time you start (fresh 200 calls daily)
- You can add prospects anytime, even while scheduler is running
- New prospects get queued and will be called in order
- System automatically skips weekends
- System automatically enforces 9am-5pm EST window

---

**Last Updated:** 2025-10-27
**Mode:** Manual Daily Operation
**Daily Limit:** 200 calls
**Your Job:** Feed prospects, Start/Stop scheduler
**System's Job:** Make calls automatically during business hours
