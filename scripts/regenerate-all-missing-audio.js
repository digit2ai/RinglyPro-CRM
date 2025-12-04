// Regenerate ElevenLabs audio for ALL clients with custom messages but no audio URLs
const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');
const voicemailAudioService = require('../src/services/voicemailAudioService');

async function regenerateAllMissingAudio() {
  try {
    console.log('🔍 Finding clients with custom messages but no audio URLs...\n');

    // Find all clients with custom messages but missing audio URLs
    const clients = await sequelize.query(
      `SELECT id, business_name, outbound_voicemail_message,
              LENGTH(outbound_voicemail_message) as message_length
       FROM clients
       WHERE outbound_voicemail_message IS NOT NULL
         AND outbound_voicemail_message != ''
         AND (outbound_voicemail_audio_url IS NULL OR outbound_voicemail_audio_url = '')
       ORDER BY id`,
      { type: QueryTypes.SELECT }
    );

    if (clients.length === 0) {
      console.log('✅ All clients with custom messages already have audio URLs!');
      process.exit(0);
    }

    console.log(`Found ${clients.length} client(s) needing audio regeneration:\n`);
    clients.forEach(c => {
      console.log(`- Client ${c.id}: ${c.business_name} (${c.message_length} chars)`);
    });
    console.log();

    let successCount = 0;
    let failCount = 0;

    for (const client of clients) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing Client ${client.id}: ${client.business_name}`);
      console.log(`${'='.repeat(60)}`);

      try {
        console.log(`Message: "${client.outbound_voicemail_message.substring(0, 80)}..."`);
        console.log(`🎤 Generating Lina voice audio...`);

        const audioUrl = await voicemailAudioService.generateVoicemailAudio(
          client.outbound_voicemail_message,
          client.id
        );

        if (!audioUrl) {
          console.error(`❌ Audio generation failed for client ${client.id}`);
          failCount++;
          continue;
        }

        console.log(`✅ Audio generated: ${audioUrl}`);

        // Update database
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

        console.log(`✅ Database updated for client ${client.id}`);
        successCount++;

        // Small delay between API calls to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ Error processing client ${client.id}:`, error.message);
        failCount++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Clients: ${clients.length}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`❌ Failed: ${failCount}`);

    if (successCount > 0) {
      console.log(`\n🎉 Successfully regenerated audio for ${successCount} client(s)!`);
      console.log(`All affected clients will now use Lina's premium voice for outbound calls.`);
    }

    process.exit(failCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

regenerateAllMissingAudio();
