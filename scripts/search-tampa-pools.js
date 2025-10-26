const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  }
});

const phoneNumbers = [
  '8134421960',  // Tampa VIP Pool Services
  '8133315922',  // Pool Troopers - Tampa
  '8133383998',  // PRECISION POOLS
  '8136992121',  // Piranha Pool Care LLC
  '8133903332',  // Chinchillin Pool Service
  '8133692600',  // Perfect Pool & Spa
  '7276071456',  // Perez Pool Cleaning Tampa Bay
  '8137434441',  // Lutz Neighborhood Pool Services
  '8135753535',  // CleanMyPool Maintenance
  '8135900022',  // Bright Blue Pros Pools & Spas
  '8135804639',  // Pool Sharks of Tampa Bay
  '8134535988',  // A-Quality Pool Service
  '8137305554',  // Helpful Tampa Pool Care
  '8138562220',  // Happy Pool Care Pros
  '8137536263',  // A and L Pool Maintenance
  '8139579996',  // Friendly Guys Pool Care
  '8132964096'   // Aqua Ava's Pool Service
];

async function searchBusinesses() {
  try {
    console.log('🔍 Searching for 17 Tampa pool service businesses...\n');

    const results = await sequelize.query(
      `SELECT
        business_name,
        phone_number,
        city,
        state,
        location,
        call_status,
        TO_CHAR(created_at, 'YYYY-MM-DD HH24:MI:SS') as created_at
       FROM business_directory
       WHERE phone_number IN (:phones)
       ORDER BY created_at DESC`,
      {
        replacements: { phones: phoneNumbers },
        type: QueryTypes.SELECT
      }
    );

    if (results.length === 0) {
      console.log('❌ NONE of the 17 Tampa pool businesses were found in the database.\n');
      console.log('Missing phone numbers:');
      phoneNumbers.forEach(phone => console.log(`  - ${phone}`));
    } else {
      console.log(`✅ Found ${results.length} out of 17 businesses in database:\n`);
      results.forEach((r, i) => {
        console.log(`${i + 1}. ${r.business_name}`);
        console.log(`   📱 ${r.phone_number}`);
        console.log(`   📍 ${r.location || `${r.city}, ${r.state}`}`);
        console.log(`   📊 Status: ${r.call_status || 'N/A'}`);
        console.log(`   📅 Added: ${r.created_at}`);
        console.log('');
      });

      // Show missing ones
      const foundPhones = results.map(r => r.phone_number);
      const missing = phoneNumbers.filter(p => !foundPhones.includes(p));

      if (missing.length > 0) {
        console.log(`\n❌ Missing ${missing.length} businesses:`);
        missing.forEach(phone => console.log(`  - ${phone}`));
      }
    }

    await sequelize.close();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

searchBusinesses();
