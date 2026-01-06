#!/usr/bin/env node
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } }
});

const CALENDARS = {
    'lqwsBWMJip0wx6NGLeaG': 'HYPERBARIC',
    'mV3NGEcqoXayzHtIEE97': 'CRYOTHERAPY',
    'yHDUtxQWt9GzaPcdUnxs': 'RECOVERY'
};

async function verify() {
    await sequelize.authenticate();

    const [appointments] = await sequelize.query(`
        SELECT appointment_date, appointment_time, ghl_calendar_id, customer_name, purpose
        FROM appointments
        WHERE client_id = 32
        ORDER BY appointment_date, appointment_time, ghl_calendar_id
    `);

    console.log('Client 32 appointments in database:', appointments.length);
    console.log('');

    // Group by date
    const byDate = {};
    appointments.forEach(a => {
        const date = String(a.appointment_date).split('T')[0].substring(0, 10);
        if (!byDate[date]) byDate[date] = [];
        byDate[date].push(a);
    });

    Object.keys(byDate).sort().forEach(date => {
        console.log('📅', date, '(' + byDate[date].length + ' appointments)');
        byDate[date].forEach(a => {
            const calName = CALENDARS[a.ghl_calendar_id] || 'OTHER';
            console.log('   ', a.appointment_time, '|', calName.padEnd(12), '|', (a.customer_name || '').substring(0, 25));
        });
        console.log('');
    });

    await sequelize.close();
}
verify();
