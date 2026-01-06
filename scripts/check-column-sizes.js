#!/usr/bin/env node
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function check() {
    await sequelize.authenticate();

    const [columns] = await sequelize.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns
        WHERE table_name = 'appointments'
        ORDER BY ordinal_position
    `);

    console.log('Column sizes:');
    columns.forEach(c => {
        if (c.character_maximum_length) {
            console.log('  ', c.column_name, ':', c.data_type, '(' + c.character_maximum_length + ')');
        }
    });

    await sequelize.close();
}
check();
