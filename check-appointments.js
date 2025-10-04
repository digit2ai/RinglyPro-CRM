const sequelize = require('./src/config/database');
const Appointment = require('./src/models/Appointment');

async function checkAppointments() {
  try {
    await sequelize.authenticate();
    console.log('✓ Database connected\n');

    const appointments = await Appointment.findAll({
      order: [['created_at', 'DESC']],
      limit: 5
    });

    if (appointments.length === 0) {
      console.log('No appointments found in database.');
    } else {
      console.log(`Found ${appointments.length} recent appointment(s):\n`);
      appointments.forEach((apt, index) => {
        console.log(`Appointment #${index + 1}:`);
        console.log(`  ID: ${apt.id}`);
        console.log(`  Customer: ${apt.customerName}`);
        console.log(`  Phone: ${apt.customerPhone}`);
        console.log(`  Email: ${apt.customerEmail || 'N/A'}`);
        console.log(`  Date: ${apt.appointmentDate}`);
        console.log(`  Time: ${apt.appointmentTime}`);
        console.log(`  Duration: ${apt.duration} minutes`);
        console.log(`  Purpose: ${apt.purpose}`);
        console.log(`  Status: ${apt.status}`);
        console.log(`  Source: ${apt.source}`);
        console.log(`  Confirmation Code: ${apt.confirmationCode}`);
        console.log(`  Created: ${apt.created_at}`);
        console.log('');
      });
    }

    await sequelize.close();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

checkAppointments();