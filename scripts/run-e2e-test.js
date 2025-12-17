#!/usr/bin/env node
/**
 * E2E Test Runner Script
 *
 * Run WhatsApp → HubSpot → RinglyPro booking E2E tests from CLI
 *
 * Usage:
 *   node scripts/run-e2e-test.js --client=<clientId> [--retries=3] [--healing]
 *
 * Options:
 *   --client=<id>   Client ID to test (required)
 *   --retries=<n>   Max retry attempts (default: 3)
 *   --healing       Enable self-healing mode
 *   --step=<name>   Run specific step only (connection, upsert, availability, booking)
 *   --clear         Clear failure log before running
 *   --report        Show failure report only (no test run)
 *
 * Examples:
 *   node scripts/run-e2e-test.js --client=1
 *   node scripts/run-e2e-test.js --client=1 --healing --retries=5
 *   node scripts/run-e2e-test.js --client=1 --step=connection
 *   node scripts/run-e2e-test.js --report
 */

require('dotenv').config();

// Parse command line arguments
function parseArgs() {
  const args = {
    client: null,
    retries: 3,
    healing: false,
    step: null,
    clear: false,
    report: false,
    help: false
  };

  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--client=')) {
      args.client = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--retries=')) {
      args.retries = parseInt(arg.split('=')[1]);
    } else if (arg === '--healing') {
      args.healing = true;
    } else if (arg.startsWith('--step=')) {
      args.step = arg.split('=')[1];
    } else if (arg === '--clear') {
      args.clear = true;
    } else if (arg === '--report') {
      args.report = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    }
  });

  return args;
}

function printUsage() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    E2E Test Runner for RinglyPro                      ║
║          WhatsApp → HubSpot → RinglyPro Booking Flow                  ║
╚══════════════════════════════════════════════════════════════════════╝

USAGE:
  node scripts/run-e2e-test.js --client=<clientId> [options]

OPTIONS:
  --client=<id>   Client ID to test (REQUIRED for test runs)
  --retries=<n>   Max retry attempts in self-healing mode (default: 3)
  --healing       Enable self-healing retry loop
  --step=<name>   Run a specific step only:
                    - connection  Test HubSpot connection
                    - upsert      Test contact create/update
                    - availability Test slot fetching
                    - booking     Test appointment creation
  --clear         Clear failure log before running
  --report        Show failure report only (no test run)
  --help, -h      Show this help message

EXAMPLES:
  # Run full E2E test for client 1
  node scripts/run-e2e-test.js --client=1

  # Run with self-healing (auto-retry on failure)
  node scripts/run-e2e-test.js --client=1 --healing

  # Run with 5 retries
  node scripts/run-e2e-test.js --client=1 --healing --retries=5

  # Test only HubSpot connection
  node scripts/run-e2e-test.js --client=1 --step=connection

  # View failure report
  node scripts/run-e2e-test.js --report

  # Clear failures and run fresh test
  node scripts/run-e2e-test.js --client=1 --clear

ENVIRONMENT:
  APP_URL               Base URL for API calls (default: https://aiagent.ringlypro.com)
  E2E_TEST_API_KEY      API key for test authentication (optional in dev)
  DATABASE_URL          Required for database connection

`);
}

async function main() {
  const args = parseArgs();

  if (args.help) {
    printUsage();
    process.exit(0);
  }

  // Check for database URL
  if (!process.env.DATABASE_URL && !process.env.CRM_DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL or CRM_DATABASE_URL is required');
    console.error('   Set it in your .env file or environment');
    process.exit(1);
  }

  // Late require to allow env vars to be set
  const e2eTestService = require('../src/services/e2eTestService');
  const e2eTestHarness = require('../src/services/e2eTestHarness');

  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    E2E Test Runner - Starting                         ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  // Initialize service
  await e2eTestService.initialize();

  // Handle --report (show failure report only)
  if (args.report) {
    const failures = e2eTestService.getFailureLog();
    const openFailures = e2eTestService.getOpenFailures();

    console.log('📋 FAILURE REPORT\n');
    console.log(`Total Failures: ${failures.length}`);
    console.log(`Open Failures: ${openFailures.length}`);

    if (openFailures.length > 0) {
      console.log('\n--- Open Failures ---\n');
      openFailures.forEach((f, i) => {
        console.log(`${i + 1}. [${f.timestamp_utc}] ${f.step}`);
        console.log(`   Symptom: ${f.symptom}`);
        console.log(`   Root Cause: ${f.suspected_root_cause}`);
        console.log('');
      });
    } else {
      console.log('\n✅ No open failures!\n');
    }

    process.exit(0);
  }

  // Handle --clear
  if (args.clear) {
    await e2eTestService.clearFailureLog();
    console.log('✅ Failure log cleared\n');
  }

  // Check for client ID
  if (!args.client) {
    console.error('❌ ERROR: --client=<id> is required for test runs');
    console.error('   Use --help for usage information');
    process.exit(1);
  }

  const clientId = args.client;
  console.log(`📋 Test Configuration:`);
  console.log(`   Client ID: ${clientId}`);
  console.log(`   Mode: ${args.healing ? 'Self-Healing' : 'Single Run'}`);
  console.log(`   Max Retries: ${args.retries}`);
  if (args.step) {
    console.log(`   Step: ${args.step} only`);
  }
  console.log('');

  let result;

  try {
    // Handle --step (single step test)
    if (args.step) {
      console.log(`🔬 Running step: ${args.step}\n`);

      switch (args.step) {
        case 'connection':
          result = await e2eTestService.stepTestConnection(clientId);
          break;
        case 'upsert':
          result = await e2eTestService.stepHubSpotUpsert(clientId);
          break;
        case 'availability':
          result = await e2eTestService.stepAvailability(clientId);
          break;
        case 'booking':
          // First get availability, then book first slot
          const availResult = await e2eTestService.stepAvailability(clientId);
          if (!availResult.success || !availResult.slots?.length) {
            console.error('❌ Cannot test booking - no availability');
            process.exit(1);
          }
          result = await e2eTestService.stepBooking(clientId, availResult.slots[0]);
          break;
        default:
          console.error(`❌ Unknown step: ${args.step}`);
          console.error('   Valid steps: connection, upsert, availability, booking');
          process.exit(1);
      }

      console.log('\n--- Step Result ---');
      console.log(`Step: ${result.step}`);
      console.log(`Success: ${result.success ? '✅ YES' : '❌ NO'}`);
      if (!result.success && result.error) {
        console.log(`Error: ${result.error}`);
      }
      if (result.contactId) console.log(`Contact ID: ${result.contactId}`);
      if (result.slots) console.log(`Slots Found: ${result.slots.length}`);
      if (result.bookingId) console.log(`Booking ID: ${result.bookingId}`);

      process.exit(result.success ? 0 : 1);
    }

    // Full E2E test
    if (args.healing) {
      console.log('🔄 Running with self-healing mode...\n');
      result = await e2eTestHarness.runWithSelfHealing(clientId, {
        maxRetries: args.retries
      });
    } else {
      console.log('🧪 Running single E2E test...\n');
      result = await e2eTestHarness.runSingle(clientId);
      result = {
        success: result.overallSuccess,
        attempts: 1,
        finalResult: result,
        allResults: [result]
      };
    }

    // Print report
    const report = e2eTestHarness.generateReport(result);
    console.log('\n' + report);

    // Exit with appropriate code
    process.exit(result.success ? 0 : 1);

  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
