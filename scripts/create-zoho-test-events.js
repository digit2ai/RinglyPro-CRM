/**
 * Create test events in Zoho CRM for Client 15
 * Run with: node scripts/create-zoho-test-events.js
 */

const axios = require('axios');

// Client 15 Zoho credentials (from database)
const ZOHO_CONFIG = {
  clientId: process.env.ZOHO_CLIENT_ID || '1000.TNCPJMK5SQXVQYEM0FJ1BI97SY7W9V',
  clientSecret: process.env.ZOHO_CLIENT_SECRET || '6dcb6af39e8e4728e0a83af5ea8e794a24e1b34f10',
  refreshToken: process.env.ZOHO_REFRESH_TOKEN || '1000.c55ea6ebe94be20b10b58a6adced72fb.ad5cfe8de92a1e90bafdbb29f94a0ea9',
  region: 'com'
};

const AUTH_DOMAIN = 'https://accounts.zoho.com';
const API_DOMAIN = 'https://www.zohoapis.com';

// Test events to create (Feb 2-5, 2026 in EST)
const TEST_EVENTS = [
  { title: 'Client Meeting - Acme Corp', date: '2026-02-02', time: '09:00', duration: 60 },
  { title: 'Product Demo - Beta Features', date: '2026-02-02', time: '14:00', duration: 90 },
  { title: 'Team Standup', date: '2026-02-03', time: '10:00', duration: 30 },
  { title: 'Sales Call - New Lead', date: '2026-02-03', time: '15:30', duration: 45 },
  { title: 'Project Review - Q1 Goals', date: '2026-02-04', time: '11:00', duration: 60 },
  { title: 'Training Session - New Hires', date: '2026-02-04', time: '13:00', duration: 120 },
  { title: 'Investor Meeting', date: '2026-02-05', time: '09:30', duration: 60 },
  { title: 'Strategy Planning - 2026', date: '2026-02-05', time: '16:00', duration: 90 }
];

async function getAccessToken() {
  const params = new URLSearchParams({
    refresh_token: ZOHO_CONFIG.refreshToken,
    client_id: ZOHO_CONFIG.clientId,
    client_secret: ZOHO_CONFIG.clientSecret,
    grant_type: 'refresh_token'
  });

  const response = await axios.post(
    `${AUTH_DOMAIN}/oauth/v2/token?${params.toString()}`,
    null,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  if (response.data.error) {
    throw new Error(`Zoho auth error: ${response.data.error}`);
  }

  return response.data.access_token;
}

async function createEvent(accessToken, event) {
  // Create datetime in EST (UTC-5)
  const startDateTime = `${event.date}T${event.time}:00-05:00`;
  const [hours, minutes] = event.time.split(':').map(Number);
  const endMinutes = hours * 60 + minutes + event.duration;
  const endHours = Math.floor(endMinutes / 60);
  const endMins = endMinutes % 60;
  const endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
  const endDateTime = `${event.date}T${endTime}:00-05:00`;

  const eventData = {
    Event_Title: event.title,
    Start_DateTime: startDateTime,
    End_DateTime: endDateTime,
    Description: `Test event created for RinglyPro-Zoho sync testing\nCreated: ${new Date().toISOString()}`
  };

  const response = await axios.post(
    `${API_DOMAIN}/crm/v5/Events`,
    { data: [eventData] },
    {
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  return response.data;
}

async function main() {
  console.log('🚀 Creating test events in Zoho CRM for Client 15...\n');

  try {
    // Get access token
    console.log('🔑 Getting access token...');
    const accessToken = await getAccessToken();
    console.log('✅ Access token obtained\n');

    // Create each event
    let successCount = 0;
    for (const event of TEST_EVENTS) {
      try {
        console.log(`📅 Creating: ${event.title} (${event.date} @ ${event.time})...`);
        const result = await createEvent(accessToken, event);

        if (result.data?.[0]?.status === 'success') {
          const eventId = result.data[0].details.id;
          console.log(`   ✅ Created with ID: ${eventId}`);
          successCount++;
        } else {
          console.log(`   ❌ Failed: ${JSON.stringify(result)}`);
        }
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
      }
    }

    console.log(`\n✨ Done! Created ${successCount}/${TEST_EVENTS.length} events.`);
    console.log('\n📋 Events created for Feb 2-5, 2026:');
    TEST_EVENTS.forEach(e => console.log(`   - ${e.date} @ ${e.time}: ${e.title}`));

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

main();
