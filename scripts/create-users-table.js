// Script to create users table if it doesn't exist
const { Client } = require('pg');
require('dotenv').config();

async function createUsersTable() {
    // Use same database priority as app: CRM_DATABASE_URL || DATABASE_URL
    const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

    const client = new Client({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // Check if users table exists
        const checkTable = await client.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'users'
        `);

        if (checkTable.rows.length > 0) {
            console.log('⚠️  users table already exists - skipping creation');
            await client.end();
            return;
        }

        console.log('📝 Creating users table...');

        // Create users table with all required columns
        await client.query(`
            CREATE TABLE users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                first_name VARCHAR(100),
                last_name VARCHAR(100),

                -- Business fields
                business_name VARCHAR(255),
                business_phone VARCHAR(20),
                business_type VARCHAR(100) CHECK (business_type IN ('healthcare', 'legal', 'realestate', 'automotive', 'retail', 'restaurant', 'beauty', 'fitness', 'professional', 'technology', 'education', 'other')),
                website_url VARCHAR(500),
                phone_number VARCHAR(20),
                business_description TEXT,
                business_hours JSONB,
                services TEXT,

                -- Status fields
                terms_accepted BOOLEAN DEFAULT FALSE NOT NULL,
                free_trial_minutes INTEGER DEFAULT 100 NOT NULL,
                onboarding_completed BOOLEAN DEFAULT FALSE NOT NULL,

                -- Email verification
                email_verified BOOLEAN DEFAULT FALSE,
                email_verification_token VARCHAR(255),

                -- Password reset
                password_reset_token VARCHAR(255),
                password_reset_expires TIMESTAMP WITH TIME ZONE,

                -- Timestamps
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )
        `);

        console.log('✅ Users table created successfully!');

        // Create indexes
        console.log('📝 Creating indexes...');

        await client.query(`CREATE UNIQUE INDEX idx_users_email ON users(email)`);
        console.log('   ✅ Email index created');

        await client.query(`CREATE INDEX idx_users_business_type ON users(business_type)`);
        console.log('   ✅ Business type index created');

        await client.query(`CREATE INDEX idx_users_onboarding_completed ON users(onboarding_completed)`);
        console.log('   ✅ Onboarding index created');

        // Create trigger for updated_at
        console.log('📝 Creating updated_at trigger...');
        await client.query(`
            CREATE OR REPLACE FUNCTION update_updated_at_column()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = CURRENT_TIMESTAMP;
                RETURN NEW;
            END;
            $$ language 'plpgsql'
        `);

        await client.query(`
            CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
        `);
        console.log('   ✅ Auto-update trigger created');

        console.log('\n✅ Users table setup completed successfully!');
        console.log('📊 Ready for user registration and authentication\n');

    } catch (error) {
        console.error('❌ Table creation failed:', error.message);
        console.error(error);
        throw error;
    } finally {
        await client.end();
    }
}

// Run table creation
if (require.main === module) {
    createUsersTable()
        .then(() => {
            console.log('✅ Users table creation complete!');
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Table creation failed:', err);
            process.exit(1);
        });
}

module.exports = createUsersTable;
