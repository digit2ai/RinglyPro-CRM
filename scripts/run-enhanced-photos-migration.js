// Run enhanced photos migration
const { sequelize } = require('../src/models');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('🔄 Running enhanced photos migration...');

        const migrationPath = path.join(__dirname, '..', 'migrations', 'create-enhanced-photos.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        await sequelize.query(sql);

        console.log('✅ Enhanced photos table created successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

runMigration();
