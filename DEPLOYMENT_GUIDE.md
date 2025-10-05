# 🚀 Bilingual Voice Bot - Deployment Guide

**Deployment Date:** October 5, 2025
**Production URL:** https://aiagent.ringlypro.com
**Status:** ✅ **DEPLOYED & READY**

---

## 📊 Deployment Summary

Your bilingual voice bot (Rachel + Lina) has been deployed to production!

### **What Was Deployed:**

✅ **Core System:**
- Multi-tenant Rachel voice service (English)
- Lina Spanish voice service (Spanish)
- Bilingual language selection menu
- Client identification system
- Database integration
- ElevenLabs TTS integration

✅ **New Files Added:**
- `src/services/linaVoiceService.js` - Spanish voice AI
- `src/routes/linaRoutes.js` - Spanish voice routes
- Updated `src/services/rachelVoiceService.js` - Bilingual greeting
- Updated `src/routes/rachelRoutes.js` - Language selection
- `BILINGUAL_VOICE_SETUP.md` - Complete documentation

✅ **Git Commits:**
- `56d6e8f` - Add comprehensive bilingual voice bot documentation
- `e5af561` - Add bilingual voice bot: Spanish support with Lina voice
- `bbc80df` - Add bilingual voice bot test results and verification

---

## 🔧 Production Configuration

### **Environment Variables (Render Dashboard)**

Make sure these are set in your Render environment:

```bash
# Database
DATABASE_URL=postgresql://[username]:[password]@[host]/ringlypro_crm_production

# Twilio
TWILIO_ACCOUNT_SID=AC...your_account_sid...
TWILIO_AUTH_TOKEN=...your_auth_token...
TWILIO_PHONE_NUMBER=+18886103810

# ElevenLabs (for Rachel & Lina voices)
ELEVENLABS_API_KEY=sk_...your_elevenlabs_key...

# Application
WEBHOOK_BASE_URL=https://aiagent.ringlypro.com
NODE_ENV=production
PORT=3000

# Other required vars
JWT_SECRET=...your_jwt_secret...
STRIPE_SECRET_KEY=sk_live_...your_stripe_key...
SENDGRID_API_KEY=SG....your_sendgrid_key...
```

### **Database Setup**

✅ Test client created in production database:
- **Client ID:** 17
- **Business Name:** RinglyPro Test
- **Phone Number:** +18886103810
- **Rachel Enabled:** true

---

## 📞 Twilio Webhook Configuration

### **CRITICAL: Update Twilio Webhook**

1. **Log into Twilio Console:**
   - Go to: https://console.twilio.com/

2. **Navigate to Phone Numbers:**
   - Phone Numbers → Manage → Active Numbers
   - Click on **+1 (888) 610-3810**

3. **Configure Voice Webhook:**
   - **A Call Comes In:** Webhook
   - **URL:** `https://aiagent.ringlypro.com/voice/rachel/`
   - **HTTP Method:** POST
   - **Click SAVE**

### **Webhook URL Structure:**

```
Production Webhook:
https://aiagent.ringlypro.com/voice/rachel/

This endpoint will:
1. Identify the client by the To number
2. Play bilingual greeting
3. Capture DTMF (Press 1 or 2)
4. Route to Rachel (English) or Lina (Spanish)
```

---

## 🧪 Testing the Deployment

### **Step 1: Test Health Endpoint**

```bash
curl https://aiagent.ringlypro.com/health
```

**Expected Response:**
```json
{
  "status": "OK",
  "services": {
    "rachel_voice": "active",
    "client_identification": "enabled"
  }
}
```

### **Step 2: Test Client Identification**

```bash
curl https://aiagent.ringlypro.com/voice/rachel/test-client/+18886103810
```

**Expected Response:**
```json
{
  "success": true,
  "client": {
    "business_name": "RinglyPro Test",
    "rachel_enabled": true
  }
}
```

### **Step 3: Make a Live Test Call**

1. **Call:** +1 (888) 610-3810
2. **Listen:** You should hear the bilingual greeting
3. **Press 1:** For English (Rachel)
4. **Press 2:** For Spanish (Lina)

---

## 🎯 Expected Call Flow

### **Initial Call:**

```
Customer dials: +18886103810
         ↓
System plays (Rachel's voice):
"Hello and welcome to RinglyPro Test.
 For English, press 1.
 Para español, presione dos."
         ↓
Customer presses 1 or 2
```

### **If Customer Presses 1 (English):**

```
Rachel: "Thank you for calling RinglyPro Test.
         I'm Rachel, your AI assistant.
         How can I help you today?
         You can say book appointment to schedule a consultation,
         pricing to hear about our services,
         or speak with someone if you need to talk to a team member."

Customer: "I want to book an appointment"

Rachel: "Great! I'd be happy to help you book an appointment.
         Can you please tell me your full name?"
```

### **If Customer Presses 2 (Spanish):**

