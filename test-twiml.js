// Inspect actual TwiML response
const axios = require('axios');

async function inspectTwiML() {
    const incomingCallData = {
        CallSid: 'TEST_CALL_' + Date.now(),
        From: '+11234567890',
        To: '+18886103810',
        CallStatus: 'ringing'
    };

    const response = await axios.post(
        'http://localhost:3000/voice/rachel/',
        new URLSearchParams(incomingCallData).toString(),
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
    );

    console.log('📄 Actual TwiML Response:');
    console.log('='.repeat(80));
    console.log(response.data);
    console.log('='.repeat(80));
}

inspectTwiML().catch(console.error);
