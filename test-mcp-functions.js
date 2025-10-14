#!/usr/bin/env node

/**
 * Automated MCP Copilot Function Tester
 * Tests all 21 GoHighLevel CRM functions via the MCP endpoint
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MCP_ENDPOINT = `${BASE_URL}/api/mcp/copilot/chat`;
const CONNECT_ENDPOINT = `${BASE_URL}/api/mcp/gohighlevel/connect`;
const GHL_API_KEY = process.env.GHL_PRIVATE_API_KEY || 'pit-acf324ce-7568-4d2c-adbc-6f225fc49cfe';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '3lSeAHXNU9t09Hhp9oai';

let SESSION_ID = null;
const DELAY_BETWEEN_TESTS = 3000; // 3 seconds between tests

// Test results tracking
const results = {
  passed: [],
  failed: [],
  total: 0
};

// Color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Helper function to send message to MCP
async function sendMessage(message, testName) {
  results.total++;
  console.log(`\n${colors.cyan}[TEST ${results.total}]${colors.reset} ${testName}`);
  console.log(`${colors.blue}Message:${colors.reset} ${message}`);

  try {
    const response = await axios.post(MCP_ENDPOINT, {
      sessionId: SESSION_ID,
      message: message
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const responseText = response.data?.response || JSON.stringify(response.data);
    console.log(`${colors.green}✓ Response:${colors.reset} ${responseText.substring(0, 200)}${responseText.length > 200 ? '...' : ''}`);

    results.passed.push({ test: testName, message, response: responseText });
    return { success: true, response: responseText, data: response.data };
  } catch (error) {
    const errorMsg = error.response?.data?.error || error.message;
    console.log(`${colors.red}✗ Error:${colors.reset} ${errorMsg}`);

    results.failed.push({ test: testName, message, error: errorMsg });
    return { success: false, error: errorMsg };
  }
}

// Helper to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate unique test data
const testPhone = `555${Math.floor(1000000 + Math.random() * 9000000)}`; // 5551234567 format
const testEmail = `test${Date.now()}@example.com`;
const testName = `TestUser${Math.floor(Math.random() * 10000)}`;

// Connect to GoHighLevel and get session
async function connectToGoHighLevel() {
  console.log(`\n${colors.cyan}[SETUP]${colors.reset} Connecting to GoHighLevel...`);
  console.log(`${colors.blue}API Key:${colors.reset} ${GHL_API_KEY.substring(0, 20)}...`);
  console.log(`${colors.blue}Location ID:${colors.reset} ${GHL_LOCATION_ID}`);

  try {
    const response = await axios.post(CONNECT_ENDPOINT, {
      apiKey: GHL_API_KEY,
      locationId: GHL_LOCATION_ID
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.success && response.data?.sessionId) {
      SESSION_ID = response.data.sessionId;
      console.log(`${colors.green}✓ Connected!${colors.reset} Session ID: ${SESSION_ID}\n`);
      return true;
    } else {
      console.log(`${colors.red}✗ Connection failed:${colors.reset}`, response.data);
      return false;
    }
  } catch (error) {
    console.log(`${colors.red}✗ Connection error:${colors.reset}`, error.response?.data || error.message);
    return false;
  }
}

async function runAllTests() {
  console.log(`${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}  MCP Copilot Automated Test Suite${colors.reset}`);
  console.log(`${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);

  // Step 1: Connect to GoHighLevel
  const connected = await connectToGoHighLevel();
  if (!connected) {
    console.log(`\n${colors.red}❌ Failed to connect to GoHighLevel. Aborting tests.${colors.reset}\n`);
    process.exit(1);
  }

  console.log(`Test Data: ${testName} / ${testPhone} / ${testEmail}\n`);

  let contactId = null;
  let opportunityId = null;

  // ========== CONTACT OPERATIONS ==========
  console.log(`\n${colors.yellow}▶ CONTACT OPERATIONS${colors.reset}`);

  // Test 1: Create Contact
  await wait(DELAY_BETWEEN_TESTS);
  const createResult = await sendMessage(
    `create contact ${testName} phone ${testPhone} email ${testEmail}`,
    'Create Contact'
  );

  // Extract contact ID from response if possible
  if (createResult.success && createResult.data?.data?.contactId) {
    contactId = createResult.data.data.contactId;
    console.log(`${colors.green}Captured Contact ID: ${contactId}${colors.reset}`);
  }

  // Test 2: Search Contact by Name
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(`search ${testName}`, 'Search Contact by Name');

  // Test 3: Search Contact by Phone
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(`search ${testPhone}`, 'Search Contact by Phone');

  // Test 4: Search Contact by Email
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(`search ${testEmail}`, 'Search Contact by Email');

  // Test 5: Update Contact
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(
    `update contact ${testEmail} with tag test-updated`,
    'Update Contact'
  );

  // Test 6: Add Tags
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(`add tag vip to ${testEmail}`, 'Add Tags');

  // Test 7: Add Multiple Tags
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(`add tags hot-lead, interested to ${testEmail}`, 'Add Multiple Tags');

  // Test 8: Remove Tags
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(`remove tag interested from ${testEmail}`, 'Remove Tags');

  // Test 9: List All Contacts
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage('list all contacts', 'List All Contacts');

  // ========== COMMUNICATION OPERATIONS ==========
  console.log(`\n${colors.yellow}▶ COMMUNICATION OPERATIONS${colors.reset}`);

  // Test 10: Send SMS by Phone
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(
    `send sms to ${testPhone} saying This is an automated test message`,
    'Send SMS by Phone'
  );

  // Test 11: Send SMS by Email
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(
    `send sms to ${testEmail} saying Another test SMS`,
    'Send SMS by Email'
  );

  // Test 12: Send Email
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(
    `send email to ${testEmail} subject Test Email body This is a test email from automated testing`,
    'Send Email'
  );

  // ========== OPPORTUNITY OPERATIONS ==========
  console.log(`\n${colors.yellow}▶ OPPORTUNITY OPERATIONS${colors.reset}`);

  // Test 13: View Opportunities
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage('show opportunities', 'View Opportunities');

  // Test 14: View Pipelines
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage('show pipelines', 'View Pipelines');

  // Test 15: Add Opportunity
  await wait(DELAY_BETWEEN_TESTS);
  const oppResult = await sendMessage(
    `add opportunity for ${testEmail} value 5000 stage lead`,
    'Add Opportunity'
  );

  if (oppResult.success && oppResult.data?.data?.opportunityId) {
    opportunityId = oppResult.data.data.opportunityId;
    console.log(`${colors.green}Captured Opportunity ID: ${opportunityId}${colors.reset}`);
  }

  // Test 16: Update Opportunity (if we have ID)
  await wait(DELAY_BETWEEN_TESTS);
  if (opportunityId) {
    await sendMessage(
      `move opportunity ${opportunityId} to qualified stage`,
      'Update Opportunity Stage'
    );
  } else {
    await sendMessage(
      `move ${testEmail} opportunity to qualified`,
      'Update Opportunity by Contact'
    );
  }

  // ========== CALENDAR OPERATIONS ==========
  console.log(`\n${colors.yellow}▶ CALENDAR OPERATIONS${colors.reset}`);

  // Test 17: List Calendars
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage('show calendars', 'List Calendars');

  // Test 18: View Calendar Events
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage('show calendar events', 'View Calendar Events');

  // Test 19: Book Appointment
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(
    `book appointment for ${testEmail} tomorrow at 2pm`,
    'Book Appointment'
  );

  // ========== OTHER OPERATIONS ==========
  console.log(`\n${colors.yellow}▶ OTHER OPERATIONS${colors.reset}`);

  // Test 20: Log Call
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(
    `log call with ${testEmail} duration 15 minutes`,
    'Log Call'
  );

  // Test 21: Send Review Request
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage(
    `send review request to ${testEmail}`,
    'Send Review Request'
  );

  // Test 22: View Dashboard
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage('show dashboard', 'View Dashboard');

  // Test 23: View Location
  await wait(DELAY_BETWEEN_TESTS);
  await sendMessage('show location', 'View Location');

  // ========== SUMMARY ==========
  printSummary();
}

function printSummary() {
  console.log(`\n${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.yellow}  TEST SUMMARY${colors.reset}`);
  console.log(`${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`Total Tests: ${results.total}`);
  console.log(`${colors.green}Passed: ${results.passed.length}${colors.reset}`);
  console.log(`${colors.red}Failed: ${results.failed.length}${colors.reset}`);
  console.log(`Success Rate: ${((results.passed.length / results.total) * 100).toFixed(2)}%`);

  if (results.failed.length > 0) {
    console.log(`\n${colors.red}FAILED TESTS:${colors.reset}`);
    results.failed.forEach((fail, idx) => {
      console.log(`${idx + 1}. ${fail.test}`);
      console.log(`   Message: ${fail.message}`);
      console.log(`   Error: ${fail.error}`);
    });
  }

  console.log(`\n${colors.yellow}═══════════════════════════════════════════════════════════${colors.reset}\n`);

  // Exit with error code if any tests failed
  process.exit(results.failed.length > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  console.error(`${colors.red}Fatal Error:${colors.reset}`, error.message);
  process.exit(1);
});
