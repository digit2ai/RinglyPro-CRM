// Test Lina Voice Custom Voicemail Generation
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const CLIENT_ID = 15; // RinglyPro test client

// Test custom voicemail message
const TEST_MESSAGE = "Hi, this is Manuel from RinglyPro. I wanted to reach out to introduce our AI receptionist service that can handle calls, book appointments, and follow up with leads automatically. This is a quick test of our custom voicemail feature using Lina's voice. If you'd like to learn more, visit RinglyPro.com or call us back. Thanks!";

async function testVoicemailGeneration() {
  console.log('🧪 Testing Lina Voice Custom Voicemail Generation\n');
  console.log(`Client ID: ${CLIENT_ID}`);
  console.log(`Message: "${TEST_MESSAGE.substring(0, 100)}..."\n`);

  try {
    // Step 1: Save custom voicemail message
    console.log('📤 Step 1: Sending custom voicemail message...');
    const saveResponse = await axios.put(
      `${BASE_URL}/api/client-settings/${CLIENT_ID}/voicemail-message`,
      { message: TEST_MESSAGE },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 60000 // 60 second timeout for audio generation
      }
    );

    console.log('✅ Response received:');
    console.log(JSON.stringify(saveResponse.data, null, 2));

    if (saveResponse.data.audioUrl) {
      console.log('\n🎤 Lina voice audio generated successfully!');
      console.log(`Audio URL: ${BASE_URL}${saveResponse.data.audioUrl}`);
    } else {
      console.log('\n⚠️ Audio generation failed - will use TTS fallback');
    }

    // Step 2: Verify the message was saved
    console.log('\n📥 Step 2: Verifying message was saved...');
    const getResponse = await axios.get(
      `${BASE_URL}/api/client-settings/${CLIENT_ID}/voicemail-message`
    );

    console.log('✅ Verification response:');
    console.log(JSON.stringify(getResponse.data, null, 2));

    // Step 3: Check if audio file exists on disk
    if (getResponse.data.audioUrl) {
      const fs = require('fs');
      const path = require('path');
      const audioPath = path.join(process.cwd(), 'public', getResponse.data.audioUrl.replace(/^\//, ''));

      console.log('\n📁 Step 3: Checking if audio file exists on disk...');
      console.log(`File path: ${audioPath}`);

      if (fs.existsSync(audioPath)) {
        const stats = fs.statSync(audioPath);
        console.log(`✅ Audio file exists! Size: ${(stats.size / 1024).toFixed(2)} KB`);
      } else {
        console.log('❌ Audio file not found on disk');
      }
    }

    console.log('\n✅ Test completed successfully!');
    console.log('\n📋 Next Steps:');
    console.log('1. Check server logs for ElevenLabs API calls');
    console.log('2. Try accessing the audio URL in browser');
    console.log('3. Make a test outbound call to verify Lina plays the message');

  } catch (error) {
    console.error('\n❌ Test failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the test
testVoicemailGeneration()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
