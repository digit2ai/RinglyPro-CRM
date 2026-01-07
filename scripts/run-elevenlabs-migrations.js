/**
 * Script to run ElevenLabs migrations
 * Run with: node scripts/run-elevenlabs-migrations.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: console.log,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

async function runMigrations() {
  try {
    console.log('🔄 Running ElevenLabs migrations...');

    // 1. Add elevenlabs_agent_id column to clients
    console.log('📦 Adding elevenlabs_agent_id column to clients...');
    try {
      await sequelize.query(`
        ALTER TABLE clients ADD COLUMN IF NOT EXISTS elevenlabs_agent_id VARCHAR
      `);
      console.log('✅ Column added or already exists');
    } catch (e) {
      console.log('Note:', e.message);
    }

    // 2. Set agent ID for Client 32
    console.log('📦 Setting agent ID for Client 32...');
    await sequelize.query(`
      UPDATE clients SET elevenlabs_agent_id = 'agent_1801kdnq8avcews9r9rrvf7k0vh1' WHERE id = 32
    `);
    console.log('✅ Agent ID set for Client 32');

    // 3. Add elevenlabs to message_source enum
    console.log('📦 Adding elevenlabs to message_source enum...');
    try {
      await sequelize.query(`
        ALTER TYPE "enum_messages_message_source" ADD VALUE IF NOT EXISTS 'elevenlabs'
      `);
      console.log('✅ Enum value added');
    } catch (e) {
      console.log('Note (enum may already exist):', e.message);
    }

    // Verify Client 32 has the agent ID
    const [client] = await sequelize.query(
      `SELECT id, business_name, elevenlabs_agent_id FROM clients WHERE id = 32`,
      { type: Sequelize.QueryTypes.SELECT }
    );

    console.log('\\n✅ Migration complete!');
    console.log('Client 32:', client);

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  }
}

runMigrations();
