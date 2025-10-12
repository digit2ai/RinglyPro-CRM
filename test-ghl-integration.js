#!/usr/bin/env node
/**
 * GoHighLevel Integration Test Script
 *
 * This script tests all major endpoints of the GoHighLevel MCP integration.
 * Run with: node test-ghl-integration.js
 */

const axios = require('axios');
require('dotenv').config();

// Configuration
const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000/api/ghl';
const GHL_API_KEY = process.env.GHL_PRIVATE_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

// Test data
let createdContactId = null;
let createdTaskId = null;
let createdNoteId = null;

// Helper function for API calls
async function apiCall(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'x-ghl-api-key': GHL_API_KEY,
        'x-ghl-location-id': GHL_LOCATION_ID
      }
    };

    if (data) {
      if (method === 'GET') {
        config.params = data;
      } else {
        config.data = data;
      }
    }

    const response = await axios(config);
    return { success: true, data: response.data };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status
    };
  }
}

// Test functions
async function testHealthCheck() {
  console.log('\n🔍 Testing Health Check...');
  const result = await apiCall('GET', '/health');

  if (result.success) {
    console.log('✅ Health check passed:', result.data);
    return true;
  } else {
    console.error('❌ Health check failed:', result.error);
    return false;
  }
}

async function testCreateContact() {
  console.log('\n📝 Testing Create Contact...');
  const contactData = {
    firstName: 'Test',
    lastName: 'Contact',
    email: `test.${Date.now()}@example.com`,
    phone: `+1813555${Math.floor(1000 + Math.random() * 9000)}`,
    tags: ['test-contact', 'automated'],
    source: 'Integration Test'
  };

  const result = await apiCall('POST', '/contacts/create', contactData);

  if (result.success && result.data.data?.contact) {
    createdContactId = result.data.data.contact.id;
    console.log('✅ Contact created:', createdContactId);
    console.log('   Name:', `${contactData.firstName} ${contactData.lastName}`);
    console.log('   Email:', contactData.email);
    console.log('   Phone:', contactData.phone);
    return true;
  } else {
    console.error('❌ Contact creation failed:', result.error);
    return false;
  }
}

async function testGetContact() {
  if (!createdContactId) {
    console.log('\n⏭️  Skipping Get Contact test (no contact created)');
    return false;
  }

  console.log('\n🔍 Testing Get Contact...');
  const result = await apiCall('GET', `/contacts/${createdContactId}`);

  if (result.success) {
    console.log('✅ Contact retrieved successfully');
    console.log('   ID:', createdContactId);
    return true;
  } else {
    console.error('❌ Get contact failed:', result.error);
    return false;
  }
}

async function testSearchContacts() {
  console.log('\n🔍 Testing Search Contacts...');
  const result = await apiCall('POST', '/contacts/search', {
    query: 'Test',
    limit: 5
  });

  if (result.success) {
    console.log('✅ Contact search successful');
    console.log('   Results:', result.data.data?.contacts?.length || 0, 'contacts');
    return true;
  } else {
    console.error('❌ Contact search failed:', result.error);
    return false;
  }
}

async function testSendSMS() {
  if (!createdContactId) {
    console.log('\n⏭️  Skipping Send SMS test (no contact created)');
    return false;
  }

  console.log('\n💬 Testing Send SMS...');
  const result = await apiCall('POST', '/conversations/messages/sms', {
    contactId: createdContactId,
    message: 'This is a test message from the GoHighLevel integration test script.'
  });

  if (result.success) {
    console.log('✅ SMS sent successfully');
    return true;
  } else {
    console.error('❌ SMS sending failed:', result.error);
    return false;
  }
}

async function testCreateNote() {
  if (!createdContactId) {
    console.log('\n⏭️  Skipping Create Note test (no contact created)');
    return false;
  }

  console.log('\n📝 Testing Create Note...');
  const result = await apiCall('POST', `/contacts/${createdContactId}/notes`, {
    body: `Test note created at ${new Date().toISOString()}`
  });

  if (result.success && result.data.data?.note) {
    createdNoteId = result.data.data.note.id;
    console.log('✅ Note created:', createdNoteId);
    return true;
  } else {
    console.error('❌ Note creation failed:', result.error);
    return false;
  }
}

