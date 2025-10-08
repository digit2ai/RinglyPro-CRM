/**
 * Migration: Add recording_url column to messages table
 *
 * This allows storing Twilio voicemail recording URLs so users can
 * listen to actual audio even if transcription fails or is poor quality
 */

const { Sequelize } = require('sequelize');

// Database connection with proper priority
const DATABASE_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ No database URL found. Set CRM_DATABASE_URL or DATABASE_URL');
    process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: console.log,
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    }
});

async function addRecordingUrlColumn() {
    try {
        console.log('🔄 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Database connected');

        console.log('\n📝 Checking if recording_url column exists...');

        // Check if column already exists
        const [results] = await sequelize.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'messages'
            AND column_name = 'recording_url'
        `);

        if (results.length > 0) {
            console.log('⚠️  recording_url column already exists, skipping...');
            await sequelize.close();
            process.exit(0);
        }

        console.log('➕ Adding recording_url column to messages table...');

        await sequelize.query(`
            ALTER TABLE messages
            ADD COLUMN recording_url VARCHAR(255) NULL
        `);

        console.log('✅ recording_url column added successfully!');

        // Add comment
        await sequelize.query(`
            COMMENT ON COLUMN messages.recording_url
            IS 'Twilio recording URL for voicemails (allows listening to actual audio)'
        `);

        console.log('✅ Column comment added');

        console.log('\n✅ Migration completed successfully!');
        await sequelize.close();
        process.exit(0);

    } catch (error) {
        console.error('❌ Migration failed:', error);
        await sequelize.close();
        process.exit(1);
    }
}

addRecordingUrlColumn();
