# Twilio Call Tracking Setup - Credit Deduction

## 🚨 Issue: Credits Not Deducting After Calls

Your account shows 615 minutes, but after a 3-minute call, the credits aren't deducting.

**Root Cause:** Twilio isn't sending statusCallback webhooks when calls end.

---

## ✅ Solution: Configure StatusCallback in Twilio

### **Step 1: Log into Twilio Console**

1. Go to: https://console.twilio.com
2. Navigate to: **Phone Numbers** → **Manage** → **Active Numbers**
3. Click on your RinglyPro number: `+18886103810`

### **Step 2: Add StatusCallback URL**

Scroll down to **Voice Configuration** section:

1. **Status Callback URL:**
   ```
   https://aiagent.ringlypro.com/webhook/twilio/voice
   ```

2. **Status Callback Method:**
   ```
   HTTP POST
   ```

3. **Status Callback Events** (Select all):
   - ☑️ initiated
   - ☑️ ringing
   - ☑️ answered
   - ☑️ **completed** (Most important!)

4. **Click:** Save

---

## 🔄 How It Works After Setup:

### **Call Flow:**
1. Customer calls your RinglyPro number
2. Call connects → Rachel AI answers
3. Conversation happens
4. **Call ends** → Twilio sends webhook to: `https://aiagent.ringlypro.com/webhook/twilio/voice`
5. Backend receives:
   ```json
   {
     "CallSid": "CAxxxx",
     "CallDuration": "180",  // 3 minutes = 180 seconds
     "CallStatus": "completed"
   }
   ```
6. **Credit system calculates:**
   - Duration: 180 seconds = 3 minutes
   - Cost: 3 min × $0.20/min = $0.60
   - Deducts from balance or free tier
7. **Database updated:**
   - `usage_records` table gets new entry
   - `credit_accounts.total_minutes_used` increases by 3
   - Balance reduces by $0.60 (if no free minutes)

---

## 📊 Current Credit System Logic

From [src/services/creditSystem.js](src/services/creditSystem.js):

### **Free Tier First:**
- **100 free minutes/month** per client
- Resets on 1st of each month
- After free tier exhausted → charges paid balance

### **Calculation (3-minute call example):**

**Scenario 1: Has Free Minutes**
```
Free minutes remaining: 100
Call duration: 3 minutes
→ Use 3 free minutes
→ Free minutes remaining: 97
→ Balance unchanged
```

**Scenario 2: No Free Minutes**
```
Free minutes remaining: 0
Call duration: 3 minutes
Per-minute rate: $0.20
→ Cost = 3 × $0.20 = $0.60
→ Deduct $0.60 from balance
```

**Scenario 3: Partial Free Minutes**
```
Free minutes remaining: 1
Call duration: 3 minutes
→ Use 1 free minute (free)
→ Charge 2 minutes × $0.20 = $0.40
→ Deduct $0.40 from balance
```

---

## 🧪 Testing After Setup

### **Test 1: Make a Short Call**
1. Call your RinglyPro number
2. Talk to Rachel for ~1 minute
3. Hang up
4. Check logs for: `Tracked call CAxxxx: XX seconds for client 1`
5. Verify balance decreased (or free minutes used)

### **Test 2: Check Database**
```sql
-- Check recent usage
SELECT * FROM usage_records
WHERE client_id = 1
ORDER BY created_at DESC
LIMIT 5;

-- Check current balance
SELECT * FROM credit_accounts
WHERE client_id = 1;
```

---

## 🔍 Webhook Endpoint Details

**URL:** `https://aiagent.ringlypro.com/webhook/twilio/voice`

**Expected Request from Twilio:**
```http
POST /webhook/twilio/voice
Content-Type: application/x-www-form-urlencoded

CallSid=CAxxxxxxxxxxxx
CallDuration=180
To=+18886103810
From=+1234567890
CallStatus=completed
```

**Backend Response:**
```xml
<Response></Response>
```

**What Happens:**
- Extracts `CallSid`, `CallDuration`, `CallStatus`
- If status = "completed" → calculates cost
- Calls `creditSystem.trackUsage()` → deducts credits
- Logs: `Tracked call CAxxxx: 180 seconds for client 1`

---

## ⚠️ Important Notes

1. **StatusCallback must be configured in Twilio Dashboard** - TwiML can't set it for inbound calls
2. **Webhook only fires when call status = "completed"**
3. **Current limitation:** Hardcoded to client ID 1 (will be fixed for multi-tenant)
4. **URL must be publicly accessible** (https://aiagent.ringlypro.com ✅)

---

## 🐛 Troubleshooting

### Issue: Still No Credits Deducting

**Check 1: Twilio Debugger**
- Go to: https://console.twilio.com/monitor/debugger
- Look for webhook errors
- Check if webhook URL is being called

**Check 2: Backend Logs**
- Check Render logs for: "Tracked call"
- If no logs → webhook not reaching backend

**Check 3: Database**
```sql
SELECT * FROM usage_records WHERE call_sid = 'CAxxxx';
```

**Check 4: Verify URL**
```bash
curl -X POST https://aiagent.ringlypro.com/webhook/twilio/voice \
  -d "CallSid=TEST123" \
  -d "CallDuration=60" \
  -d "CallStatus=completed"
```
Should return: `<Response></Response>`

---

## ✅ Setup Complete Checklist

- [ ] StatusCallback URL configured in Twilio phone number settings
- [ ] StatusCallback events include "completed"
- [ ] StatusCallback method is POST
- [ ] Made test call and verified webhook fires
- [ ] Checked backend logs for "Tracked call" message
- [ ] Verified database usage_records has new entry
- [ ] Confirmed balance/free minutes decreased

---

**After completing setup, your credits will automatically deduct when calls end!** 🎉
