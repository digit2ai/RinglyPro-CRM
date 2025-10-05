// Add test client to PRODUCTION database
const { Client } = require('pg');

// PRODUCTION database URL - from your .env
const PRODUCTION_DB_URL = "postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require";

async function setupProductionClient() {
    const client = new Client({
        connectionString: PRODUCTION_DB_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to PRODUCTION database');
        console.log('🌐 Database:', PRODUCTION_DB_URL.substring(0, 50) + '...\n');

        // Check if client exists
        const checkQuery = `
            SELECT id, business_name, ringlypro_number, rachel_enabled
            FROM clients
            WHERE ringlypro_number = $1
        `;

        const existing = await client.query(checkQuery, ['+18886103810']);

        if (existing.rows.length > 0) {
            console.log('✅ Client already exists in PRODUCTION:');
            console.log(`   - ID: ${existing.rows[0].id}`);
            console.log(`   - Business: ${existing.rows[0].business_name}`);
            console.log(`   - Number: ${existing.rows[0].ringlypro_number}`);
            console.log(`   - Rachel Enabled: ${existing.rows[0].rachel_enabled}`);

            if (!existing.rows[0].rachel_enabled) {
                console.log('\n🔄 Enabling Rachel for this client...');
                const updateQuery = `
                    UPDATE clients
                    SET rachel_enabled = true, active = true, updated_at = NOW()
                    WHERE ringlypro_number = $1
                    RETURNING id, business_name, rachel_enabled
                `;
                const updated = await client.query(updateQuery, ['+18886103810']);
                console.log('✅ Client updated:', updated.rows[0]);
            }
        } else {
            console.log('📝 Creating new client in PRODUCTION database...\n');

            const insertQuery = `
                INSERT INTO clients (
                    business_name,
                    business_phone,
                    ringlypro_number,
                    owner_name,
                    owner_phone,
                    owner_email,
                    rachel_enabled,
                    booking_enabled,
                    active,
                    timezone,
                    business_hours_start,
                    business_hours_end,
                    business_days,
                    created_at,
                    updated_at
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
                )
                RETURNING id, business_name, ringlypro_number, rachel_enabled
            `;

            const values = [
                'RinglyPro',                         // business_name
                '+18886103810',                       // business_phone
                '+18886103810',                       // ringlypro_number
                'RinglyPro Admin',                    // owner_name
                '+18886103810',                       // owner_phone
                'admin@ringlypro.com',                // owner_email
                true,                                 // rachel_enabled
                true,                                 // booking_enabled
                true,                                 // active
                'America/New_York',                   // timezone
                '09:00:00',                           // business_hours_start
                '17:00:00',                           // business_hours_end
                'mon-fri'                             // business_days
            ];

            const result = await client.query(insertQuery, values);

            console.log('✅ Production client created successfully:');
            console.log(`   - ID: ${result.rows[0].id}`);
            console.log(`   - Business: ${result.rows[0].business_name}`);
            console.log(`   - Number: ${result.rows[0].ringlypro_number}`);
            console.log(`   - Rachel Enabled: ${result.rows[0].rachel_enabled}`);
        }

        console.log('\n' + '='.repeat(60));
        console.log('🎉 PRODUCTION DATABASE SETUP COMPLETE!');
        console.log('='.repeat(60));
        console.log('\n📞 Next steps:');
        console.log('   1. Update Twilio webhook to:');
        console.log('      https://aiagent.ringlypro.com/voice/rachel/');
        console.log('   2. Call +18886103810 to test');
        console.log('   3. Press 1 for English or 2 for Spanish');
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

setupProductionClient();