async function testCreateTask() {
  if (!createdContactId) {
    console.log('\n⏭️  Skipping Create Task test (no contact created)');
    return false;
  }

  console.log('\n✅ Testing Create Task...');
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const result = await apiCall('POST', `/contacts/${createdContactId}/tasks`, {
    title: 'Test Task',
    body: 'This is a test task from the integration test',
    dueDate: tomorrow.toISOString(),
    status: 'pending'
  });

  if (result.success && result.data.data?.task) {
    createdTaskId = result.data.data.task.id;
    console.log('✅ Task created:', createdTaskId);
    return true;
  } else {
    console.error('❌ Task creation failed:', result.error);
    return false;
  }
}

async function testGetCalendars() {
  console.log('\n📅 Testing Get Calendars...');
  const result = await apiCall('GET', '/calendars');

  if (result.success) {
    console.log('✅ Calendars retrieved');
    console.log('   Count:', result.data.data?.calendars?.length || 0);
    return true;
  } else {
    console.error('❌ Get calendars failed:', result.error);
    return false;
  }
}

async function testGetPipelines() {
  console.log('\n🎯 Testing Get Pipelines...');
  const result = await apiCall('GET', '/opportunities/pipelines');

  if (result.success) {
    console.log('✅ Pipelines retrieved');
    console.log('   Count:', result.data.data?.pipelines?.length || 0);
    return true;
  } else {
    console.error('❌ Get pipelines failed:', result.error);
    return false;
  }
}

async function testAIWelcomeContact() {
  console.log('\n🤖 Testing AI Welcome Contact Action...');
  const contactData = {
    firstName: 'AI',
    lastName: 'TestUser',
    email: `ai.test.${Date.now()}@example.com`,
    phone: `+1813555${Math.floor(1000 + Math.random() * 9000)}`,
    welcomeMessage: 'Hi! This is an automated welcome message from our integration test.'
  };

  const result = await apiCall('POST', '/ai/welcome-contact', contactData);

  if (result.success) {
    console.log('✅ AI Welcome action completed successfully');
    console.log('   Contact created:', result.data.data?.contact?.id);
    console.log('   SMS sent:', result.data.data?.sms ? 'Yes' : 'No');
    console.log('   Note logged:', result.data.data?.note?.id ? 'Yes' : 'No');
    return true;
  } else {
    console.error('❌ AI Welcome action failed:', result.error);
    return false;
  }
}

// Main test runner
async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║   GoHighLevel MCP Integration Test Suite                  ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('\n📋 Configuration:');
  console.log('   Base URL:', BASE_URL);
  console.log('   API Key:', GHL_API_KEY ? '✓ Set' : '✗ Missing');
  console.log('   Location ID:', GHL_LOCATION_ID ? '✓ Set' : '✗ Missing');

  if (!GHL_API_KEY || !GHL_LOCATION_ID) {
    console.error('\n❌ ERROR: Missing required environment variables!');
    console.error('   Please set GHL_PRIVATE_API_KEY and GHL_LOCATION_ID in your .env file');
    process.exit(1);
  }

  const tests = [
    { name: 'Health Check', fn: testHealthCheck, critical: true },
    { name: 'Create Contact', fn: testCreateContact, critical: true },
    { name: 'Get Contact', fn: testGetContact, critical: false },
    { name: 'Search Contacts', fn: testSearchContacts, critical: false },
    { name: 'Send SMS', fn: testSendSMS, critical: false },
    { name: 'Create Note', fn: testCreateNote, critical: false },
    { name: 'Create Task', fn: testCreateTask, critical: false },
    { name: 'Get Calendars', fn: testGetCalendars, critical: false },
    { name: 'Get Pipelines', fn: testGetPipelines, critical: false },
    { name: 'AI Welcome Contact', fn: testAIWelcomeContact, critical: false }
  ];

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else if (result === false && test.critical) {
        failed++;
        console.error(`\n💥 CRITICAL TEST FAILED: ${test.name}`);
        console.error('   Stopping test suite...');
        break;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`\n💥 Test "${test.name}" threw an error:`, error.message);
      failed++;
      if (test.critical) {
        console.error('   Stopping test suite...');
        break;
      }
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║   Test Results Summary                                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   Total: ${passed + failed + skipped}`);

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED! Integration is working correctly.');
    process.exit(0);
  } else {
    console.log(`\n⚠️  ${failed} test(s) failed. Please review the errors above.`);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(error => {
  console.error('\n💥 Fatal error running tests:', error);
  process.exit(1);
});
