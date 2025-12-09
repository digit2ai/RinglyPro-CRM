// Check all storefronts and see which client they belong to
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

    // First, check if there's an ordergopro_clients table
    const tablesCheck = await sequelize.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE '%ordergopro%' OR tablename LIKE '%storefront%'`,
      { type: QueryTypes.SELECT }
    );

    console.log('📋 Available tables:');
    tablesCheck.forEach(t => console.log(`   - ${t.tablename}`));
    console.log('');

    // Check all ordergopro clients
    const clients = await sequelize.query(
      `SELECT id, first_name, last_name, email FROM ordergopro_clients ORDER BY id`,
      { type: QueryTypes.SELECT }
    );

    console.log(`👥 OrderGoPro Clients (${clients.length}):`);
    clients.forEach(c => {
      console.log(`   ${c.id}: ${c.first_name} ${c.last_name} (${c.email})`);
    });
    console.log('');

    // Get all storefronts
    const storefronts = await sequelize.query(
      `SELECT
        sb.id,
        sb.business_name,
        sb.business_slug,
        sb.original_website_url,
        sb.website_import_status,
        sb.is_published,
        sb.created_at,
        sb.ordergopro_client_id,
        oc.email as client_email
      FROM storefront_businesses sb
      LEFT JOIN ordergopro_clients oc ON sb.ordergopro_client_id = oc.id
      ORDER BY sb.created_at DESC
      LIMIT 20`,
      { type: QueryTypes.SELECT }
    );

    console.log(`🏪 Recent Storefronts (${storefronts.length}):\n`);

    for (const store of storefronts) {
      console.log(`   📦 ${store.business_name} (ID: ${store.id})`);
      console.log(`      Client ID: ${store.ordergopro_client_id} (${store.client_email || 'No email'})`);
      console.log(`      Slug: ${store.business_slug}`);
      console.log(`      Original URL: ${store.original_website_url || 'None'}`);
      console.log(`      Import Status: ${store.website_import_status || 'pending'}`);
      console.log(`      Published: ${store.is_published ? 'Yes' : 'No'}`);
      console.log(`      Created: ${store.created_at}`);

      // Get items count
      const items = await sequelize.query(
        `SELECT COUNT(*) as count FROM storefront_items WHERE storefront_id = :id`,
        {
          replacements: { id: store.id },
          type: QueryTypes.SELECT
        }
      );

      console.log(`      Items: ${items[0].count}`);
      console.log('      ---\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

checkStorefronts();
