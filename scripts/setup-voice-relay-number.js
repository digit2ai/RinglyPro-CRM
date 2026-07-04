'use strict';
/**
 * Point a TEST Twilio number at the ConversationRelay POC.
 *
 * Usage:
 *   node scripts/setup-voice-relay-number.js                 # list your Twilio numbers
 *   node scripts/setup-voice-relay-number.js +15551234567    # wire that number's Voice webhook
 *   node scripts/setup-voice-relay-number.js +15551234567 --revert=https://old.url  # restore
 *
 * Safe by design: with no arg it only LISTS. It never touches a number you didn't name.
 */

require('dotenv').config();
const twilio = require('twilio');

const BASE = (process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com').replace(/\/$/, '');
const RELAY_URL = `${BASE}/voice/relay/incoming`;

(async () => {
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const arg = process.argv[2];
  const revert = (process.argv.find(a => a.startsWith('--revert=')) || '').split('=')[1];

  if (!arg) {
    const nums = await client.incomingPhoneNumbers.list({ limit: 50 });
    console.log(`\nYour Twilio numbers (relay target = ${RELAY_URL}):\n`);
    nums.forEach(n => {
      const wired = n.voiceUrl === RELAY_URL ? '  <-- WIRED TO RELAY' : '';
      console.log(`  ${n.phoneNumber}  (${n.friendlyName})  voiceUrl=${n.voiceUrl || '(none)'}${wired}`);
    });
    console.log(`\nTo wire one:  node scripts/setup-voice-relay-number.js <+E164number>\n`);
    return;
  }

  const matches = await client.incomingPhoneNumbers.list({ phoneNumber: arg, limit: 1 });
  if (!matches.length) { console.error(`Number ${arg} not found on this Twilio account.`); process.exit(1); }
  const pn = matches[0];

  const targetUrl = revert || RELAY_URL;
  const updated = await client.incomingPhoneNumbers(pn.sid).update({ voiceUrl: targetUrl, voiceMethod: 'POST' });
  console.log(`\n${revert ? 'Reverted' : 'Wired'} ${updated.phoneNumber}`);
  console.log(`  voiceUrl = ${updated.voiceUrl}`);
  console.log(`  voiceMethod = ${updated.voiceMethod}`);
  console.log(`\nCall ${updated.phoneNumber} and ask to book an appointment.\n`);
})().catch(err => { console.error('Error:', err.message); process.exit(1); });
