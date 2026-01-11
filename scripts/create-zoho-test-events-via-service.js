/**
 * Create test events in Zoho CRM for Client 15 using zohoCalendarService
 *
 * This script should be run from the production server where DATABASE_URL is set.
 *
 * Run with: node scripts/create-zoho-test-events-via-service.js
 */

// Set working directory to project root
process.chdir(__dirname + '/..');

const zohoCalendarService = require('./src/services/zohoCalendarService');

const CLIENT_ID = 15;

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

async function main() {
  console.log('🚀 Creating test events in Zoho CRM for Client 15...\n');
  console.log('Using zohoCalendarService.createEvent()...\n');

  try {
    let successCount = 0;

    for (const event of TEST_EVENTS) {
      try {
        // Calculate start time in ISO format with EST offset
        const startTime = `${event.date}T${event.time}:00-05:00`;

        console.log(`📅 Creating: ${event.title} (${event.date} @ ${event.time})...`);

        const result = await zohoCalendarService.createEvent(CLIENT_ID, {
          title: event.title,
          customerName: 'Test Event',
          customerPhone: '555-0100',
          customerEmail: 'test@example.com',
          startTime: startTime,
          duration: event.duration,
          description: `Test event for RinglyPro-Zoho sync testing`,
          confirmationCode: 'TEST-' + Math.random().toString(36).substring(7).toUpperCase()
        });

        if (result.success) {
          console.log(`   ✅ Created with ID: ${result.event?.id}`);
          successCount++;
        } else {
          console.log(`   ❌ Failed: ${result.error}`);
        }
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
      }
    }

    console.log(`\n✨ Done! Created ${successCount}/${TEST_EVENTS.length} events.`);
    console.log('\n📋 Events scheduled for Feb 2-5, 2026:');
    TEST_EVENTS.forEach(e => console.log(`   - ${e.date} @ ${e.time}: ${e.title}`));

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }

  process.exit(0);
}

main();
