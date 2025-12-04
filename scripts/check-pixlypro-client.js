// Check PixlyPro client configuration
const { sequelize } = require('../src/models');
const { QueryTypes } = require('sequelize');

async function checkPixlyPro() {
  try {
    console.log('🔍 Searching for PixlyPro client...\n');

    const clients = await sequelize.query(
      `SELECT id, business_name, ringlypro_number, outbound_voicemail_message
       FROM clients
       WHERE business_name ILIKE '%Pixly%' OR business_name ILIKE '%PixlyPro%'`,
      { type: QueryTypes.SELECT }
    );

    if (clients.length > 0) {
      console.log(`Found ${clients.length} PixlyPro client(s):\n`);
      clients.forEach(client => {
        console.log(`Client ID: ${client.id}`);
        console.log(`Business Name: ${client.business_name}`);
        console.log(`Twilio Number: ${client.ringlypro_number}`);
        console.log(`Has Custom Message: ${!!client.outbound_voicemail_message}`);
        if (client.outbound_voicemail_message) {
          console.log(`Message Preview: ${client.outbound_voicemail_message.substring(0, 100)}...`);
        }
        console.log('---');
      });
    } else {
      console.log('❌ No PixlyPro client found in database');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkPixlyPro();
