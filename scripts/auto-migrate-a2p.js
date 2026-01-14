// =====================================================
// Auto-Migrate A2P 10DLC Table
// This runs on server startup to ensure the table exists
// =====================================================

const { Sequelize } = require('sequelize');

async function autoMigrateA2P() {
    const sequelize = require('../src/config/database');

    try {
        console.log('📝 Auto-migrating A2P 10DLC table...');

        // Check if a2p table exists
        const [tableExists] = await sequelize.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'a2p'
            );
        `);

        if (tableExists[0].exists) {
            console.log('✅ A2P table already exists');
            return true;
        }

        console.log('🔄 Creating A2P table...');

        // Create the a2p table
        await sequelize.query(`
            CREATE TABLE IF NOT EXISTS a2p (
                id SERIAL PRIMARY KEY,

                -- Foreign key to clients table
                client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

                -- Status tracking
                status VARCHAR(20) NOT NULL DEFAULT 'draft',

                -- Timestamps
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                submitted_at TIMESTAMP,
                approved_at TIMESTAMP,
                rejected_at TIMESTAMP,
                rejection_reason TEXT,

                -- Business Identity
                legal_business_name VARCHAR(255),
                dba_name VARCHAR(255),
                business_type VARCHAR(50),
                tax_id_type VARCHAR(10),
                tax_id_last4 VARCHAR(4),
                tax_id_full_encrypted TEXT,
                business_registration_country VARCHAR(10) NOT NULL DEFAULT 'US',
                business_address_line1 VARCHAR(255),
                business_address_line2 VARCHAR(255),
                business_city VARCHAR(100),
                business_state VARCHAR(50),
                business_postal_code VARCHAR(20),
                business_website VARCHAR(500),
                business_vertical VARCHAR(100),

                -- Authorized Representative
                authorized_rep_first_name VARCHAR(100),
                authorized_rep_last_name VARCHAR(100),
                authorized_rep_email VARCHAR(255),
                authorized_rep_phone_e164 VARCHAR(20),
                authorized_rep_title VARCHAR(100),

                -- Messaging Use Case
                use_case_categories JSONB,
                use_case_other_description TEXT,
                use_case_description TEXT,

                -- Consent & Opt-Out
                consent_methods JSONB,
                consent_other_description TEXT,
                opt_out_acknowledged BOOLEAN NOT NULL DEFAULT false,
                opt_in_disclosure_url VARCHAR(500),
                privacy_policy_url VARCHAR(500),
                terms_of_service_url VARCHAR(500),

                -- Sample Messages
                sample_message_1 TEXT,
                sample_message_2 TEXT,
                sample_message_3 TEXT,

                -- Volume Estimates
                estimated_sms_per_day VARCHAR(20),
                estimated_sms_per_month INTEGER,

                -- Internal Fields
                notes_internal TEXT,
                submitted_by_user_id INTEGER
            );
        `);

        // Create indexes
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS a2p_client_id_idx ON a2p(client_id);
        `);
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS a2p_status_idx ON a2p(status);
        `);
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS a2p_submitted_at_idx ON a2p(submitted_at);
        `);

        // Unique constraint: one A2P record per client
        await sequelize.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS a2p_client_id_unique ON a2p(client_id);
        `);

        console.log('✅ A2P table created successfully');
        return true;

    } catch (error) {
        console.error('❌ A2P auto-migration error:', error.message);
        return false;
    }
}

module.exports = { autoMigrateA2P };
