require('dotenv').config();
const TwilioNumberProvisioning = require('./src/services/twilioNumberProvisioning');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://ringlypro_admin:g0KoTof0UPhqdKHKXVnOeF1uspIG8Rbu@dpg-d2job763jp1c73fc8kt0-a.virginia-postgres.render.com/ringlypro_crm_production?sslmode=require';

// Verify Twilio credentials are loaded
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
    console.error('❌ Missing Twilio credentials!');
    console.error('Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in .env file');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

// Initialize Twilio service
const twilioProvisioning = new TwilioNumberProvisioning(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
    process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com'
);

async function fixAllWebhooks() {
    try {
        console.log('🔧 Fixing webhooks for all numbers...\n');

        // Get all Twilio numbers
        const twilioNumbers = await twilioProvisioning.listAllNumbers();
        console.log(`Found ${twilioNumbers.length} numbers in Twilio account\n`);

        // Get all clients from database
        const clientsResult = await pool.query(
            'SELECT id, business_name, ringlypro_number, twilio_number_sid FROM clients WHERE ringlypro_number IS NOT NULL'
        );

        console.log(`Found ${clientsResult.rows.length} clients in database\n`);

        for (const client of clientsResult.rows) {
            console.log(`\n📞 Processing: ${client.business_name} (${client.ringlypro_number})`);

            // Find matching Twilio number
            const twilioNumber = twilioNumbers.find(n => n.phoneNumber === client.ringlypro_number);

            if (!twilioNumber) {
                console.log(`   ⚠️ Number not found in Twilio account, searching...`);

                // Search for the number manually
                const allNumbers = await twilioProvisioning.client.incomingPhoneNumbers.list({
                    phoneNumber: client.ringlypro_number
                });

                if (allNumbers.length > 0) {
                    const sid = allNumbers[0].sid;
                    console.log(`   ✅ Found number, SID: ${sid}`);

                    // Update database with SID
                    await pool.query(
                        'UPDATE clients SET twilio_number_sid = $1 WHERE id = $2',
                        [sid, client.id]
                    );

                    // Update webhooks
                    console.log(`   🔧 Updating webhooks...`);
                    await twilioProvisioning.updateWebhooks(sid);
                    console.log(`   ✅ Webhooks updated!`);
                } else {
                    console.log(`   ❌ Number not found in Twilio account - may need to be purchased`);
                }
            } else {
                console.log(`   ✅ Found in Twilio, SID: ${twilioNumber.sid}`);

                // Check if SID is in database
                if (!client.twilio_number_sid || client.twilio_number_sid !== twilioNumber.sid) {
                    console.log(`   🔄 Updating database with SID...`);
                    await pool.query(
                        'UPDATE clients SET twilio_number_sid = $1 WHERE id = $2',
                        [twilioNumber.sid, client.id]
                    );
                    console.log(`   ✅ Database updated`);
                }

                // Check current webhook
                console.log(`   Current webhook: ${twilioNumber.voiceUrl}`);

                if (twilioNumber.voiceUrl !== 'https://aiagent.ringlypro.com/voice/rachel/') {
                    console.log(`   🔧 Updating webhooks...`);
                    await twilioProvisioning.updateWebhooks(twilioNumber.sid);
                    console.log(`   ✅ Webhooks updated!`);
                } else {
                    console.log(`   ✅ Webhooks already correct`);
                }
            }
        }

        console.log('\n\n🎉 All webhooks fixed!\n');
        console.log('Summary:');
        console.log(`  Total clients: ${clientsResult.rows.length}`);
        console.log(`  Total Twilio numbers: ${twilioNumbers.length}`);
        console.log('\nAll numbers now point to: https://aiagent.ringlypro.com/voice/rachel/\n');

    } catch (error) {
        console.error('❌ Error:', error);
    } finally {
        await pool.end();
    }
}

fixAllWebhooks();
