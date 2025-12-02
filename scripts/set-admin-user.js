// Set admin user migration
const { sequelize } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function setAdminUser() {
    try {
        console.log('🔄 Setting admin flag for mstagg@digit2ai.com...');

        const migrationPath = path.join(__dirname, '..', 'migrations', 'set-admin-user.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        const result = await sequelize.query(sql);

        console.log('✅ Admin user updated successfully');
        console.log('User info:', result[1]);
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

setAdminUser();
