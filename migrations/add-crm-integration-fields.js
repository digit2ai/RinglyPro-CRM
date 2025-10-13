/**
 * Migration: Add GoHighLevel Integration Fields to Clients Table
 *
 * Adds fields for GoHighLevel API credentials to enable
 * MCP Copilot auto-loading of credentials from client profile
 *
 * Fields added:
 * - ghl_api_key: GoHighLevel Private Integration Token
 * - ghl_location_id: GoHighLevel Location ID (20 characters)
 */

module.exports = {
    up: async (queryInterface, Sequelize) => {
        console.log('🔄 Adding GoHighLevel integration fields to clients table...');

        try {
            // Add GoHighLevel API Key field
            await queryInterface.addColumn('clients', 'ghl_api_key', {
                type: Sequelize.STRING(255),
                allowNull: true,
                comment: 'GoHighLevel Private Integration Token (PIT)'
            });
            console.log('✅ Added ghl_api_key column');

            // Add GoHighLevel Location ID field (20 characters)
            await queryInterface.addColumn('clients', 'ghl_location_id', {
                type: Sequelize.STRING(20),
                allowNull: true,
                comment: 'GoHighLevel Location ID for MCP integration (20 characters)'
            });
            console.log('✅ Added ghl_location_id column');

            console.log('✅ GoHighLevel integration fields migration completed successfully');

        } catch (error) {
            console.error('❌ Error during GoHighLevel integration fields migration:', error);
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        console.log('🔄 Removing GoHighLevel integration fields from clients table...');

        try {
            await queryInterface.removeColumn('clients', 'ghl_location_id');
            console.log('✅ Removed ghl_location_id column');

            await queryInterface.removeColumn('clients', 'ghl_api_key');
            console.log('✅ Removed ghl_api_key column');

            console.log('✅ GoHighLevel integration fields rollback completed successfully');

        } catch (error) {
            console.error('❌ Error during GoHighLevel integration fields rollback:', error);
            throw error;
        }
    }
};
