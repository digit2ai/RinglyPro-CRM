# Default Voicemail Setup - RinglyPro Lina Voice

## Overview

This ensures that **ALL clients** (new and existing) hear Lina's premium voice, even if they don't configure a custom message.

---

## How It Works

### 3-Tier Fallback System:

```
┌─────────────────────────────────────────────────────────┐
│  1. CUSTOM CLIENT MESSAGE (Priority)                    │
│  → Client saved custom message in Settings              │
│  → Plays from S3: voicemail/client_29/voicemail_*.mp3  │
│  → Uses Lina's ElevenLabs voice                         │
└─────────────────────────────────────────────────────────┘
                        ↓ (if no custom message)
┌─────────────────────────────────────────────────────────┐
│  2. DEFAULT RINGLYPRO MESSAGE (Recommended)             │
│  → ELEVENLABS_VOICEMAIL_URL environment variable        │
│  → Plays from S3: voicemail/client_default/voicemail_*  │
│  → Uses Lina's ElevenLabs voice (pre-generated)         │
└─────────────────────────────────────────────────────────┘
                        ↓ (if env var not set)
┌─────────────────────────────────────────────────────────┐
│  3. TWILIO POLLY TTS (Emergency Fallback)               │
│  → Uses Twilio's built-in Polly.Joanna voice            │
│  → Lower quality, but always works                      │
└─────────────────────────────────────────────────────────┘
```

---

## Default Message Generated

**S3 Location:**
```
https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_default/voicemail_1764895914610.mp3
```

**Message:**
> "Hi, this is Lina from RinglyPro.com, calling with a quick business update. RinglyPro offers a free AI receptionist that helps small businesses answer calls, book appointments, and send automatic follow-ups — so you never miss a lead, even after hours. This message is for informational purposes only, and there's no obligation or payment required. If you'd like to learn more, you can visit RinglyPro.com or call us back at 813-212-4888. If you'd prefer not to receive future informational updates, you can reply stop or call the same number and we'll remove you. Thanks for your time, and have a great day."

**Voice:** Lina (ElevenLabs Bella - natural, bilingual)

---

## Setup Instructions

### Step 1: Apply S3 Bucket Policy (Required)

1. Go to [AWS S3 Console](https://s3.console.aws.amazon.com/s3/buckets/ringlypro-uploads)
2. Click **Permissions** tab
3. Scroll to **Bucket Policy** → Click **Edit**
4. Paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadVoicemailAudio",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::ringlypro-uploads/voicemail/*"
    }
  ]
}
```

5. Click **Save changes**

**Verify:**
```bash
curl -I "https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_default/voicemail_1764895914610.mp3"

# Should return: HTTP/1.1 200 OK
```

### Step 2: Set Environment Variable on Render (Recommended)

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select **RinglyPro CRM** service
3. Go to **Environment** tab
4. Click **Add Environment Variable**
5. Add:

```
Key:   ELEVENLABS_VOICEMAIL_URL
Value: https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_default/voicemail_1764895914610.mp3
```

6. Click **Save changes** (will trigger auto-redeploy)

---

## What Happens for Each Client Type

### New Clients (Sign Up Today):

**Scenario A: Client configures custom message**
1. Goes to Settings → Types custom message
2. Clicks Save
3. Audio auto-generates and uploads to S3
4. ✅ **Result:** Outbound calls use their custom Lina voice

**Scenario B: Client does NOT configure custom message**
1. Makes outbound call immediately
2. System checks: No custom message found
3. Falls back to `ELEVENLABS_VOICEMAIL_URL`
4. ✅ **Result:** Plays default RinglyPro Lina voice (if env var set)
5. ✅ **Result:** Plays Twilio Polly TTS (if env var NOT set)

### Existing Clients:

**Category 1: Has custom message (RinglyPro, PixlyPro, DIGIT2AI)**
- **Action needed:** Run migration script once (see below)
- **Result:** Uses their custom S3 audio

**Category 2: No custom message (Most clients)**
- **Action needed:** None
- **Result:** Uses default Lina voice (when env var set)

---

## Migration for Existing Clients (One-Time)

Run this on production to migrate existing clients with custom messages:

```bash
# Via Render Dashboard Shell
node scripts/regenerate-all-with-s3.js
```

**What it does:**
- Finds all clients with custom messages
- Generates ElevenLabs audio for each
- Uploads to S3
- Updates database

---

## Testing

### Test Default Voice (New Client):

1. Create test client account (or use existing without custom message)
2. Go to **Outbound Caller**
3. Enter test phone number
4. Make call
5. **Expected:** Hears default RinglyPro Lina voice

### Test Custom Voice (PixlyPro):

1. Log in as PixlyPro
2. Go to **Outbound Caller**
3. Enter test phone number
4. Make call
5. **Expected:** Hears PixlyPro's custom Lina voice

---

## Cost Analysis

### Default Voicemail:
- **Generation:** $0.18 (one-time)
- **Storage:** $0.00001/month (~1KB)
- **Total:** Essentially free

### Custom Client Messages:
- **Generation:** $0.18 per client (when they save message)
- **Storage:** $0.00002/month per client
- **100 clients:** ~$0.02/month storage
- **1000 clients:** ~$0.20/month storage

---

## Troubleshooting

### Issue: New client hears Twilio Polly voice (not Lina)

**Cause:** `ELEVENLABS_VOICEMAIL_URL` not set

**Fix:**
1. Set environment variable (see Step 2 above)
2. Or client can add custom message in Settings (auto-generates)

### Issue: "403 Forbidden" when playing default audio

**Cause:** Bucket policy not applied

**Fix:** Apply bucket policy (see Step 1 above)

### Issue: Default audio plays for client with custom message

**Cause:** Migration script not run yet

**Fix:** Run `node scripts/regenerate-all-with-s3.js` on production

---

## Summary

### ✅ What's Configured:

1. **S3 voicemail storage** - Persistent, scalable
2. **Default Lina voice** - Pre-generated and uploaded to S3
3. **3-tier fallback** - Always works, even without setup
4. **Multi-tenant ready** - Each client isolated

### ⏳ What You Need to Do:

1. **Apply S3 bucket policy** (2 minutes)
2. **Set ELEVENLABS_VOICEMAIL_URL** environment variable (2 minutes)
3. **Run migration script** for existing clients (1 minute)

### 🎉 Result:

**New clients:**
- ✅ Without custom message → Default Lina voice
- ✅ With custom message → Custom Lina voice

**Existing clients:**
- ✅ Without custom message → Default Lina voice
- ✅ With custom message → Custom Lina voice (after migration)

**Everyone gets Lina's premium voice - no manual work required!** 🚀
