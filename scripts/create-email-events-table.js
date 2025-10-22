/**
 * Manual Migration: Create email_events table
 * Run this script to manually create the email_events table
 * Usage: node scripts/create-email-events-table.js
 */

const { Pool } = require('pg');

async function createEmailEventsTable() {
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL || process.env.CRM_DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        console.log('🔄 Creating email_events table...\n');

        // Create table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS email_events (
                sg_event_id   TEXT PRIMARY KEY,
                message_id    TEXT,
                template_id   TEXT,
                event         TEXT NOT NULL,
                email         TEXT NOT NULL,
                timestamp     TIMESTAMPTZ NOT NULL,
                category      TEXT,
                contact_id    INTEGER,
                payload       JSONB,
                created_at    TIMESTAMPTZ DEFAULT NOW()
            )
        `);
        console.log('✅ Created email_events table');

        // Create indexes
        await pool.query(`CREATE INDEX IF NOT EXISTS ix_email_events_event ON email_events(event)`);
        console.log('✅ Created index: ix_email_events_event');

        await pool.query(`CREATE INDEX IF NOT EXISTS ix_email_events_created ON email_events(created_at)`);
        console.log('✅ Created index: ix_email_events_created');

        await pool.query(`CREATE INDEX IF NOT EXISTS ix_email_events_email ON email_events(email)`);
        console.log('✅ Created index: ix_email_events_email');

        await pool.query(`CREATE INDEX IF NOT EXISTS ix_email_events_template ON email_events(template_id)`);
        console.log('✅ Created index: ix_email_events_template');

        await pool.query(`CREATE INDEX IF NOT EXISTS ix_email_events_category ON email_events(category)`);
        console.log('✅ Created index: ix_email_events_category');

        // Verify table was created
        const result = await pool.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'email_events'
        `);

        if (result.rows.length > 0) {
            console.log('\n✅ SUCCESS! email_events table created and verified.');
            console.log('📧 Email Marketing analytics are now ready to use!');
        } else {
            console.log('\n❌ Table creation may have failed - please check permissions');
        }

    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        console.error('\nFull error:', error);
        process.exit(1);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

createEmailEventsTable();
