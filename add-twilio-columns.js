const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function addTwilioColumns() {
    try {
        console.log('🔧 Adding Twilio columns to clients table...\n');

        // Add twilio_number_sid column
        console.log('Adding twilio_number_sid column...');
        await pool.query(`
            ALTER TABLE clients
            ADD COLUMN IF NOT EXISTS twilio_number_sid VARCHAR(255)
        `);
        console.log('✅ twilio_number_sid column added\n');

        // Add email column if it doesn't exist
        console.log('Adding email column...');
        await pool.query(`
            ALTER TABLE clients
            ADD COLUMN IF NOT EXISTS email VARCHAR(255)
        `);
        console.log('✅ email column added\n');

        // Add user_id column if it doesn't exist
        console.log('Adding user_id column...');
        await pool.query(`
            ALTER TABLE clients
            ADD COLUMN IF NOT EXISTS user_id INTEGER
        `);
        console.log('✅ user_id column added\n');

        // Create index on ringlypro_number for faster lookups
        console.log('Creating index on ringlypro_number...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_clients_ringlypro_number
            ON clients(ringlypro_number)
        `);
        console.log('✅ Index created\n');

        // Create index on twilio_number_sid
        console.log('Creating index on twilio_number_sid...');
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_clients_twilio_sid
            ON clients(twilio_number_sid)
        `);
        console.log('✅ Index created\n');

        console.log('🎉 All columns and indexes added successfully!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

addTwilioColumns();
