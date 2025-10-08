// Script to debug client lookup by phone number
const { Client } = require('pg');
require('dotenv').config();

async function debugClientLookup() {
    const testNumber = process.argv[2] || '+16205771775';
    const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

    const client = new Client({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');
        console.log(`🔍 Looking up clients with ringlypro_number: ${testNumber}\n`);
        console.log('='.repeat(100));

        // Get client info
        const result = await client.query(`
            SELECT
                c.id,
                c.business_name,
                c.business_phone,
                c.ringlypro_number,
                c.twilio_number_sid,
                c.custom_greeting,
                c.rachel_enabled,
                c.booking_enabled,
                c.active,
                c.created_at,
                u.email as owner_email,
                u.first_name,
                u.last_name
            FROM clients c
            LEFT JOIN users u ON c.user_id = u.id
            WHERE c.ringlypro_number = $1
            ORDER BY c.created_at DESC
        `, [testNumber]);

        if (result.rows.length === 0) {
            console.log(`\n❌ No clients found with ringlypro_number: ${testNumber}`);
            console.log('   This number is not assigned to any client!\n');
            return;
        }

        console.log(`\n✅ Found ${result.rows.length} client(s) with this number:\n`);

        result.rows.forEach((row, index) => {
            console.log(`\n${index + 1}. ${row.business_name}`);
            console.log('   ' + '-'.repeat(80));
            console.log(`   Client ID: ${row.id}`);
            console.log(`   Owner: ${row.first_name} ${row.last_name} (${row.owner_email})`);
            console.log(`   Business Phone: ${row.business_phone}`);
            console.log(`   RinglyPro Number: ${row.ringlypro_number}`);
            console.log(`   Twilio SID: ${row.twilio_number_sid || 'N/A'}`);
            console.log(`   Rachel Enabled: ${row.rachel_enabled ? '✅ YES' : '❌ NO'}`);
            console.log(`   Booking Enabled: ${row.booking_enabled ? '✅ YES' : '❌ NO'}`);
            console.log(`   Active: ${row.active ? '✅ YES' : '❌ NO'}`);
            console.log(`   Created: ${row.created_at}`);
            console.log(`   \n   Custom Greeting:`);
            console.log(`   "${row.custom_greeting}"`);
        });

        console.log('\n' + '='.repeat(100));

        if (result.rows.length > 1) {
            console.log('\n⚠️  WARNING: Multiple clients found with the same number!');
            console.log('   This will cause Rachel to use the FIRST client\'s configuration.');
            console.log('   Each client MUST have a unique Twilio number.\n');
        } else {
            console.log('\n✅ Only one client has this number (correct)');
            console.log('\n📋 When a call comes to this number, Rachel will:');
            console.log(`   1. Identify as: "${result.rows[0].business_name}"`);
            console.log(`   2. Use greeting: "${result.rows[0].custom_greeting}"`);
            console.log(`   3. Offer language selection: English (1) or Spanish (2)`);
            console.log(`   4. ${result.rows[0].booking_enabled ? 'Allow' : 'Block'} appointment booking\n`);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await client.end();
    }
}

debugClientLookup();
