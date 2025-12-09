// Check storefronts for mstagg@digit2ai.com
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

    // Get client info
    const [client] = await sequelize.query(
      `SELECT id, first_name, last_name, email FROM ordergopro_clients WHERE email = 'mstagg@digit2ai.com'`,
      { type: QueryTypes.SELECT }
    );

    if (!client) {
      console.log('❌ Client not found');
      process.exit(1);
    }

    console.log('👤 Client Info:');
    console.log(`   ID: ${client.id}`);
    console.log(`   Name: ${client.first_name} ${client.last_name}`);
    console.log(`   Email: ${client.email}\n`);

    // Get storefronts
    const storefronts = await sequelize.query(
      `SELECT
        id,
        business_name,
        business_slug,
        original_website_url,
        website_import_status,
        is_published,
        created_at,
        tagline,
        description,
        primary_color,
        logo_url
      FROM storefront_businesses
      WHERE client_id = :clientId
      ORDER BY created_at DESC`,
      {
        replacements: { clientId: client.id },
        type: QueryTypes.SELECT
      }
    );

    console.log(`🏪 Found ${storefronts.length} storefronts:\n`);

    for (const store of storefronts) {
      console.log(`   📦 ${store.business_name}`);
      console.log(`      Slug: ${store.business_slug}`);
      console.log(`      Original URL: ${store.original_website_url || 'None'}`);
      console.log(`      Import Status: ${store.website_import_status || 'Not started'}`);
      console.log(`      Published: ${store.is_published ? 'Yes' : 'No'}`);
      console.log(`      Created: ${store.created_at}`);
      console.log(`      Tagline: ${store.tagline || 'None'}`);
      console.log(`      Logo: ${store.logo_url || 'None'}`);
      console.log(`      Colors: ${store.primary_color || 'Default'}`);
      console.log('');

      // Get products for this storefront
      const products = await sequelize.query(
        `SELECT COUNT(*) as count FROM storefront_products WHERE storefront_id = :id`,
        {
          replacements: { id: store.id },
          type: QueryTypes.SELECT
        }
      );

      console.log(`      Products: ${products[0].count}`);

      // Get categories
      const categories = await sequelize.query(
        `SELECT COUNT(*) as count FROM storefront_categories WHERE storefront_id = :id`,
        {
          replacements: { id: store.id },
          type: QueryTypes.SELECT
        }
      );

      console.log(`      Categories: ${categories[0].count}`);
      console.log('      ---\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

checkStorefronts();
