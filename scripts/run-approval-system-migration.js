// Run photo approval system migration
const { sequelize } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('🔄 Running photo approval system migration...');

        const migrationPath = path.join(__dirname, '..', 'migrations', 'add-photo-approval-system.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        await sequelize.query(sql);

        console.log('✅ Photo approval system migration completed successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
