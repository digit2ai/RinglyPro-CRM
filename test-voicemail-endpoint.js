// test-voicemail-endpoint.js
// Quick test to verify voicemail endpoint works

const axios = require('axios');

async function testVoicemailEndpoint() {
    console.log('🧪 Testing Voicemail Endpoint...\n');

    // Test 1: Check if messages API works
    try {
        const clientId = 1; // Change this to your actual client ID
        const url = `http://localhost:3000/api/messages/client/${clientId}`;

        console.log(`📡 Fetching: ${url}`);
        const response = await axios.get(url);

        console.log(`✅ Status: ${response.status}`);
        console.log(`📊 Found ${response.data.length} messages`);

        if (response.data.length > 0) {
            console.log('\n📝 Latest message:');
            const msg = response.data[0];
            console.log(`   From: ${msg.fromNumber || msg.from_number}`);
            console.log(`   Body: ${msg.body.substring(0, 100)}...`);
            console.log(`   Created: ${msg.createdAt || msg.created_at}`);
        } else {
            console.log('\n⚠️  No messages found.');
            console.log('   Possible reasons:');
            console.log('   1. Voicemail transcription not yet complete (wait 5-10 min)');
            console.log('   2. Wrong client ID');
            console.log('   3. Voicemail webhook not configured');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', error.response.data);
        }
    }

    // Test 2: Check database connection
    console.log('\n🔍 Checking database...');
    try {
        const { Message } = require('./src/models');
        const count = await Message.count();
        console.log(`✅ Total messages in database: ${count}`);

        const recent = await Message.findAll({
            limit: 3,
            order: [['createdAt', 'DESC']]
        });

        console.log(`\n📋 Recent messages:`);
        recent.forEach((msg, i) => {
            console.log(`   ${i+1}. Client ${msg.clientId}: ${msg.body.substring(0, 50)}...`);
        });

    } catch (dbError) {
        console.error('❌ Database error:', dbError.message);
    }
}

// Run test
if (require.main === module) {
    testVoicemailEndpoint()
        .then(() => {
            console.log('\n✅ Test complete!');
            process.exit(0);
        })
        .catch(err => {
            console.error('\n❌ Test failed:', err);
            process.exit(1);
        });
}

module.exports = testVoicemailEndpoint;
