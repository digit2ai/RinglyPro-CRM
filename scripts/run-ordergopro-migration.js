#!/usr/bin/env node

/**
 * Run OrderGoPro clients migration
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Running OrderGoPro clients migration...\n');

    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations/create-ordergopro-clients.sql'),
      'utf8'
    );

    await client.query(sql);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name = 'ordergopro_clients'
    `);

    if (result.rows.length > 0) {
      console.log('✅ ordergopro_clients table created');
    }

    // Check if column was added
    const colCheck = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'storefront_businesses'
      AND column_name = 'ordergopro_client_id'
    `);

    if (colCheck.rows.length > 0) {
      console.log('✅ ordergopro_client_id column added to storefront_businesses\n');
    }

    console.log('🎉 OrderGoPro SaaS platform database ready!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
