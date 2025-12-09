// Check detailed import status for mstagg storefronts
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

async function checkImports() {
  try {
    await sequelize.authenticate();
    console.log('✅ Connected to database\n');

    // Get mstagg storefronts with full details
    const storefronts = await sequelize.query(
      `SELECT
        sb.id,
        sb.business_name,
        sb.business_slug,
        sb.original_website_url,
        sb.website_import_status,
        sb.is_published,
        sb.tagline,
        sb.description,
        sb.logo_url,
        sb.primary_color,
        sb.secondary_color,
        sb.brand_style,
        sb.brand_tone,
        sb.brand_keywords,
        COUNT(DISTINCT si.id) as item_count,
        COUNT(DISTINCT sc.id) as category_count
      FROM storefront_businesses sb
      LEFT JOIN storefront_items si ON sb.id = si.storefront_id
      LEFT JOIN storefront_categories sc ON sb.id = sc.storefront_id
      WHERE sb.ordergopro_client_id = 8
      GROUP BY sb.id
      ORDER BY sb.created_at DESC`,
      { type: QueryTypes.SELECT }
    );

    console.log(`🏪 Manuel's Storefronts (${storefronts.length}):\n`);

    for (const s of storefronts) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📦 ${s.business_name} (ID: ${s.id})`);
      console.log(`   Slug: ${s.business_slug}`);
      console.log(`   URL: https://aiagent.ringlypro.com/storefront/${s.business_slug}`);
      console.log(`   Original Website: ${s.original_website_url || 'None'}`);
      console.log(`   Import Status: ${s.website_import_status}`);
      console.log(`   Published: ${s.is_published ? 'Yes' : 'No'}`);
      console.log('');
      console.log(`   🎨 Branding:`);
      console.log(`      Tagline: ${s.tagline || 'Not set'}`);
      console.log(`      Logo: ${s.logo_url ? '✓ Set' : '✗ Missing'}`);
      console.log(`      Colors: ${s.primary_color || 'Default'} / ${s.secondary_color || 'Default'}`);
      console.log(`      Style: ${s.brand_style || 'Not set'}`);
      console.log(`      Tone: ${s.brand_tone || 'Not set'}`);
      console.log(`      Keywords: ${s.brand_keywords ? s.brand_keywords.join(', ') : 'None'}`);
      console.log('');
      console.log(`   📊 Content:`);
      console.log(`      Categories: ${s.category_count}`);
      console.log(`      Items: ${s.item_count}`);
      console.log('');

      // Check AI import logs
      const imports = await sequelize.query(
        `SELECT
          import_type,
          status,
          error_message,
          extracted_data,
          items_found,
          items_created,
          categories_created,
          created_at
         FROM storefront_ai_imports
         WHERE storefront_id = :id
         ORDER BY created_at DESC
         LIMIT 5`,
        {
          replacements: { id: s.id },
          type: QueryTypes.SELECT
        }
      );

      if (imports.length > 0) {
        console.log(`   📝 Import Logs (${imports.length}):`);
        imports.forEach(imp => {
          console.log(`      ${imp.import_type}: ${imp.status}`);
          console.log(`         Items: ${imp.items_created}/${imp.items_found} created`);
          console.log(`         Categories: ${imp.categories_created}`);
          if (imp.error_message) {
            console.log(`         Error: ${imp.error_message}`);
          }
        });
      } else {
        console.log(`   ⚠️  No AI import logs found`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

checkImports();
