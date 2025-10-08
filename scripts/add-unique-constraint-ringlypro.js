// Script to add unique constraint to ringlypro_number
// This prevents multiple clients from sharing the same Twilio number
const { Client } = require('pg');
require('dotenv').config();

async function addUniqueConstraint() {
    const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

    const client = new Client({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database\n');

        // First, check for duplicate numbers
        console.log('🔍 Checking for duplicate Twilio numbers...\n');
        const duplicates = await client.query(`
            SELECT ringlypro_number, COUNT(*) as count,
                   STRING_AGG(id::text, ', ') as client_ids,
                   STRING_AGG(business_name, ', ') as businesses
            FROM clients
            GROUP BY ringlypro_number
            HAVING COUNT(*) > 1
        `);

        if (duplicates.rows.length > 0) {
            console.log('⚠️  WARNING: Found duplicate Twilio numbers:');
            console.log('='.repeat(80));
            duplicates.rows.forEach(dup => {
                console.log(`\nNumber: ${dup.ringlypro_number}`);
                console.log(`   Used by ${dup.count} clients: ${dup.businesses}`);
                console.log(`   Client IDs: ${dup.client_ids}`);
            });
            console.log('\n' + '='.repeat(80));
            console.log('\n❌ Cannot add unique constraint with duplicate numbers!');
            console.log('📝 Please fix duplicates first by assigning unique Twilio numbers to each client.\n');
            return;
        }

        console.log('✅ No duplicate numbers found\n');

        // Check if constraint already exists
        const constraintCheck = await client.query(`
            SELECT constraint_name
            FROM information_schema.table_constraints
            WHERE table_name = 'clients'
            AND constraint_name = 'clients_ringlypro_number_unique'
        `);

        if (constraintCheck.rows.length > 0) {
            console.log('⚠️  Unique constraint already exists on ringlypro_number');
            return;
        }

        // Add unique constraint
        console.log('📝 Adding unique constraint to ringlypro_number...');
        await client.query(`
            ALTER TABLE clients
            ADD CONSTRAINT clients_ringlypro_number_unique UNIQUE (ringlypro_number)
        `);

        console.log('✅ Unique constraint added successfully!');
        console.log('📊 ringlypro_number is now guaranteed to be unique across all clients\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await client.end();
    }
}

addUniqueConstraint();
