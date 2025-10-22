/**
 * Migration Script: Add SendGrid Columns to Clients Table
 * Run this to enable multi-tenant email marketing
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.CRM_DATABASE_URL
    });

    try {
        console.log('🚀 Starting SendGrid columns migration...');
        console.log('📊 Database:', process.env.DATABASE_URL ? 'Connected' : 'Using CRM_DATABASE_URL');

        // Read the SQL migration file
        const sqlPath = path.join(__dirname, '../db/add_sendgrid_settings.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('📄 Running SQL migration...');

        // Split by semicolons and execute each statement
        const statements = sql
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0 && !s.startsWith('--'));

        for (const statement of statements) {
            if (statement.toLowerCase().includes('alter table') ||
                statement.toLowerCase().includes('comment on')) {
                try {
                    await pool.query(statement);
                    console.log('✅ Executed:', statement.substring(0, 60) + '...');
                } catch (error) {
                    if (error.message.includes('already exists')) {
                        console.log('⚠️  Column already exists, skipping...');
                    } else {
                        throw error;
                    }
                }
            } else if (statement.toLowerCase().includes('select')) {
                // This is the verification query
                const result = await pool.query(statement);
                if (result.rows.length > 0) {
                    console.log('\n✅ Verification - SendGrid columns:');
                    result.rows.forEach(row => {
                        console.log(`   - ${row.column_name} (${row.data_type}${row.character_maximum_length ? `(${row.character_maximum_length})` : ''})`);
                    });
                } else {
                    console.log('⚠️  No SendGrid columns found - migration may have failed');
                }
            }
        }

        console.log('\n🎉 Migration completed successfully!');
        console.log('\n📝 Next steps:');
        console.log('   1. Go to Dashboard → Settings → CRM Integrations');
        console.log('   2. Configure SendGrid API Key and From Email');
        console.log('   3. Test by sending an email from Email Marketing tool');

        await pool.end();
        process.exit(0);

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error('Stack:', error.stack);

        if (error.message.includes('connect')) {
            console.error('\n💡 Database connection failed. Check your DATABASE_URL environment variable.');
        }

        await pool.end();
        process.exit(1);
    }
}

runMigration();
