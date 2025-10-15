#!/usr/bin/env node
/**
 * GoHighLevel API Test Script
 * Tests all API functions with the actual JWT token from database
 */

require('dotenv').config();
const axios = require('axios');
const { Sequelize } = require('sequelize');

// Database connection - use CRM_DATABASE_URL or DATABASE_URL
const databaseUrl = process.env.CRM_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('❌ No database URL found. Please set CRM_DATABASE_URL or DATABASE_URL environment variable.');
  process.exit(1);
}

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: {
    ssl: process.env.NODE_ENV === 'production' ? {
      require: true,
      rejectUnauthorized: false
    } : false
  }
});

// Test results tracker
const results = {
  passed: [],
  failed: [],
  skipped: []
};

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

// GHL API Helper
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
      return { success: true, data: response.data };
    } catch (error) {
      const status = error.response?.status || 'TIMEOUT';
      const message = error.response?.data?.message || error.message;
      logTest(testName, 'fail', `Error ${status}: ${message}`);
      results.failed.push({ name: testName, error: `${status}: ${message}` });
      return { success: false, error: error.response?.data || error.message };
    }
  }

  // Test 1: Create Contact
  async testCreateContact() {
    return await this.callAPI('POST', '/contacts/', {
      firstName: 'Test',
      lastName: 'Contact',
      email: `test.${Date.now()}@ringlypro-test.com`,
      phone: '+17275551234'
    }, 'Test 1: Create Contact');
  }

  // Test 2: Search Contacts
  async testSearchContacts() {
    return await this.callAPI('GET', '/contacts/?query=Test&limit=5', null, 'Test 2: Search Contacts');
  }

  // Test 3: Get Contact by ID (if we have one)
  async testGetContact(contactId) {
    if (!contactId) {
      logTest('Test 3: Get Contact by ID', 'skip', 'No contact ID available');
      results.skipped.push('Test 3: Get Contact by ID');
      return { success: false, skipped: true };
    }
    return await this.callAPI('GET', `/contacts/${contactId}`, null, 'Test 3: Get Contact by ID');
  }

  // Test 4: Update Contact
  async testUpdateContact(contactId) {
    if (!contactId) {
      logTest('Test 4: Update Contact', 'skip', 'No contact ID available');
      results.skipped.push('Test 4: Update Contact');
      return { success: false, skipped: true };
    }
    return await this.callAPI('PUT', `/contacts/${contactId}`, {
      phone: '+17275559999'
    }, 'Test 4: Update Contact');
  }

  // Test 5: Add Tags
  async testAddTags(contactId) {
    if (!contactId) {
      logTest('Test 5: Add Tags', 'skip', 'No contact ID available');
      results.skipped.push('Test 5: Add Tags');
      return { success: false, skipped: true };
    }
    return await this.callAPI('POST', `/contacts/${contactId}/tags`, {
      tags: ['test-tag', 'api-test']
    }, 'Test 5: Add Tags');
  }

  // Test 6: Get Pipelines
  async testGetPipelines() {
    return await this.callAPI('GET', '/opportunities/pipelines', null, 'Test 6: Get Pipelines');
  }

  // Test 7: Search Opportunities
  async testSearchOpportunities() {
    return await this.callAPI('POST', '/opportunities/search', {}, 'Test 7: Search Opportunities');
  }

  // Test 8: Get Calendars
  async testGetCalendars() {
    return await this.callAPI('GET', '/calendars/', null, 'Test 8: Get Calendars');
  }

  // Test 9: Get Location Info
  async testGetLocation() {
    const endpoint = this.isJWT
      ? '/locations/' // JWT has locationId embedded
      : `/locations/${this.locationId}`;
    return await this.callAPI('GET', endpoint, null, 'Test 9: Get Location Info');
  }

  // Test 10: Delete Test Contact (cleanup)
  async testDeleteContact(contactId) {
    if (!contactId) {
      logTest('Test 10: Delete Test Contact', 'skip', 'No contact ID available');
      results.skipped.push('Test 10: Delete Test Contact');
      return { success: false, skipped: true };
    }
    return await this.callAPI('DELETE', `/contacts/${contactId}`, null, 'Test 10: Delete Test Contact');
  }
}

