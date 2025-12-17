/**
 * Script to run HubSpot integration fields migration
 *
 * Usage: node scripts/run-hubspot-integration-migration.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const migration = require('../migrations/add-hubspot-integration-fields');

async function runMigration() {
    console.log('🚀 Starting HubSpot integration fields migration...\n');

    // Initialize Sequelize connection
    const sequelize = new Sequelize(process.env.DATABASE_URL, {
        dialect: 'postgres',
        logging: console.log,
        dialectOptions: {
            ssl: process.env.NODE_ENV === 'production' ? {
                require: true,
                rejectUnauthorized: false
            } : false
        }
    });

    try {
        // Test connection
        console.log('📡 Testing database connection...');
        await sequelize.authenticate();
        console.log('✅ Database connection established\n');

        // Run migration
        console.log('🔄 Running migration...\n');
        await migration.up(sequelize.getQueryInterface(), Sequelize);

        console.log('\n✅ Migration completed successfully!');
        console.log('\n📝 New fields added to clients table:');
        console.log('   - hubspot_api_key (HubSpot Private App Access Token)');
        console.log('   - hubspot_meeting_slug (Default meeting link slug)');
        console.log('   - hubspot_timezone (Timezone override for HubSpot)');
        console.log('   - booking_system (Active booking system: "ghl" or "hubspot")');
        console.log('   - settings (JSONB for extended integration config)');
        console.log('\n💡 Clients can now configure HubSpot booking in their settings');
        console.log('   Set booking_system = "hubspot" to use HubSpot for WhatsApp bookings');

    } catch (error) {
        console.error('\n❌ Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        await sequelize.close();
        console.log('\n👋 Database connection closed');
    }
}

// Run the migration
runMigration();
