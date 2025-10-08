// Script to check all client Twilio numbers
const { Client } = require('pg');
require('dotenv').config();

async function checkClientNumbers() {
    const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

    const client = new Client({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // Get all clients with their Twilio numbers
        const result = await client.query(`
            SELECT
                c.id,
                c.business_name,
                c.business_phone,
                c.ringlypro_number,
                c.twilio_number_sid,
                c.created_at,
                u.email as owner_email
            FROM clients c
            LEFT JOIN users u ON c.user_id = u.id
            ORDER BY c.created_at DESC
        `);

        console.log(`📊 Total clients: ${result.rows.length}\n`);
        console.log('='.repeat(100));

        result.rows.forEach((row, index) => {
            console.log(`\n${index + 1}. ${row.business_name}`);
            console.log(`   ID: ${row.id}`);
            console.log(`   Owner Email: ${row.owner_email || 'N/A'}`);
            console.log(`   Business Phone: ${row.business_phone}`);
            console.log(`   RinglyPro Number: ${row.ringlypro_number}`);
            console.log(`   Twilio SID: ${row.twilio_number_sid || 'N/A'}`);
            console.log(`   Created: ${row.created_at}`);

            // Check for duplicates
            const duplicates = result.rows.filter(r =>
                r.ringlypro_number === row.ringlypro_number && r.id !== row.id
            );
            if (duplicates.length > 0) {
                console.log(`   ⚠️  DUPLICATE NUMBER - Also used by: ${duplicates.map(d => d.business_name).join(', ')}`);
            }
        });

        console.log('\n' + '='.repeat(100));

        // Check for duplicate numbers
        const duplicateCheck = await client.query(`
            SELECT ringlypro_number, COUNT(*) as count,
                   STRING_AGG(business_name, ', ') as businesses
            FROM clients
            GROUP BY ringlypro_number
            HAVING COUNT(*) > 1
        `);

        if (duplicateCheck.rows.length > 0) {
            console.log('\n⚠️  DUPLICATE NUMBERS FOUND:\n');
            duplicateCheck.rows.forEach(dup => {
                console.log(`   ${dup.ringlypro_number}: Used by ${dup.count} clients (${dup.businesses})`);
            });
        } else {
            console.log('\n✅ No duplicate Twilio numbers found');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await client.end();
    }
}

checkClientNumbers();
