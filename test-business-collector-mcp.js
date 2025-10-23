#!/usr/bin/env node

/**
 * Test Business Collector MCP Integration
 * Tests the integration between RinglyPro AI Copilot and Business Collector
 */

const axios = require('axios');

const BASE_URL = process.env.MCP_BASE_URL || 'https://ringlypro-crm.onrender.com';
const COLLECTOR_URL = process.env.BUSINESS_COLLECTOR_URL || 'https://ringlypro-public-business-collector.onrender.com';

console.log('🧪 Testing Business Collector MCP Integration\n');
console.log(`MCP Base URL: ${BASE_URL}`);
console.log(`Collector URL: ${COLLECTOR_URL}\n`);

let sessionId = null;

/**
 * Test 1: Check Business Collector Health
 */
async function testCollectorHealth() {
  console.log('Test 1: Checking Business Collector Health...');
  try {
    const response = await axios.get(`${COLLECTOR_URL}/health`);
    console.log('✅ Business Collector is healthy');
    console.log(`   Status: ${response.data.status}`);
    console.log(`   Version: ${response.data.version}`);
    console.log(`   Timestamp: ${response.data.timestamp}\n`);
    return true;
  } catch (error) {
    console.log(`❌ Business Collector health check failed: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 2: Connect to Business Collector via MCP
 */
async function testMCPConnection() {
  console.log('Test 2: Connecting to Business Collector via MCP...');
  try {
    const response = await axios.post(`${BASE_URL}/api/mcp/business-collector/connect`, {});
    sessionId = response.data.sessionId;
    console.log('✅ Connected to Business Collector');
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Service Status: ${response.data.serviceStatus}`);
    console.log(`   Version: ${response.data.version}\n`);
    return true;
  } catch (error) {
    console.log(`❌ Connection failed: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 3: Quick Collection (GET endpoint)
 */
async function testQuickCollection() {
  console.log('Test 3: Testing quick collection endpoint...');
  try {
    const response = await axios.get(`${BASE_URL}/api/mcp/business-collector/quick`, {
      params: {
        category: 'Coffee Shops',
        geography: 'Seattle',
        max: 5
      }
    });

    if (response.data.success) {
      console.log('✅ Quick collection successful');
      console.log(`   Found: ${response.data.summary.total} businesses`);
      console.log(`   Category: ${response.data.summary.category}`);
      console.log(`   Geography: ${response.data.summary.geography}`);
      console.log('\n   Sample results:');
      console.log(response.data.displayText || '   (No display text)');
      console.log();
      return true;
    } else {
      console.log(`❌ Quick collection failed: ${response.data.error}\n`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Quick collection error: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 4: Full Collection (POST endpoint with session)
 */
async function testFullCollection() {
  console.log('Test 4: Testing full collection with session...');

  if (!sessionId) {
    console.log('❌ No session ID available. Skipping test.\n');
    return false;
  }

  try {
    const response = await axios.post(`${BASE_URL}/api/mcp/business-collector/collect`, {
      sessionId,
      category: 'Real Estate Agents',
      geography: 'Miami, FL',
      maxResults: 10
    });

    if (response.data.success) {
      console.log('✅ Full collection successful');
      console.log(`   Found: ${response.data.summary.total} businesses`);
      console.log(`   Category: ${response.data.summary.category}`);
      console.log(`   Geography: ${response.data.summary.geography}`);
      console.log(`   Sources: ${response.data.summary.sources_used?.length || 0}`);
      console.log(`   Execution Time: ${response.data.summary.execution_time_seconds}s`);
      console.log('\n   Sample results:');
      console.log(response.data.displayText || '   (No display text)');
      console.log();
      return true;
    } else {
      console.log(`❌ Full collection failed: ${response.data.error}\n`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Full collection error: ${error.message}\n`);
    return false;
  }
}

/**
 * Test 5: AI Copilot Chat with Natural Language
 */
async function testCopilotChat() {
  console.log('Test 5: Testing AI Copilot chat interface...');

  if (!sessionId) {
    console.log('❌ No session ID available. Skipping test.\n');
    return false;
  }

  try {
    const response = await axios.post(`${BASE_URL}/api/mcp/copilot/chat`, {
      sessionId,
      message: 'Collect Dentists in Tampa'
    });

    if (response.data.success) {
      console.log('✅ Copilot chat successful');
      console.log(`   Response: ${response.data.response.substring(0, 200)}...`);
      console.log(`   Suggestions: ${response.data.suggestions.join(', ')}`);
      console.log();
      return true;
    } else {
      console.log(`❌ Copilot chat failed: ${response.data.error}\n`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Copilot chat error: ${error.message}\n`);
    return false;
  }
}

/**
 * Run all tests
 */
async function runTests() {
  const results = [];

  results.push(await testCollectorHealth());
  results.push(await testMCPConnection());
  results.push(await testQuickCollection());
  results.push(await testFullCollection());
  results.push(await testCopilotChat());

  const passed = results.filter(r => r).length;
  const total = results.length;

  console.log('═══════════════════════════════════════');
  console.log(`Test Results: ${passed}/${total} passed`);
  console.log('═══════════════════════════════════════\n');

  if (passed === total) {
    console.log('✅ All tests passed! Business Collector is fully integrated.\n');
    console.log('Next steps:');
    console.log('1. Visit: https://aiagent.ringlypro.com/mcp-copilot');
    console.log('2. Connect to Business Collector');
    console.log('3. Try: "Collect Real Estate Agents in Florida"');
    console.log();
  } else {
    console.log(`⚠️  ${total - passed} test(s) failed. Check the errors above.\n`);
  }

  process.exit(passed === total ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
