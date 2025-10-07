#!/usr/bin/env node

/**
 * Drop the old unique_time_slot constraint
 *
 * This constraint prevents different clients from booking the same time
 * We need unique_time_slot_per_client instead
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const DATABASE_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

const sequelize = new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    logging: console.log,
    dialectOptions: {
        ssl: process.env.NODE_ENV === 'production' ? {
            require: true,
            rejectUnauthorized: false
        } : false
    }
});

async function dropOldConstraint() {
    try {
        console.log('🔌 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Connected\n');

        // Check what constraints exist
        console.log('📋 Checking current constraints...');
        const [constraints] = await sequelize.query(`
            SELECT conname, pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = 'appointments'::regclass
            AND contype = 'u'
            ORDER BY conname;
        `);

        console.log('Current unique constraints:');
        constraints.forEach(c => {
            console.log(`  - ${c.conname}: ${c.definition}`);
        });
        console.log('');

        // Check if old constraint exists
        const hasOldConstraint = constraints.some(c => c.conname === 'unique_time_slot');

        if (hasOldConstraint) {
            console.log('🗑️  Dropping OLD constraint: unique_time_slot');
            await sequelize.query(`
                ALTER TABLE appointments
                DROP CONSTRAINT unique_time_slot;
            `);
            console.log('✅ Old constraint dropped!\n');
        } else {
            console.log('ℹ️  Old constraint "unique_time_slot" does not exist\n');
        }

        // Verify final state
        console.log('🔍 Verifying final constraints...');
        const [finalConstraints] = await sequelize.query(`
            SELECT conname, pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = 'appointments'::regclass
            AND contype = 'u'
            ORDER BY conname;
        `);

        console.log('Final unique constraints:');
        finalConstraints.forEach(c => {
            console.log(`  - ${c.conname}: ${c.definition}`);
        });

        console.log('\n✅ Done! Multi-tenant booking should work now.');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

dropOldConstraint();
