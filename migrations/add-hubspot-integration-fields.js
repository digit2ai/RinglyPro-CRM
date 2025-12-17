/**
 * Migration: Add HubSpot Integration Fields to Clients Table
 *
 * Adds fields for HubSpot API credentials and meeting configuration
 * to enable WhatsApp AI booking via HubSpot scheduling.
 *
 * IMPORTANT: This is SEPARATE from GHL integration.
 * Clients can use GHL, HubSpot, or both independently.
 *
 * Fields added:
 * - hubspot_api_key: HubSpot Private App Access Token
 * - hubspot_meeting_slug: Default meeting link slug (e.g., "john-smith")
 * - hubspot_timezone: Timezone override for HubSpot scheduling
 * - settings: JSONB field for extended integration settings
 */

module.exports = {
    up: async (queryInterface, Sequelize) => {
        console.log('🔄 Adding HubSpot integration fields to clients table...');

        try {
            // Check if columns already exist (idempotent migration)
            const tableDescription = await queryInterface.describeTable('clients');

            // Add HubSpot API Key field
            if (!tableDescription.hubspot_api_key) {
                await queryInterface.addColumn('clients', 'hubspot_api_key', {
                    type: Sequelize.STRING(255),
                    allowNull: true,
                    comment: 'HubSpot Private App Access Token'
                });
                console.log('✅ Added hubspot_api_key column');
            } else {
                console.log('⏭️ hubspot_api_key column already exists');
            }

            // Add HubSpot Meeting Slug field
            if (!tableDescription.hubspot_meeting_slug) {
                await queryInterface.addColumn('clients', 'hubspot_meeting_slug', {
                    type: Sequelize.STRING(100),
                    allowNull: true,
                    comment: 'HubSpot default meeting link slug (e.g., "john-smith")'
                });
                console.log('✅ Added hubspot_meeting_slug column');
            } else {
                console.log('⏭️ hubspot_meeting_slug column already exists');
            }

            // Add HubSpot Timezone override field
            if (!tableDescription.hubspot_timezone) {
                await queryInterface.addColumn('clients', 'hubspot_timezone', {
                    type: Sequelize.STRING(50),
                    allowNull: true,
                    comment: 'HubSpot timezone override (falls back to client timezone)'
                });
                console.log('✅ Added hubspot_timezone column');
            } else {
                console.log('⏭️ hubspot_timezone column already exists');
            }

            // Add settings JSONB field for extended integration config
            if (!tableDescription.settings) {
                await queryInterface.addColumn('clients', 'settings', {
                    type: Sequelize.JSONB,
                    allowNull: true,
                    defaultValue: null,
                    comment: 'Extended settings JSONB: { integration: { hubspot: {...}, ghl: {...} } }'
                });
                console.log('✅ Added settings JSONB column');
            } else {
                console.log('⏭️ settings column already exists');
            }

            // Add booking_system field to indicate which system to use
            if (!tableDescription.booking_system) {
                await queryInterface.addColumn('clients', 'booking_system', {
                    type: Sequelize.STRING(20),
                    allowNull: true,
                    defaultValue: null,
                    comment: 'Active booking system: "ghl", "hubspot", or null (use first available)'
                });
                console.log('✅ Added booking_system column');
            } else {
                console.log('⏭️ booking_system column already exists');
            }

            console.log('✅ HubSpot integration fields migration completed successfully');

        } catch (error) {
            console.error('❌ Error during HubSpot integration fields migration:', error);
            throw error;
        }
    },

    down: async (queryInterface, Sequelize) => {
        console.log('🔄 Removing HubSpot integration fields from clients table...');

        try {
            const tableDescription = await queryInterface.describeTable('clients');

            if (tableDescription.booking_system) {
                await queryInterface.removeColumn('clients', 'booking_system');
                console.log('✅ Removed booking_system column');
            }

            if (tableDescription.settings) {
                await queryInterface.removeColumn('clients', 'settings');
                console.log('✅ Removed settings column');
            }

            if (tableDescription.hubspot_timezone) {
                await queryInterface.removeColumn('clients', 'hubspot_timezone');
                console.log('✅ Removed hubspot_timezone column');
            }

            if (tableDescription.hubspot_meeting_slug) {
                await queryInterface.removeColumn('clients', 'hubspot_meeting_slug');
                console.log('✅ Removed hubspot_meeting_slug column');
            }

            if (tableDescription.hubspot_api_key) {
                await queryInterface.removeColumn('clients', 'hubspot_api_key');
                console.log('✅ Removed hubspot_api_key column');
            }

            console.log('✅ HubSpot integration fields rollback completed successfully');

        } catch (error) {
            console.error('❌ Error during HubSpot integration fields rollback:', error);
            throw error;
        }
    }
};
