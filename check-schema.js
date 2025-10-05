// Check clients table schema
require('dotenv').config();
const { Client } = require('pg');

async function checkSchema() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();

        const query = `
            SELECT
                column_name,
                data_type,
                character_maximum_length,
                is_nullable,
                column_default
            FROM information_schema.columns
            WHERE table_name = 'clients'
            ORDER BY ordinal_position;
        `;

        const result = await client.query(query);

        console.log('\n📋 Clients Table Schema:');
        console.log('='.repeat(80));
        result.rows.forEach(row => {
            const length = row.character_maximum_length ? `(${row.character_maximum_length})` : '';
            const nullable = row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL';
            console.log(`${row.column_name.padEnd(30)} ${(row.data_type + length).padEnd(20)} ${nullable}`);
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

checkSchema();
