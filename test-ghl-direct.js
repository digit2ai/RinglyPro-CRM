#!/usr/bin/env node
/**
 * Direct GoHighLevel API Test
 * Tests API with credentials - run this on Render or locally with DB access
 */

const axios = require('axios');

// Color codes for terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logTest(name, status, details = '') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏭️';
  const color = status === 'pass' ? 'green' : status === 'fail' ? 'red' : 'yellow';
  log(`${icon} ${name}`, color);
  if (details) {
    log(`   ${details}`, 'cyan');
  }
}

// Test results tracker
const results = {
  passed: [],
  failed: []
};

// GHL API Tester
class GHLAPITester {
  constructor(apiKey, locationId) {
    this.apiKey = apiKey;
    this.locationId = locationId;
    this.baseURL = 'https://services.leadconnectorhq.com';
    this.isJWT = !apiKey.startsWith('pit-');

    log(`\n🔑 Token Type: ${this.isJWT ? 'JWT' : 'PIT'}`, 'cyan');
    log(`🔑 Token Preview: ${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 10)}`, 'cyan');
    log(`📍 Location ID: ${locationId}`, 'cyan');
  }

  async callAPI(method, endpoint, data = null, testName = '') {
    try {
      const headers = {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'Version': '2021-07-28'
      };

      // JWT tokens don't need locationId parameter
      let params = undefined;
      if (!this.isJWT && method === 'GET' && !endpoint.includes('?')) {
        params = { locationId: this.locationId };
      }

      // JWT tokens don't need locationId in body
      let payload = data;
      if (!this.isJWT && data && method !== 'GET') {
        payload = { locationId: this.locationId, ...data };
      }

      const url = `${this.baseURL}${endpoint}`;

      log(`\n🌐 ${method} ${url}`, 'cyan');
      if (params) log(`   Query Params: ${JSON.stringify(params)}`, 'cyan');
      if (payload) log(`   Body: ${JSON.stringify(payload)}`, 'cyan');

      const response = await axios({
        method,
        url,
        headers,
        data: payload,
        params,
        timeout: 10000
      });

      logTest(testName, 'pass', `Status: ${response.status}`);
      results.passed.push(testName);
      return { success: true, data: response.data, status: response.status };
    } catch (error) {
      const status = error.response?.status || 'TIMEOUT';
      const message = error.response?.data?.message || error.message;
      const fullError = JSON.stringify(error.response?.data || error.message);
      logTest(testName, 'fail', `Error ${status}: ${message}`);
      log(`   Full error: ${fullError}`, 'red');
      results.failed.push({ name: testName, error: `${status}: ${message}`, details: fullError });
      return { success: false, error: error.response?.data || error.message, status };
    }
  }
}

