#!/usr/bin/env node
'use strict';

/**
 * Lina AI Call Simulation
 * Simulates what Lina would say when calling about the Store Health Dashboard
 */

const axios = require('axios');
const { format } = require('date-fns');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

async function simulateLinaCall() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  📞 INCOMING CALL FROM: Lina - Store Health AI            ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  log('', 'reset');

  // Simulate ringing
  log('🔊 Ring... Ring... Ring...', 'yellow');
  log('', 'reset');
  await new Promise(resolve => setTimeout(resolve, 2000));

  log('✅ Call Connected', 'green');
  log('', 'reset');
  await new Promise(resolve => setTimeout(resolve, 1000));

  log('─'.repeat(80), 'cyan');
  log('🤖 LINA (AI Assistant):', 'magenta');
  log('─'.repeat(80), 'cyan');
  log('', 'reset');

  try {
    // Fetch dashboard data
    const response = await axios.get('http://localhost:3000/api/v1/dashboard/overview');
    const data = response.data.data;

    // Generate Lina's script
    const script = `
Hello! This is Lina, your Store Health AI assistant. I'm calling to give you
an update on your store network's performance for ${format(new Date(), 'MMMM do, yyyy')}.

Let me share the current status:

OVERALL NETWORK HEALTH:
We're currently monitoring ${data.total_stores} stores across your network.
The average health score is ${data.average_health_score} out of 100.

STORE STATUS BREAKDOWN:
- ${data.green_stores} stores are performing well and are in the green zone
- ${data.red_stores} stores need attention and are in the red zone
- ${data.stores_requiring_action} stores require immediate action from management

CRITICAL ALERTS:
I've identified ${data.critical_stores.length} stores that need your immediate attention:

${data.critical_stores.map((store, idx) => {
  const status = store.health_score < 60 ? 'critically low' : 'concerning';
  return `${idx + 1}. ${store.store_name}
   - Store Code: ${store.store_code}
   - Health Score: ${store.health_score} out of 100
   - Status: This store has a ${status} health score
   - Escalation Level: ${store.escalation_level}`;
}).join('\n\n')}

RECOMMENDED ACTIONS:
Based on the current data, I recommend the following immediate actions:

1. Review the ${data.red_stores} underperforming stores with your district managers
2. Focus on the ${data.critical_stores.filter(s => Number(s.health_score) < 60).length} stores with critical health scores below 60
3. Check the dashboard at http://localhost:5173 for detailed KPI breakdowns
4. Escalation level ${Math.max(...data.critical_stores.map(s => s.escalation_level))} protocols should be activated for the most critical stores

NEXT STEPS:
You can view the complete interactive dashboard with detailed charts and KPI
trends at your Store Health AI dashboard. All store managers have been notified
via the alert system.

Is there anything specific you'd like me to explain about any particular store
or metric? You can also view real-time updates on the dashboard.

Thank you for your attention. Have a great day!
    `.trim();

    // Display the script line by line with pauses
    const lines = script.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        log(`   ${line}`, 'cyan');
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        log('', 'reset');
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

  } catch (error) {
    log('   [Lina encountered an error fetching the latest data]', 'red');
    log(`   Error: ${error.message}`, 'red');
  }

  log('', 'reset');
  log('─'.repeat(80), 'cyan');
  log('', 'reset');
  await new Promise(resolve => setTimeout(resolve, 1000));

  log('📞 Call Duration: 2 minutes, 15 seconds', 'yellow');
  log('✅ Call Ended', 'green');
  log('', 'reset');

  log('╔════════════════════════════════════════════════════════════╗', 'cyan');
  log('║  NOTE: This is a simulation. To enable real phone calls:  ║', 'cyan');
  log('║  1. Sign up for Twilio at https://www.twilio.com          ║', 'cyan');
  log('║  2. Add your credentials to .env:                         ║', 'cyan');
  log('║     TWILIO_ACCOUNT_SID=your_account_sid                   ║', 'cyan');
  log('║     TWILIO_AUTH_TOKEN=your_auth_token                     ║', 'cyan');
  log('║     TWILIO_FROM_NUMBER=your_twilio_phone_number           ║', 'cyan');
  log('╚════════════════════════════════════════════════════════════╝', 'cyan');
  log('', 'reset');
}

// Run the simulation
simulateLinaCall()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Simulation error:', err);
    process.exit(1);
  });
