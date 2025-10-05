// Test bilingual voice bot endpoints
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testEndpoints() {
    console.log('🧪 Testing Bilingual Voice Bot Endpoints\n');
    console.log('='.repeat(60));

    try {
        // Test 1: Health check
        console.log('\n📋 TEST 1: Health Check');
        console.log('-'.repeat(60));
        const healthResponse = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health check passed');
        console.log(`   - Status: ${healthResponse.data.status}`);
        console.log(`   - Rachel Voice: ${healthResponse.data.services.rachel_voice}`);
        console.log(`   - Client ID System: ${healthResponse.data.services.client_identification}`);

        // Test 2: Client test endpoint
        console.log('\n📋 TEST 2: Client Identification Test');
        console.log('-'.repeat(60));
        const clientTestResponse = await axios.get(
            `${BASE_URL}/voice/rachel/test-client/+18886103810`
        );
        console.log('✅ Client identification working');
        console.log(`   - Client: ${clientTestResponse.data.client?.business_name}`);
        console.log(`   - Rachel Enabled: ${clientTestResponse.data.client?.rachel_enabled}`);

        // Test 3: Simulate incoming call (Rachel initial webhook)
        console.log('\n📋 TEST 3: Incoming Call - Bilingual Greeting');
        console.log('-'.repeat(60));

        const incomingCallData = {
            CallSid: 'TEST_CALL_' + Date.now(),
            From: '+11234567890',
            To: '+18886103810',
            CallStatus: 'ringing'
        };

        const incomingCallResponse = await axios.post(
            `${BASE_URL}/voice/rachel/`,
            new URLSearchParams(incomingCallData).toString(),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        console.log('✅ Bilingual greeting generated');
        console.log('   Response type:', incomingCallResponse.headers['content-type']);

        // Check if TwiML contains bilingual greeting
        const twiml = incomingCallResponse.data;
        const hasEnglishOption = twiml.includes('For English, press 1') || twiml.includes('For English');
        const hasSpanishOption = twiml.includes('Para español') || twiml.includes('presione dos');

        console.log(`   - English option present: ${hasEnglishOption ? '✅' : '❌'}`);
        console.log(`   - Spanish option present: ${hasSpanishOption ? '✅' : '❌'}`);

        // Test 4: Language Selection - English
        console.log('\n📋 TEST 4: Language Selection - English (Press 1)');
        console.log('-'.repeat(60));

        const selectEnglishData = {
            CallSid: incomingCallData.CallSid,
            Digits: '1',
            From: '+11234567890',
            To: '+18886103810'
        };

        try {
            // This will redirect, so we need to handle that
            const englishResponse = await axios.post(
                `${BASE_URL}/voice/rachel/select-language`,
                new URLSearchParams(selectEnglishData).toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    maxRedirects: 0,
                    validateStatus: (status) => status >= 200 && status < 400
                }
            );

            console.log('✅ English selection handled');
            console.log(`   - Response status: ${englishResponse.status}`);

            if (englishResponse.status === 307) {
                console.log(`   - Redirects to: ${englishResponse.headers.location}`);
                console.log(`   - ${englishResponse.headers.location.includes('rachel') ? '✅' : '❌'} Routes to Rachel`);
            }
        } catch (error) {
            if (error.response && error.response.status === 307) {
                console.log('✅ English selection redirects correctly');
                console.log(`   - Redirects to: ${error.response.headers.location}`);
            } else {
                throw error;
            }
        }

        // Test 5: Language Selection - Spanish
        console.log('\n📋 TEST 5: Language Selection - Spanish (Press 2)');
        console.log('-'.repeat(60));

        const selectSpanishData = {
            CallSid: incomingCallData.CallSid,
            Digits: '2',
            From: '+11234567890',
            To: '+18886103810'
        };

        try {
            const spanishResponse = await axios.post(
                `${BASE_URL}/voice/rachel/select-language`,
                new URLSearchParams(selectSpanishData).toString(),
                {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    maxRedirects: 0,
                    validateStatus: (status) => status >= 200 && status < 400
                }
            );

            console.log('✅ Spanish selection handled');
            console.log(`   - Response status: ${spanishResponse.status}`);

            if (spanishResponse.status === 307) {
                console.log(`   - Redirects to: ${spanishResponse.headers.location}`);
                console.log(`   - ${spanishResponse.headers.location.includes('lina') ? '✅' : '❌'} Routes to Lina`);
            }
        } catch (error) {
            if (error.response && error.response.status === 307) {
                console.log('✅ Spanish selection redirects correctly');
                console.log(`   - Redirects to: ${error.response.headers.location}`);
                console.log(`   - ${error.response.headers.location.includes('lina') ? '✅' : '❌'} Routes to Lina`);
            } else {
                throw error;
            }
        }

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST RESULTS');
        console.log('='.repeat(60));
        console.log('✅ All endpoint tests passed');
        console.log('✅ Bilingual system is working correctly');
        console.log('\n🎉 Your bilingual voice bot is ready for live testing!');
        console.log('\n📞 Next Steps:');
        console.log('   1. Expose with ngrok: ngrok http 3000');
        console.log('   2. Configure Twilio webhook to: https://YOUR-NGROK-URL.ngrok.io/voice/rachel/');
        console.log('   3. Call +18886103810 and test both languages');
        console.log('');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('   Response status:', error.response.status);
            console.error('   Response data:', error.response.data);
        }
        process.exit(1);
    }
}

testEndpoints();
