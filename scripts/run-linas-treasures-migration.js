const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require',
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting Lina\'s Treasures database migration...\n');

    // Read the SQL file
    const sqlFile = path.join(__dirname, '../migrations/create-linas-treasures-schema.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');

    // Execute the migration
    await client.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('\nCreated tables:');
    console.log('  - lt_product_categories');
    console.log('  - lt_products');
    console.log('  - lt_partnerships');
    console.log('  - lt_orders');
    console.log('  - lt_order_items');
    console.log('  - lt_cart_items');
    console.log('  - lt_product_reviews');
    console.log('  - lt_inventory_history');

    // Verify tables were created
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'lt_%'
      ORDER BY table_name;
    `);

    console.log('\n✓ Verified tables in database:');
    result.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    // Check seed data
    const categoriesCount = await client.query('SELECT COUNT(*) FROM lt_product_categories');
    console.log(`\n✓ Product categories seeded: ${categoriesCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
