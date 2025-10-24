# Outbound Caller Integration - RinglyPro CRM

## Overview

The Outbound Caller system has been fully integrated into RinglyPro CRM, allowing users to automatically call leads collected from the Business Collector directly from the AI Copilot interface.

## Architecture

### Core Components

1. **Outbound Caller Service** ([src/services/outbound-caller.js](src/services/outbound-caller.js))
   - Twilio integration for making outbound calls
   - Phone number validation (US format, invalid area codes, test numbers)
   - Auto-calling with configurable intervals (default: 2 minutes)
   - Machine detection (voicemail vs human)
   - Call status tracking and logging
   - Graceful cleanup on shutdown

2. **Outbound Caller Routes** ([src/routes/outbound-caller.js](src/routes/outbound-caller.js))
   - `POST /api/outbound-caller/call` - Make single call
   - `POST /api/outbound-caller/start` - Start auto-calling
   - `POST /api/outbound-caller/stop` - Stop auto-calling
   - `GET /api/outbound-caller/status` - Get calling status
   - `POST /api/outbound-caller/voice` - Twilio voice webhook (TwiML)
   - `POST /api/outbound-caller/gather` - Handle user input (press 1/2)
   - `POST /api/outbound-caller/call-status` - Call status updates
   - `GET /api/outbound-caller/logs` - Get call logs

3. **MCP Integration** ([src/routes/mcp.js](src/routes/mcp.js))
   - Intent detection for outbound calling
   - Session management for collected leads
   - Natural language interface for calling controls

## User Flow

### 1. Collect Leads from Business Collector

```
User: "Collect Real Estate Agents in Tampa"
AI: "Found 100 Real Estate Agents in Tampa!"
Suggestions: [Export results to CSV, Outbound Caller]
```

### 2. Initiate Outbound Calling

```
User: "Outbound Caller" (or "Start calling" or "Call leads")
AI: "📞 Outbound Caller Ready!
     ✅ 100 leads with phone numbers loaded
     🎯 Auto-calling with 2-minute intervals
     🤖 AI voice with machine detection
     Ready to start calling?"
Suggestions: [Start calling now, View call settings, Export to CSV instead]
```

### 3. Start Auto-Calling

```
User: "Start calling now"
AI: "🚀 Auto-Calling Started!
     📊 Status:
     • Total leads: 100
     • Interval: 2 minutes
     • Currently calling lead #1

     Calls will continue automatically every 2 minutes."
Suggestions: [Stop calling, Check status, View call logs]
```

### 4. Monitor Progress

```
User: "Check status"
AI: "📊 Calling Status:
     ✅ Auto-calling is ACTIVE
     • Current: Lead #25 of 100
     • Completed: 25 calls
     • Remaining: 75 leads
     • Interval: 2 minutes"
```

### 5. Stop Calling

```
User: "Stop calling"
AI: "⏸️ Auto-Calling Stopped!
     📊 Summary:
     • Calls made: 25
     • Total leads: 100
     • Remaining: 75"
```

## Voice Interaction Flow

### Human Answered

When a human answers the call:

```
Rachel (AI): "Hello! This is Rachel from RinglyPro. We help businesses like
             yours grow with automated calling solutions. Press 1 to speak
             with an agent, or press 2 to be added to our do not call list."

If Press 1: Connects to AGENT_PHONE_NUMBER
If Press 2: "You have been added to our do not call list. Goodbye."
If No Input: "We did not receive any input. Goodbye."
```

### Voicemail Detected

When voicemail is detected:

```
Rachel (AI): "Hello, this is a message from RinglyPro. We wanted to reach
             out regarding your business. Please call us back at your
             convenience. Thank you."
```

## Phone Number Validation

The system validates phone numbers before calling:

- ✅ 10 or 11 digit numbers (auto-adds country code '1' if missing)
- ❌ Invalid area codes: 555, 911, 000, 111
- ❌ Test numbers: 1555*, 15555555555
- ✅ Normalizes to E.164 format: +18134893222

## Environment Variables

Add to your `.env` file:

```bash
# Twilio Configuration (Required)
TWILIO_ACCOUNT_SID=your-twilio-account-sid
TWILIO_AUTH_TOKEN=your-twilio-auth-token
TWILIO_PHONE_NUMBER=+1234567890

# Outbound Caller Configuration
AGENT_PHONE_NUMBER=+1234567890  # Where to forward when customer presses 1
BASE_URL=https://your-domain.com  # For webhooks
```

## Twilio Webhook Configuration

Configure these webhooks in your Twilio Console:

1. **Voice URL**: `https://your-domain.com/api/outbound-caller/voice`
2. **Status Callback URL**: `https://your-domain.com/api/outbound-caller/call-status`

## API Endpoints

### Start Auto-Calling

