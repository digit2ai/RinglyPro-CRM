// Simple fix - just insert the clients without ON CONFLICT
const { Client } = require('pg');

const PRODUCTION_DB = "postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require";

async function simpleFixDatabase() {
    const client = new Client({
        connectionString: PRODUCTION_DB,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to PRODUCTION database\n');

        // Check if clients already exist
        const checkQuery = `SELECT id, business_name, ringlypro_number FROM clients WHERE ringlypro_number IN ('+18886103810', '+12232949184')`;
        const existing = await client.query(checkQuery);

        console.log('📊 Existing clients:');
        if (existing.rows.length > 0) {
            existing.rows.forEach(row => {
                console.log(`   ID ${row.id}: ${row.business_name} - ${row.ringlypro_number}`);
            });

            // Just update them to enable Rachel
            console.log('\n🔄 Updating clients to enable Rachel...');
            const updateQuery = `
                UPDATE clients
                SET rachel_enabled = true, active = true, updated_at = NOW()
                WHERE ringlypro_number IN ('+18886103810', '+12232949184')
                RETURNING id, business_name, ringlypro_number, rachel_enabled;
            `;
            const result = await client.query(updateQuery);

            console.log('\n✅ Updated clients:');
            result.rows.forEach(row => {
                console.log(`   ID ${row.id}: ${row.business_name} - Rachel: ${row.rachel_enabled}`);
            });
        } else {
            console.log('   No existing clients found. Creating new ones...\n');

            // Insert new clients
            const insertQueries = [
                {
                    name: 'RinglyPro',
                    number: '+18886103810'
                },
                {
                    name: 'Digit2AI',
                    number: '+12232949184'
                }
            ];

            for (const client of insertQueries) {
                try {
                    const insertQuery = `
                        INSERT INTO clients (
                            business_name, business_phone, ringlypro_number,
                            owner_name, owner_phone, owner_email,
                            rachel_enabled, active
                        ) VALUES ($1, $2, $3, $4, $5, $6, true, true)
                        RETURNING id, business_name, ringlypro_number;
                    `;
                    const result = await client.query(insertQuery, [
                        client.name,
                        client.number,
                        client.number,
                        `${client.name} Admin`,
                        client.number,
                        `admin@${client.name.toLowerCase()}.com`
                    ]);
                    console.log(`✅ Created: ${result.rows[0].business_name}`);
                } catch (err) {
                    console.log(`⚠️  ${client.name} may already exist: ${err.message}`);
                }
            }
        }

        // Final verification
        console.log('\n📞 Bilingual-ready clients:');
        console.log('=' .repeat(60));
        const finalCheck = await client.query(`
            SELECT id, business_name, ringlypro_number, rachel_enabled
            FROM clients
            WHERE rachel_enabled = true
            ORDER BY id;
        `);

        finalCheck.rows.forEach(row => {
            console.log(`   ${row.ringlypro_number} → ${row.business_name} (ID: ${row.id})`);
        });

        console.log('\n✅ DATABASE READY!');
        console.log('\n📞 Update Twilio webhooks:');
        finalCheck.rows.forEach(row => {
            console.log(`   ${row.ringlypro_number}:`);
            console.log(`   https://aiagent.ringlypro.com/voice/rachel/`);
            console.log('');
        });

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

simpleFixDatabase();
