// Regenerate ElevenLabs audio for ALL clients with custom messages and upload to S3
const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');
const voicemailAudioService = require('../src/services/voicemailAudioService');

async function regenerateAllWithS3() {
  try {
    console.log('🔄 Regenerating voicemail audio for all clients with custom messages...\n');

    // Find all clients with custom messages (regardless of audio URL status)
    const clients = await sequelize.query(
      `SELECT id, business_name, outbound_voicemail_message,
              outbound_voicemail_audio_url,
              LENGTH(outbound_voicemail_message) as message_length
       FROM clients
       WHERE outbound_voicemail_message IS NOT NULL
         AND outbound_voicemail_message != ''
       ORDER BY id`,
      { type: QueryTypes.SELECT }
    );

    if (clients.length === 0) {
      console.log('ℹ️ No clients with custom voicemail messages found.');
      process.exit(0);
    }

    console.log(`Found ${clients.length} client(s) with custom voicemail messages:\n`);
    clients.forEach(c => {
      const hasAudio = c.outbound_voicemail_audio_url ? '✅' : '❌';
      console.log(`- Client ${c.id}: ${c.business_name} (${c.message_length} chars) ${hasAudio}`);
    });
    console.log();

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const client of clients) {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`Processing Client ${client.id}: ${client.business_name}`);
      console.log(`${'='.repeat(60)}`);

      try {
        // Check if already has S3 URL
        if (client.outbound_voicemail_audio_url && client.outbound_voicemail_audio_url.includes('.s3.amazonaws.com/')) {
          console.log(`✅ Already has S3 audio: ${client.outbound_voicemail_audio_url}`);
          console.log('⏭️ Skipping (already migrated to S3)');
          skippedCount++;
          continue;
        }

        console.log(`Message: "${client.outbound_voicemail_message.substring(0, 80)}..."`);
        console.log(`🎤 Generating Lina voice audio and uploading to S3...`);

        // Delete old audio if exists (local file)
        if (client.outbound_voicemail_audio_url) {
          console.log(`🗑️ Deleting old audio: ${client.outbound_voicemail_audio_url}`);
          await voicemailAudioService.deleteVoicemailAudio(client.outbound_voicemail_audio_url);
        }

        // Generate new audio with S3 upload
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
    console.log(`MIGRATION SUMMARY`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Total Clients: ${clients.length}`);
    console.log(`✅ Success: ${successCount}`);
    console.log(`⏭️ Skipped (already S3): ${skippedCount}`);
    console.log(`❌ Failed: ${failCount}`);

    if (successCount > 0) {
      console.log(`\n🎉 Successfully migrated ${successCount} client(s) to S3!`);
      console.log(`All clients will now use persistent Lina voice audio from AWS S3.`);
    }

    process.exit(failCount > 0 ? 1 : 0);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

regenerateAllWithS3();
