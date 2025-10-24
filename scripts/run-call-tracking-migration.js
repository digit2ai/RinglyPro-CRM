/**
 * Run Call Tracking and Location Migration
 *
 * This script adds the following fields to business_directory table:
 * - location (e.g., "Miami, FL")
 * - call_status (TO_BE_CALLED, CALLED, FAILED, SKIPPED)
 * - last_called_at (timestamp of last call)
 * - call_attempts (number of attempts)
 * - call_result (human, voicemail, no_answer, etc.)
 * - call_notes (additional notes)
 *
 * Plus indexes for efficient querying
 */

const path = require('path');
const sequelize = require('../src/config/database');
const migration = require('../migrations/add-call-tracking-and-location');

async function runMigration() {
    console.log('🚀 Starting call tracking and location migration...\n');

    try {
        // Test database connection
        console.log('📡 Testing database connection...');
        await sequelize.authenticate();
        console.log('✅ Database connection established\n');

        // Run migration
        console.log('🔄 Running migration...\n');
        await migration.up(sequelize.getQueryInterface(), sequelize.Sequelize);

        console.log('\n✅ Migration completed successfully!\n');
        console.log('📊 New fields added to business_directory:');
        console.log('   - location: VARCHAR(255)');
        console.log('   - call_status: VARCHAR(20) DEFAULT "TO_BE_CALLED"');
        console.log('   - last_called_at: TIMESTAMP');
        console.log('   - call_attempts: INTEGER DEFAULT 0');
        console.log('   - call_result: VARCHAR(50)');
        console.log('   - call_notes: TEXT\n');

        console.log('🔍 Indexes created:');
        console.log('   - business_directory_call_status_idx');
        console.log('   - business_directory_location_idx');
        console.log('   - business_directory_client_status_idx');
        console.log('   - business_directory_last_called_idx\n');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        // Close database connection
        console.log('👋 Database connection closed');
        await sequelize.close();
    }
}

// Run migration
runMigration();
