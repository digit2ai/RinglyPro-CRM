# Lina Voice Implementation for Custom Outbound Voicemail Messages

## Overview

This implementation enables **Lina's ElevenLabs voice** to play custom outbound voicemail messages configured by clients in their Settings. When a client saves a custom voicemail message, the system automatically generates an MP3 audio file using ElevenLabs' Lina voice (Bella voice ID), stores it, and plays it during outbound calls and Prospect Manager calls.

## Implementation Summary

### ✅ Completed Changes

1. **Database Schema** - Added `outbound_voicemail_audio_url` column to `clients` table
2. **Client Model** - Updated Sequelize model to include new field
3. **Audio Generation Service** - Created `voicemailAudioService.js` for ElevenLabs integration
4. **Settings API** - Updated client settings endpoints to generate audio on save
5. **Outbound Caller** - Modified to prioritize custom Lina voice audio

---

## Files Modified

### 1. Database Migration
**File:** `migrations/add-outbound-voicemail-audio-url.sql`
- Added `outbound_voicemail_audio_url TEXT` column to `clients` table
- Migration script: `scripts/add-voicemail-audio-url-column.js`
- Status: ✅ **Successfully applied to production database**

### 2. Client Model
**File:** `src/models/Client.js` (lines 59-64)
```javascript
outbound_voicemail_audio_url: {
    type: DataTypes.TEXT,
    allowNull: true,
    defaultValue: null,
    comment: 'URL to ElevenLabs-generated audio file for custom outbound voicemail message (Lina voice)'
}
```

### 3. Voicemail Audio Service
**File:** `src/services/voicemailAudioService.js` (NEW)

**Key Features:**
- Uses ElevenLabs **Bella voice** (ID: `EXAVITQu4vr4xnSDxMaL`) for Lina
- Generates MP3 files when custom voicemail message is saved
- Stores audio files in `/public/voicemail-audio/` directory
- Automatic cleanup of old audio files (30+ days)
- Handles file deletion when message is updated or deleted

**Key Methods:**
- `generateVoicemailAudio(text, clientId)` - Generate ElevenLabs audio
- `deleteVoicemailAudio(audioUrl)` - Delete old audio file
- `cleanupOldAudioFiles()` - Remove files older than 30 days

**Voice Settings:**
```javascript
model_id: 'eleven_multilingual_v2',  // Supports English and Spanish
voice_settings: {
    stability: 0.6,              // Higher stability for voicemail
    similarity_boost: 0.8,       // High similarity for consistent voice
    style: 0.3,                  // Moderate style for natural delivery
    use_speaker_boost: true
}
```

### 4. Client Settings API
**File:** `src/routes/client-settings.js`

**Updated Endpoints:**

#### GET `/api/client-settings/:clientId/voicemail-message`
- Returns custom message, audio URL, and isCustom flag
```json
{
  "success": true,
  "message": "Custom voicemail text...",
  "audioUrl": "/voicemail-audio/voicemail_client_15_1234567890.mp3",
  "isCustom": true
}
```

#### PUT `/api/client-settings/:clientId/voicemail-message`
**Flow:**
1. Receive custom voicemail message from client
2. Fetch old audio URL (for deletion)
3. Generate new ElevenLabs audio with Lina's voice
4. Save message + audio URL to database
5. Delete old audio file
6. Return success with audio URL

**Response:**
```json
{
  "success": true,
  "message": "Voicemail message updated successfully",
  "audioUrl": "/voicemail-audio/voicemail_client_15_1234567890.mp3",
  "usingLinaVoice": true
}
```

#### DELETE `/api/client-settings/:clientId/voicemail-message`
- Clears message and audio URL
- Deletes audio file from disk

### 5. Outbound Caller Service
**File:** `src/services/outbound-caller.js` (lines 332-410)

**Updated `generateVoiceTwiML()` method:**

**Audio Priority Order:**
1. **Custom ElevenLabs audio (Lina voice)** - If client has custom message with generated audio
2. **Default ElevenLabs audio** - If using default message and `ELEVENLABS_VOICEMAIL_URL` env var is set
3. **Twilio Polly TTS** - Fallback if audio generation fails