```bash
POST /api/outbound-caller/start
Content-Type: application/json

{
  "leads": [
    {
      "business_name": "Joe's Plumbing",
      "phone": "8134893222",
      "category": "Plumber"
    }
  ],
  "intervalMinutes": 2
}
```

### Get Status

```bash
GET /api/outbound-caller/status

Response:
{
  "success": true,
  "isRunning": true,
  "currentIndex": 5,
  "totalLeads": 100,
  "callsMade": 5,
  "remaining": 95,
  "intervalMinutes": 2
}
```

### Stop Calling

```bash
POST /api/outbound-caller/stop

Response:
{
  "success": true,
  "status": "stopped",
  "callsMade": 25,
  "totalLeads": 100
}
```

## Natural Language Commands

The MCP integration supports these natural language commands:

**Start Calling:**
- "Outbound Caller"
- "Start calling"
- "Call leads"
- "Auto call"
- "Begin calls"
- "Call now"

**Stop Calling:**
- "Stop calling"
- "Stop calls"
- "Pause calling"

**Check Status:**
- "Status"
- "Check calling"
- "Call progress"

## Call Logs

All calls are logged with:
- Call SID (Twilio identifier)
- Phone number called
- Lead data (name, category)
- Call status (initiated, ringing, answered, completed)
- Answered by (human or machine)
- Timestamp

Access logs via:
- MCP: "View call logs"
- API: `GET /api/outbound-caller/logs`

## Error Handling

### Missing Twilio Credentials

```
❌ Failed to start calling: Twilio not configured

⚠️ Please check:
• Twilio credentials configured
• TWILIO_ACCOUNT_SID set
• TWILIO_AUTH_TOKEN set
• TWILIO_PHONE_NUMBER set
```

### No Phone Numbers

```
❌ No phone numbers found in collected leads.
   Please collect businesses with phone numbers first.
```

### Invalid Phone Number

Calls with invalid phone numbers are skipped and logged:
```
⚠️ Lead #15 has invalid phone: Invalid area code
   Skipping to next lead...
```

## Testing

### Test Single Call

```bash
curl -X POST http://localhost:3000/api/outbound-caller/call \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+18134893222",
    "leadData": {
      "name": "Test Business",
      "category": "Real Estate Agent"
    }
  }'
```

### Test Auto-Calling (Small Batch)

```javascript
const leads = [
  { business_name: "Test 1", phone: "8134893222" },
  { business_name: "Test 2", phone: "8134893223" }
];

fetch('http://localhost:3000/api/outbound-caller/start', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ leads, intervalMinutes: 0.5 }) // 30 seconds for testing
});
```

## Safety Features

1. **Rate Limiting**: Configurable intervals between calls (default 2 minutes)
2. **Graceful Shutdown**: Automatically stops calling when server shuts down
3. **Phone Validation**: Blocks invalid/test numbers before calling
4. **Machine Detection**: Different handling for voicemail vs humans
5. **Do Not Call**: Customers can opt out by pressing 2

## Integration with Business Collector

The outbound caller seamlessly integrates with the Business Collector:

1. User collects leads: "Collect lawyers in Tampa"
2. System stores 100+ leads with phone numbers
3. User clicks "Outbound Caller" button
4. System loads leads into calling queue
5. User confirms "Start calling now"
6. Auto-calling begins with 2-minute intervals

## Future Enhancements

- [ ] Call recording
- [ ] Custom voice scripts per campaign
- [ ] Do-not-call list persistence
- [ ] Call analytics dashboard
- [ ] Time-zone aware calling (don't call at night)
- [ ] A/B testing different scripts
- [ ] CRM integration (auto-create contacts)
- [ ] SMS follow-up for voicemails
- [ ] Callback scheduling

## Troubleshooting

### Calls Not Going Through

1. Check Twilio credentials in `.env`
2. Verify Twilio phone number is voice-enabled
3. Check webhook URLs are publicly accessible
4. Review Twilio debugger for errors

### Voicemail Detection Not Working

- Ensure `machineDetection` is enabled in Twilio settings
- Increase `machineDetectionTimeout` if needed (currently 5000ms)

### Calls Getting Dropped

- Check `AGENT_PHONE_NUMBER` is set correctly
- Verify agent phone can receive calls
- Review call logs for status updates

## Cost Considerations

**Twilio Pricing (approximate):**
- Outbound calls: $0.013/min
- Phone number: $1/month
- 100 calls × 2 min average = $2.60

**Best Practices:**
- Start with small batches to test
- Monitor call success rates
- Adjust intervals based on response rates
- Use phone validation to avoid wasted calls

## Support

For issues or questions:
1. Check Twilio debugger: https://console.twilio.com/debugger
2. Review call logs: `GET /api/outbound-caller/logs`
3. Check server logs for errors
4. Test with single call first before batch calling

---

**Created:** 2025-10-23
**Integration Status:** ✅ Complete and Ready for Production
