// =====================================================
// Vagaro Database Migration Script
// File: scripts/migrate-vagaro.js
// Purpose: Add vagaro_id fields to contacts and appointments tables
// =====================================================

const { sequelize } = require('../src/models');
const logger = require('../src/utils/logger');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    logger.info('[VAGARO MIGRATION] Starting migration...');

    // Read SQL migration file
    const sqlPath = path.join(__dirname, '../migrations/add-vagaro-id-fields.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    // Execute migration
    await sequelize.query(sql);

    logger.info('[VAGARO MIGRATION] ✅ Migration completed successfully!');
    logger.info('[VAGARO MIGRATION] Added vagaro_id fields to contacts and appointments tables');

    process.exit(0);
  } catch (error) {
    logger.error('[VAGARO MIGRATION] ❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
