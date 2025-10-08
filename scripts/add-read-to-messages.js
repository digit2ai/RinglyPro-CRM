/**
 * Migration: Add read column to messages table
 *
 * This allows tracking which messages have been read by the client
 * Used for badge counter to show only unread messages
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

async function addReadColumn() {
    try {
        console.log('🔄 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Database connected');

        console.log('\n📝 Checking if read column exists...');

        // Check if column already exists
        const [results] = await sequelize.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'messages'
            AND column_name = 'read'
        `);

        if (results.length > 0) {
            console.log('⚠️  read column already exists, skipping...');
            await sequelize.close();
            process.exit(0);
        }

        console.log('➕ Adding read column to messages table...');

        await sequelize.query(`
            ALTER TABLE messages
            ADD COLUMN read BOOLEAN NOT NULL DEFAULT false
        `);

        console.log('✅ read column added successfully!');

        // Add comment
        await sequelize.query(`
            COMMENT ON COLUMN messages.read
            IS 'Whether the message has been read by the client'
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

addReadColumn();
