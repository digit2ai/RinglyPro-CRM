const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require';

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function checkAndAddClients() {
    try {
        console.log('📊 Checking existing clients...\n');

        // Check existing clients
        const existingClients = await pool.query(
            'SELECT id, business_name, ringlypro_number, rachel_enabled FROM clients ORDER BY id'
        );

        console.log('Existing clients:');
        existingClients.rows.forEach(client => {
            console.log(`  ID: ${client.id}, Business: ${client.business_name}, Number: ${client.ringlypro_number}, Rachel: ${client.rachel_enabled}`);
        });

        // Phone numbers that should exist
        const requiredNumbers = [
            { number: '+18886103810', business: 'RinglyPro' },
            { number: '+12232949184', business: 'Digit2AI' },
            { number: '+12603688369', business: 'TestBusiness' }
        ];

        console.log('\n📝 Checking required numbers...\n');

        for (const required of requiredNumbers) {
            const exists = existingClients.rows.find(c => c.ringlypro_number === required.number);

            if (!exists) {
                console.log(`❌ Missing: ${required.number} (${required.business})`);
                console.log(`   Adding to database...`);

                const insertResult = await pool.query(`
                    INSERT INTO clients (
                        business_name,
                        ringlypro_number,
                        rachel_enabled,
                        active,
                        created_at,
                        updated_at
                    ) VALUES ($1, $2, true, true, NOW(), NOW())
                    RETURNING id, business_name, ringlypro_number
                `, [required.business, required.number]);

                console.log(`   ✅ Added: ID ${insertResult.rows[0].id}`);
            } else {
                console.log(`✅ Found: ${required.number} (${exists.business_name}, ID: ${exists.id}, Rachel: ${exists.rachel_enabled})`);

                // Make sure Rachel is enabled
                if (!exists.rachel_enabled) {
                    console.log(`   🔄 Enabling Rachel for ${exists.business_name}...`);
                    await pool.query(
                        'UPDATE clients SET rachel_enabled = true, updated_at = NOW() WHERE id = $1',
                        [exists.id]
                    );
                    console.log(`   ✅ Rachel enabled`);
                }
            }
        }

        console.log('\n✅ Done!');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

checkAndAddClients();
