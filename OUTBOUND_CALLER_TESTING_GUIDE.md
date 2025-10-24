# Outbound Caller Testing Guide

## 🧪 Quick Test Plan

### **Prerequisites**
✅ Twilio credentials configured in Render environment
✅ `TWILIO_PHONE_NUMBER=+12396103810`
✅ `AGENT_PHONE_NUMBER=+12396103810`
✅ Deployment complete

---

## 📋 Test Scenario 1: Collect Leads & Test Outbound Caller Button

### **Step 1: Open AI Copilot**
Navigate to: https://aiagent.ringlypro.com/mcp-copilot

### **Step 2: Connect Business Collector**
Click: **"Connect to Business Collector"**

Expected result:
```
✅ Business Collector Connected!
Ready to collect business leads.
```

### **Step 3: Collect Test Leads**
Type: **"Collect lawyers in Tampa"**

Expected result:
```
Found 100 lawyers in Tampa!

[List of businesses with names, phones, addresses...]

Suggestions:
- Export results to CSV
- Outbound Caller
```

### **Step 4: Click "Outbound Caller" Button**

Expected result:
```
📞 Outbound Caller Ready!

✅ 95 leads with phone numbers loaded
🎯 Auto-calling with 2-minute intervals
🤖 Machine detection included

⚠️ Important:
• Human answers → Directly connected to GHL Voice Bot
• Voicemail detected → Rachel AI leaves professional message
• Each call from +12396103810

Ready to start calling?

Suggestions:
- Start calling now
- View call settings
- Export to CSV instead
```

### **Step 5: Start Calling (CAUTION: This will make real calls!)**

**⚠️ IMPORTANT**: Only do this during business hours (9 AM - 5 PM local time)

Type: **"Start calling now"**

Expected result:
```
🚀 Auto-Calling Started!

📊 Status:
• Total leads: 95
• Interval: 2 minutes
• Currently calling lead #1

🎯 Calls will continue automatically every 2 minutes.

You can stop calling at any time.

Suggestions:
- Stop calling
- Check status
- View call logs
```

### **Step 6: Check Status**

Type: **"Check status"**

Expected result:
```
📊 Calling Status:

✅ Auto-calling is ACTIVE
• Current: Lead #3 of 95
• Completed: 3 calls
• Remaining: 92 leads
• Interval: 2 minutes

🎯 Next call in ~2 minutes

Suggestions:
- Stop calling
- View call logs
```

### **Step 7: Stop Calling**

Type: **"Stop calling"**

Expected result:
```
⏸️ Auto-Calling Stopped!

📊 Summary:
• Calls made: 3
• Total leads: 95
• Remaining: 92

You can restart calling anytime.

Suggestions:
- Start calling now
- View call logs
- Export to CSV
```

---

## 📋 Test Scenario 2: Verify Call Flow

### **When a Business Answers (Human Detected):**

**What Happens:**
1. System calls from +12396103810
2. Business answers: "Hello?"
3. System immediately forwards to +12396103810 (your GHL Voice Bot)
4. GHL Voice Bot takes over the conversation
5. No "press 1" prompt - seamless handoff

**Twilio Call Flow:**
```
Your System → Dials Lead
Lead Answers (Human)
Twilio Detects: "human"
System: <Dial>+12396103810</Dial>
GHL Voice Bot: "Hello! [Your GHL script...]"
```

### **When Voicemail is Detected:**

**What Happens:**
1. System calls from +12396103810
2. Voicemail picks up: "You've reached..."
3. Twilio detects voicemail beep
4. Rachel AI speaks: "Hello, this is a message from RinglyPro. We wanted to reach out regarding your business. Please call us back at your convenience. Thank you."
5. System hangs up and moves to next lead

**Twilio Call Flow:**
```
Your System → Dials Lead
Voicemail Answers (Machine)
Twilio Detects: "machine_end_beep"
Rachel AI: [Leaves message]
Hangup
Next Lead in 2 minutes
```

---

## 📋 Test Scenario 3: API Testing (Direct)

### **Test 1: Check Status**
```bash
curl https://ringlypro-crm.onrender.com/api/outbound-caller/status
```

Expected:
```json
{
  "success": true,
  "isRunning": false,
  "currentIndex": 0,
  "totalLeads": 0,
  "callsMade": 0,
  "remaining": 0,
  "recentLogs": [],
  "intervalMinutes": 2
}
```

### **Test 2: Make Single Test Call**
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/outbound-caller/call \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1YOUR_TEST_NUMBER",
    "leadData": {
      "name": "Test Call",
      "category": "Test"
    }
  }'
