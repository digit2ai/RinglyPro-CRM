const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function fixPricing() {
    try {
        const result = await pool.query("UPDATE clients SET per_minute_rate = 0.200 WHERE per_minute_rate = 0.100;");
        console.log(`Updated ${result.rowCount} row(s)`);
        
        // Verify the change
        const check = await pool.query("SELECT id, per_minute_rate FROM clients;");
        console.log('Current rates:', check.rows);
        
    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

fixPricing();