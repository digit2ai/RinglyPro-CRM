// Add outbound_voicemail_audio_url column to clients table
const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');

async function addVoicemailAudioUrlColumn() {
  try {
    console.log('🔧 Adding outbound_voicemail_audio_url column to clients table...');

    // Add the column
    await sequelize.query(`
      ALTER TABLE clients
      ADD COLUMN IF NOT EXISTS outbound_voicemail_audio_url TEXT;
    `, {
      type: QueryTypes.RAW
    });

    console.log('✅ Column added successfully');

    // Verify the column was added
    const result = await sequelize.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'clients'
        AND column_name = 'outbound_voicemail_audio_url';
    `, {
      type: QueryTypes.SELECT
    });

    if (result && result.length > 0) {
      console.log('✅ Verification successful:');
      console.log(result[0]);
    } else {
      console.log('⚠️ Column not found in schema - may already exist');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

addVoicemailAudioUrlColumn();
