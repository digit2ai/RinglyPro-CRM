// Run photo approval system migration on production database
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const PROD_DB_URL = 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require';

async function runMigration() {
    let sequelize;
    try {
        console.log('🔄 Connecting to production database...');

        sequelize = new Sequelize(PROD_DB_URL, {
            dialect: 'postgres',
            logging: false,
            dialectOptions: {
                ssl: {
                    require: true,
                    rejectUnauthorized: false
                }
            }
        });

        await sequelize.authenticate();
        console.log('✅ Connected to production database');

        console.log('🔄 Running photo approval system migration...');

        const migrationPath = path.join(__dirname, '..', 'migrations', 'add-photo-approval-system.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        await sequelize.query(sql);

        console.log('✅ Photo approval system migration completed successfully on PRODUCTION');

        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        if (sequelize) await sequelize.close();
        process.exit(1);
    }
}

runMigration();
