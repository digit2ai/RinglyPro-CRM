// Script to check which user columns exist in database
const { Client } = require('pg');
require('dotenv').config();

async function checkUserColumns() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL || process.env.CRM_DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        // Get all columns in users table
        const result = await client.query(`
            SELECT column_name, data_type, is_nullable, column_default
            FROM information_schema.columns
            WHERE table_name = 'users'
            ORDER BY ordinal_position
        `);

        console.log('\n📊 Current users table columns:');
        console.log('================================');
        result.rows.forEach(row => {
            console.log(`${row.column_name} (${row.data_type}) - Nullable: ${row.is_nullable}`);
        });

        console.log('\n\n📋 Required columns from User model:');
        console.log('====================================');
        const requiredColumns = [
            'email', 'password_hash', 'first_name', 'last_name',
            'business_name', 'business_phone', 'business_type', 'website_url',
            'phone_number', 'business_description', 'business_hours', 'services',
            'terms_accepted', 'free_trial_minutes', 'onboarding_completed',
            'email_verified', 'email_verification_token',
            'password_reset_token', 'password_reset_expires'
        ];

        const existingColumns = result.rows.map(r => r.column_name);
        const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));

        if (missingColumns.length > 0) {
            console.log('\n❌ Missing columns:');
            missingColumns.forEach(col => console.log(`   - ${col}`));
        } else {
            console.log('\n✅ All required columns exist!');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await client.end();
    }
}

checkUserColumns();
