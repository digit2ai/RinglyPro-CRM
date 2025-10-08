// Script to run the calendar settings migration
// Usage: node scripts/run-calendar-migration.js

const { Client } = require('pg');
require('dotenv').config();

async function runMigration() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        // Check if column already exists
        const checkColumn = await client.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'clients'
            AND column_name = 'calendar_settings'
        `);

        if (checkColumn.rows.length > 0) {
            console.log('⚠️  calendar_settings column already exists - skipping migration');
            await client.end();
            return;
        }

        // Add calendar_settings column
        console.log('📝 Adding calendar_settings column to clients table...');
        await client.query(`
            ALTER TABLE clients
            ADD COLUMN calendar_settings JSON DEFAULT NULL
        `);

        console.log('✅ Migration completed successfully!');
        console.log('📊 calendar_settings column added to clients table');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        throw error;
    } finally {
        await client.end();
    }
}

// Run migration
if (require.main === module) {
    runMigration()
        .then(() => {
            console.log('\n✅ Calendar settings migration complete!');
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Migration failed:', err);
            process.exit(1);
        });
}

module.exports = runMigration;
