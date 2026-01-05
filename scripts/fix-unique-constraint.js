#!/usr/bin/env node
/**
 * Fix unique constraint to allow multiple appointments at same time for different calendars
 */
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: console.log,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function fixConstraint() {
    try {
        await sequelize.authenticate();
        console.log('✅ Connected to database\n');

        // Drop the old constraint (it's a UNIQUE constraint, not just an index)
        console.log('📋 Dropping old unique_time_slot_per_client constraint...');
        await sequelize.query('ALTER TABLE appointments DROP CONSTRAINT IF EXISTS unique_time_slot_per_client');
        console.log('✅ Old constraint dropped\n');

        // Create new constraint that includes ghl_calendar_id
        console.log('📋 Creating new unique constraint with calendar_id...');
        await sequelize.query(`
            CREATE UNIQUE INDEX unique_time_slot_per_client_calendar
            ON appointments (client_id, appointment_date, appointment_time, COALESCE(ghl_calendar_id, 'default'))
        `);
        console.log('✅ New constraint created\n');

        console.log('🎉 Done! Now multiple calendars can have appointments at the same time.');

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

fixConstraint();
