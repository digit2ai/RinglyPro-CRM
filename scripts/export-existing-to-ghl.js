// Script to export existing database contacts to GHL
// Run this to push the 240+ contacts that were saved before auto-export was implemented

const { Sequelize, QueryTypes } = require('sequelize');
const axios = require('axios');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
});

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

async function exportExistingToGHL() {
  try {
    console.log('🚀 Starting export of existing businesses to GHL...\n');

    // Get client ID from command line or use default
    const clientId = process.argv[2] || '15';
    console.log(`📋 Using Client ID: ${clientId}`);

    // Get GHL credentials
    const credentials = await sequelize.query(
      `SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId`,
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    if (!credentials || credentials.length === 0) {
      console.error('❌ Client not found');
      process.exit(1);
    }

    const { ghl_api_key, ghl_location_id } = credentials[0];

    if (!ghl_api_key || !ghl_location_id) {
      console.error('❌ GHL credentials not configured for this client');
      process.exit(1);
    }

    console.log(`🔑 GHL credentials found`);
    console.log(`📍 Location ID: ${ghl_location_id}\n`);

    // Get all businesses for this client
    const businesses = await sequelize.query(
      `SELECT * FROM business_directory WHERE client_id = :clientId ORDER BY created_at DESC`,
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    console.log(`📊 Found ${businesses.length} businesses in database\n`);

    if (businesses.length === 0) {
      console.log('✅ No businesses to export');
      process.exit(0);
    }

    let exported = 0;
    let skipped = 0;
    let failed = 0;

    for (const business of businesses) {
      try {
        // Skip if no phone number
        if (!business.phone_number) {
          console.log(`⚠️  Skipping ${business.business_name}: No phone number`);
          skipped++;
          continue;
        }

        // Format phone number
        let phone = business.phone_number.replace(/\D/g, '');
        if (phone.length === 10) {
          phone = '1' + phone;
        }
        if (!phone.startsWith('+')) {
          phone = '+' + phone;
        }

        // Build location string
        const businessLocation = business.city && business.state
          ? `${business.city}, ${business.state}`
          : (business.state || '');

        // Prepare contact data
        const contactData = {
          locationId: ghl_location_id,
          firstName: business.business_name || 'Unknown Business',
          phone: phone,
          email: business.email || undefined,
          website: business.website || undefined,
          address1: business.street || undefined,
          city: business.city || undefined,
          state: business.state || undefined,
          postalCode: business.postal_code || undefined,
          country: business.country || 'US',
          source: `Business Collector - ${businessLocation}`,
          tags: [
            'NEW LEAD',
            'TO_BE_CALLED',
            business.category || 'Uncategorized',
            businessLocation || 'Location Unknown'
          ].filter(tag => tag)
        };

        // Call GHL API
        const response = await axios({
          method: 'POST',
          url: `${GHL_BASE_URL}/contacts/`,
          headers: {
            'Authorization': `Bearer ${ghl_api_key}`,
            'Version': GHL_API_VERSION,
            'Content-Type': 'application/json'
          },
          data: contactData
        });

        if (response.data && response.data.contact) {
          console.log(`✅ Exported: ${business.business_name} (Contact ID: ${response.data.contact.id})`);
          exported++;
        }

      } catch (error) {
        // Handle duplicates
        if (error.response?.data?.message?.includes('duplicate') ||
            error.response?.data?.message?.includes('already exists')) {
          console.log(`⚠️  Already exists: ${business.business_name}`);
          skipped++;
        } else {
          console.error(`❌ Failed: ${business.business_name} - ${error.response?.data?.message || error.message}`);
          failed++;
        }
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(50));
    console.log('📊 EXPORT SUMMARY');
    console.log('='.repeat(50));
    console.log(`✅ Exported: ${exported}`);
    console.log(`⚠️  Skipped (no phone): ${skipped - (businesses.length - exported - failed - skipped)}`);
    console.log(`⚠️  Already in GHL: ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Total Processed: ${businesses.length}`);
    console.log('='.repeat(50));

    await sequelize.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    await sequelize.close();
    process.exit(1);
  }
}

exportExistingToGHL();
