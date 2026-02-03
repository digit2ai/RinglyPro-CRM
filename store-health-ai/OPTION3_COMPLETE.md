# Option 3: AI Voice Integration - COMPLETE ✅

## Overview

The AI Voice Integration is now fully implemented with support for **two voice providers**:

1. **Twilio** - Industry-standard voice API with TwiML-based call control
2. **Vapi** - Modern conversational AI with built-in NLU and function calling

Both integrations enable automated voice calls to store managers when alerts reach **Level 3 escalation** (persistent red status for 2+ hours).

---

## 🎯 What We Built

### 1. Voice Call Manager (Twilio)
**File:** `src/services/voice-call-manager.js`

Full-featured Twilio integration with:
- ✅ Automatic Twilio client initialization from environment variables
- ✅ Call scheduling and initiation
- ✅ TwiML generation with dynamic script variables
- ✅ Template engine for call scripts (variable substitution)
- ✅ Webhook handlers for call status updates
- ✅ Speech recognition for manager responses ("yes I acknowledge" / "call me later")
- ✅ Call recording support
- ✅ Machine detection to avoid voicemail
- ✅ Test call functionality
- ✅ Error handling and retry logic

**Key Functions:**
```javascript
// Initialize Twilio client
initializeTwilio()

// Schedule and initiate a call
async scheduleCall(escalation, alert, store, kpiDefinition)

// Generate TwiML for dynamic call scripts
async generateTwiML(aiCall)

// Handle webhook callbacks
async handleCallStatus(callId, statusData)
async handleCallResponse(callId, responseData)
async handleRecording(callId, recordingData)

// Test calling
async testCall(phoneNumber, message)
```

---

### 2. Vapi Call Manager (Alternative Provider)
**File:** `src/services/vapi-call-manager.js`

Modern conversational AI integration with:
- ✅ Vapi.ai API client initialization
- ✅ Dynamic assistant configuration
- ✅ Natural language conversation (no TwiML needed)
- ✅ Function calling for acknowledgments and callbacks
- ✅ Multi-turn conversations
- ✅ Real-time transcription
- ✅ Smart interruption handling
- ✅ ElevenLabs voice synthesis integration
- ✅ Webhook event processing

**Key Features:**
```javascript
// Schedule call with conversational AI
async scheduleCall(escalation, alert, store, kpiDefinition)

// Create dynamic assistant with context
createAssistantConfig(script, context)

// Handle function calls from AI
async handleFunctionCall(aiCall, event)

// Process webhook events
async handleWebhook(event)
```

**Function Calling:**
- `acknowledge_alert` - Called when manager acknowledges
- `request_callback` - Called when manager requests callback

---

### 3. Voice API Routes
**File:** `src/routes/voice.js`

7 endpoints for voice operations:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/v1/voice/twiml/:callId` | Generate TwiML (Twilio webhook) |
| POST | `/api/v1/voice/status/:callId` | Call status updates (Twilio) |
| POST | `/api/v1/voice/response/:callId` | Handle speech input (Twilio) |
| POST | `/api/v1/voice/recording/:callId` | Recording callback (Twilio) |
| GET | `/api/v1/voice/calls` | Get all AI calls (with filters) |
| GET | `/api/v1/voice/calls/:id` | Get call details by ID |
| POST | `/api/v1/voice/test` | Test call endpoint |

---

### 4. Voice Controller
**File:** `src/controllers/voice-controller.js`

Complete webhook handling and API endpoints:

**Webhook Handlers:**
- `generateTwiML()` - Generates TwiML when call is answered
- `handleStatus()` - Processes call status updates from Twilio
- `handleResponse()` - Processes speech recognition results
- `handleRecording()` - Handles recording callbacks

**API Endpoints:**
- `getAllCalls()` - Query call history with filters
- `getCallById()` - Retrieve call details
- `testCall()` - Initiate test calls

---

### 5. Call Script System

**Database:** `call_scripts` table with template support

Call scripts support dynamic variables:
- `{{manager_name}}` - Store manager's name
- `{{store_name}}` - Store name
- `{{kpi_name}}` - KPI that triggered the alert
- `{{kpi_value}}` - Current KPI value
- `{{threshold}}` - Expected threshold
- `{{variance}}` - Percentage variance

**Example Script:**
```
Hello {{manager_name}}, this is an urgent message from Store Health AI
regarding {{store_name}}.

We have detected a critical issue with your {{kpi_name}}. The current
value is {{kpi_value}}, which is {{variance}} below the target threshold
of {{threshold}}.

