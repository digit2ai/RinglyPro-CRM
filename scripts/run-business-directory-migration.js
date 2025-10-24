/**
 * Script to run business directory migration
 *
 * Usage: node scripts/run-business-directory-migration.js
 */

require('dotenv').config();
const { Sequelize } = require('sequelize');
const migration = require('../migrations/create-business-directory');

async function runMigration() {
    console.log('🚀 Starting business directory migration...\n');

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
        console.log('\n📝 New table created: business_directory');
        console.log('   Columns:');
        console.log('   - id (primary key)');
        console.log('   - business_name');
        console.log('   - phone_number');
        console.log('   - website');
        console.log('   - email');
        console.log('   - street, city, state, postal_code, country');
        console.log('   - category');
        console.log('   - source_url');
        console.log('   - confidence');
        console.log('   - notes');
        console.log('   - client_id (foreign key to clients table)');
        console.log('   - created_at, updated_at');
        console.log('\n💡 Business Collector will now automatically save all collected businesses to this table');

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
