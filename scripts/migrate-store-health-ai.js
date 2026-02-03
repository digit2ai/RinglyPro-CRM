#!/usr/bin/env node
'use strict';

/**
 * Auto-migrate Store Health AI database tables
 * Runs Store Health AI migrations if needed
 */

const { exec } = require('child_process');
const path = require('path');
const util = require('util');

const execPromise = util.promisify(exec);

async function migrateStoreHealthAI() {
  try {
    console.log('🏪 Running Store Health AI migrations...');

    const storeHealthPath = path.join(__dirname, '..', 'store-health-ai');

    // Run sequelize migrations for Store Health AI
    const { stdout, stderr } = await execPromise(
      'npx sequelize-cli db:migrate',
      {
        cwd: storeHealthPath,
        env: {
          ...process.env,
          NODE_ENV: process.env.NODE_ENV || 'production'
        }
      }
    );

    if (stdout) console.log(stdout);
    if (stderr) console.error(stderr);

    console.log('✅ Store Health AI migrations complete');
    return true;
  } catch (error) {
    console.error('❌ Store Health AI migration error:', error.message);
    // Don't fail startup if migrations fail - tables might already exist
    return false;
  }
}

// Export for use in server startup
module.exports = { migrateStoreHealthAI };

// Run directly if called as script
if (require.main === module) {
  migrateStoreHealthAI()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal migration error:', error);
      process.exit(1);
    });
}