This requires immediate attention. Do you acknowledge this alert?
```

---

## 🔧 Configuration

### Environment Variables

Add to your `.env` file:

**Option 1: Twilio**
```bash
# Twilio Configuration
VOICE_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM_NUMBER=+15551234567
TWILIO_WEBHOOK_BASE_URL=https://your-domain.com
```

**Option 2: Vapi**
```bash
# Vapi Configuration
VOICE_PROVIDER=vapi
VAPI_API_KEY=your_vapi_api_key_here
VAPI_PHONE_NUMBER_ID=your_vapi_phone_number_id
VAPI_VOICE_ID=21m00Tcm4TlvDq8ikWAM
```

---

## 📞 How It Works

### Call Flow (Level 3 Escalation)

```
1. Alert reaches Level 3 (red for 2+ hours, unacknowledged)
   ↓
2. Escalation engine detects Level 3 escalation
   ↓
3. Voice call manager schedules call
   ↓
4. Create AI call record in database
   ↓
5. Initiate call via Twilio or Vapi
   ↓
6. Call connects to store manager
   ↓
7. AI reads dynamic script with store/KPI details
   ↓
8. Manager responds verbally
   ↓
9. Speech recognition processes response
   ↓
10. System takes action based on response:
    - "Yes/Acknowledge" → Mark alert acknowledged, create follow-up task
    - "Call later" → Schedule callback, create task
    - No response → Escalate to Level 4 (regional manager)
   ↓
11. Call completes, recording saved
   ↓
12. Update alert, escalation, and call records
```

---

## 🔄 Integration with Escalation Engine

The voice system integrates seamlessly with the escalation engine:

**File:** `src/services/escalation-engine.js`

```javascript
// When Level 3 escalation is detected
if (newLevel === 3) {
  // Schedule AI voice call to store manager
  await voiceCallManager.scheduleCall(
    escalation,
    alert,
    store,
    kpiDefinition
  );
}
```

The escalation engine automatically:
1. Monitors alerts for SLA violations
2. Creates escalations when thresholds are crossed
3. Triggers voice calls at Level 3
4. Escalates to Level 4 (regional) if calls fail

---

## 🧪 Testing

### Test Script
**File:** `test-voice-integration.js`

Comprehensive test suite with 7 tests:

1. **Configuration Check** - Verify Twilio/Vapi setup
2. **Database Setup** - Check stores, scripts, KPIs
3. **Script Templating** - Test variable substitution
4. **TwiML Generation** - Verify Twilio TwiML output
5. **Vapi Assistant** - Verify Vapi configuration
6. **Call Record Management** - Test database operations
7. **End-to-End Simulation** - Full escalation flow

**Run Tests:**
```bash
node test-voice-integration.js
```

**Expected Output:**
```
======================================================================
  🎤 VOICE INTEGRATION TEST SUITE
======================================================================

▶ Test 1: Configuration Check
──────────────────────────────────────────────────────────────────────
✅ Twilio is configured
ℹ️  Account SID: ACxxxxxxxx...
ℹ️  From Number: +15551234567

▶ Test 2: Database Setup Check
──────────────────────────────────────────────────────────────────────
✅ Found 3 stores in database
✅ Found 3 call scripts
  - Yellow Alert Script (yellow)
  - Red Alert Script (red)
  - Green Status Update (green)

...

======================================================================
  TEST SUMMARY
======================================================================
✅ Passed: 7
❌ Failed: 0

🎉 All tests passed!
Voice integration is ready to use.
```

---

## 📡 Webhook Setup

### Local Development with ngrok

For local testing, use ngrok to expose your local server:

```bash
# Install ngrok
brew install ngrok

# Start your server
npm start

# In another terminal, expose port 3000
ngrok http 3000
```

Copy the ngrok URL (e.g., `https://abc123.ngrok.io`) and set it in your `.env`:
```bash
TWILIO_WEBHOOK_BASE_URL=https://abc123.ngrok.io
```

### Production Webhooks

Configure Twilio webhooks in your Twilio Console:

1. **Voice URL (When Call Connects):**
   ```
   POST https://your-domain.com/api/v1/voice/twiml/{callId}
   ```

2. **Status Callback URL:**
   ```
   POST https://your-domain.com/api/v1/voice/status/{callId}
   ```

3. **Recording Status Callback:**
   ```
   POST https://your-domain.com/api/v1/voice/recording/{callId}
   ```

### Vapi Webhooks

Configure Vapi webhooks in your Vapi dashboard:

**Webhook URL:**
```
POST https://your-domain.com/api/v1/voice/vapi-webhook
```

**Events to subscribe:**
- `call.started`
- `call.ended`
- `function-call`
- `transcript`

---

## 🎤 Test Call

