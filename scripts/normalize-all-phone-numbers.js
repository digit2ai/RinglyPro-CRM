#!/usr/bin/env node

/**
 * Normalize all phone numbers in the database
 *
 * This script updates phone numbers in:
 * - clients.ringlypro_number
 * - contacts.phone
 * - appointments.customer_phone
 * - calls.from_number and to_number
 *
 * Applies the same normalization logic used in voice booking
 */

const { Sequelize } = require('sequelize');
const { normalizePhoneFromSpeech, formatPhoneNumber } = require('../src/utils/phoneNormalizer');
require('dotenv').config();

const DATABASE_URL = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
}

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

async function normalizeAllPhoneNumbers() {
    try {
        console.log('🔌 Connecting to database...');
        await sequelize.authenticate();
        console.log('✅ Connected\n');

        let totalUpdated = 0;

        // 1. Normalize clients.ringlypro_number
        console.log('📱 Normalizing client phone numbers...');
        const [clients] = await sequelize.query(`
            SELECT id, ringlypro_number
            FROM clients
            WHERE ringlypro_number IS NOT NULL
            AND ringlypro_number != ''
        `);

        console.log(`Found ${clients.length} clients with phone numbers`);

        for (const client of clients) {
            const normalized = normalizePhoneFromSpeech(client.ringlypro_number);
            if (normalized !== client.ringlypro_number) {
                await sequelize.query(`
                    UPDATE clients
                    SET ringlypro_number = :normalized
                    WHERE id = :id
                `, {
                    replacements: { normalized, id: client.id }
                });
                console.log(`  ✓ Client ${client.id}: ${client.ringlypro_number} → ${normalized}`);
                totalUpdated++;
            }
        }
        console.log(`✅ Updated ${totalUpdated} client phone numbers\n`);

        // 2. Normalize contacts.phone
        totalUpdated = 0;
        console.log('📱 Normalizing contact phone numbers...');
        const [contacts] = await sequelize.query(`
            SELECT id, phone, client_id
            FROM contacts
            WHERE phone IS NOT NULL
            AND phone != ''
        `);

        console.log(`Found ${contacts.length} contacts with phone numbers`);

        for (const contact of contacts) {
            const normalized = normalizePhoneFromSpeech(contact.phone);
            if (normalized !== contact.phone) {
                await sequelize.query(`
                    UPDATE contacts
                    SET phone = :normalized
                    WHERE id = :id
                `, {
                    replacements: { normalized, id: contact.id }
                });
                console.log(`  ✓ Contact ${contact.id} (client ${contact.client_id}): ${contact.phone} → ${normalized}`);
                totalUpdated++;
            }
        }
        console.log(`✅ Updated ${totalUpdated} contact phone numbers\n`);

        // 3. Normalize appointments.customer_phone
        totalUpdated = 0;
        console.log('📱 Normalizing appointment phone numbers...');
        const [appointments] = await sequelize.query(`
            SELECT id, customer_phone, client_id
            FROM appointments
            WHERE customer_phone IS NOT NULL
            AND customer_phone != ''
        `);

        console.log(`Found ${appointments.length} appointments with phone numbers`);

        for (const apt of appointments) {
            const normalized = normalizePhoneFromSpeech(apt.customer_phone);
            if (normalized !== apt.customer_phone) {
                await sequelize.query(`
                    UPDATE appointments
                    SET customer_phone = :normalized
                    WHERE id = :id
                `, {
                    replacements: { normalized, id: apt.id }
                });
                console.log(`  ✓ Appointment ${apt.id} (client ${apt.client_id}): ${apt.customer_phone} → ${normalized}`);
                totalUpdated++;
            }
        }
        console.log(`✅ Updated ${totalUpdated} appointment phone numbers\n`);

        // 4. Normalize calls.from_number and to_number
        totalUpdated = 0;
        console.log('📱 Normalizing call phone numbers...');
        const [calls] = await sequelize.query(`
            SELECT id, from_number, to_number, client_id
            FROM calls
            WHERE (from_number IS NOT NULL AND from_number != '')
            OR (to_number IS NOT NULL AND to_number != '')
        `);

        console.log(`Found ${calls.length} calls with phone numbers`);

        for (const call of calls) {
            let updated = false;
            const normalizedFrom = normalizePhoneFromSpeech(call.from_number || '');
            const normalizedTo = normalizePhoneFromSpeech(call.to_number || '');

            if (normalizedFrom !== call.from_number || normalizedTo !== call.to_number) {
                await sequelize.query(`
                    UPDATE calls
                    SET from_number = :normalizedFrom,
                        to_number = :normalizedTo
                    WHERE id = :id
                `, {
                    replacements: {
                        normalizedFrom: normalizedFrom || call.from_number,
                        normalizedTo: normalizedTo || call.to_number,
                        id: call.id
                    }
                });
                console.log(`  ✓ Call ${call.id}: ${call.from_number} → ${normalizedFrom}, ${call.to_number} → ${normalizedTo}`);
                totalUpdated++;
            }
        }
        console.log(`✅ Updated ${totalUpdated} call records\n`);

        console.log('🎉 Phone number normalization complete!');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    } finally {
        await sequelize.close();
    }
}

normalizeAllPhoneNumbers();