```
Lina: "Buenas tardes, gracias por llamar a RinglyPro Test.
       Mi nombre es Lina, su asistente virtual.
       ¿En qué puedo ayudarle hoy?
       Puedo ayudarle a agendar una cita, obtener información sobre precios,
       o conectarlo con nuestro equipo."

Cliente: "Quiero hacer una cita"

Lina: "¡Excelente! Con mucho gusto le ayudaré a agendar una cita.
       ¿Puede decirme su nombre completo, por favor?"
```

---

## 🔍 Monitoring & Logs

### **Check Production Logs (Render Dashboard):**

1. Go to: https://dashboard.render.com/
2. Find your service: **RinglyPro CRM**
3. Click **Logs** tab

### **Look for these log messages:**

```
✅ Client identified: RinglyPro Test (ID: 17)
✅ Rachel audio generated successfully
✅ Using Rachel's voice for bilingual greeting
🌍 Language selected: English/Spanish
```

### **Check Database Calls:**

```bash
# SSH into production (if needed)
# Query recent calls
SELECT * FROM calls
WHERE client_id = 17
ORDER BY created_at DESC
LIMIT 5;
```

---

## 📊 Production URLs

| Endpoint | URL | Purpose |
|----------|-----|---------|
| Health Check | https://aiagent.ringlypro.com/health | System status |
| Rachel Webhook | https://aiagent.ringlypro.com/voice/rachel/ | Main call entry |
| Lina Webhook | https://aiagent.ringlypro.com/voice/lina/incoming | Spanish calls |
| Language Selection | https://aiagent.ringlypro.com/voice/rachel/select-language | DTMF handler |
| Client Test | https://aiagent.ringlypro.com/voice/rachel/test-client/+18886103810 | Test client ID |
| Dashboard | https://aiagent.ringlypro.com/ | CRM Dashboard |

---

## ⚠️ Important Notes

### **ElevenLabs API Usage:**

- **Free Tier:** 10,000 characters/month
- **Creator:** $5/month = 30,000 characters
- **Pro:** $22/month = 100,000 characters

**Monitor your usage:**
- Average call: ~1,000 characters
- 100 calls ≈ 100,000 characters
- **Recommendation:** Upgrade to Pro tier for production

### **Session Storage:**

⚠️ **Current:** In-memory sessions (will reset on server restart)

**To Fix (Future):**
- Implement Redis for session storage
- Or use database-backed sessions

### **Audio File Storage:**

⚠️ **Current:** Files saved to `/tmp` (ephemeral on Render)

**To Fix (Future):**
- Use S3 or CloudFlare R2 for persistent storage
- Implement CDN for faster delivery

---

## 🐛 Troubleshooting

### **Issue: "No client found"**

**Solution:**
```bash
# Run this to add/update client in production database
node add-test-client.js "YOUR_PRODUCTION_DATABASE_URL"
```

### **Issue: Bilingual greeting not playing**

**Possible causes:**
1. ElevenLabs API quota exceeded
2. ELEVENLABS_API_KEY not set in production
3. Webhook URL not updated in Twilio

**Check:**
```bash
curl https://aiagent.ringlypro.com/health
# Look for: "rachel_voice": "active"
```

### **Issue: Language selection not working**

**Possible causes:**
1. DTMF not enabled on Twilio number
2. Session storage issue

**Check Twilio logs:**
- https://console.twilio.com/monitor/logs/calls

---

## 🎉 Success Criteria

Your deployment is successful if:

✅ Health endpoint returns `"rachel_voice": "active"`
✅ Client test endpoint finds RinglyPro Test
✅ Live call plays bilingual greeting
✅ Pressing 1 routes to English (Rachel)
✅ Pressing 2 routes to Spanish (Lina)
✅ Both voices use ElevenLabs TTS
✅ Calls are logged to database

---

## 📞 Next Steps

1. **Update Twilio Webhook** (if not done yet)
2. **Make test call** to verify end-to-end
3. **Monitor ElevenLabs usage** in dashboard
4. **Add real clients** to database
5. **Implement real appointment booking**
6. **Set up call analytics**

---

## 📚 Documentation

- **Setup Guide:** [BILINGUAL_VOICE_SETUP.md](BILINGUAL_VOICE_SETUP.md)
- **Test Results:** [BILINGUAL_TEST_RESULTS.md](BILINGUAL_TEST_RESULTS.md)
- **Code Structure:**
  - Rachel Service: `src/services/rachelVoiceService.js`
  - Lina Service: `src/services/linaVoiceService.js`
  - Rachel Routes: `src/routes/rachelRoutes.js`
  - Lina Routes: `src/routes/linaRoutes.js`

---

## 🆘 Support

If you encounter issues:

1. **Check Render Logs:** https://dashboard.render.com/
2. **Check Twilio Logs:** https://console.twilio.com/monitor/logs/calls
3. **Check ElevenLabs Usage:** https://elevenlabs.io/usage
4. **Review Health Endpoint:** https://aiagent.ringlypro.com/health

---

**Deployment Completed By:** Claude Code
**Date:** October 5, 2025
**Status:** ✅ **LIVE IN PRODUCTION**

**🎊 Your bilingual voice bot is now live!**
