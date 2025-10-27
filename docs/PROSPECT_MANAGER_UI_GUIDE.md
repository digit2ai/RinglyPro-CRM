# Prospect Manager UI - Complete Guide

## Access the UI

**URL:** https://aiagent.ringlypro.com/mcp-copilot/prospect-manager.html?client_id=15

The UI will automatically:
- Set your Client ID to 15
- Load current scheduler status
- Display your prospect list
- Auto-refresh status every 5 seconds

---

## UI Overview

The Prospect Manager has two main sections:

### 1. **Scheduler Controls** (Top)
- Status indicator (green = running, gray = stopped, yellow = paused)
- Real-time statistics
- Start/Stop/Pause/Resume buttons
- Progress bar
- Configuration details

### 2. **Prospect List** (Bottom)
- Searchable table of all prospects
- Filter by status (To Be Called, Called, Failed, etc.)
- Pagination controls
- Real-time updates

---

## Tomorrow's Workflow (UI Version)

### **Morning - 9:00 AM EST**

**Step 1: Open Prospect Manager**
1. Navigate to: https://aiagent.ringlypro.com/mcp-copilot/prospect-manager.html?client_id=15
2. You'll see the dashboard with your Client ID (15) pre-filled

**Step 2: Check Your Prospects**
1. Look at the "Total Prospects" card
2. It should show a number (e.g., 1,049 prospects)
3. Scroll down to the prospect list
4. Verify prospects have status "TO_BE_CALLED"

**Step 3: Start the Scheduler**
1. Click the **"▶️ Start Scheduler"** button at the top
2. You'll see a green notification: "✅ Scheduler started successfully!"
3. The status indicator turns **GREEN** and says "Running"
4. Statistics start updating automatically

**Step 4: Monitor Progress**
- Watch the "Called Today" number increase (updates every 5 seconds)
- Progress bar fills as calls are made
- "Remaining" shows how many prospects are left
- "Next Call" shows when the next call will be made (every 2 minutes)

### **During the Day - Monitor**

**What You'll See:**

✅ **When Running Normally:**
- Status: **Green dot** - "Running"
- "Called Today" increases every 2 minutes
- "Remaining Today" counts down (stops at 0 or 200 max)
- Prospect list updates - status changes from "TO_BE_CALLED" to "CALLED"

✅ **Success Indicators:**
- Different phone numbers in Twilio dashboard
- Status changes to "CALLED" in prospect list
- Progress bar fills up
- No error notifications

❌ **Problem Indicators:**
- Status stays green but "Called Today" doesn't increase
- Same phone number called repeatedly (check Twilio)
- Error notifications appear (red)

**Troubleshooting:**
1. Click **"🔄 Refresh"** to reload prospect list
2. Check server logs for "(1 rows affected)" message
3. If stuck, click **"⏹️ Stop"** then **"▶️ Start Scheduler"** again

### **Afternoon - 5:00 PM EST**

**Stop the Scheduler:**
1. Click the **"⏹️ Stop"** button
2. Confirm the popup: "Are you sure you want to stop the scheduler?"
3. Status changes to **Gray** - "Stopped"
4. Note the final "Called Today" count (should be ≤ 200)

---

## Button Guide

### **Start Scheduler** (Green Button)
- Starts automated calling
- Only enabled when scheduler is stopped
- Begins calling prospects with status "TO_BE_CALLED"
- Respects business hours (9am-5pm EST, Mon-Fri)

### **Pause** (Yellow Button)
- Temporarily pauses calling
- Maintains current position in queue
- Only enabled when scheduler is running
- Use when you need to stop briefly without losing progress

### **Resume** (Green Button)
- Continues from where you paused
- Only enabled when scheduler is paused
- Picks up where it left off

### **Stop** (Red Button)
- Completely stops the scheduler
- Resets progress counters
- Only enabled when scheduler is running or paused
- Use at end of day (5pm)

---

## Statistics Explained