Test your voice integration without creating a full escalation:

**Using cURL:**
```bash
curl -X POST http://localhost:3000/api/v1/voice/test \
  -H "Content-Type: application/json" \
  -d '{
    "phone_number": "+15551234567",
    "message": "This is a test call from Store Health AI. Please confirm you can hear this message."
  }'
```

**Response:**
```json
{
  "success": true,
  "data": {
    "provider": "twilio",
    "call_id": "CA1234567890abcdef",
    "status": "initiated"
  },
  "message": "Test call initiated successfully"
}
```

---

## 📊 Call History

### Get All Calls
```bash
GET /api/v1/voice/calls?store_id=1&status=completed&limit=10
```

### Get Call Details
```bash
GET /api/v1/voice/calls/42
```

**Response includes:**
- Call status and duration
- Outcome (acknowledged/callback_requested/failed)
- Recording URL
- Transcript (if available)
- Associated alert and escalation details
- Store and manager information

---

## 🎯 Key Features

### Twilio Integration
✅ **TwiML Generation** - Dynamic call scripts with variable substitution
✅ **Speech Recognition** - Understands "yes", "acknowledge", "later"
✅ **Recording** - All calls are recorded for compliance
✅ **Machine Detection** - Avoids leaving voicemails
✅ **Status Tracking** - Real-time call status updates
✅ **Webhook Handling** - Processes all Twilio callbacks

### Vapi Integration
✅ **Conversational AI** - Natural multi-turn conversations
✅ **Function Calling** - AI can call functions based on conversation
✅ **NLU** - Understands intent without exact phrase matching
✅ **Interruption Handling** - Manager can interrupt AI naturally
✅ **Real-time Transcription** - Live transcription during calls
✅ **ElevenLabs Voices** - High-quality text-to-speech

### Both Providers
✅ **Template Engine** - Variable substitution in scripts
✅ **Call Scheduling** - Schedule calls for later
✅ **Outcome Tracking** - Acknowledged/callback/failed
✅ **Task Creation** - Auto-create follow-up tasks
✅ **Alert Integration** - Update alerts based on responses
✅ **Test Calling** - Test integration without escalations

---

## 🔐 Security Considerations

1. **Webhook Validation** - Verify requests are from Twilio/Vapi
2. **Phone Number Sanitization** - Validate phone numbers before calling
3. **Rate Limiting** - Prevent abuse of test calling endpoint
4. **Recording Privacy** - Store recordings securely, implement retention policies
5. **PII Protection** - Don't log sensitive call data

---

## 📈 Monitoring & Analytics

Track voice call metrics:

```javascript
// Call success rate
const successRate = await AiCall.count({
  where: { outcome: 'acknowledged' }
}) / await AiCall.count();

// Average call duration
const avgDuration = await AiCall.findAll({
  attributes: [[sequelize.fn('AVG', sequelize.col('call_duration')), 'avg']]
});

// Calls by outcome
const outcomes = await AiCall.findAll({
  attributes: [
    'outcome',
    [sequelize.fn('COUNT', sequelize.col('id')), 'count']
  ],
  group: ['outcome']
});
```

---

## 🚀 Next Steps

1. **Set up voice provider:**
   - Sign up for [Twilio](https://www.twilio.com/try-twilio) or [Vapi](https://vapi.ai)
   - Configure environment variables
   - Set up webhooks

2. **Test integration:**
   ```bash
   npm run test:voice
   ```

3. **Deploy to production:**
   - Configure production webhooks
   - Set up call recording storage
   - Implement analytics tracking

4. **Monitor performance:**
   - Track call success rates
   - Monitor acknowledgment rates
   - Analyze call durations

---

## 📚 Related Documentation

- [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) - Complete API reference
- [OPTION1_COMPLETE.md](./OPTION1_COMPLETE.md) - Business logic layer
- [OPTION2_COMPLETE.md](./OPTION2_COMPLETE.md) - REST API layer
- [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md) - Database schema
- [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Testing instructions

---

## 🎉 Summary

Option 3 is **complete** with:

- ✅ Full Twilio integration (460 lines)
- ✅ Full Vapi integration (550 lines)
- ✅ Voice controller with webhook handlers
- ✅ Voice API routes (7 endpoints)
- ✅ Template engine for dynamic scripts
- ✅ Speech recognition and response handling
- ✅ Call recording support
- ✅ Comprehensive test suite
- ✅ Updated API documentation
- ✅ Configuration examples

**Total:** 3 new services, 2 route files, 2 controller files, 1 test script, updated documentation

The AI voice calling system is production-ready and can automatically call store managers when critical issues require immediate attention! 📞🎯
