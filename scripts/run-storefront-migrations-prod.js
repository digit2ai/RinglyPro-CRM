#!/usr/bin/env node

/**
 * Run both storefront migrations on production database
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

const DB_URL = 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require';

const migrations = [
  'migrations/create-online-storefront-schema.sql',
  'migrations/enhance-storefront-with-upmenu-features.sql'
];

async function runMigration(filePath) {
  return new Promise((resolve, reject) => {
    const absolutePath = path.join(__dirname, '..', filePath);

    if (!fs.existsSync(absolutePath)) {
      reject(new Error(`Migration file not found: ${absolutePath}`));
      return;
    }

    console.log(`\n📄 Running: ${filePath}...`);

    const command = `psql "${DB_URL}" -f "${absolutePath}"`;

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Error: ${error.message}`);
        reject(error);
        return;
      }

      if (stderr && !stderr.includes('NOTICE')) {
        console.error(`⚠️  Warning: ${stderr}`);
      }

      console.log(stdout);
      console.log(`✅ Completed: ${filePath}`);
      resolve();
    });
  });
}

async function runAllMigrations() {
  console.log('🚀 Starting storefront migrations on PRODUCTION database...\n');
  console.log('⚠️  WARNING: Running on PRODUCTION database');
  console.log('Database:', DB_URL.split('@')[1].split('/')[0]);
  console.log('');

  try {
    for (const migration of migrations) {
      await runMigration(migration);
    }

    console.log('\n🎉 All migrations completed successfully!\n');
    console.log('📊 Verifying tables...\n');

    // Verify tables were created
    const verifyCommand = `psql "${DB_URL}" -c "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'storefront_%' ORDER BY table_name;"`;

    exec(verifyCommand, (error, stdout, stderr) => {
      if (error) {
        console.error('❌ Verification failed:', error.message);
        process.exit(1);
      }

      console.log('✅ Tables created:');
      console.log(stdout);

      console.log('\n🎯 Next steps:');
      console.log('1. Verify Render deployment is complete');
      console.log('2. Test creating a storefront via API');
      console.log('3. Build frontend views\n');

      process.exit(0);
    });

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runAllMigrations();
