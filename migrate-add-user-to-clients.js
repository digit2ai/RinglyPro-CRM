require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function migrateClientUserRelation() {
    try {
        console.log('Adding user_id column to clients table...');
        
        // Add user_id column to clients table
        await pool.query(`
            ALTER TABLE clients 
            ADD COLUMN IF NOT EXISTS user_id INTEGER;
        `);
        
        // Create index for performance
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients (user_id);
        `);
        
        // Update existing client record to link with user ID 1 (the test user we just created)
        await pool.query(`
            UPDATE clients 
            SET user_id = 1 
            WHERE id = 1 AND user_id IS NULL;
        `);
        
        // Verify the change
        const result = await pool.query(`
            SELECT id, business_name, user_id, per_minute_rate 
            FROM clients 
            WHERE id = 1;
        `);
        
        console.log('Migration completed successfully!');
        console.log('Client record:', result.rows[0]);
        
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await pool.end();
    }
}

migrateClientUserRelation();