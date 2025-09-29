// test-forwarding.js - Test script for conditional forwarding system
const axios = require('axios');

const BASE_URL = 'https://ringlypro-crm.onrender.com';

async function testForwardingSystem() {
    console.log('🧪 Testing RinglyPro Conditional Forwarding System\n');

    try {
        // 1. Test health check
        console.log('1️⃣ Testing health check...');
        const health = await axios.get(`${BASE_URL}/health`);
        console.log('✅ Health Status:', health.data.services.call_forwarding);
        console.log('📋 Available endpoints:', health.data.api_endpoints);

        // 2. Test carrier list
        console.log('\n2️⃣ Testing carrier list...');
        const carriers = await axios.get(`${BASE_URL}/api/call-forwarding/carriers`);
        console.log('✅ Supported carriers:', carriers.data.carriers.length);
        console.log('📱 Carriers:', carriers.data.carriers.map(c => c.name).join(', '));

        // 3. Test AT&T setup (most common)
        console.log('\n3️⃣ Testing AT&T forwarding setup...');
        
        // Note: This will require authentication in real testing
        // For now, we'll test the endpoint exists
        try {
            const attSetup = await axios.get(`${BASE_URL}/api/call-forwarding/setup/att`);
            console.log('✅ AT&T setup endpoint working');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ AT&T endpoint exists (requires authentication)');
            } else {
                console.log('❌ AT&T endpoint error:', error.message);
            }
        }

        // 4. Test Verizon setup
        console.log('\n4️⃣ Testing Verizon forwarding setup...');
        try {
            const verizonSetup = await axios.get(`${BASE_URL}/api/call-forwarding/setup/verizon`);
            console.log('✅ Verizon setup endpoint working');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Verizon endpoint exists (requires authentication)');
            } else {
                console.log('❌ Verizon endpoint error:', error.message);
            }
        }

        // 5. Test Rachel toggle endpoint
        console.log('\n5️⃣ Testing Rachel toggle endpoint...');
        try {
            const rachelStatus = await axios.get(`${BASE_URL}/api/client/rachel-status`);
            console.log('✅ Rachel status endpoint working');
        } catch (error) {
            if (error.response?.status === 401) {
                console.log('✅ Rachel toggle endpoint exists (requires authentication)');
            } else {
                console.log('❌ Rachel toggle error:', error.message);
            }
        }

        // 6. Test conditional forward webhook
        console.log('\n6️⃣ Testing conditional forward webhook...');
        try {
            const webhook = await axios.post(`${BASE_URL}/webhook/conditional-forward`, {
                From: '+16566001400',
                To: '+16566001400',
                CallSid: 'test-call-sid'
            });
            console.log('✅ Conditional forward webhook responding');
        } catch (error) {
            console.log('📋 Webhook response:', error.response?.status || error.message);
        }

        console.log('\n🎉 Conditional Forwarding System Test Complete!');
        console.log('\n📋 Next Steps:');
        console.log('1. Create user account and test authenticated endpoints');
        console.log('2. Test actual phone forwarding with carrier codes');
        console.log('3. Verify Rachel receives forwarded calls correctly');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

// Run the test
testForwardingSystem();