```

Expected:
```json
{
  "success": true,
  "callSid": "CAxxxxxxxxxxxx",
  "phone": "+1YOUR_TEST_NUMBER",
  "status": "queued"
}
```

### **Test 3: Start Auto-Calling (Small Test)**
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/outbound-caller/start \
  -H "Content-Type: application/json" \
  -d '{
    "leads": [
      {"business_name": "Test 1", "phone": "+1YOUR_TEST_NUMBER"},
      {"business_name": "Test 2", "phone": "+1ANOTHER_TEST_NUMBER"}
    ],
    "intervalMinutes": 0.5
  }'
```

Expected:
```json
{
  "success": true,
  "totalLeads": 2,
  "intervalMinutes": 0.5,
  "status": "started"
}
```

### **Test 4: Stop Calling**
```bash
curl -X POST https://ringlypro-crm.onrender.com/api/outbound-caller/stop
```

Expected:
```json
{
  "success": true,
  "status": "stopped",
  "callsMade": 2,
  "totalLeads": 2,
  "wasCalling": true
}
```

---

## 🔍 Monitoring & Debugging

### **Check Twilio Call Logs**
1. Go to: https://console.twilio.com/us1/monitor/logs/calls
2. Filter by: From Number = +12396103810
3. Look for recent calls
4. Check call status and duration

### **Check Server Logs**
```bash
# On Render dashboard
# Click on your RinglyPro-CRM service
# Click "Logs" tab
# Search for: [OUTBOUND]
```

Expected logs:
```
[OUTBOUND] Making call to +18134893222
[OUTBOUND] Call initiated: CA123456 to +18134893222
[OUTBOUND] Human answered - forwarding to GHL Voice Bot at +12396103810
[OUTBOUND] Call status updated: CA123456 - answered
```

### **Check for Errors**
Look for:
- ❌ "Twilio not configured"
- ❌ "Invalid phone number"
- ❌ "Call failed"

---

## ✅ Success Criteria

### **Outbound Caller is Working If:**
- ✅ Status endpoint returns valid JSON
- ✅ Single test call goes through successfully
- ✅ Call appears in Twilio call logs
- ✅ When human answers, call forwards to GHL
- ✅ When voicemail detected, Rachel leaves message
- ✅ Auto-calling runs with 2-minute intervals
- ✅ Stop calling works immediately
- ✅ No errors in server logs

---

## 🚨 Common Issues & Solutions

### **Issue 1: "Twilio not configured"**
**Solution**: Check environment variables in Render
```
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE_NUMBER=+12396103810
AGENT_PHONE_NUMBER=+12396103810
```

### **Issue 2: Calls not connecting**
**Solution**:
1. Verify phone number format: +1XXXXXXXXXX
2. Check Twilio debugger for specific error
3. Verify +12396103810 is voice-enabled

### **Issue 3: GHL Voice Bot not answering**
**Solution**:
1. Make a manual call to +12396103810
2. Verify GHL picks up correctly
3. Check TwiML Bin configuration in Twilio

### **Issue 4: Voicemail detection not working**
**Solution**:
1. Machine detection enabled in code (already done)
2. Increase timeout if needed (currently 5000ms)
3. Check Twilio call logs for AnsweredBy field

### **Issue 5: Calls stopping unexpectedly**
**Solution**:
1. Check server didn't crash (Render logs)
2. Verify interval isn't cleared
3. Look for uncaught errors in logs

---

## 📊 Test Results Checklist

After testing, verify:

- [ ] Business Collector connects successfully
- [ ] Leads collected with phone numbers
- [ ] "Outbound Caller" button appears
- [ ] Clicking button shows "Ready" message
- [ ] "Start calling now" begins auto-calling
- [ ] First call made immediately
- [ ] Subsequent calls every 2 minutes
- [ ] Human answers → GHL Voice Bot picks up
- [ ] Voicemail → Rachel leaves message
- [ ] "Check status" shows correct progress
- [ ] "Stop calling" works immediately
- [ ] Call logs visible in Twilio
- [ ] No errors in Render logs

---

## 🎯 Quick Start (Minimal Test)

**If you just want to verify it works:**

1. Open: https://aiagent.ringlypro.com/mcp-copilot
2. Connect Business Collector
3. Type: "Collect lawyers in Tampa"
4. Click: "Outbound Caller"
5. Look for: "📞 Outbound Caller Ready!" message

**If you see that message with lead counts, it's working!** ✅

---

## ⚠️ SAFETY REMINDERS

1. **Only test during business hours** (9 AM - 5 PM local time)
2. **Use your own test number first** before calling real businesses
3. **Start small** - Test with 2-3 numbers first
4. **Monitor closely** - Watch Twilio logs and server logs
5. **Stop immediately** if anything seems wrong
6. **Respect regulations** - TCPA compliance, do-not-call lists

---

## 📞 Support

If you encounter issues:
1. Check Twilio debugger: https://console.twilio.com/debugger
2. Check Render logs: Render dashboard → Logs
3. Verify environment variables
4. Test with single call first
5. Review this guide's troubleshooting section

---

**Ready to test? Start with the Quick Start section above!** 🚀