**Key Changes:**
- Fetches both `outbound_voicemail_message` AND `outbound_voicemail_audio_url` from database
- Plays custom audio URL with full base URL: `${baseUrl}${customAudioUrl}`
- Logs which voice/audio is being used for debugging

**Example Log Output:**
```
🎤 Playing custom Lina voice audio: https://aiagent.ringlypro.com/voicemail-audio/voicemail_client_15_1702584930123.mp3
```

---

## How It Works: End-to-End Flow

### When Client Saves Custom Voicemail Message

1. **Client Action:** User edits "Custom Voicemail Message" in Settings → CRM tab
2. **Save Request:** PUT request to `/api/client-settings/:clientId/voicemail-message`
3. **Audio Generation:**
   - Service calls ElevenLabs API with Lina's voice (Bella)
   - Generates MP3 file: `voicemail_client_15_1702584930123.mp3`
   - Saves to `/public/voicemail-audio/` directory
   - Returns public URL: `/voicemail-audio/voicemail_client_15_1702584930123.mp3`
4. **Database Update:**
   - `outbound_voicemail_message` = custom text
   - `outbound_voicemail_audio_url` = `/voicemail-audio/voicemail_client_15_1702584930123.mp3`
5. **Cleanup:** Old audio file deleted (if exists)

### When Outbound Call is Made

1. **Call Initiated:** From Outbound Call or Prospect Manager feature
2. **Twilio Webhook:** POST to `/api/outbound-caller/voice?clientId=15`
3. **TwiML Generation:**
   - Fetch client's `outbound_voicemail_audio_url` from database
   - If exists: `<Play>https://aiagent.ringlypro.com/voicemail-audio/voicemail_client_15_1702584930123.mp3</Play>`
   - If not: Fall back to Twilio TTS or default ElevenLabs audio
4. **Audio Playback:** Twilio plays Lina's voice with custom message
5. **Call Completion:** Hangup after message

---

## Voice Configuration

### Lina Voice (ElevenLabs Bella)
- **Voice ID:** `EXAVITQu4vr4xnSDxMaL`
- **Model:** `eleven_multilingual_v2` (supports English & Spanish)
- **Characteristics:** Natural female voice, warm and professional
- **Use Case:** Custom client voicemail messages

### Text Preprocessing
Custom messages are preprocessed for better pronunciation:
```javascript
text
  .replace(/RinglyPro/gi, 'Ringly Pro')  // Clearer pronunciation
  .replace(/\bAI\b/g, 'A.I.')            // Spell out AI
  .replace(/\$/g, ' dollars')             // Convert $ to words
  .replace(/&/g, ' and ')                 // Convert & to word
```

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/client-settings/:clientId/voicemail-message` | Get custom message and audio URL |
| PUT | `/api/client-settings/:clientId/voicemail-message` | Save custom message and generate Lina audio |
| DELETE | `/api/client-settings/:clientId/voicemail-message` | Delete custom message and audio file |

---

## Storage & File Management

### Audio File Storage
- **Location:** `/public/voicemail-audio/`
- **Naming:** `voicemail_client_{clientId}_{timestamp}.mp3`
- **Access:** Public URL served by Express static middleware

### File Lifecycle
1. **Creation:** When custom message is saved
2. **Update:** New file created, old file deleted
3. **Deletion:** When message is reset to default
4. **Cleanup:** Automated cleanup of files older than 30 days

### Disk Usage Estimate
- Average voicemail: ~200-500 KB per client
- 100 clients with custom messages: ~25-50 MB
- 1000 clients: ~250-500 MB

---

## Cost Analysis

### ElevenLabs API Costs
- **Pricing:** ~$0.30 per 1000 characters
- **Average Message:** 500 characters = **$0.15 per client**
- **Regeneration:** Only when client updates their message
- **Expected Usage:**
  - 100 clients = $15 one-time
  - 1000 clients = $150 one-time
  - Updates/month (estimated 10%) = $1.50 - $15/month

### Storage Costs
- **Audio Files:** Negligible (50-500 MB total)
- **Bandwidth:** Minimal (files played once per call)

---

## Testing Instructions

### 1. Test Custom Message Generation

```bash
# Save custom voicemail message
curl -X PUT https://aiagent.ringlypro.com/api/client-settings/15/voicemail-message \
  -H "Content-Type: application/json" \
  -d '{"message": "Hi, this is a custom test message from RinglyPro."}'

