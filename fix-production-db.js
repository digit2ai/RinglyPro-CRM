// Fix production database - create clients table and add test data
const { Client } = require('pg');
const fs = require('fs');

const PRODUCTION_DB = "postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require";

async function fixProductionDatabase() {
    const client = new Client({
        connectionString: PRODUCTION_DB,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to PRODUCTION database\n');

        // Read SQL file
        const sql = fs.readFileSync('create-clients-table.sql', 'utf8');

        // Execute SQL
        console.log('🔄 Creating clients table and inserting test data...\n');
        const result = await client.query(sql);

        console.log('✅ SUCCESS! Database fixed.');
        console.log('\n📊 Results:');
        if (result.rows && result.rows.length > 0) {
            console.log('   ', result.rows[0].result);
        }

        // Verify clients exist
        const verifyQuery = `
            SELECT id, business_name, ringlypro_number, rachel_enabled
            FROM clients
            WHERE rachel_enabled = true
            ORDER BY id;
        `;

        const clients = await client.query(verifyQuery);

        console.log('\n📞 Active Clients with Rachel Enabled:');
        console.log('=' .repeat(60));
        clients.rows.forEach(client => {
            console.log(`   ID ${client.id}: ${client.business_name} - ${client.ringlypro_number}`);
        });

        console.log('\n✅ Production database is ready!');
        console.log('\n📞 Next: Update Twilio webhooks for these numbers:');
        clients.rows.forEach(client => {
            console.log(`   ${client.ringlypro_number} → https://aiagent.ringlypro.com/voice/rachel/`);
        });
        console.log('');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.code) {
            console.error('   Error code:', error.code);
        }
    } finally {
        await client.end();
    }
}

fixProductionDatabase();
