// Force regenerate audio for PixlyPro even if URL exists in database
const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');
const voicemailAudioService = require('../src/services/voicemailAudioService');

async function forceRegenerate() {
  try {
    console.log('🔄 Force regenerating audio for PixlyPro (Client 29)...\n');

    // Fetch PixlyPro's custom message
    const [client] = await sequelize.query(
      `SELECT id, business_name, outbound_voicemail_message, outbound_voicemail_audio_url
       FROM clients
       WHERE id = 29`,
      { type: QueryTypes.SELECT }
    );

    if (!client) {
      console.error('❌ Client 29 (PixlyPro) not found');
      process.exit(1);
    }

    if (!client.outbound_voicemail_message) {
      console.error('❌ PixlyPro has no custom message');
      process.exit(1);
    }

    console.log(`Client: ${client.business_name} (ID: ${client.id})`);
    console.log(`Message Length: ${client.outbound_voicemail_message.length} characters`);
    console.log(`Current Audio URL: ${client.outbound_voicemail_audio_url || 'NULL'}`);
    console.log(`Message: "${client.outbound_voicemail_message.substring(0, 100)}..."\n`);

    // Delete old audio file if URL exists
    if (client.outbound_voicemail_audio_url) {
      console.log('🗑️ Deleting old audio file reference...');
      voicemailAudioService.deleteVoicemailAudio(client.outbound_voicemail_audio_url);
    }

    // Force generate new audio
    console.log('🎤 Generating NEW Lina voice audio with ElevenLabs...');
    const audioUrl = await voicemailAudioService.generateVoicemailAudio(
      client.outbound_voicemail_message,
      client.id
    );

    if (!audioUrl) {
      console.error('❌ Audio generation failed!');
      console.error('Check ELEVENLABS_API_KEY environment variable.');
      process.exit(1);
    }

    console.log(`✅ Audio generated: ${audioUrl}\n`);

    // Update database
    console.log('💾 Updating database...');
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

    console.log('✅ Database updated!\n');

    // Verify file exists
    const fs = require('fs');
    const path = require('path');
    const audioPath = path.join(process.cwd(), 'public', audioUrl.replace(/^\//, ''));

    console.log('📋 Verification:');
    console.log(`Audio URL: ${audioUrl}`);
    console.log(`File path: ${audioPath}`);

    if (fs.existsSync(audioPath)) {
      const stats = fs.statSync(audioPath);
      console.log(`File size: ${(stats.size / 1024).toFixed(2)} KB`);
      console.log(`\n✅ SUCCESS! Audio file created and ready.`);
      console.log(`🌐 Will be available at: https://aiagent.ringlypro.com${audioUrl}`);
    } else {
      console.log('⚠️ Warning: Audio file not found at expected path');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

forceRegenerate();