# Expected Response:
{
  "success": true,
  "message": "Voicemail message updated successfully",
  "audioUrl": "/voicemail-audio/voicemail_client_15_1702584930123.mp3",
  "usingLinaVoice": true
}
```

### 2. Verify Audio File Created

```bash
# Check if audio file exists
ls -lh public/voicemail-audio/

# Expected: voicemail_client_15_*.mp3 file
```

### 3. Test Outbound Call

1. Go to **Business Copilot → Outbound Call**
2. Enter a test phone number
3. Make call
4. **Expected:** Lina's voice plays the custom message you configured

### 4. Verify Database

```sql
SELECT id, business_name, outbound_voicemail_message, outbound_voicemail_audio_url
FROM clients
WHERE id = 15;
```

Expected result: Both message and audio URL populated

---

## Troubleshooting

### Issue: Audio Not Generated

**Symptoms:** `usingLinaVoice: false` in API response

**Check:**
1. ElevenLabs API key configured: `process.env.ELEVENLABS_API_KEY`
2. Check server logs for ElevenLabs API errors
3. Verify `/public/voicemail-audio/` directory exists and is writable

**Fallback Behavior:** System will use Twilio Polly TTS (less natural voice)

### Issue: Audio Not Playing During Call

**Symptoms:** Twilio plays TTS instead of custom audio

**Check:**
1. Verify `outbound_voicemail_audio_url` is saved in database
2. Check audio file exists: `ls public/voicemail-audio/voicemail_client_*`
3. Verify `BASE_URL` environment variable is correct
4. Check Twilio webhook logs: `/api/outbound-caller/voice?clientId=15`

**Expected Log:**
```
🎤 Playing custom Lina voice audio: https://aiagent.ringlypro.com/voicemail-audio/voicemail_client_15_*.mp3
```

### Issue: Old Audio Files Not Deleted

**Check:**
- Cleanup runs automatically on server startup (after 5 seconds)
- Files older than 30 days are deleted
- Manual cleanup: Restart server or run cleanup script

---

## Environment Variables Required

```bash
# ElevenLabs API Key (required for Lina voice generation)
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Base URL for audio file serving
BASE_URL=https://aiagent.ringlypro.com

# Default ElevenLabs voicemail (optional, for default RinglyPro message)
ELEVENLABS_VOICEMAIL_URL=https://your-storage/default-voicemail.mp3
```

---

## Future Enhancements

### Potential Improvements

1. **Voice Selection**
   - Allow clients to choose between Rachel, Lina, or other ElevenLabs voices
   - Add voice preview in settings

2. **Cloud Storage**
   - Move audio files to AWS S3 or Google Cloud Storage
   - Reduces local disk usage
   - Better scalability

3. **Audio Preview**
   - Add "Preview" button in settings to hear generated audio before saving
   - Reduce trial-and-error

4. **Multiple Languages**
   - Auto-detect message language
   - Use appropriate ElevenLabs voice (Spanish, French, etc.)

5. **Analytics**
   - Track audio generation success rate
   - Monitor ElevenLabs API usage and costs

---

## Deployment Checklist

Before deploying to production:

- [x] Database migration applied
- [x] `ELEVENLABS_API_KEY` environment variable set
- [x] `/public/voicemail-audio/` directory exists with write permissions
- [x] `BASE_URL` environment variable correctly configured
- [x] Server restart to load new voicemail audio service
- [ ] Test with real client account
- [ ] Verify audio plays correctly in outbound calls
- [ ] Monitor ElevenLabs API usage in first week
- [ ] Check disk space usage for audio files

---

## Summary

✅ **Implementation Complete**

Clients can now:
1. Configure custom outbound voicemail messages in Settings
2. Have their message automatically converted to Lina's natural voice
3. Hear Lina play their custom message during Outbound Calls and Prospect Manager calls

The system handles:
- Audio generation on save
- File storage and cleanup
- Graceful fallback if generation fails
- Old file deletion on updates

**Next Steps:**
- Test with production client
- Monitor ElevenLabs costs
- Consider adding voice preview feature
