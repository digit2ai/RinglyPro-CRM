/**
 * Auto-Migration: Add SendGrid Columns (runs on app startup)
 * This ensures SendGrid columns are created when the app deploys
 */

const { sequelize } = require('../src/models');

async function autoMigrateSendGrid() {
    try {
        console.log('🔄 Checking SendGrid columns...');

        // Check if columns already exist
        const [results] = await sequelize.query(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'clients'
              AND column_name LIKE 'sendgrid%'
        `);

        if (results.length >= 4) {
            console.log('✅ SendGrid columns already exist');
            return;
        }

        console.log('📊 Creating SendGrid columns...');

        // Add columns one by one (safer than running entire SQL file)
        const columns = [
            {
                name: 'sendgrid_api_key',
                sql: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_api_key VARCHAR(255)`,
                comment: `COMMENT ON COLUMN clients.sendgrid_api_key IS 'SendGrid API Key for email sending (encrypted)'`
            },
            {
                name: 'sendgrid_from_email',
                sql: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_from_email VARCHAR(255)`,
                comment: `COMMENT ON COLUMN clients.sendgrid_from_email IS 'Verified sender email address in SendGrid'`
            },
            {
                name: 'sendgrid_from_name',
                sql: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_from_name VARCHAR(255)`,
                comment: `COMMENT ON COLUMN clients.sendgrid_from_name IS 'Sender name that appears in emails'`
            },
            {
                name: 'sendgrid_reply_to',
                sql: `ALTER TABLE clients ADD COLUMN IF NOT EXISTS sendgrid_reply_to VARCHAR(255)`,
                comment: `COMMENT ON COLUMN clients.sendgrid_reply_to IS 'Reply-to email address (optional)'`
            }
        ];

        for (const col of columns) {
            try {
                await sequelize.query(col.sql);
                console.log(`   ✓ Created column: ${col.name}`);

                // Add comment
                try {
                    await sequelize.query(col.comment);
                } catch (err) {
                    // Comments are optional, don't fail if they don't work
                }
            } catch (error) {
                if (error.message.includes('already exists')) {
                    console.log(`   ⚠️  Column ${col.name} already exists`);
                } else {
                    throw error;
                }
            }
        }

        // Verify all columns were created
        const [verification] = await sequelize.query(`
            SELECT column_name, data_type, character_maximum_length
            FROM information_schema.columns
            WHERE table_name = 'clients'
              AND column_name LIKE 'sendgrid%'
            ORDER BY column_name
        `);

        console.log('\n✅ SendGrid columns created successfully:');
        verification.forEach(col => {
            console.log(`   - ${col.column_name} (${col.data_type}${col.character_maximum_length ? `(${col.character_maximum_length})` : ''})`);
        });

        console.log('\n📧 Email Marketing is now ready for multi-tenant use!');

    } catch (error) {
        console.error('❌ SendGrid auto-migration failed:', error.message);
        // Don't crash the app, just log the error
        console.error('⚠️  Email Marketing may not work until columns are created manually');
    }
}

// Only export, don't run immediately
module.exports = { autoMigrateSendGrid };
