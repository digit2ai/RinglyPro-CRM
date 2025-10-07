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

async function checkAllConstraints() {
    try {
        await sequelize.authenticate();

        console.log('📋 ALL CONSTRAINTS on appointments table:\n');

        const [allConstraints] = await sequelize.query(`
            SELECT
                conname as name,
                contype as type,
                pg_get_constraintdef(oid) as definition
            FROM pg_constraint
            WHERE conrelid = 'appointments'::regclass
            ORDER BY contype, conname;
        `);

        allConstraints.forEach(c => {
            const typeMap = {
                'p': 'PRIMARY KEY',
                'u': 'UNIQUE',
                'f': 'FOREIGN KEY',
                'c': 'CHECK'
            };
            console.log(`${typeMap[c.type] || c.type}: ${c.name}`);
            console.log(`  ${c.definition}\n`);
        });

        console.log('📋 ALL INDEXES on appointments table:\n');

        const [indexes] = await sequelize.query(`
            SELECT
                i.relname as index_name,
                ix.indisunique as is_unique,
                array_agg(a.attname ORDER BY a.attnum) as columns
            FROM pg_class t
            JOIN pg_index ix ON t.oid = ix.indrelid
            JOIN pg_class i ON i.oid = ix.indexrelid
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
            WHERE t.relname = 'appointments'
            GROUP BY i.relname, ix.indisunique
            ORDER BY i.relname;
        `);

        indexes.forEach(idx => {
            const uniqueFlag = idx.is_unique ? 'UNIQUE' : 'NON-UNIQUE';
            const columns = Array.isArray(idx.columns) ? idx.columns.join(', ') : String(idx.columns);
            console.log(`${uniqueFlag}: ${idx.index_name}`);
            console.log(`  Columns: ${columns}\n`);
        });

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkAllConstraints();
