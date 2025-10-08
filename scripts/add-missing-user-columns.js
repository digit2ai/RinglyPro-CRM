// Script to add all missing columns to users table
// Safe to run multiple times - checks if column exists before adding
const { Client } = require('pg');
require('dotenv').config();

async function addMissingUserColumns() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || process.env.CRM_DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // Helper function to add column if it doesn't exist
        const addColumnIfNotExists = async (columnName, columnDefinition) => {
            const check = await client.query(`
                SELECT column_name
                FROM information_schema.columns
                WHERE table_name = 'users' AND column_name = $1
            `, [columnName]);

            if (check.rows.length === 0) {
                console.log(`➕ Adding column: ${columnName}`);
                await client.query(`ALTER TABLE users ADD COLUMN ${columnName} ${columnDefinition}`);
                console.log(`   ✅ Added ${columnName}`);
            } else {
                console.log(`⏭️  Column already exists: ${columnName}`);
            }
        };

        console.log('📝 Adding missing user table columns...\n');

        // Add all potentially missing columns
        await addColumnIfNotExists('first_name', 'VARCHAR(100)');
        await addColumnIfNotExists('last_name', 'VARCHAR(100)');
        await addColumnIfNotExists('business_type', "VARCHAR(100) CHECK (business_type IN ('healthcare', 'legal', 'realestate', 'automotive', 'retail', 'restaurant', 'beauty', 'fitness', 'professional', 'technology', 'education', 'other'))");
        await addColumnIfNotExists('website_url', 'VARCHAR(500)');
        await addColumnIfNotExists('phone_number', 'VARCHAR(20)');
        await addColumnIfNotExists('business_description', 'TEXT');
        await addColumnIfNotExists('business_hours', 'JSONB');
        await addColumnIfNotExists('services', 'TEXT');
        await addColumnIfNotExists('terms_accepted', 'BOOLEAN DEFAULT FALSE NOT NULL');
        await addColumnIfNotExists('free_trial_minutes', 'INTEGER DEFAULT 100 NOT NULL');
        await addColumnIfNotExists('onboarding_completed', 'BOOLEAN DEFAULT FALSE NOT NULL');
        await addColumnIfNotExists('email_verified', 'BOOLEAN DEFAULT FALSE');
        await addColumnIfNotExists('email_verification_token', 'VARCHAR(255)');
        await addColumnIfNotExists('password_reset_token', 'VARCHAR(255)');
        await addColumnIfNotExists('password_reset_expires', 'TIMESTAMP WITH TIME ZONE');

        console.log('\n✅ Migration completed successfully!');
        console.log('📊 All required user table columns are now present\n');

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error(error);
        throw error;
    } finally {
        await client.end();
    }
}

// Run migration
if (require.main === module) {
    addMissingUserColumns()
        .then(() => {
            console.log('✅ User table migration complete!');
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Migration failed:', err);
            process.exit(1);
        });
}

module.exports = addMissingUserColumns;
