#!/usr/bin/env node

/**
 * Fix appointment unique constraint
 *
 * Problem: The database has constraint "unique_time_slot" without client_id
 * This prevents different clients from booking the same time slot (multi-tenant bug)
 *
 * Solution: Drop old constraint, add new one with client_id
 */

const { Sequelize } = require('sequelize');
require('dotenv').config();

const DATABASE_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
}

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

async function fixConstraint() {
    try {
        console.log('🔌 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Database connection established\n');

        // Step 1: Check existing constraints
        console.log('📋 Checking existing constraints...');
        const [constraints] = await sequelize.query(`
            SELECT conname, pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = 'appointments'::regclass
            AND contype = 'u'
            ORDER BY conname;
        `);

        console.log('Current unique constraints on appointments table:');
        constraints.forEach(c => {
            console.log(`  - ${c.conname}: ${c.definition}`);
        });
        console.log('');

        // Step 2: Drop old constraint if it exists
        const hasOldConstraint = constraints.some(c => c.conname === 'unique_time_slot');

        if (hasOldConstraint) {
            console.log('🗑️  Dropping old constraint: unique_time_slot (without client_id)...');
            await sequelize.query(`
                ALTER TABLE appointments
                DROP CONSTRAINT IF EXISTS unique_time_slot;
            `);
            console.log('✅ Old constraint dropped\n');
        } else {
            console.log('ℹ️  Old constraint "unique_time_slot" does not exist (already fixed)\n');
        }

        // Step 3: Add new constraint if it doesn't exist
        const hasNewConstraint = constraints.some(c => c.conname === 'unique_time_slot_per_client');

        if (!hasNewConstraint) {
            console.log('➕ Adding new constraint: unique_time_slot_per_client (with client_id)...');
            await sequelize.query(`
                ALTER TABLE appointments
                ADD CONSTRAINT unique_time_slot_per_client
                UNIQUE (client_id, appointment_date, appointment_time);
            `);
            console.log('✅ New constraint added\n');
        } else {
            console.log('ℹ️  New constraint "unique_time_slot_per_client" already exists\n');
        }

        // Step 4: Verify final state
        console.log('🔍 Verifying final constraints...');
        const [finalConstraints] = await sequelize.query(`
            SELECT conname, pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = 'appointments'::regclass
            AND contype = 'u'
            ORDER BY conname;
        `);

        console.log('Final unique constraints on appointments table:');
        finalConstraints.forEach(c => {
            console.log(`  - ${c.conname}: ${c.definition}`);
        });

        console.log('\n✅ Constraint migration complete!');
        console.log('💡 Clients can now book the same time slots without conflicts');

    } catch (error) {
        console.error('❌ Error fixing constraint:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

fixConstraint();
