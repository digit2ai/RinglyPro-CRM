#!/usr/bin/env node
/**
 * Fix API Key for Client ID 15
 *
 * This script updates the GoHighLevel API key from the incorrect password
 * to the correct PIT token.
 */

const { Sequelize } = require('sequelize');

// Database connection from environment variable
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable not set');
    console.error('Run: export DATABASE_URL="your-database-url"');
    process.exit(1);
}

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: {
            require: true,
            rejectUnauthorized: false
        }
    }
});

async function fixApiKey() {
    try {
        // Connect to database
        await sequelize.authenticate();
        console.log('✅ Connected to database');

        // Check current value
        const [currentResults] = await sequelize.query(
            'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE id = 15'
        );

        if (currentResults.length === 0) {
            console.error('❌ Client ID 15 not found');
            process.exit(1);
        }

        const client = currentResults[0];
        console.log('\n📋 Current values:');
        console.log('   Business:', client.business_name);
        console.log('   API Key:', client.ghl_api_key);
        console.log('   Location ID:', client.ghl_location_id);

        // Update with correct API key
        console.log('\n🔧 Updating API key...');
        const correctApiKey = 'pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe';

        await sequelize.query(
            'UPDATE clients SET ghl_api_key = :apiKey WHERE id = 15',
            {
                replacements: { apiKey: correctApiKey }
            }
        );

        // Verify update
        const [updatedResults] = await sequelize.query(
            'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE id = 15'
        );

        const updated = updatedResults[0];
        console.log('\n✅ Updated successfully!');
        console.log('   Business:', updated.business_name);
        console.log('   API Key:', updated.ghl_api_key);
        console.log('   Location ID:', updated.ghl_location_id);

        console.log('\n🎉 Done! You can now create contacts in the chat.');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

fixApiKey();
