// Check which clients have GHL credentials configured
require('dotenv').config();
const { sequelize } = require('../src/models');

async function checkGHLCredentials() {
  try {
    console.log('🔍 Checking GHL credentials in database...\n');

    const result = await sequelize.query(`
      SELECT
        id,
        business_name,
        owner_email,
        CASE
          WHEN ghl_api_key IS NOT NULL AND ghl_api_key != ''
          THEN 'YES (' || LEFT(ghl_api_key, 15) || '...)'
          ELSE 'NO'
        END as has_api_key,
        CASE
          WHEN ghl_location_id IS NOT NULL AND ghl_location_id != ''
          THEN ghl_location_id
          ELSE 'NO'
        END as location_id,
        CASE
          WHEN ghl_api_key IS NOT NULL AND ghl_api_key != ''
            AND ghl_location_id IS NOT NULL AND ghl_location_id != ''
          THEN '✅ CONFIGURED'
          ELSE '❌ NOT CONFIGURED'
        END as status
      FROM clients
      ORDER BY id
    `, { type: sequelize.QueryTypes.SELECT });

    console.log('📊 GHL Credentials Status:\n');
    console.log('ID | Business Name | Email | Has API Key | Location ID | Status');
    console.log('---|---------------|-------|-------------|-------------|-------');

    result.forEach(client => {
      console.log(
        `${client.id} | ${client.business_name.substring(0, 20).padEnd(20)} | ` +
        `${client.owner_email.substring(0, 25).padEnd(25)} | ` +
        `${client.has_api_key.padEnd(20)} | ${client.location_id.padEnd(20)} | ${client.status}`
      );
    });

    console.log('\n📈 Summary:');
    const configured = result.filter(c => c.status === '✅ CONFIGURED').length;
    const notConfigured = result.filter(c => c.status === '❌ NOT CONFIGURED').length;
    console.log(`✅ Configured: ${configured}`);
    console.log(`❌ Not Configured: ${notConfigured}`);
    console.log(`📊 Total Clients: ${result.length}`);

    // Check if all are pointing to same credentials
    const uniqueApiKeys = await sequelize.query(`
      SELECT
        LEFT(ghl_api_key, 20) as api_key_prefix,
        ghl_location_id,
        COUNT(*) as client_count,
        STRING_AGG(business_name, ', ') as businesses
      FROM clients
      WHERE ghl_api_key IS NOT NULL AND ghl_api_key != ''
      GROUP BY ghl_api_key, ghl_location_id
      ORDER BY client_count DESC
    `, { type: sequelize.QueryTypes.SELECT });

    if (uniqueApiKeys.length > 0) {
      console.log('\n🔑 Unique API Key/Location ID Combinations:');
      uniqueApiKeys.forEach((combo, i) => {
        console.log(`\n${i + 1}. API Key: ${combo.api_key_prefix}...`);
        console.log(`   Location ID: ${combo.ghl_location_id}`);
        console.log(`   Used by ${combo.client_count} client(s): ${combo.businesses}`);

        if (combo.client_count > 1) {
          console.log(`   ⚠️  WARNING: Multiple clients sharing same GHL credentials!`);
        }
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkGHLCredentials();
