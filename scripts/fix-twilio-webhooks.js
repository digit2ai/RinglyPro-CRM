// Script to update Twilio webhook URLs for existing numbers
const { Client } = require('pg');
const twilio = require('twilio');
require('dotenv').config();

async function fixTwilioWebhooks() {
    const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

    // Initialize Twilio client
    const twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
    );

    const dbClient = new Client({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });

    try {
        await dbClient.connect();
        console.log('✅ Connected to database\n');

        // Get all clients with Twilio SIDs
        const result = await dbClient.query(`
            SELECT id, business_name, ringlypro_number, twilio_number_sid
            FROM clients
            WHERE twilio_number_sid IS NOT NULL
            ORDER BY id
        `);

        console.log(`📊 Found ${result.rows.length} clients with Twilio numbers\n`);
        console.log('='.repeat(100));

        const correctVoiceUrl = `${webhookBaseUrl}/voice/rachel/`;
        const correctStatusUrl = `${webhookBaseUrl}/voice/webhook/call-status`;
        const correctSmsUrl = `${webhookBaseUrl}/api/messages/incoming`;

        console.log('\n📝 Correct webhook URLs:');
        console.log(`   Voice:  ${correctVoiceUrl}`);
        console.log(`   Status: ${correctStatusUrl}`);
        console.log(`   SMS:    ${correctSmsUrl}\n`);
        console.log('='.repeat(100));

        for (const row of result.rows) {
            console.log(`\n${row.id}. ${row.business_name}`);
            console.log(`   Number: ${row.ringlypro_number}`);
            console.log(`   SID: ${row.twilio_number_sid}`);

            try {
                // Get current configuration
                const number = await twilioClient.incomingPhoneNumbers(row.twilio_number_sid).fetch();

                console.log(`\n   Current configuration:`);
                console.log(`   Voice URL: ${number.voiceUrl || 'NOT SET'}`);
                console.log(`   Status URL: ${number.statusCallback || 'NOT SET'}`);
                console.log(`   SMS URL: ${number.smsUrl || 'NOT SET'}`);

                // Check if update needed
                const needsUpdate =
                    number.voiceUrl !== correctVoiceUrl ||
                    number.statusCallback !== correctStatusUrl ||
                    number.smsUrl !== correctSmsUrl;

                if (needsUpdate) {
                    console.log(`\n   🔧 Updating webhooks...`);

                    await twilioClient.incomingPhoneNumbers(row.twilio_number_sid).update({
                        voiceUrl: correctVoiceUrl,
                        voiceMethod: 'POST',
                        statusCallback: correctStatusUrl,
                        statusCallbackMethod: 'POST',
                        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                        smsUrl: correctSmsUrl,
                        smsMethod: 'POST'
                    });

                    console.log(`   ✅ Updated successfully!`);
                } else {
                    console.log(`\n   ✅ Webhooks already correct - no update needed`);
                }

            } catch (twilioError) {
                console.error(`   ❌ Twilio API error: ${twilioError.message}`);
            }
        }

        console.log('\n' + '='.repeat(100));
        console.log('\n✅ Webhook update complete!\n');

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.error(error);
    } finally {
        await dbClient.end();
    }
}

fixTwilioWebhooks();