// Main test function
async function runTests() {
  log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
  log('║      GoHighLevel API Comprehensive Test Suite             ║', 'blue');
  log('╚════════════════════════════════════════════════════════════╝', 'blue');

  try {
    // 1. Connect to database
    log('\n📊 Step 1: Fetching credentials from database...', 'yellow');
    await sequelize.authenticate();
    log('✅ Database connected', 'green');

    const [results] = await sequelize.query(
      'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = 15'
    );

    if (!results || results.length === 0 || !results[0].ghl_api_key) {
      log('❌ No GHL credentials found for client 15', 'red');
      process.exit(1);
    }

    const { ghl_api_key, ghl_location_id } = results[0];
    log('✅ Credentials loaded', 'green');

    // 2. Initialize tester
    log('\n🧪 Step 2: Initializing API tester...', 'yellow');
    const tester = new GHLAPITester(ghl_api_key, ghl_location_id);

    // 3. Run tests
    log('\n🚀 Step 3: Running API tests...\n', 'yellow');

    let contactId = null;

    // Test 1: Create Contact
    const createResult = await tester.testCreateContact();
    if (createResult.success) {
      contactId = createResult.data?.contact?.id;
      if (contactId) {
        log(`   📝 Created contact ID: ${contactId}`, 'cyan');
      }
    }

    // Test 2: Search Contacts
    await tester.testSearchContacts();

    // Test 3: Get Contact by ID
    await tester.testGetContact(contactId);

    // Test 4: Update Contact
    await tester.testUpdateContact(contactId);

    // Test 5: Add Tags
    await tester.testAddTags(contactId);

    // Test 6: Get Pipelines
    await tester.testGetPipelines();

    // Test 7: Search Opportunities
    await tester.testSearchOpportunities();

    // Test 8: Get Calendars
    await tester.testGetCalendars();

    // Test 9: Get Location
    await tester.testGetLocation();

    // Test 10: Cleanup - Delete Test Contact
    await tester.testDeleteContact(contactId);

    // Print Summary
    log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
    log('║                    TEST SUMMARY                            ║', 'blue');
    log('╚════════════════════════════════════════════════════════════╝', 'blue');
    log(`\n✅ Passed: ${results.passed.length}`, 'green');
    log(`❌ Failed: ${results.failed.length}`, 'red');
    log(`⏭️  Skipped: ${results.skipped.length}`, 'yellow');

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
    } else {
      const allFailed = results.passed.length === 0;
      const mostFailed = results.failed.length > results.passed.length;

      if (allFailed) {
        log('\n⚠️  ALL TESTS FAILED - This suggests:', 'red');
        const firstError = results.failed[0]?.error || '';
        if (firstError.includes('Invalid JWT') || firstError.includes('401')) {
          log('   • JWT token is invalid, expired, or wrong type', 'red');
          log('   • SOLUTION: Generate a new API key from GoHighLevel', 'yellow');
          log('   • Recommended: Use a Private Integration Token (PIT) instead', 'yellow');
        } else if (firstError.includes('403')) {
          log('   • Token lacks required permissions', 'red');
          log('   • SOLUTION: Check token scopes in GoHighLevel', 'yellow');
        } else {
          log(`   • Unknown issue: ${firstError}`, 'red');
        }
      } else if (mostFailed) {
        log('\n⚠️  MOST TESTS FAILED - Partial connectivity issue', 'yellow');
      } else {
        log('\n⚠️  SOME TESTS FAILED - Specific endpoint issues', 'yellow');
      }
    }

    log('\n');

  } catch (error) {
    log(`\n❌ Test suite error: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
