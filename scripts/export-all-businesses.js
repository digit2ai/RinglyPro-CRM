// Export all collected businesses to console (simplified format)
const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');

async function exportAllBusinesses() {
  try {
    console.log('📊 Fetching all collected businesses...\n');

    const businesses = await sequelize.query(
      `SELECT
        bd.business_name,
        bd.phone_number,
        bd.website,
        bd.street,
        bd.city,
        bd.state,
        bd.postal_code
      FROM business_directory bd
      ORDER BY bd.created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    console.log(`Found ${businesses.length} businesses\n`);
    console.log('═'.repeat(120));

    if (businesses.length === 0) {
      console.log('No businesses collected yet.');
      process.exit(0);
    }

    console.log('Business Name | Phone Number | Website | Street | City | State | Postal Code');
    console.log('─'.repeat(120));

    // Display all businesses
    businesses.forEach((b) => {
      console.log(`${b.business_name || 'N/A'} | ${b.phone_number || 'N/A'} | ${b.website || 'N/A'} | ${b.street || 'N/A'} | ${b.city || 'N/A'} | ${b.state || 'N/A'} | ${b.postal_code || 'N/A'}`);
    });

    console.log('═'.repeat(120));
    console.log(`\nTotal: ${businesses.length} businesses collected`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

exportAllBusinesses();
