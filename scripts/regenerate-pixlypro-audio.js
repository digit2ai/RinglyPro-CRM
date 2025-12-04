// Regenerate ElevenLabs audio for PixlyPro's existing custom message
const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');
const voicemailAudioService = require('../src/services/voicemailAudioService');

async function regenerateAudio() {
  try {
    console.log('🔄 Regenerating ElevenLabs audio for PixlyPro...\n');

    // Fetch PixlyPro's custom message
    const [client] = await sequelize.query(
      `SELECT id, business_name, outbound_voicemail_message
       FROM clients
       WHERE id = 29`,
      { type: QueryTypes.SELECT }
    );

    if (!client) {
      console.error('❌ Client 29 (PixlyPro) not found');
      process.exit(1);
    }

    if (!client.outbound_voicemail_message) {
      console.error('❌ PixlyPro has no custom message to regenerate');
      process.exit(1);
    }

    console.log(`Client: ${client.business_name} (ID: ${client.id})`);
    console.log(`Message Length: ${client.outbound_voicemail_message.length} characters`);
    console.log(`Message Preview: "${client.outbound_voicemail_message.substring(0, 100)}..."\n`);

    // Generate ElevenLabs audio with Lina's voice
    console.log('🎤 Generating Lina voice audio with ElevenLabs...');
    const audioUrl = await voicemailAudioService.generateVoicemailAudio(
      client.outbound_voicemail_message,
      client.id
    );

    if (!audioUrl) {
      console.error('❌ Audio generation failed!');
      console.error('Check ELEVENLABS_API_KEY environment variable and server logs.');
      process.exit(1);
    }

    console.log(`✅ Audio generated: ${audioUrl}\n`);

    // Update database with audio URL
    console.log('💾 Updating database with audio URL...');
    await sequelize.query(
      `UPDATE clients
       SET outbound_voicemail_audio_url = :audioUrl,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = :clientId`,
      {
        replacements: { clientId: client.id, audioUrl },
        type: QueryTypes.UPDATE
      }
    );

    console.log('✅ Database updated successfully!\n');

    // Verify update
    const [updated] = await sequelize.query(
      `SELECT outbound_voicemail_audio_url FROM clients WHERE id = 29`,
      { type: QueryTypes.SELECT }
    );

    console.log('📋 Verification:');
    console.log(`Audio URL in DB: ${updated.outbound_voicemail_audio_url}`);

    // Check file exists
    const fs = require('fs');
    const path = require('path');
    const audioPath = path.join(process.cwd(), 'public', audioUrl.replace(/^\//, ''));

    if (fs.existsSync(audioPath)) {
      const stats = fs.statSync(audioPath);
      console.log(`Audio File Size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`\n✅ SUCCESS! PixlyPro will now use Lina's premium voice for outbound calls.`);
    } else {
      console.log('⚠️ Audio file not found on disk at expected location');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

regenerateAudio();
