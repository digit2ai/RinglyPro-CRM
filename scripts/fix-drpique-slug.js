// Fix Dr. Pique storefront slug from "https://melindas.com/" to "drpique"
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

async function fixSlug() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Check current state
    console.log('📋 Before fix:');
    const before = await sequelize.query(
      `SELECT id, business_name, business_slug FROM storefront_businesses WHERE id = 13`,
      { type: QueryTypes.SELECT }
    );
    console.log(before);
    console.log('');

    // Update the slug
    console.log('🔧 Updating slug from "https://melindas.com/" to "drpique"...');
    await sequelize.query(
      `UPDATE storefront_businesses SET business_slug = 'drpique' WHERE id = 13`,
      { type: QueryTypes.UPDATE }
    );

    // Verify the fix
    console.log('\n✅ After fix:');
    const after = await sequelize.query(
      `SELECT id, business_name, business_slug FROM storefront_businesses WHERE id = 13`,
      { type: QueryTypes.SELECT }
    );
    console.log(after);
    console.log('');

    console.log('✅ Slug fixed successfully!');
    console.log('🔗 New URL: https://aiagent.ringlypro.com/storefront/drpique');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

fixSlug();
