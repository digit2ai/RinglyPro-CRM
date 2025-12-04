# Production Audio Regeneration Instructions

## Issue
PixlyPro and potentially other clients have custom voicemail messages saved but no ElevenLabs audio URLs. This is because their messages were saved before the audio generation feature was implemented.

## Solution
Run the audio regeneration script on the production server.

## How to Run on Render

### Option 1: Via Render Dashboard Shell

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your **RinglyPro CRM** service
3. Click **Shell** in the top right
4. Run the following command:

```bash
node scripts/regenerate-all-missing-audio.js
```

### Option 2: Via Render CLI

```bash
render shell ringlypro-crm
node scripts/regenerate-all-missing-audio.js
```

## Expected Output

The script will:
1. Find all clients with custom messages but no audio URLs
2. Generate ElevenLabs audio with Lina's voice for each
3. Update the database with audio URLs
4. Show a summary of successes and failures

### Example Output:
```
🔍 Finding clients with custom messages but no audio URLs...

Found 1 client(s) needing audio regeneration:

- Client 29: PixlyPro (623 chars)

============================================================
Processing Client 29: PixlyPro
============================================================
Message: "Hi, this is Lina from PixlyPro.com, calling with a quick business update..."
🎤 Generating Lina voice audio...
✅ Audio generated: /voicemail-audio/voicemail_client_29_1764865493040.mp3
✅ Database updated for client 29

============================================================
SUMMARY
============================================================
Total Clients: 1
✅ Success: 1
❌ Failed: 0

🎉 Successfully regenerated audio for 1 client(s)!
All affected clients will now use Lina's premium voice for outbound calls.
```

## Verification

After running the script, verify PixlyPro now has premium voice:

1. Log in as PixlyPro user (pixlypro@digit2ai.com)
2. Go to **Business Copilot → Outbound Call**
3. Enter a test phone number
4. Make a call
5. **Expected:** Lina's premium voice plays PixlyPro's custom message

## Individual Client Regeneration

If you need to regenerate audio for a specific client only:

```bash
node scripts/regenerate-pixlypro-audio.js
```

Or check a client's status:

```bash
node scripts/check-pixlypro-audio.js
```

## Environment Requirements

Ensure these environment variables are set on Render:
- `ELEVENLABS_API_KEY` - Required for audio generation
- `BASE_URL` - Should be `https://aiagent.ringlypro.com`

## Cost Estimate

- PixlyPro message (623 chars): ~$0.19
- Each additional client: ~$0.15 average
- One-time cost, only regenerates when clients update messages

## Troubleshooting

### "Audio generation failed"
- Check `ELEVENLABS_API_KEY` is set correctly
- Verify ElevenLabs account has credits
- Check Render logs for detailed error messages

### "Permission denied" on audio directory
- Ensure `/public/voicemail-audio/` directory exists
- Check write permissions on Render instance

### Audio file not accessible via URL
- Verify `BASE_URL` environment variable is correct
- Check Express static middleware is serving `/public` directory
- Confirm audio file was created: `ls -lh public/voicemail-audio/`

## Files Involved

- `scripts/regenerate-all-missing-audio.js` - Batch regeneration (recommended)
- `scripts/regenerate-pixlypro-audio.js` - PixlyPro-specific regeneration
- `scripts/check-pixlypro-audio.js` - Check audio URL status
- `src/services/voicemailAudioService.js` - Audio generation service
- `src/routes/client-settings.js` - API endpoints for saving messages
- `src/services/outbound-caller.js` - Plays audio during calls

## Next Steps

After running the regeneration script:
1. Test PixlyPro outbound call to verify Lina voice works
2. Monitor ElevenLabs API usage in dashboard
3. Check audio files are being served correctly
4. Inform user that premium voice is now working
