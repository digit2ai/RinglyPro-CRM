// Check PixlyPro audio URL status
const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');

async function checkAudioUrl() {
  try {
    console.log('🔍 Checking PixlyPro audio URL status...\n');

    const [client] = await sequelize.query(
      `SELECT id, business_name,
              outbound_voicemail_message,
              outbound_voicemail_audio_url,
              LENGTH(outbound_voicemail_message) as message_length
       FROM clients
       WHERE id = 29`,
      { type: QueryTypes.SELECT }
    );

    if (client) {
      console.log(`Client ID: ${client.id}`);
      console.log(`Business Name: ${client.business_name}`);
      console.log(`Has Custom Message: ${!!client.outbound_voicemail_message}`);
      console.log(`Message Length: ${client.message_length} characters`);
      console.log(`Audio URL: ${client.outbound_voicemail_audio_url || 'NULL (❌ MISSING)'}`);

      if (!client.outbound_voicemail_audio_url && client.outbound_voicemail_message) {
        console.log('\n⚠️ ISSUE FOUND:');
        console.log('Client has custom message but no audio URL!');
        console.log('\n💡 SOLUTION:');
        console.log('The custom message was saved before audio generation was implemented.');
        console.log('To fix: Have client re-save their message in Settings, OR run regeneration script.');
      } else if (client.outbound_voicemail_audio_url) {
        console.log('\n✅ Audio URL exists! Voice should work.');
      }
    } else {
      console.log('❌ Client 29 not found');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAudioUrl();
