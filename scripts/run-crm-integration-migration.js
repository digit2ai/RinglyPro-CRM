/**
 * Script to run CRM integration fields migration
 *
 * Usage: node scripts/run-crm-integration-migration.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const migration = require('../migrations/add-crm-integration-fields');

async function runMigration() {
    console.log('🚀 Starting CRM integration fields migration...\n');

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
        console.log('   - ghl_api_key (GoHighLevel Private Integration Token)');
        console.log('   - ghl_location_id (GoHighLevel Location ID)');
        console.log('   - hubspot_api_key (HubSpot API Key)');
        console.log('\n💡 Clients can now configure CRM integrations in their dashboard settings');

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
