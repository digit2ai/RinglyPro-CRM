// Verify approval system columns exist in production
const { Sequelize, QueryTypes } = require('sequelize');

const PROD_DB_URL = 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require';

async function verifyColumns() {
    let sequelize;
    try {
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
        console.log('✅ Connected to production database\n');

        // Check enhanced_photos columns
        const enhancedPhotosColumns = await sequelize.query(`
            SELECT column_name, data_type, column_default
            FROM information_schema.columns
            WHERE table_name = 'enhanced_photos'
            AND column_name IN ('approval_status', 'customer_feedback', 'approved_at', 'reviewed_at')
            ORDER BY column_name;
        `, { type: QueryTypes.SELECT });

        console.log('📋 Enhanced Photos Table - Approval Columns:');
        if (enhancedPhotosColumns.length > 0) {
            enhancedPhotosColumns.forEach(col => {
                console.log(`  ✅ ${col.column_name} (${col.data_type}) - Default: ${col.column_default || 'NULL'}`);
            });
        } else {
            console.log('  ❌ No approval columns found!');
        }

        // Check if photo_communications table exists
        const tableExists = await sequelize.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_name = 'photo_communications'
            );
        `, { type: QueryTypes.SELECT });

        console.log('\n📋 Photo Communications Table:');
        if (tableExists[0].exists) {
            console.log('  ✅ Table exists');

            // Count rows
            const [rowCount] = await sequelize.query(`
                SELECT COUNT(*) as count FROM photo_communications;
            `, { type: QueryTypes.SELECT });

            console.log(`  📊 Current rows: ${rowCount.count}`);
        } else {
            console.log('  ❌ Table does not exist!');
        }

        await sequelize.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Verification failed:', error);
        if (sequelize) await sequelize.close();
        process.exit(1);
    }
}

verifyColumns();
