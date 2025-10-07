# Update Twilio Webhooks for All Numbers

## Issue
Only +18886103810 is working with the bilingual appointment booking system. The other two numbers (+12232949184 and +12603688369) need their Twilio webhooks updated.

## Solution
All three numbers need to have their Voice Webhook URL set to:
```
https://aiagent.ringlypro.com/voice/rachel/
```

## Steps to Update

1. **Log in to Twilio Console**
   - Go to: https://console.twilio.com
   - Login with your credentials

2. **Navigate to Phone Numbers**
   - Click "Phone Numbers" in the left sidebar
   - Click "Manage" → "Active Numbers"

3. **Update Each Number**

   For **each** of these three numbers:
   - `+1 (888) 610-3810` ✅ Already configured
   - `+1 (223) 294-9184` ⚠️ Needs update
   - `+1 (260) 368-8369` ⚠️ Needs update

   Do the following:

   a. Click on the phone number

   b. Scroll down to "Voice Configuration"

   c. Under "A CALL COMES IN", set:
      - **Webhook URL**: `https://aiagent.ringlypro.com/voice/rachel/`
      - **HTTP Method**: `POST`

   d. Under "PRIMARY HANDLER FAILS" (optional but recommended):
      - **Fallback URL**: `https://aiagent.ringlypro.com/voice/rachel/`
      - **HTTP Method**: `POST`

   e. Click **Save** at the bottom

4. **Test Each Number**
   - Call each number from your phone
   - You should hear Rachel's bilingual greeting
   - Press 1 for English or 2 for Spanish
   - Complete the appointment booking flow

## Expected Behavior After Update

All three numbers should:
1. Answer with Rachel's bilingual greeting
2. Allow language selection (1 for English, 2 for Spanish)
3. Route to appropriate voice (Rachel or Lina)
4. Collect name, phone, and date/time
5. Confirm appointment booking

## Verification

After updating, check Render logs while calling each number:
```
✅ Client identified: [Business Name] (ID: [number])
✅ Initial session saved for client [number]
✅ Rachel audio generated successfully
```

If you see these logs, the number is working correctly!

## Troubleshooting

If a number still doesn't work:
1. Check that the webhook URL doesn't have a trailing space
2. Verify HTTP method is POST (not GET)
3. Check Twilio's debugger for webhook errors: https://console.twilio.com/us1/monitor/logs/debugger
4. Make sure the number is in the database (run `node check-and-add-clients.js`)
