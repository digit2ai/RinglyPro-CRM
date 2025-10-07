#!/usr/bin/env node

const { Sequelize } = require('sequelize');
require('dotenv').config();

const DATABASE_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    }
});

async function searchForConstraint() {
    try {
        await sequelize.authenticate();

        console.log('🔍 Searching for anything named "unique_time_slot"...\n');

        // Check constraints
        const [constraints] = await sequelize.query(`
            SELECT
                conname,
                conrelid::regclass as table_name,
                pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conname LIKE '%unique_time_slot%';
        `);

        console.log('CONSTRAINTS:');
        if (constraints.length === 0) {
            console.log('  (none found)\n');
        } else {
            constraints.forEach(c => {
                console.log(`  ${c.conname} on ${c.table_name}`);
                console.log(`    ${c.definition}\n`);
            });
        }

        // Check indexes
        const [indexes] = await sequelize.query(`
            SELECT
                i.relname as index_name,
                t.relname as table_name,
                ix.indisunique as is_unique
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            WHERE i.relname LIKE '%unique_time_slot%';
        `);

        console.log('INDEXES:');
        if (indexes.length === 0) {
            console.log('  (none found)\n');
        } else {
            indexes.forEach(i => {
                console.log(`  ${i.index_name} on ${i.table_name} (unique: ${i.is_unique})\n`);
            });
        }

        // Now let's try to actually insert a duplicate to see the real error
        console.log('🧪 Testing actual duplicate insert...\n');

        const [existing] = await sequelize.query(`
            SELECT client_id, appointment_date, appointment_time
            FROM appointments
            LIMIT 1;
        `);

        if (existing.length > 0) {
            const test = existing[0];
            console.log(`Found existing appointment: client=${test.client_id}, date=${test.appointment_date}, time=${test.appointment_time}`);
            console.log('Attempting to insert duplicate...\n');

            try {
                await sequelize.query(`
                    INSERT INTO appointments (
                        client_id, customer_name, customer_phone,
                        appointment_date, appointment_time,
                        status, confirmation_code, source,
                        created_at, updated_at
                    ) VALUES (
                        ${test.client_id}, 'Test', 'Test',
                        '${test.appointment_date}', '${test.appointment_time}',
                        'confirmed', 'TEST123', 'voice_booking',
                        NOW(), NOW()
                    );
                `);
                console.log('❌ ERROR: Duplicate was allowed! This should not happen.');
            } catch (error) {
                console.log('✅ Duplicate correctly rejected!');
                console.log(`Constraint violated: ${error.parent?.constraint || 'unknown'}`);
                console.log(`Error message: ${error.parent?.message || error.message}\n`);
            }
        }

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await sequelize.close();
    }
}

searchForConstraint();
