# Voicemail Feature Implementation Guide

## 🎉 What's New

This update transforms the RinglyPro CRM to support voicemail messages with AI summarization, replacing SMS-only communication.

### Key Changes:

1. **✅ Fixed Multi-Tenant Credit Deduction**
   - Credits now correctly deduct for ALL clients (not just client ID 1)
   - Per-minute billing during calls

2. **✅ Updated Voice Flows (Rachel & Lina)**
   - **New Option**: "Leave a message" / "Dejar un mensaje"
   - **Existing**: "Book appointment" / "Agendar una cita"
   - Removed pricing and support transfer options

3. **✅ Voicemail Recording**
   - Max 3 minutes per voicemail
   - Auto-transcription by Twilio
   - Press # to finish early

4. **✅ Claude AI Summarization**
   - Automatically summarizes voicemail transcriptions
   - Stores concise, actionable summaries in CRM

5. **✅ CRM UI Updates**
   - New "Messages & Voicemails" section
   - Collapsible message cards (click to expand)
   - **SMS Reply Button**: Opens device SMS app with pre-filled recipient

---

## 📋 Setup Requirements

### 1. Environment Variables

Add to your `.env` file or Render environment variables:

```bash
# Existing Variables (keep these)
DATABASE_URL=postgresql://...
TWILIO_ACCOUNT_SID=ACxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxx
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com

# NEW: Claude AI API Key (required for voicemail summarization)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxx
```

**Get your Claude API key**: https://console.anthropic.com/settings/keys

### 2. Twilio Configuration

#### A. Configure Voice Webhooks

For each RinglyPro phone number in Twilio Console:

1. Go to: https://console.twilio.com/console/phone-numbers/incoming
2. Click on your number (e.g., +18886103810)
3. Scroll to **Voice Configuration**:
   - **A Call Comes In**: `Webhook` → `https://aiagent.ringlypro.com/voice/rachel/select-language`
   - **Status Callback URL**: `https://aiagent.ringlypro.com/webhook/twilio/voice`
   - **Status Callback Method**: `HTTP POST`
   - **Status Callback Events**: ✅ Select ALL (initiated, ringing, answered, completed)

#### B. New Voicemail Webhook Endpoints

These are automatically configured in the code:
- English: `/voice/rachel/voicemail-transcription`
- Spanish: `/voice/lina/voicemail-transcription`

---

## 🧪 Testing Guide

### Test 1: Credit Deduction (Multi-Tenant Fix)

**Objective**: Verify credits deduct correctly for ALL clients

1. **Setup**: Create 2+ test clients with different RinglyPro numbers
2. **Test**:
   - Call Client A's number
   - Stay on call for 2 minutes
   - Hang up
   - Check logs: `Tracked call CAxxxx: 120 seconds for client X (Business Name)`
   - Verify Client A's credits decreased
3. **Repeat** for Client B
4. **Expected**: Both clients should have credits deducted independently

**Check logs for**:
```
✅ Tracked call CAxxxxx: 120 seconds for client 2 (Acme Corp)
```

---

### Test 2: Voicemail Flow (English - Rachel)

**Objective**: Test complete voicemail recording and summarization

1. **Call** your RinglyPro number
2. **Select**: Option 1 (English)
3. **Say**: "Leave a message" or "I want to leave a voicemail"
4. **Expected**: Rachel says: _"I'll be happy to record your message... After the beep..."_
5. **Record** a test message (e.g., "Hi, I need to reschedule my appointment for tomorrow at 3 PM")
6. **Press** `#` to finish
7. **Expected**: "Thank you for your message. We'll get back to you soon. Goodbye!"

**Check Logs**:
```
📝 Voicemail transcription received: TRxxxxxxx
Transcription: "Hi, I need to reschedule my appointment for tomorrow at 3 PM"
✅ Claude AI summarized voicemail (en): Voicemail from +1234567890: ...
💾 Voicemail stored for client 1 (Your Business)
```

**Check CRM Dashboard**:
- Refresh dashboard
- Navigate to "Messages & Voicemails" section
- See new message with:
  - Caller's phone number
  - Time received
  - Summarized message preview
- Click to expand → Full summary appears
- Click "Reply via SMS" → Device SMS app opens with recipient pre-filled

---

### Test 3: Voicemail Flow (Spanish - Lina)

**Objective**: Test Spanish voicemail with Claude AI

1. **Call** your RinglyPro number
2. **Select**: Option 2 (Español)
3. **Say**: "Dejar un mensaje" or "Quiero dejar un mensaje"
4. **Expected**: Lina says: _"Con gusto grabaré su mensaje..."_
5. **Record** in Spanish: "Hola, necesito cambiar mi cita para mañana a las 3"
6. **Press** `#` to finish
7. **Expected**: "Gracias por su mensaje..."

