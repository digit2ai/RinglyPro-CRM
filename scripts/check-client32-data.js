#!/usr/bin/env node
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

async function checkData() {
    await sequelize.authenticate();

    const [appointments] = await sequelize.query(
        'SELECT appointment_date, appointment_time, ghl_calendar_id, customer_name, purpose FROM appointments WHERE client_id = 32 ORDER BY appointment_date, appointment_time'
    );

    console.log('Current appointments for Client 32:', appointments.length);

    // Show by calendar
    const byCal = {};
    appointments.forEach(a => {
        const cal = a.ghl_calendar_id || 'none';
        if (!byCal[cal]) byCal[cal] = 0;
        byCal[cal]++;
    });

    console.log('\nBy calendar ID:');
    Object.keys(byCal).forEach(cal => console.log('  ', cal, ':', byCal[cal]));

    // Sample
    console.log('\nSample appointments:');
    appointments.slice(0, 10).forEach(a => {
        const date = a.appointment_date ? a.appointment_date.toISOString().split('T')[0] : 'null';
        console.log('  ', date, a.appointment_time, '|', (a.ghl_calendar_id || 'null').substring(0, 12), '|', (a.purpose || '').substring(0, 30));
    });

    await sequelize.close();
}
checkData();
