// Configure existing Twilio number for testing Rachel AI
require('dotenv').config();
const twilio = require('twilio');

// Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const PHONE_NUMBER = '+18132120813';        // (813) 212-0813
const WEBHOOK_BASE_URL = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.error('❌ Missing Twilio credentials in .env file');
    console.error('Required: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
    process.exit(1);
}

const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

async function configureTestNumber() {
    try {
        console.log('🔍 Finding Twilio number:', PHONE_NUMBER);

        // Find the phone number SID
        const numbers = await client.incomingPhoneNumbers.list({
            phoneNumber: PHONE_NUMBER
        });

        if (numbers.length === 0) {
            console.error('❌ Phone number not found in your Twilio account:', PHONE_NUMBER);
            return;
        }

        const numberSid = numbers[0].sid;
        console.log('✅ Found number SID:', numberSid);

        // Update webhooks
        console.log('🔧 Configuring webhooks...');

        const updatedNumber = await client.incomingPhoneNumbers(numberSid)
            .update({
                voiceUrl: `${WEBHOOK_BASE_URL}/voice/rachel/`,
                voiceMethod: 'POST',
                statusCallback: `${WEBHOOK_BASE_URL}/voice/webhook/call-status`,
                statusCallbackMethod: 'POST',
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
                smsUrl: `${WEBHOOK_BASE_URL}/api/messages/incoming`,
                smsMethod: 'POST',
                friendlyName: 'RinglyPro Test - Digit2AI'
            });

        console.log('\n✅ Twilio number configured successfully!\n');
        console.log('📞 Phone Number:', updatedNumber.phoneNumber);
        console.log('🎤 Voice Webhook:', updatedNumber.voiceUrl);
        console.log('📊 Status Callback:', updatedNumber.statusCallback);
        console.log('💬 SMS Webhook:', updatedNumber.smsUrl);
        console.log('\n🎉 You can now call', PHONE_NUMBER, 'to test Rachel AI!');

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.status === 401) {
            console.error('Authentication failed. Please check your Twilio credentials.');
        }
    }
}

configureTestNumber();
