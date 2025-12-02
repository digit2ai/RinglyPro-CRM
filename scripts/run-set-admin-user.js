// Run set admin user migration on production
// Usage: node scripts/run-set-admin-user.js

const { sequelize } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('🔄 Running set admin user migration...');

        const migrationPath = path.join(__dirname, '..', 'migrations', 'set-admin-user.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        await sequelize.query(sql);

        console.log('✅ Admin user migration completed successfully');
        console.log('You can now login at /admin-login with mstagg@digit2ai.com');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
