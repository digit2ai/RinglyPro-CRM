/**
 * Auto-migration for email_events table
 * Creates table and indexes for SendGrid webhook event tracking
 * Runs on app startup (non-blocking)
 */

const { sequelize } = require('../src/models');

async function autoMigrateEmailEvents() {
    try {
        console.log('🔄 Checking email_events table...');

        // Check if table exists
        const [results] = await sequelize.query(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'email_events'
        `);

        if (results.length > 0) {
            console.log('✅ email_events table already exists');
            return;
        }

        console.log('📊 Creating email_events table...');

        // Create table
        await sequelize.query(`
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

        // Create indexes
        await sequelize.query(`CREATE INDEX IF NOT EXISTS ix_email_events_event ON email_events(event)`);
        await sequelize.query(`CREATE INDEX IF NOT EXISTS ix_email_events_created ON email_events(created_at)`);
        await sequelize.query(`CREATE INDEX IF NOT EXISTS ix_email_events_email ON email_events(email)`);
        await sequelize.query(`CREATE INDEX IF NOT EXISTS ix_email_events_template ON email_events(template_id)`);
        await sequelize.query(`CREATE INDEX IF NOT EXISTS ix_email_events_category ON email_events(category)`);

        console.log('   ✓ Created email_events table');
        console.log('   ✓ Created indexes');
        console.log('\n✅ Email events tracking is ready!');

    } catch (error) {
        console.error('❌ Email events auto-migration failed:', error.message);
        // Don't throw - allow app to continue
    }
}

module.exports = { autoMigrateEmailEvents };
