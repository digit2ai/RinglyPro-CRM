#!/usr/bin/env node
/**
 * Fix GHL Location ID for Client ID 15
 *
 * Updates the ghl_location_id from CU7M8At2sWwodiBrr71J to SEMmeWOBlogS8eeis0N9
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

async function fixLocationId() {
    try {
        // Connect to database
        await sequelize.authenticate();
        console.log('✅ Connected to database');

        // Check current value in clients table
        const [clientResults] = await sequelize.query(
            'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE id = 15'
        );

        if (clientResults.length === 0) {
            console.error('❌ Client ID 15 not found');
            process.exit(1);
        }

        const client = clientResults[0];
        console.log('\n📋 Current values in clients table:');
        console.log('   Business:', client.business_name);
        console.log('   API Key:', client.ghl_api_key);
        console.log('   Location ID:', client.ghl_location_id);

        // Check ghl_integrations table too
        const [integrationResults] = await sequelize.query(
            'SELECT id, ghl_location_id, is_active FROM ghl_integrations WHERE client_id = 15'
        );

        if (integrationResults.length > 0) {
            console.log('\n📋 Current values in ghl_integrations table:');
            integrationResults.forEach(row => {
                console.log(`   Integration ID ${row.id}: location=${row.ghl_location_id}, active=${row.is_active}`);
            });
        }

        // Update with correct location ID
        const correctLocationId = 'SEMmeWOBlogS8eeis0N9';
        console.log('\n🔧 Updating location_id to:', correctLocationId);

        // Update clients table
        await sequelize.query(
            'UPDATE clients SET ghl_location_id = :locationId WHERE id = 15',
            { replacements: { locationId: correctLocationId } }
        );
        console.log('   ✅ Updated clients table');

        // Update ghl_integrations table if exists
        if (integrationResults.length > 0) {
            await sequelize.query(
                'UPDATE ghl_integrations SET ghl_location_id = :locationId WHERE client_id = 15',
                { replacements: { locationId: correctLocationId } }
            );
            console.log('   ✅ Updated ghl_integrations table');
        }

        // Verify updates
        const [updatedClient] = await sequelize.query(
            'SELECT id, business_name, ghl_api_key, ghl_location_id FROM clients WHERE id = 15'
        );

        console.log('\n✅ Updated successfully!');
        console.log('   Business:', updatedClient[0].business_name);
        console.log('   Location ID:', updatedClient[0].ghl_location_id);

        if (integrationResults.length > 0) {
            const [updatedIntegration] = await sequelize.query(
                'SELECT id, ghl_location_id FROM ghl_integrations WHERE client_id = 15'
            );
            console.log('   Integration Location ID:', updatedIntegration[0]?.ghl_location_id);
        }

        console.log('\n🎉 Done! Client 15 now has the correct GHL location ID.');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

fixLocationId();
