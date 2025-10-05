// Add test client for bilingual voice bot testing
require('dotenv').config();
const { Client } = require('pg');

// Use production database URL if provided as argument
const DATABASE_URL = process.argv[2] || process.env.DATABASE_URL;

async function addTestClient() {
    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    console.log('📊 Using database:', DATABASE_URL.substring(0, 50) + '...');

    try {
        await client.connect();
        console.log('✅ Connected to database');

        // Check if client already exists
        const checkQuery = `
            SELECT id, business_name, ringlypro_number
            FROM clients
            WHERE ringlypro_number = $1
        `;
        const existingClient = await client.query(checkQuery, ['+18886103810']);

        if (existingClient.rows.length > 0) {
            console.log('\n✅ Test client already exists:');
            console.log(`   - ID: ${existingClient.rows[0].id}`);
            console.log(`   - Business: ${existingClient.rows[0].business_name}`);
            console.log(`   - Number: ${existingClient.rows[0].ringlypro_number}`);
            console.log('\n🔄 Updating to ensure Rachel is enabled...');

            const updateQuery = `
                UPDATE clients
                SET rachel_enabled = true,
                    active = true,
                    updated_at = NOW()
                WHERE ringlypro_number = $1
                RETURNING id, business_name, rachel_enabled
            `;
            const updated = await client.query(updateQuery, ['+18886103810']);
            console.log('✅ Client updated:', updated.rows[0]);
        } else {
            console.log('\n📝 Creating new test client...');

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
                'RinglyPro Test',                    // business_name
                '+18886103810',                       // business_phone
                '+18886103810',                       // ringlypro_number
                'Test Owner',                         // owner_name
                '+18886103810',                       // owner_phone
                'test@ringlypro.com',                 // owner_email
                true,                                 // rachel_enabled
                true,                                 // booking_enabled
                true,                                 // active
                'America/New_York',                   // timezone
                '09:00:00',                           // business_hours_start
                '17:00:00',                           // business_hours_end
                'mon-fri'                             // business_days (simple string, not JSON)
            ];

            const result = await client.query(insertQuery, values);
            console.log('✅ Test client created:');
            console.log(`   - ID: ${result.rows[0].id}`);
            console.log(`   - Business: ${result.rows[0].business_name}`);
            console.log(`   - Number: ${result.rows[0].ringlypro_number}`);
            console.log(`   - Rachel Enabled: ${result.rows[0].rachel_enabled}`);
        }

        console.log('\n✅ Database setup complete!');
        console.log('\n📞 You can now test by calling: +18886103810');

    } catch (error) {
        console.error('❌ Error:', error.message);

        if (error.message.includes('does not exist')) {
            console.log('\n⚠️  The clients table may not exist yet.');
            console.log('   Run database migrations first: npm run migrate');
        }
    } finally {
        await client.end();
    }
}

addTestClient();
