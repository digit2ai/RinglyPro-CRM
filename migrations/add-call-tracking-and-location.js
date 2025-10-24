/**
 * Migration: Add Call Tracking and Location Fields
 *
 * Adds fields to business_directory table for:
 * - Location tracking (city, state combined)
 * - Call status workflow (TO_BE_CALLED, CALLED, FAILED, SKIPPED)
 * - Call attempt tracking
 * - Call results (human, voicemail, no_answer, etc.)
 * - Timestamps for last call
 *
 * This enables the automated scheduled calling system where:
 * 1. Collect businesses and flag as TO_BE_CALLED
 * 2. Scheduled auto-caller processes them during business hours
 * 3. Status updates to CALLED after each successful call
 */

module.exports = {
    up: async (queryInterface, Sequelize) => {
        console.log('🔄 Adding call tracking and location fields to business_directory...');

        try {
            // Add location field (e.g., "Miami, FL" or "Los Angeles, CA")
            await queryInterface.addColumn('business_directory', 'location', {
                type: Sequelize.STRING(255),
                allowNull: true,
                comment: 'Combined city and state for easy filtering (e.g., "Miami, FL")'
            });
            console.log('✅ Added location field');

            // Add call_status field for workflow tracking
            await queryInterface.addColumn('business_directory', 'call_status', {
                type: Sequelize.STRING(20),
                defaultValue: 'TO_BE_CALLED',
                allowNull: false,
                comment: 'Call status: TO_BE_CALLED, CALLED, FAILED, SKIPPED'
            });
            console.log('✅ Added call_status field');

            // Add last_called_at timestamp
            await queryInterface.addColumn('business_directory', 'last_called_at', {
                type: Sequelize.DATE,
                allowNull: true,
                comment: 'Timestamp of last call attempt'
            });
            console.log('✅ Added last_called_at field');

            // Add call_attempts counter
            await queryInterface.addColumn('business_directory', 'call_attempts', {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false,
                comment: 'Number of call attempts made'
            });
            console.log('✅ Added call_attempts field');

            // Add call_result field
            await queryInterface.addColumn('business_directory', 'call_result', {
                type: Sequelize.STRING(50),
                allowNull: true,
                comment: 'Result of last call: human, voicemail, no_answer, busy, failed'
            });
            console.log('✅ Added call_result field');

            // Add call_notes field for additional context
            await queryInterface.addColumn('business_directory', 'call_notes', {
                type: Sequelize.TEXT,
                allowNull: true,
                comment: 'Notes from call attempts'
            });
            console.log('✅ Added call_notes field');

            // Add indexes for efficient querying
            await queryInterface.addIndex('business_directory', ['call_status'], {
                name: 'business_directory_call_status_idx'
            });
            console.log('✅ Added index on call_status');

            await queryInterface.addIndex('business_directory', ['location'], {
                name: 'business_directory_location_idx'
            });
            console.log('✅ Added index on location');

            // Add composite index for efficient prospect querying
            await queryInterface.addIndex('business_directory', ['client_id', 'call_status'], {
                name: 'business_directory_client_status_idx'
            });
            console.log('✅ Added composite index on client_id and call_status');

            // Add index on last_called_at for scheduling queries
            await queryInterface.addIndex('business_directory', ['last_called_at'], {
                name: 'business_directory_last_called_idx'
            });
            console.log('✅ Added index on last_called_at');

            console.log('✅ Call tracking and location migration completed successfully');

        } catch (error) {
            console.error('❌ Error during migration:', error);
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        console.log('🔄 Rolling back call tracking and location fields...');

        try {
            // Drop indexes first
            await queryInterface.removeIndex('business_directory', 'business_directory_call_status_idx');
            await queryInterface.removeIndex('business_directory', 'business_directory_location_idx');
            await queryInterface.removeIndex('business_directory', 'business_directory_client_status_idx');
            await queryInterface.removeIndex('business_directory', 'business_directory_last_called_idx');

            // Drop columns
            await queryInterface.removeColumn('business_directory', 'location');
            await queryInterface.removeColumn('business_directory', 'call_status');
            await queryInterface.removeColumn('business_directory', 'last_called_at');
            await queryInterface.removeColumn('business_directory', 'call_attempts');
            await queryInterface.removeColumn('business_directory', 'call_result');
            await queryInterface.removeColumn('business_directory', 'call_notes');

            console.log('✅ Rollback completed successfully');

        } catch (error) {
            console.error('❌ Error during rollback:', error);
            throw error;
        }
    }
};
