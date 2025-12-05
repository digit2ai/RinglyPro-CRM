# S3 Voicemail Setup Checklist

## ❌ Issue: "Application Error" on Outbound Calls

**Root Cause:** S3 bucket policy not applied yet - Twilio can't access audio files

---

## ✅ 3-Step Fix (Do These Now)

### Step 1: Apply S3 Bucket Policy (2 minutes) ⚠️ **REQUIRED**

This makes the voicemail audio files publicly accessible so Twilio can play them.

1. Go to: https://s3.console.aws.amazon.com/s3/buckets/ringlypro-uploads
2. Click **Permissions** tab
3. Scroll to **Bucket Policy**
4. Click **Edit**
5. **Paste this policy:**

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

6. Click **Save changes**

**Verify it works:**
```bash
curl -I "https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_16/voicemail_1764894255574.mp3"

# Should return: HTTP/1.1 200 OK
# If returns 403 Forbidden: Policy not applied correctly
```

---

### Step 2: Set Default Voicemail Environment Variable (2 minutes) 🎯 **RECOMMENDED**

This ensures new clients without custom messages hear Lina's voice.

1. Go to: https://dashboard.render.com
2. Select **RinglyPro CRM** service
3. Click **Environment** tab
4. Click **Add Environment Variable**
5. Add:

```
Key:   ELEVENLABS_VOICEMAIL_URL
Value: https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_default/voicemail_1764895914610.mp3
```

6. Click **Save changes** (will trigger auto-redeploy - takes ~2 minutes)

---

### Step 3: Run Migration Script on Production (1 minute) ⚠️ **REQUIRED FOR PIXLYPRO**

This regenerates audio for clients who already have custom messages (PixlyPro, RinglyPro).

1. Go to: https://dashboard.render.com
2. Select **RinglyPro CRM** service
3. Click **Shell** tab (top navigation)
4. Wait for shell to connect
5. Run:

```bash
node scripts/regenerate-all-with-s3.js
```

**Expected output:**
```
Found 2 client(s) with custom voicemail messages:
- Client 15: RinglyPro (607 chars) ✅
- Client 29: PixlyPro (686 chars) ✅

Processing Client 15: RinglyPro
🎤 Generating Lina voice audio and uploading to S3...
✅ Audio generated: https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_15/voicemail_*.mp3
✅ Database updated for client 15

Processing Client 29: PixlyPro
🎤 Generating Lina voice audio and uploading to S3...
✅ Audio generated: https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_29/voicemail_*.mp3
✅ Database updated for client 29

🎉 Successfully migrated 2 client(s) to S3!
```

---

## 🧪 Test After Setup

### Test 1: PixlyPro (Custom Message)

1. Log in as: `pixlypro@digit2ai.com`
2. Go to: **Outbound Caller**
3. Enter test phone number
4. Click **Make Call**
5. **Expected:** Hears PixlyPro's custom Lina voice message

### Test 2: New Client (Default Message)

1. Create new test client OR use client without custom message
2. Go to: **Outbound Caller**
3. Enter test phone number
4. Click **Make Call**
5. **Expected:** Hears default RinglyPro Lina voice message

---

## 📊 Current Status

### What's Working:
- ✅ Code deployed to production
- ✅ S3 upload service active
- ✅ Client 16 (DIGIT2AI) has S3 audio generated locally
- ✅ Default voicemail audio generated and uploaded to S3

### What's Blocking PixlyPro:
- ❌ **S3 bucket policy not applied** → Twilio gets 403 Forbidden
- ❌ **Migration script not run on production** → PixlyPro has no S3 audio yet

**Error you're seeing:**
```
"We are sorry, an application error has occurred"
```

**Why:**
Twilio tries to play S3 URL but gets 403 Forbidden because bucket policy isn't applied.

---

## 🎯 After Completing All 3 Steps:

### For PixlyPro:
- ✅ Outbound calls will play custom Lina voice message
- ✅ Prospect Manager calls will play custom Lina voice message
- ✅ Audio persists forever (no more deployment issues)

### For RinglyPro:
- ✅ Outbound calls will play custom Lina voice message (not hardcoded default)
- ✅ Custom message works correctly

### For ALL Future Clients:
- ✅ Custom messages automatically generate S3 audio
- ✅ Clients without custom message use default Lina voice
- ✅ Zero maintenance required

---

## 🆘 Troubleshooting

### Still getting "application error" after Step 1?

**Check:** Bucket policy applied correctly
```bash
curl -I "https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_16/voicemail_1764894255574.mp3"
```
- If `200 OK` → Policy working
- If `403 Forbidden` → Policy not applied or wrong syntax

### Migration script fails?

**Check:** Environment variables on Render
- `ELEVENLABS_API_KEY` must be set
- `AWS_ACCESS_KEY_ID` must be set
- `AWS_SECRET_ACCESS_KEY` must be set
- `AWS_S3_BUCKET` must be set

### Client still hears Twilio Polly voice (not Lina)?

**Check:** Was migration run? Look in logs for:
```
🎤 Playing custom Lina voice audio: https://ringlypro-uploads.s3.amazonaws.com/voicemail/client_29/...
```

If missing, run migration script again.

---

## 📝 Summary

**Right now:** Code is deployed, but S3 files can't be accessed by Twilio

**After Step 1:** Twilio can access S3 files (fixes "application error")

**After Step 2:** New clients get default Lina voice

**After Step 3:** PixlyPro gets custom Lina voice

**Total time:** ~5 minutes

**Result:** ✅ Multi-tenant voicemail system fully operational
