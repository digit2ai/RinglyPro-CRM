// Check storefront client IDs
const { Sequelize, QueryTypes } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DATABASE_URL || 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require',
  {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
);

async function checkStorefronts() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Check which column exists
    const columns = await sequelize.query(
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_name = 'storefront_businesses'
       AND column_name LIKE '%client%'`,
      { type: QueryTypes.SELECT }
    );

    console.log('📋 Client-related columns in storefront_businesses:');
    columns.forEach(c => {
      console.log(`   - ${c.column_name} (${c.data_type})`);
    });
    console.log('');

    // Get all storefronts with their client linkage
    const storefronts = await sequelize.query(
      `SELECT
        id,
        business_name,
        business_slug,
        client_id,
        ordergopro_client_id,
        created_at
      FROM storefront_businesses
      ORDER BY created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    console.log(`🏪 Storefronts (${storefronts.length}):\n`);

    storefronts.forEach(s => {
      console.log(`   ${s.id}: ${s.business_name}`);
      console.log(`      Slug: ${s.business_slug}`);
      console.log(`      client_id: ${s.client_id || 'NULL'}`);
      console.log(`      ordergopro_client_id: ${s.ordergopro_client_id || 'NULL'}`);
      console.log(`      Created: ${s.created_at}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

checkStorefronts();