**Check Logs**:
```
📝 Spanish voicemail transcription received: TRxxxxxxx
Transcripción: "Hola, necesito cambiar mi cita para mañana a las 3"
✅ Claude AI summarized voicemail (es): Mensaje de voz de +1234567890: ...
💾 Spanish voicemail stored for client 1 (Your Business)
```

---

### Test 4: SMS Reply Integration

**Objective**: Test device SMS integration

1. **Open CRM Dashboard** on mobile device
2. **Navigate** to Messages section
3. **Click** on a voicemail to expand
4. **Click** "Reply via SMS" button
5. **Expected**:
   - Device SMS app opens
   - Recipient field pre-filled with caller's number
   - Type message and send normally

**On Android**: Uses `sms:+1234567890`
**On iOS**: Uses `sms:+1234567890`

---

### Test 5: Credit Deduction for Voicemails

**Objective**: Verify voicemail duration counts toward usage

1. **Call** your number
2. **Leave** a 2-minute voicemail
3. **Check logs**: Voicemail duration should be tracked
4. **Expected**:
   - Call duration = ~2 minutes
   - Credits deducted = 2 minutes × $0.20/min = $0.40

**Check Database**:
```sql
SELECT * FROM usage_records WHERE usage_type = 'voice_call' ORDER BY created_at DESC LIMIT 5;
SELECT * FROM credit_accounts WHERE client_id = YOUR_CLIENT_ID;
```

---

## 🚀 Deployment Checklist

- [ ] Add `ANTHROPIC_API_KEY` to Render environment variables
- [ ] Restart Render service
- [ ] Verify Twilio webhook configuration (statusCallback URL)
- [ ] Test voicemail flow (English & Spanish)
- [ ] Test credit deduction for multiple clients
- [ ] Test SMS reply on mobile device
- [ ] Check database: voicemails appear in `messages` table

---

## 📊 Database Schema

### Messages Table (stores voicemails)

```sql
SELECT
    id,
    client_id,           -- Which business received the voicemail
    from_number,         -- Caller's phone
    to_number,           -- RinglyPro number
    body,                -- Claude AI summary
    status,              -- 'received'
    created_at
FROM messages
WHERE client_id = YOUR_CLIENT_ID
ORDER BY created_at DESC;
```

---

## 🔧 Troubleshooting

### Issue: Voicemail not recording

**Check**:
1. Twilio webhook logs: https://console.twilio.com/monitor/debugger
2. Render logs: Look for "Voicemail recording completed"
3. Verify webhook URL is publicly accessible

### Issue: No Claude AI summary (using fallback)

**Symptoms**: Messages show: `Voicemail from +1234567890: [raw transcription]`

**Fix**:
1. Verify `ANTHROPIC_API_KEY` is set in environment
2. Check logs for: `⚠️ ANTHROPIC_API_KEY not configured`
3. Restart service after adding key

### Issue: Credits not deducting

**Check**:
1. Twilio statusCallback configuration
2. Logs for: `✅ Tracked call CAxxxx: X seconds for client Y`
3. Database: `SELECT * FROM usage_records`

### Issue: SMS reply button not working

**Mobile Only**: This feature requires a mobile device with SMS capability
**Desktop**: Button will not work (SMS URIs only work on mobile)

---

## 📞 API Endpoints

### New Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/voice/rachel/voicemail-complete` | POST | Handles voicemail recording completion (English) |
| `/voice/rachel/voicemail-transcription` | POST | Receives transcription & saves with AI summary (English) |
| `/voice/lina/voicemail-complete` | POST | Handles voicemail recording completion (Spanish) |
| `/voice/lina/voicemail-transcription` | POST | Receives transcription & saves with AI summary (Spanish) |
| `/api/messages/client/:clientId` | GET | Fetch voicemails for specific client |

---

## 🎯 Success Metrics

After deployment, you should see:

1. ✅ Calls tracked per client (multi-tenant)
2. ✅ Voicemails stored in database
3. ✅ Summaries generated by Claude AI
4. ✅ Messages visible in CRM dashboard
5. ✅ SMS reply button opens device SMS app
6. ✅ Credits deducting correctly per minute

---

## 🆘 Support

**Issues?** Check:
1. Render logs
2. Twilio debugger console
3. Browser console (for CRM UI issues)
4. Database queries (verify data is being stored)

**Contact**: Open an issue on GitHub or check documentation at:
- Twilio Docs: https://www.twilio.com/docs/voice
- Claude API Docs: https://docs.anthropic.com/
