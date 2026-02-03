#!/usr/bin/env node
'use strict';

/**
 * Direct Twilio call with Lina's message
 * Uses traditional Twilio TTS to deliver the Store Health report
 */

const twilio = require('twilio');

require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_PHONE_NUMBER;
const to = process.env.TEST_PHONE || '+1234567890'; // Set TEST_PHONE in .env

const client = twilio(accountSid, authToken);

const message = `Hello! This is Lina, your Store Health AI assistant calling with an urgent update. We are monitoring 10 stores with an average health score of 77 point 1 out of 100. Six stores need immediate attention. Four stores have critically low health scores below 60. The most critical are Manhattan 42nd Street with 47, Brooklyn Heights with 54, Staten Island with 47, and Lower East Side with 47. Please review these stores with your district managers and activate Escalation Level 3 protocols. Check your dashboard for details. Thank you!`;

console.log(`📞 Calling ${to} from ${from}...`);

client.calls
  .create({
    twiml: `<Response><Say voice="Polly.Joanna">${message}</Say></Response>`,
    to: to,
    from: from
  })
  .then(call => {
    console.log(`✅ Call initiated: ${call.sid}`);
    console.log(`Status: ${call.status}`);
    process.exit(0);
  })
  .catch(error => {
    console.error(`❌ Call failed: ${error.message}`);
    process.exit(1);
  });