| Statistic | What It Means |
|-----------|---------------|
| **Total Prospects** | Number of prospects with "TO_BE_CALLED" status in your database |
| **Called Today** | Number of calls made since you started today (resets when you stop) |
| **Remaining** | How many more calls allowed today (200 max - Called Today) |
| **Next Call** | Time until next call (every 2 minutes) or status message |

---

## Filters (Optional)

You can filter which prospects to call:

**Location Filter:**
- Enter a location like "Tampa, FL"
- Only calls prospects in that location

**Category Filter:**
- Enter a category like "pool service"
- Only calls prospects in that category

Leave blank to call all prospects with "TO_BE_CALLED" status.

---

## Status Badge Colors

In the prospect list, you'll see colored badges:

- **Blue** - `TO_BE_CALLED` - Ready to be called
- **Green** - `CALLED` - Successfully called
- **Red** - `FAILED` - Call failed
- **Gray** - `SKIPPED` - Manually skipped

---

## Auto-Stop Conditions

The scheduler will automatically stop if:

1. **Daily limit reached** - 200 calls made today
2. **No more prospects** - All prospects have been called
3. **Outside business hours** - After 5pm or before 9am EST
4. **Weekend** - Saturday or Sunday

When auto-stopped, you'll see a notification explaining why.

---

## Real-Time Updates

The UI automatically refreshes:
- **Status**: Every 5 seconds
- **Statistics**: Every 5 seconds
- **Prospect list**: Click "🔄 Refresh" button manually

---

## Notifications

You'll see popup notifications in the top-right:

- **Green** = Success (✅ Scheduler started)
- **Red** = Error (❌ Failed to start)
- **Blue** = Info (📊 Loading prospects)

Notifications auto-dismiss after 3 seconds.

---

## Mobile Responsive

The UI works on mobile devices:
- All buttons are touch-friendly
- Tables scroll horizontally on small screens
- Status updates work the same way

---

## Security Features

✅ **Client ID Locked** - Your Client ID (15) is locked and cannot be changed
✅ **Multi-Tenant Isolation** - You only see your prospects (client_id = 15)
✅ **No Cross-Client Access** - Cannot accidentally call another client's prospects

---

## FAQ

**Q: Can I leave the page open while it runs?**
A: Yes! The scheduler runs on the server. You can close the page and it will keep running. Open the page again to check status.

**Q: What happens if I refresh the page?**
A: Nothing bad! The page reloads and reconnects to the scheduler. If it was running, it will still show as running.

**Q: Can I start multiple schedulers?**
A: No. If you click "Start" while one is running, it will stop the old one and start a new one.

**Q: Will it automatically restart tomorrow?**
A: No. You must manually click "Start Scheduler" each day at 9am.

**Q: What if my computer goes to sleep?**
A: The scheduler runs on the server, not your computer. It will keep running even if your computer sleeps.

**Q: How do I know if it's working correctly?**
A: Check these signs:
- Status is green
- "Called Today" increases every 2 minutes
- Different phone numbers in Twilio dashboard
- Prospects change from "TO_BE_CALLED" to "CALLED" in the list

---

## Quick Reference

**URL:** https://aiagent.ringlypro.com/mcp-copilot/prospect-manager.html?client_id=15

**Schedule:** Every 2 minutes, 9am-5pm EST, Monday-Friday

**Daily Limit:** 200 calls per day

**Start Command:** Click "▶️ Start Scheduler" button

**Stop Command:** Click "⏹️ Stop" button

**Monitor:** Watch "Called Today" stat increase every 2 minutes

**Expected Duration:** ~6.5 hours (200 calls ÷ 30 calls/hour)

---

## Support

If you encounter issues:
1. Check Twilio dashboard for call logs
2. Check server logs at Render.com
3. Look for "(1 rows affected)" in logs (confirms database update)
4. If duplicate calls, restart the scheduler (Stop → Start)

---

**You're all set! The UI is ready for tomorrow's calling session.**
