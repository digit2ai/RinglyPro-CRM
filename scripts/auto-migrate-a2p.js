// =====================================================
// Auto-Migrate A2P 10DLC Table
// This runs on server startup to ensure the table exists
// Updated: 2026-01-14 - Added STOP response, double opt-in, data attestation fields
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
            console.log('✅ A2P table already exists, checking for new columns...');

            // Add new columns if they don't exist (for existing deployments)
            const newColumns = [
                { name: 'company_type', type: 'VARCHAR(20)' },
                { name: 'regions_of_operation', type: 'VARCHAR(50)' },
                { name: 'stock_exchange', type: 'VARCHAR(20)' },
                { name: 'stock_ticker', type: 'VARCHAR(10)' },
                { name: 'tax_id_number', type: 'VARCHAR(50)' },
                { name: 'business_contact_email', type: 'VARCHAR(255)' },
                { name: 'job_position', type: 'VARCHAR(50)' },
                { name: 'campaign_use_case', type: 'VARCHAR(50)' },
                { name: 'content_attributes', type: 'JSONB' },
                { name: 'consent_process_description', type: 'TEXT' },
                { name: 'opt_in_confirmation_message', type: 'TEXT' },
                { name: 'message_frequency', type: 'VARCHAR(50)' },
                { name: 'help_keyword_response', type: 'TEXT' },
                // New fields added 2026-01-14
                { name: 'support_contact_info', type: 'VARCHAR(500)' },
                { name: 'stop_keyword_response', type: 'TEXT' },
                { name: 'use_double_opt_in', type: 'BOOLEAN DEFAULT false' },
                { name: 'double_opt_in_message', type: 'TEXT' },
                { name: 'opt_in_checkbox_default', type: 'BOOLEAN DEFAULT false' },
                { name: 'no_data_sharing', type: 'BOOLEAN DEFAULT false' }
            ];

            for (const col of newColumns) {
                try {
                    await sequelize.query(`
                        ALTER TABLE a2p ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}
                    `);
                } catch (e) {
                    // Column might already exist, that's ok
                }
            }

            console.log('✅ A2P table columns updated');
            return true;
        }

        console.log('🔄 Creating A2P table...');

        // Create the a2p table with ALL columns including new ones
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
                company_type VARCHAR(20),
                business_vertical VARCHAR(100),
                regions_of_operation VARCHAR(50),
                stock_exchange VARCHAR(20),
                stock_ticker VARCHAR(10),
                tax_id_type VARCHAR(10),
                tax_id_number VARCHAR(50),
                tax_id_last4 VARCHAR(4),
                tax_id_full_encrypted TEXT,
                business_registration_country VARCHAR(10) NOT NULL DEFAULT 'US',
                business_address_line1 VARCHAR(255),
                business_address_line2 VARCHAR(255),
                business_city VARCHAR(100),
                business_state VARCHAR(50),
                business_postal_code VARCHAR(20),
                business_website VARCHAR(500),
                support_contact_info VARCHAR(500),

                -- Authorized Representative
                authorized_rep_first_name VARCHAR(100),
                authorized_rep_last_name VARCHAR(100),
                authorized_rep_email VARCHAR(255),
                business_contact_email VARCHAR(255),
                authorized_rep_phone_e164 VARCHAR(20),
                authorized_rep_title VARCHAR(100),
                job_position VARCHAR(50),

                -- Messaging Use Case
                campaign_use_case VARCHAR(50),
                use_case_categories JSONB,
                use_case_other_description TEXT,
                use_case_description TEXT,
                content_attributes JSONB,

                -- Consent & Opt-Out
                consent_methods JSONB,
                consent_other_description TEXT,
                consent_process_description TEXT,
                opt_in_confirmation_message TEXT,
                message_frequency VARCHAR(50),
                help_keyword_response TEXT,
                stop_keyword_response TEXT,
                use_double_opt_in BOOLEAN DEFAULT false,
                double_opt_in_message TEXT,
                opt_in_checkbox_default BOOLEAN DEFAULT false,
                no_data_sharing BOOLEAN DEFAULT false,
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
