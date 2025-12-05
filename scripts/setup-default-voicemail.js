// Generate default RinglyPro voicemail with Lina's voice and upload to S3
const voicemailAudioService = require('../src/services/voicemailAudioService');
const logger = require('../src/utils/logger');

async function setupDefaultVoicemail() {
  try {
    console.log('🎤 Generating default RinglyPro voicemail with Lina\'s voice...\n');

    const defaultMessage = "Hi, this is Lina from RinglyPro.com, calling with a quick business update. RinglyPro offers a free AI receptionist that helps small businesses answer calls, book appointments, and send automatic follow-ups — so you never miss a lead, even after hours. This message is for informational purposes only, and there's no obligation or payment required. If you'd like to learn more, you can visit RinglyPro.com or call us back at 813-212-4888. If you'd prefer not to receive future informational updates, you can reply stop or call the same number and we'll remove you. Thanks for your time, and have a great day.";

    console.log(`Message length: ${defaultMessage.length} characters`);
    console.log(`Message preview: "${defaultMessage.substring(0, 100)}..."\n`);

    // Use client ID 0 for default message (or any identifier)
    console.log('📤 Uploading to S3...');
    const audioUrl = await voicemailAudioService.generateVoicemailAudio(defaultMessage, 'default');

    if (!audioUrl) {
      console.error('❌ Failed to generate default voicemail audio');
      console.error('Check ELEVENLABS_API_KEY and AWS credentials');
      process.exit(1);
    }

    console.log('\n✅ SUCCESS! Default voicemail audio generated and uploaded to S3\n');
    console.log(`S3 URL: ${audioUrl}\n`);
    console.log('━'.repeat(80));
    console.log('📋 NEXT STEP: Add this to your Render environment variables');
    console.log('━'.repeat(80));
    console.log(`\nELEVENLABS_VOICEMAIL_URL=${audioUrl}\n`);
    console.log('━'.repeat(80));
    console.log('\nHow to add on Render:');
    console.log('1. Go to https://dashboard.render.com');
    console.log('2. Select RinglyPro CRM service');
    console.log('3. Go to Environment tab');
    console.log('4. Add new variable: ELEVENLABS_VOICEMAIL_URL');
    console.log(`5. Value: ${audioUrl}`);
    console.log('6. Save changes (will trigger redeploy)\n');

    process.exit(0);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

setupDefaultVoicemail();
