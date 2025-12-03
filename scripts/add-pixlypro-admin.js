#!/usr/bin/env node
/**
 * Add pixlypro@digit2ai.com as Photo Studio Admin
 */

const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');

async function addPixlyproAdmin() {
    try {
        console.log('========================================');
        console.log('  Adding pixlypro@digit2ai.com as Admin');
        console.log('========================================\n');

        // Update the user to be admin
        await sequelize.query(
            `UPDATE users
             SET is_admin = true
             WHERE email = 'pixlypro@digit2ai.com'`,
            { type: QueryTypes.UPDATE }
        );

        console.log('✅ Successfully granted admin access to pixlypro@digit2ai.com\n');

        // Verify the update
        const [user] = await sequelize.query(
            `SELECT id, email, first_name, last_name, is_admin
             FROM users
             WHERE email = 'pixlypro@digit2ai.com'`,
            { type: QueryTypes.SELECT }
        );

        if (user) {
            console.log('User details:');
            console.log(`  ID: ${user.id}`);
            console.log(`  Email: ${user.email}`);
            console.log(`  Name: ${user.first_name || ''} ${user.last_name || ''}`);
            console.log(`  Is Admin: ${user.is_admin}`);
        } else {
            console.log('⚠️  User not found. They may need to register first.');
        }

        console.log('\n========================================\n');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

addPixlyproAdmin();
