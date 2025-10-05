# 📞 Twilio Webhook Setup - BILINGUAL VOICE BOT

**IMPORTANT:** You need to update Twilio webhooks to enable the bilingual Spanish/English system!

---

## 🎯 What You Have Now:

✅ **Production Server:** https://aiagent.ringlypro.com
✅ **Bilingual Code:** Deployed and live
✅ **Database:** Fixed with clients table
✅ **Three Phone Numbers Ready:**
   - **+18886103810** (RinglyPro Test)
   - **+12232949184** (Digit2AI)
   - **+12603688369** (DIGIT2AI LLC)

---

## ⚠️ The Problem:

Your Twilio webhooks are probably still pointing to the **OLD endpoint**:
```
https://aiagent.ringlypro.com/webhook/twilio/voice  ❌ OLD
```

They need to point to the **NEW bilingual endpoint**:
```
https://aiagent.ringlypro.com/voice/rachel/  ✅ NEW
```

---

## 📋 STEP-BY-STEP FIX:

### **Step 1: Go to Twilio Console**

Open: https://console.twilio.com/

### **Step 2: Navigate to Phone Numbers**

1. Click **Phone Numbers** in the left sidebar
2. Click **Manage**
3. Click **Active Numbers**

### **Step 3: Update EACH Phone Number**

You need to update **ALL THREE** numbers:

#### **For +18886103810 (RinglyPro Test):**

1. Click on **+18886103810**
2. Scroll to **"Voice & Fax"** section
3. Find **"A CALL COMES IN"**
4. Change the webhook URL to:
   ```
   https://aiagent.ringlypro.com/voice/rachel/
   ```
5. Make sure it says **HTTP POST**
6. Click **SAVE**

#### **For +12232949184 (Digit2AI):**

1. Click on **+12232949184**
2. Scroll to **"Voice & Fax"** section
3. Find **"A CALL COMES IN"**
4. Change the webhook URL to:
   ```
   https://aiagent.ringlypro.com/voice/rachel/
   ```
5. Make sure it says **HTTP POST**
6. Click **SAVE**

#### **For +12603688369 (DIGIT2AI LLC):**

1. Click on **+12603688369**
2. Scroll to **"Voice & Fax"** section
3. Find **"A CALL COMES IN"**
4. Change the webhook URL to:
   ```
   https://aiagent.ringlypro.com/voice/rachel/
   ```
5. Make sure it says **HTTP POST**
6. Click **SAVE**

---

## 🧪 Test After Updating:

### **Test 1: Call +18886103810**

1. Dial: **+1 (888) 610-3810**
2. **You should hear:**
   > "Hello and welcome to RinglyPro Test. For English, press 1. Para español, presione dos."

3. **Press 2** for Spanish
4. **You should hear Lina:**
   > "Buenas [tardes/días/noches], gracias por llamar a RinglyPro Test..."

### **Test 2: Call +12232949184**

1. Dial: **+1 (223) 294-9184**
2. **You should hear:**
   > "Hello and welcome to Digit2AI. For English, press 1. Para español, presione dos."

3. **Press 2** for Spanish
4. **You should hear Lina** speaking Spanish

---

## 📊 What Each Number Will Do:

### **When Someone Calls:**

```
Customer Dials → Twilio Receives Call
                      ↓
         Twilio Calls Your Webhook:
   https://aiagent.ringlypro.com/voice/rachel/
                      ↓
         System Identifies Client by "To" Number
                      ↓
         Plays Bilingual Greeting (Rachel's voice)
         "For English, press 1. Para español, presione dos."
                      ↓
              Customer Presses 1 or 2
                      ↓
         Press 1 → Rachel (English) | Press 2 → Lina (Spanish)
```

---

## 🎤 Voice Experience:

### **English (Press 1) - Rachel:**
```
Rachel: "Thank you for calling [Business Name].
         I'm Rachel, your AI assistant.
         How can I help you today?
         You can say 'book appointment' to schedule a consultation,
         'pricing' to hear about our services,
         or 'speak with someone' if you need to talk to a team member."
```

### **Spanish (Press 2) - Lina:**
```
Lina: "Buenos [días/tardes/noches], gracias por llamar a [Business Name].
       Mi nombre es Lina, su asistente virtual.
       ¿En qué puedo ayudarle hoy?
       Puedo ayudarle a agendar una cita, obtener información sobre precios,
       o conectarlo con nuestro equipo."
```

---

## ⚙️ Configuration Summary:

| Phone Number | Business | Webhook URL |
|--------------|----------|-------------|
| +18886103810 | RinglyPro Test | https://aiagent.ringlypro.com/voice/rachel/ |
| +12232949184 | Digit2AI | https://aiagent.ringlypro.com/voice/rachel/ |
| +12603688369 | DIGIT2AI LLC | https://aiagent.ringlypro.com/voice/rachel/ |

**All use the SAME webhook** - the system identifies the client by the incoming number!

---

## 🚨 Troubleshooting:

### **Problem: Still hearing old message**

**Solution:**
1. Check webhook URL is EXACTLY: `https://aiagent.ringlypro.com/voice/rachel/`
2. Make sure you clicked **SAVE** in Twilio
3. Wait 30 seconds for Twilio to update
4. Try calling again

### **Problem: "Configuration issue" message**

**Solution:**
- Render is still deploying (wait 2-3 minutes)
- Check Render logs at: https://dashboard.render.com/
- Look for "Deploy live" message

### **Problem: No bilingual greeting**

**Solution:**
1. Verify webhook URL has `/voice/rachel/` at the end
2. Make sure HTTP method is **POST** (not GET)
3. Check Twilio debugger at: https://console.twilio.com/monitor/logs/calls

---

## ✅ Success Checklist:

After updating webhooks, verify:

- [ ] Called +18886103810 and heard bilingual greeting
- [ ] Pressed 1 and heard Rachel in English
- [ ] Called again and pressed 2 to hear Lina in Spanish
- [ ] Tested +12232949184 (if you have this number)
- [ ] Tested +12603688369 (if you have this number)

---

## 📞 Quick Reference:

**What to say after language selection:**

**English (Rachel):**
- "I want to book an appointment" → Appointment booking flow
- "How much does it cost?" → Pricing information
- "I need help" → Support/transfer

**Spanish (Lina):**
- "Quiero hacer una cita" → Appointment booking flow
- "¿Cuánto cuesta?" → Pricing information
- "Necesito ayuda" → Support/transfer

---

## 🎉 You're Done When:

✅ You can call any of your numbers
✅ You hear the bilingual greeting
✅ Pressing 1 gives you Rachel (English)
✅ Pressing 2 gives you Lina (Spanish)
✅ Both voices sound natural (ElevenLabs)

---

**Updated:** October 5, 2025
**Status:** Ready to configure
**Time to complete:** 5-10 minutes
