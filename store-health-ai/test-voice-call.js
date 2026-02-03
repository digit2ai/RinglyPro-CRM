#!/usr/bin/env node
'use strict';

/**
 * Quick test script for ElevenLabs voice calling
 * Tests the new AI Store Manager agent configuration
 */

require('dotenv').config();
const { voiceCallManager } = require('./src/services');

// Your phone number to test with
const TEST_PHONE = '+16566001400'; // Update this to your number

async function testCall() {
  console.log('🧪 Testing ElevenLabs Voice Call Configuration\n');

  console.log('Configuration:');
  console.log(`  Agent ID: ${process.env.ELEVENLABS_AGENT_ID}`);
  console.log(`  Phone Number ID: ${process.env.ELEVENLABS_PHONE_NUMBER_ID}`);
  console.log(`  Calling: ${TEST_PHONE}\n`);

  try {
    console.log('📞 Initiating call...\n');

    const result = await voiceCallManager.testCall(
      TEST_PHONE,
      'Test call from Store Health AI - AI Store Manager'
    );

    console.log('\n✅ Call initiated successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.success) {
      console.log('\n📱 You should receive a call shortly from +1 (329) 999-5699');
      console.log('   The AI Store Manager will deliver a store health report\n');
    } else {
      console.log('\n❌ Call failed:', result.error);
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error('   Make sure:');
    console.error('   1. Your .env file has ELEVENLABS_API_KEY configured');
    console.error('   2. Your Twilio account has credit');
    console.error('   3. The phone number is in E.164 format (+1234567890)\n');
  }
}

// Run the test
testCall();
