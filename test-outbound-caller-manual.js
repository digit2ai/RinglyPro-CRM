// Manual Outbound Caller Test Script
// Run this locally to test calling without waiting for Render deployment

require('dotenv').config();
const twilio = require('twilio');
const fs = require('fs');
const csv = require('csv-parser');

// Configuration
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER || '+12396103810';
const AGENT_PHONE_NUMBER = process.env.AGENT_PHONE_NUMBER || '+12396103810';
const BASE_URL = process.env.BASE_URL || 'https://ringlypro-crm.onrender.com';

// CSV file path (update this to your file)
const CSV_FILE = '/Users/manuelstagg/Desktop/plumbers-tampa-60-leads.csv';

// Initialize Twilio
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

console.log('🚀 RinglyPro Outbound Caller - Manual Test');
console.log('==========================================');
console.log(`📞 From: ${TWILIO_PHONE_NUMBER}`);
console.log(`🎯 Forward to: ${AGENT_PHONE_NUMBER}`);
console.log(`📄 CSV: ${CSV_FILE}`);
console.log('');

// Read CSV and parse leads
async function loadLeads() {
  return new Promise((resolve, reject) => {
    const leads = [];
    fs.createReadStream(CSV_FILE)
      .pipe(csv())
      .on('data', (row) => {
        leads.push({
          name: row.Name,
          phone: row.phone,
          website: row.Website
        });
      })
      .on('end', () => {
        console.log(`✅ Loaded ${leads.length} leads from CSV`);
        resolve(leads);
      })
      .on('error', reject);
  });
}

// Make a single test call
async function makeTestCall(lead) {
  try {
    console.log(`\n📞 Calling: ${lead.name}`);
    console.log(`   Phone: ${lead.phone}`);
    console.log(`   Website: ${lead.website}`);

    const call = await client.calls.create({
      to: `+${lead.phone}`,
      from: TWILIO_PHONE_NUMBER,
      url: `${BASE_URL}/api/outbound-caller/voice`,
      statusCallback: `${BASE_URL}/api/outbound-caller/call-status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      machineDetection: 'DetectMessageEnd',
      machineDetectionTimeout: 5000,
      record: false
    });

    console.log(`✅ Call initiated: ${call.sid}`);
    console.log(`   Status: ${call.status}`);
    console.log(`   Direction: ${call.direction}`);
    console.log(`   View in Twilio: https://console.twilio.com/us1/monitor/logs/calls/${call.sid}`);

    return call;
  } catch (error) {
    console.error(`❌ Error calling ${lead.name}:`, error.message);
    return null;
  }
}

// Main test function
async function runTest() {
  try {
    // Load leads
    const leads = await loadLeads();

    if (leads.length === 0) {
      console.error('❌ No leads found in CSV');
      return;
    }

    // Ask user how many to call
    console.log('\n🎯 Test Options:');
    console.log('1. Call first lead only (safe test)');
    console.log('2. Call first 3 leads');
    console.log('3. Call first 5 leads');
    console.log('4. Call ALL leads (use with caution!)');
    console.log('');

    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('Choose option (1-4): ', async (answer) => {
      rl.close();

      let leadsToCall = [];
      switch(answer) {
        case '1':
          leadsToCall = leads.slice(0, 1);
          break;
        case '2':
          leadsToCall = leads.slice(0, 3);
          break;
        case '3':
          leadsToCall = leads.slice(0, 5);
          break;
        case '4':
          leadsToCall = leads;
          break;
        default:
          console.log('❌ Invalid option');
          return;
      }

      console.log(`\n🚀 Starting calls to ${leadsToCall.length} leads...`);
      console.log('⏱️  2-minute interval between calls\n');

      for (let i = 0; i < leadsToCall.length; i++) {
        const lead = leadsToCall[i];

        console.log(`\n[${i + 1}/${leadsToCall.length}] Processing: ${lead.name}`);

        await makeTestCall(lead);

        // Wait 2 minutes before next call (except for last one)
        if (i < leadsToCall.length - 1) {
          console.log(`\n⏳ Waiting 2 minutes before next call...`);
          await new Promise(resolve => setTimeout(resolve, 120000)); // 2 minutes
        }
      }

      console.log('\n✅ All calls completed!');
      console.log(`📊 Total calls made: ${leadsToCall.length}`);
      console.log(`\n📞 View all calls: https://console.twilio.com/us1/monitor/logs/calls`);
    });

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
console.log('⚠️  IMPORTANT: Only run during business hours (9 AM - 5 PM)');
console.log('⚠️  These will be REAL calls to REAL businesses');
console.log('⚠️  Press Ctrl+C to cancel\n');

// Give user 5 seconds to cancel
setTimeout(() => {
  runTest();
}, 5000);
