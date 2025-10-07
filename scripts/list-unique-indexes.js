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

async function listUniqueIndexes() {
    try {
        await sequelize.authenticate();

        console.log('🔍 Listing ALL unique indexes on appointments table:\n');

        const [result] = await sequelize.query(`
            SELECT
                indexname,
                indexdef
            FROM pg_indexes
            WHERE tablename = 'appointments'
            AND indexdef LIKE '%UNIQUE%'
            ORDER BY indexname;
        `);

        if (result.length === 0) {
            console.log('No unique indexes found.\n');
        } else {
            result.forEach(idx => {
                console.log(`Index: ${idx.indexname}`);
                console.log(`Definition: ${idx.indexdef}\n`);
            });
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await sequelize.close();
    }
}

listUniqueIndexes();
