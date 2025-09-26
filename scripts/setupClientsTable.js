// scripts/setupClientsTable.js
const { Client } = require('pg');

async function setupClientsTable() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('Connected to database');

        // Create clients table
        const createTableQuery = `
            CREATE TABLE IF NOT EXISTS clients (
                id SERIAL PRIMARY KEY,
                business_name VARCHAR(255) NOT NULL,
                ringlypro_number VARCHAR(20) UNIQUE NOT NULL,
                custom_greeting TEXT,
                booking_url VARCHAR(500),
                rachel_enabled BOOLEAN DEFAULT true,
                business_hours JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `;

        await client.query(createTableQuery);
        console.log('✅ Clients table created');

        // Insert default client data
        const insertQuery = `
            INSERT INTO clients (business_name, ringlypro_number, rachel_enabled, booking_url)
            VALUES ('RinglyPro', '+18886103810', true, 'https://calendly.com/ringlypro')
            ON CONFLICT (ringlypro_number) DO NOTHING;
        `;

        await client.query(insertQuery);
        console.log('✅ Default client data inserted');

    } catch (error) {
        console.error('Error setting up clients table:', error);
    } finally {
        await client.end();
    }
}

setupClientsTable();