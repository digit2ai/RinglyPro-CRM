#!/usr/bin/env node

/**
 * Add client_id column to users table
 * Links users to clients for multi-tenant settings
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function addClientIdColumn() {
  const client = await pool.connect();

  try {
    console.log('🚀 Adding client_id column to users table...\n');

    // Check if column exists
    const checkResult = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'client_id'
    `);

    if (checkResult.rows.length > 0) {
      console.log('✅ client_id column already exists in users table');
    } else {
      // Add the column
      console.log('📄 Adding client_id column...');
      await client.query(`
        ALTER TABLE users ADD COLUMN client_id INTEGER REFERENCES clients(id)
      `);
      console.log('✅ client_id column added');

      // Create index
      console.log('📄 Creating index...');
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_users_client_id ON users(client_id)
      `);
      console.log('✅ Index created');
    }

    // Link manuelstagg@gmail.com to client 30 (Manuel's Photos)
    console.log('\n📄 Linking manuelstagg@gmail.com to client 30...');
    const updateResult = await client.query(`
      UPDATE users
      SET client_id = 30
      WHERE email = 'manuelstagg@gmail.com'
      AND (client_id IS NULL OR client_id != 30)
      RETURNING id, email, client_id
    `);

    if (updateResult.rows.length > 0) {
      console.log(`✅ Linked user: ${updateResult.rows[0].email} -> client_id: ${updateResult.rows[0].client_id}`);
    } else {
      console.log('ℹ️  User already linked or not found');
    }

    // Verify the result
    console.log('\n🔍 Verifying users table structure...');
    const verifyResult = await client.query(`
      SELECT u.id, u.email, u.client_id, c.business_name
      FROM users u
      LEFT JOIN clients c ON u.client_id = c.id
      WHERE u.email = 'manuelstagg@gmail.com'
    `);

    if (verifyResult.rows.length > 0) {
      const user = verifyResult.rows[0];
      console.log(`\n✅ User verified:`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Client ID: ${user.client_id}`);
      console.log(`   Business: ${user.business_name || 'N/A'}`);
    }

    console.log('\n🎉 Migration completed successfully!\n');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

addClientIdColumn();