// Main test function
async function runTests(apiKey, locationId) {
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║      GoHighLevel API Comprehensive Test Suite             ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  const tester = new GHLAPITester(apiKey, locationId);

  log('\n🚀 Running API tests...\n', 'yellow');

  let contactId = null;

  // Test 1: Create Contact
  log('\n═══ Test 1: Create Contact ═══', 'blue');
  const createResult = await tester.callAPI('POST', '/contacts/', {
    firstName: 'TestAPI',
    lastName: 'Contact',
    email: `test.api.${Date.now()}@ringlypro-test.com`,
    phone: '+17275551234'
  }, 'Create Contact');

  if (createResult.success) {
    contactId = createResult.data?.contact?.id;
    if (contactId) {
      log(`   📝 Created contact ID: ${contactId}`, 'green');
    }
  }

  // Test 2: Search Contacts
  log('\n═══ Test 2: Search Contacts ═══', 'blue');
  await tester.callAPI('GET', '/contacts/?query=Test&limit=5', null, 'Search Contacts');

  // Test 3: Get Contact by ID
  if (contactId) {
    log('\n═══ Test 3: Get Contact by ID ═══', 'blue');
    await tester.callAPI('GET', `/contacts/${contactId}`, null, 'Get Contact by ID');
  }

  // Test 4: Update Contact
  if (contactId) {
    log('\n═══ Test 4: Update Contact ═══', 'blue');
    await tester.callAPI('PUT', `/contacts/${contactId}`, {
      phone: '+17275559999'
    }, 'Update Contact');
  }

  // Test 5: Add Tags
  if (contactId) {
    log('\n═══ Test 5: Add Tags ═══', 'blue');
    await tester.callAPI('POST', `/contacts/${contactId}/tags`, {
      tags: ['test-tag', 'api-test']
    }, 'Add Tags');
  }

  // Test 6: Get Pipelines
  log('\n═══ Test 6: Get Pipelines ═══', 'blue');
  await tester.callAPI('GET', '/opportunities/pipelines', null, 'Get Pipelines');

  // Test 7: Get Location
  log('\n═══ Test 7: Get Location Info ═══', 'blue');
  const locationEndpoint = tester.isJWT ? '/locations/' : `/locations/${locationId}`;
  await tester.callAPI('GET', locationEndpoint, null, 'Get Location Info');

  // Test 8: Cleanup - Delete Test Contact
  if (contactId) {
    log('\n═══ Test 8: Delete Test Contact (Cleanup) ═══', 'blue');
    await tester.callAPI('DELETE', `/contacts/${contactId}`, null, 'Delete Test Contact');
  }

  // Print Summary
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║                    TEST SUMMARY                            ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');
  log(`\n✅ Passed: ${results.passed.length}`, 'green');
  log(`❌ Failed: ${results.failed.length}`, 'red');

  if (results.failed.length > 0) {
    log('\n❌ Failed Tests:', 'red');
    results.failed.forEach(({ name, error }) => {
      log(`   • ${name}: ${error}`, 'red');
    });
  }

  if (results.passed.length > 0) {
    log('\n✅ Passed Tests:', 'green');
    results.passed.forEach(name => {
      log(`   • ${name}`, 'green');
    });
  }

  // Analysis
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║                      ANALYSIS                              ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  if (results.failed.length === 0) {
    log('\n🎉 ALL TESTS PASSED! Your GHL API integration is working perfectly.', 'green');
    log('✅ The issue is NOT with the API credentials.', 'green');
    log('✅ The issue must be in the session/frontend integration.', 'yellow');
  } else {
    const allFailed = results.passed.length === 0;
    const firstError = results.failed[0]?.error || '';

    if (allFailed) {
      log('\n⚠️  ALL TESTS FAILED - This suggests:', 'red');
      if (firstError.includes('Invalid JWT') || firstError.includes('401')) {
        log('   • JWT token is INVALID, EXPIRED, or WRONG TYPE', 'red');
        log('   • SOLUTION: Generate a NEW API key from GoHighLevel', 'yellow');
        log('   • Recommended: Use a Private Integration Token (PIT) instead of JWT', 'yellow');
        log('\n   How to get a PIT token:', 'cyan');
        log('   1. Go to GoHighLevel → Settings → Integrations', 'cyan');
        log('   2. Click "Create Private Integration Token"', 'cyan');
        log('   3. Copy the token (starts with "pit-")', 'cyan');
        log('   4. Update in RinglyPro Settings', 'cyan');
      } else if (firstError.includes('403')) {
        log('   • Token lacks required permissions', 'red');
        log('   • SOLUTION: Check token scopes in GoHighLevel settings', 'yellow');
      } else {
        log(`   • Unknown issue: ${firstError}`, 'red');
      }
    } else {
      log('\n⚠️  SOME TESTS FAILED - Specific endpoint issues:', 'yellow');
      log('   • Some operations work, some don\'t', 'yellow');
      log('   • This suggests token has limited permissions', 'yellow');
      log('   • Or certain endpoints have different requirements', 'yellow');
    }
  }

  log('\n');
  return results;
}

// CLI usage
if (require.main === module) {
  const apiKey = process.argv[2];
  const locationId = process.argv[3];

  if (!apiKey || !locationId) {
    console.error('\n❌ Usage: node test-ghl-direct.js <API_KEY> <LOCATION_ID>');
    console.error('\nExample:');
    console.error('  node test-ghl-direct.js "eyJhbGci..." "3lSeAHXNU9t09Hhp9oai"');
    console.error('\nOr set environment variables:');
    console.error('  GHL_API_KEY=your_key GHL_LOCATION_ID=your_id node test-ghl-direct.js');
    process.exit(1);
  }

  runTests(apiKey, locationId).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { runTests, GHLAPITester };
