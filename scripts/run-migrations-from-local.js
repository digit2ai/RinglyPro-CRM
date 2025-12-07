#!/usr/bin/env node

/**
 * Run storefront migrations from local machine
 * Uses pg library instead of psql command
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting storefront migrations on PRODUCTION...\n');

    // Migration 1
    console.log('📄 Running: create-online-storefront-schema.sql');
    const sql1 = fs.readFileSync(
      path.join(__dirname, '../migrations/create-online-storefront-schema.sql'),
      'utf8'
    );
    await client.query(sql1);
    console.log('✅ Completed: create-online-storefront-schema.sql\n');

    // Migration 2
    console.log('📄 Running: enhance-storefront-with-upmenu-features.sql');
    const sql2 = fs.readFileSync(
      path.join(__dirname, '../migrations/enhance-storefront-with-upmenu-features.sql'),
      'utf8'
    );
    await client.query(sql2);
    console.log('✅ Completed: enhance-storefront-with-upmenu-features.sql\n');

    // Verify
    console.log('🔍 Verifying tables...');
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'storefront_%'
      ORDER BY table_name
    `);

    console.log(`\n✅ Created ${result.rows.length} storefront tables:`);
    result.rows.forEach(row => console.log(`   - ${row.table_name}`));

    // Check subscription plans
    const plans = await client.query(`
      SELECT plan_name, monthly_price, display_name
      FROM storefront_subscription_plans
      ORDER BY monthly_price
    `);

    console.log(`\n💰 Subscription plans seeded:`);
    plans.rows.forEach(plan => {
      console.log(`   - ${plan.display_name}: $${plan.monthly_price}/mo`);
    });

    console.log('\n🎉 All migrations completed successfully!\n');
    console.log('🎯 Next steps:');
    console.log('1. Restart Render service (auto-deploys from GitHub)');
    console.log('2. Test creating storefront via API');
    console.log('3. Build frontend views\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations();
