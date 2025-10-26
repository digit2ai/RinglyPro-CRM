/**
 * Generate ElevenLabs Rachel Premium Voice Voicemail
 *
 * This script generates the voicemail audio file using ElevenLabs Rachel voice
 * and uploads it to a publicly accessible URL for Twilio to play
 *
 * Usage: node scripts/generate-elevenlabs-voicemail.js
 *
 * Requirements:
 * - ELEVENLABS_API_KEY environment variable
 * - Rachel voice ID (you can find this in your ElevenLabs dashboard)
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');

// ElevenLabs API configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Rachel Premium Voice ID (you'll need to get this from your ElevenLabs account)
// Common Rachel voice IDs:
// - Rachel (Premium): 21m00Tcm4TlvDq8ikWAM
const RACHEL_VOICE_ID = process.env.ELEVENLABS_RACHEL_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';

// The voicemail message (TCPA-compliant)
const VOICEMAIL_MESSAGE = "Hi, this is Lina from RinglyPro.com, calling with a quick business update. RinglyPro offers a free AI receptionist that helps small businesses answer calls, book appointments, and send automatic follow-ups — so you never miss a lead, even after hours. This message is for informational purposes only, and there's no obligation or payment required. If you'd like to learn more, you can visit RinglyPro.com or call us back at 813-212-4888. If you'd prefer not to receive future informational updates, you can reply stop or call the same number and we'll remove you. Thanks for your time, and have a great day.";

async function generateVoicemail() {
  console.log('🎙️  Generating ElevenLabs Rachel Premium Voice voicemail...\n');

  if (!ELEVENLABS_API_KEY) {
    console.error('❌ Error: ELEVENLABS_API_KEY environment variable not set');
    console.log('\nPlease set your ElevenLabs API key:');
    console.log('export ELEVENLABS_API_KEY="your-api-key-here"');
    process.exit(1);
  }

  console.log(`📝 Message: ${VOICEMAIL_MESSAGE.substring(0, 100)}...`);
  console.log(`🎤 Voice ID: ${RACHEL_VOICE_ID}`);
  console.log(`🔑 API Key: ${ELEVENLABS_API_KEY.substring(0, 10)}...`);
  console.log('\n🔄 Calling ElevenLabs API...\n');

  const postData = JSON.stringify({
    text: VOICEMAIL_MESSAGE,
    model_id: "eleven_monolingual_v1",
    voice_settings: {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true
    }
  });

  const options = {
    hostname: 'api.elevenlabs.io',
    port: 443,
    path: `/v1/text-to-speech/${RACHEL_VOICE_ID}`,
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Length': Buffer.byteLength(postData)
    }
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      console.log(`📡 Response status: ${res.statusCode}`);

      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', (chunk) => {
          errorData += chunk;
        });
        res.on('end', () => {
          console.error('❌ Error response:', errorData);
          reject(new Error(`ElevenLabs API error: ${res.statusCode}`));
        });
        return;
      }

      const outputPath = path.join(__dirname, '..', 'public', 'voicemail-rachel.mp3');
      const outputDir = path.dirname(outputPath);

      // Ensure directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const writeStream = fs.createWriteStream(outputPath);

      res.pipe(writeStream);

      writeStream.on('finish', () => {
        writeStream.close();
        const stats = fs.statSync(outputPath);
        console.log(`✅ Voicemail audio generated successfully!`);
        console.log(`📁 File saved to: ${outputPath}`);
        console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
        console.log(`\n🌐 Public URL (after deploy): https://ringlypro-crm.onrender.com/voicemail-rachel.mp3`);
        console.log(`\n📋 Next steps:`);
        console.log(`1. Commit and push the generated file`);
        console.log(`2. Add this environment variable to Render:`);
        console.log(`   ELEVENLABS_VOICEMAIL_URL=https://ringlypro-crm.onrender.com/voicemail-rachel.mp3`);
        console.log(`3. Deploy the updated code`);
        resolve(outputPath);
      });

      writeStream.on('error', (err) => {
        console.error('❌ Error writing file:', err);
        reject(err);
      });
    });

    req.on('error', (err) => {
      console.error('❌ Request error:', err);
      reject(err);
    });

    req.write(postData);
    req.end();
  });
}

// Run the script
generateVoicemail().catch(err => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
