// Test database connection and client lookup
require('dotenv').config();
const { Client } = require('pg');

async function testClientLookup() {
    const phoneNumber = '+12232949184';

    console.log('Testing client lookup for:', phoneNumber);
    console.log('Database URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        const query = `
            SELECT
                id,
                business_name,
                ringlypro_number,
                rachel_enabled,
                active
            FROM clients
            WHERE ringlypro_number = $1
        `;

        const result = await client.query(query, [phoneNumber]);

        console.log('Query result:', result.rows);

        if (result.rows.length > 0) {
            console.log('✅ Client found:', result.rows[0]);
        } else {
            console.log('❌ No client found');

            // Try to see all clients
            const allClientsQuery = 'SELECT id, business_name, ringlypro_number FROM clients';
            const allClients = await client.query(allClientsQuery);
            console.log('All clients in database:', allClients.rows);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

testClientLookup();
