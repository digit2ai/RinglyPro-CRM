/**
 * Migration: Add CRM Integration Fields to Clients Table
 *
 * Adds fields for GoHighLevel and HubSpot API keys to enable
 * MCP Copilot auto-loading of credentials from client profile
 *
 * Fields added:
 * - ghl_api_key: GoHighLevel Private Integration Token
 * - ghl_location_id: GoHighLevel Location ID
 * - hubspot_api_key: HubSpot API Key
 */

module.exports = {
    up: async (queryInterface, Sequelize) => {
        console.log('🔄 Adding CRM integration fields to clients table...');

        try {
            // Add GoHighLevel API Key field
            await queryInterface.addColumn('clients', 'ghl_api_key', {
                type: Sequelize.STRING(255),
                allowNull: true,
                comment: 'GoHighLevel Private Integration Token (PIT)'
            });
            console.log('✅ Added ghl_api_key column');

            // Add GoHighLevel Location ID field
            await queryInterface.addColumn('clients', 'ghl_location_id', {
                type: Sequelize.STRING(100),
                allowNull: true,
                comment: 'GoHighLevel Location ID for MCP integration'
            });
            console.log('✅ Added ghl_location_id column');

            // Add HubSpot API Key field
            await queryInterface.addColumn('clients', 'hubspot_api_key', {
                type: Sequelize.STRING(255),
                allowNull: true,
                comment: 'HubSpot API Key for CRM integration'
            });
            console.log('✅ Added hubspot_api_key column');

            console.log('✅ CRM integration fields migration completed successfully');

        } catch (error) {
            console.error('❌ Error during CRM integration fields migration:', error);
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        console.log('🔄 Removing CRM integration fields from clients table...');

        try {
            await queryInterface.removeColumn('clients', 'hubspot_api_key');
            console.log('✅ Removed hubspot_api_key column');

            await queryInterface.removeColumn('clients', 'ghl_location_id');
            console.log('✅ Removed ghl_location_id column');

            await queryInterface.removeColumn('clients', 'ghl_api_key');
            console.log('✅ Removed ghl_api_key column');

            console.log('✅ CRM integration fields rollback completed successfully');

        } catch (error) {
            console.error('❌ Error during CRM integration fields rollback:', error);
            throw error;
        }
    }
};
