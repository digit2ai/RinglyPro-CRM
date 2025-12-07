#!/usr/bin/env node

/**
 * Migration Runner for Online Storefront Module
 * Creates all tables for multi-tenant storefront system
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/ringlypro_development',
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting Online Storefront migration...\n');

    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/create-online-storefront-schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Executing migration SQL...');
    await client.query(migrationSQL);

    console.log('✅ Migration completed successfully!\n');

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name LIKE 'storefront_%'
      ORDER BY table_name;
    `);

    console.log(`\n✅ Created ${result.rows.length} tables:`);
    result.rows.forEach(row => {
      console.log(`   - ${row.table_name}`);
    });

    console.log('\n🎉 Online Storefront module is ready!');
    console.log('\nNext steps:');
    console.log('1. Create AI website scraper service');
    console.log('2. Build storefront API endpoints');
    console.log('3. Create public storefront frontend');
    console.log('4. Add admin UI to RinglyPro CRM');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('\nError details:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
