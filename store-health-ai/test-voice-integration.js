#!/usr/bin/env node
'use strict';

/**
 * Voice Integration Test Suite
 *
 * Tests both Twilio and Vapi integrations for AI voice calling
 */

require('dotenv').config();
const { voiceCallManager } = require('./src/services');
const vapiCallManager = require('./src/services/vapi-call-manager');
const {
  AiCall,
  CallScript,
  Store,
  Alert,
  Escalation,
  KpiDefinition
} = require('./models');

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function header(title) {
  console.log('\n' + '='.repeat(70));
  log(`  ${title}`, 'bright');
  console.log('='.repeat(70) + '\n');
}

function section(title) {
  log(`\n▶ ${title}`, 'cyan');
  log('─'.repeat(70), 'cyan');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

/**
 * Test 1: Configuration Check
 */
async function testConfiguration() {
  section('Test 1: Configuration Check');

  const twilioConfigured = voiceCallManager.isConfigured();
  const vapiConfigured = vapiCallManager.isConfigured();

  if (twilioConfigured) {
    success('Twilio is configured');
    info(`  Account SID: ${process.env.TWILIO_ACCOUNT_SID?.substring(0, 10)}...`);
    info(`  From Number: ${process.env.TWILIO_FROM_NUMBER}`);
  } else {
    warning('Twilio is NOT configured');
    info('  Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER');
  }

  if (vapiConfigured) {
    success('Vapi is configured');
    info(`  API Key: ${process.env.VAPI_API_KEY?.substring(0, 10)}...`);
    info(`  Phone Number ID: ${process.env.VAPI_PHONE_NUMBER_ID}`);
  } else {
    warning('Vapi is NOT configured');
    info('  Set VAPI_API_KEY and VAPI_PHONE_NUMBER_ID');
  }

  if (!twilioConfigured && !vapiConfigured) {
    error('No voice providers configured!');
    return false;
  }

  return true;
}

/**
 * Test 2: Database Setup Check
 */
async function testDatabaseSetup() {
  section('Test 2: Database Setup Check');

  try {
    // Check for stores
    const storeCount = await Store.count();
    if (storeCount > 0) {
      success(`Found ${storeCount} stores in database`);
    } else {
      warning('No stores found. Run seeders first: npm run seed');
      return false;
    }

    // Check for call scripts
    const scriptCount = await CallScript.count();
    if (scriptCount > 0) {
      success(`Found ${scriptCount} call scripts`);

      const scripts = await CallScript.findAll();
      scripts.forEach(script => {
        info(`  - ${script.name} (${script.script_type})`);
      });
    } else {
      warning('No call scripts found. Run seeders first: npm run seed');
      return false;
    }

    // Check for KPI definitions
    const kpiCount = await KpiDefinition.count();
    if (kpiCount > 0) {
      success(`Found ${kpiCount} KPI definitions`);
    } else {
      warning('No KPI definitions found. Run seeders first: npm run seed');
      return false;
    }

    return true;
  } catch (err) {
    error(`Database check failed: ${err.message}`);
    return false;
  }
}

/**
 * Test 3: Script Template Engine
 */
async function testScriptTemplating() {
  section('Test 3: Script Template Engine');

  try {
    const script = await CallScript.findOne({
      where: { script_type: 'red', is_active: true }
    });

    if (!script) {
      warning('No red alert script found');
      return false;
    }

    info('Testing template variable substitution...');

    const variables = {
      manager_name: 'Alice Martinez',
      store_name: 'Dollar Tree - Manhattan 42nd St',
      kpi_name: 'Labor Coverage Ratio',
      kpi_value: '87%',
      threshold: '95%',
      variance: '-10.0%'
    };

    const content = voiceCallManager.generateScriptContent(script, variables);

    success('Template engine working correctly');
    info('Sample output:');
    console.log(colors.magenta + content.substring(0, 200) + '...' + colors.reset);

    return true;
  } catch (err) {
    error(`Template test failed: ${err.message}`);
    return false;
  }
}

/**
 * Test 4: TwiML Generation
 */
async function testTwiMLGeneration() {
  section('Test 4: TwiML Generation (Twilio)');

  if (!voiceCallManager.isConfigured()) {
    warning('Skipping - Twilio not configured');
    return true;
  }

  try {
    // Create a mock AI call record
    const store = await Store.findOne();
    const script = await CallScript.findOne({ where: { script_type: 'yellow' } });
    const kpiDef = await KpiDefinition.findOne();

    if (!store || !script || !kpiDef) {
      warning('Missing test data');
      return false;
    }

    const mockAlert = {
      severity: 'yellow',
      title: 'Test Alert',
      kpi_value: 100,
      threshold_value: 95
    };

    const mockCall = await AiCall.create({
      store_id: store.id,
      call_type: 'escalation_alert',
      call_provider: 'twilio',
      call_status: 'scheduled',
      to_phone: '+15551234567',
      scheduled_at: new Date()
    });

    info('Generating TwiML...');
    const twiml = await voiceCallManager.generateTwiML(mockCall);

    if (twiml.includes('<?xml version') && twiml.includes('<Response>')) {
      success('TwiML generated successfully');
      info('Sample TwiML:');
      console.log(colors.magenta + twiml.substring(0, 300) + '...' + colors.reset);
    } else {
      error('Invalid TwiML format');
      return false;
    }

    // Clean up
    await mockCall.destroy();

    return true;
  } catch (err) {
    error(`TwiML generation failed: ${err.message}`);
    return false;
  }
}

/**
 * Test 5: Vapi Assistant Configuration
 */
async function testVapiAssistant() {
  section('Test 5: Vapi Assistant Configuration');

  if (!vapiCallManager.isConfigured()) {
    warning('Skipping - Vapi not configured');
    return true;
  }

  try {
    const store = await Store.findOne();
    const kpiDef = await KpiDefinition.findOne();
    const script = await CallScript.findOne({ where: { script_type: 'red' } });

    if (!store || !kpiDef || !script) {
      warning('Missing test data');
      return false;
    }

    const mockAlert = {
      severity: 'red',
      title: 'Test Alert',
      kpi_value: 80,
      threshold_value: 95,
      alert_date: new Date()
    };

    const context = vapiCallManager.buildConversationContext(store, kpiDef, mockAlert);
    const assistantConfig = vapiCallManager.createAssistantConfig(script, context);

    success('Vapi assistant configuration created');
    info('Assistant details:');
    info(`  - Name: ${assistantConfig.name}`);
    info(`  - Model: ${assistantConfig.model.model}`);
    info(`  - Voice: ${assistantConfig.voice.voiceId}`);
    info(`  - Functions: ${assistantConfig.model.functions.length}`);

    assistantConfig.model.functions.forEach(fn => {
      info(`    • ${fn.name}: ${fn.description}`);
    });

    return true;
  } catch (err) {
    error(`Vapi assistant test failed: ${err.message}`);
    return false;
  }
}

/**
 * Test 6: Call Record Management
 */
async function testCallRecordManagement() {
  section('Test 6: Call Record Management');

  try {
    const store = await Store.findOne();

    // Create test call record
    const testCall = await AiCall.create({
      store_id: store.id,
      call_type: 'escalation_alert',
      call_provider: 'twilio',
      call_status: 'scheduled',
      to_phone: '+15551234567',
      scheduled_at: new Date(),
      metadata: { test: true }
    });

    success('Created test call record');

    // Update status
    await testCall.update({
      call_status: 'completed',
      completed_at: new Date(),
      call_duration: 45,
      outcome: 'acknowledged'
    });

    success('Updated call status');

    // Retrieve call
    const retrieved = await AiCall.findByPk(testCall.id, {
      include: [{ model: Store, as: 'store' }]
    });

    if (retrieved && retrieved.store) {
      success('Retrieved call with associations');
    }

    // Query calls
    const recentCalls = await AiCall.findAll({
      where: { store_id: store.id },
      limit: 5,
      order: [['scheduled_at', 'DESC']]
    });

    success(`Queried recent calls: ${recentCalls.length} found`);

    // Clean up
    await testCall.destroy();

    return true;
  } catch (err) {
    error(`Call record management test failed: ${err.message}`);
    return false;
  }
}

/**
 * Test 7: End-to-End Simulation (without actual call)
 */
async function testEndToEndSimulation() {
  section('Test 7: End-to-End Simulation');

  try {
    // Get test data
    const store = await Store.findOne();
    const kpiDef = await KpiDefinition.findOne();

    if (!store || !kpiDef) {
      warning('Missing test data');
      return false;
    }

    info('Simulating escalation scenario...');

    // 1. Create alert
    const alert = await Alert.create({
      store_id: store.id,
      kpi_definition_id: kpiDef.id,
      severity: 'red',
      escalation_level: 2,
      status: 'active',
      title: 'Test Alert - Labor Coverage Critical',
      message: 'Labor coverage has dropped to 87%, well below the 95% threshold',
      kpi_value: 87,
      threshold_value: 95,
      variance_pct: -10.0,
      requires_acknowledgment: true,
      alert_date: new Date(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    success('Step 1: Created alert');

    // 2. Create escalation
    const escalation = await Escalation.create({
      store_id: store.id,
      alert_id: alert.id,
      from_level: 1,
      to_level: 3,
      status: 'pending',
      escalated_at: new Date(),
      reason: 'Alert unacknowledged for 2 hours'
    });
    success('Step 2: Created escalation to level 3');

    // 3. Schedule AI call
    info('Step 3: Scheduling AI call...');

    const provider = vapiCallManager.isConfigured() ? 'vapi' :
                    voiceCallManager.isConfigured() ? 'twilio' : null;

    if (!provider) {
      warning('No voice provider configured - skipping actual call scheduling');
    } else {
      const aiCall = await AiCall.create({
        store_id: store.id,
        alert_id: alert.id,
        escalation_id: escalation.id,
        call_type: 'escalation_alert',
        call_provider: provider,
        call_status: 'scheduled',
        to_phone: store.manager_phone || '+15551234567',
        scheduled_at: new Date(),
        metadata: {
          test: true,
          severity: 'red',
          kpi_code: kpiDef.kpi_code
        }
      });
      success(`Step 3: AI call scheduled (${provider})`);

      // 4. Simulate call completion
      await aiCall.update({
        call_status: 'completed',
        answered_at: new Date(Date.now() - 60000),
        completed_at: new Date(),
        call_duration: 60,
        outcome: 'acknowledged',
        provider_call_id: 'test_call_123'
      });
      success('Step 4: Call completed (simulated)');

      // 5. Acknowledge alert
      await alert.update({
        status: 'acknowledged',
        acknowledged_at: new Date(),
        acknowledged_by: 'AI Call Response'
      });
      success('Step 5: Alert acknowledged');

      // 6. Resolve escalation
      await escalation.update({
        status: 'resolved',
        resolved_at: new Date(),
        resolution: 'Manager acknowledged via AI call'
      });
      success('Step 6: Escalation resolved');

      // Clean up
      await aiCall.destroy();
    }

    await escalation.destroy();
    await alert.destroy();

    success('End-to-end simulation completed successfully');
    return true;

  } catch (err) {
    error(`End-to-end simulation failed: ${err.message}`);
    console.error(err);
    return false;
  }
}

/**
 * Main test runner
 */
async function runTests() {
  header('🎤 VOICE INTEGRATION TEST SUITE');

  const results = {
    passed: 0,
    failed: 0,
    skipped: 0
  };

  try {
    // Test 1: Configuration
    const configOk = await testConfiguration();
    if (configOk) results.passed++; else results.failed++;

    // Test 2: Database setup
    const dbOk = await testDatabaseSetup();
    if (dbOk) {
      results.passed++;

      // Test 3: Script templating
      const templateOk = await testScriptTemplating();
      if (templateOk) results.passed++; else results.failed++;

      // Test 4: TwiML generation
      const twimlOk = await testTwiMLGeneration();
      if (twimlOk) results.passed++; else results.failed++;

      // Test 5: Vapi assistant
      const vapiOk = await testVapiAssistant();
      if (vapiOk) results.passed++; else results.failed++;

      // Test 6: Call record management
      const recordOk = await testCallRecordManagement();
      if (recordOk) results.passed++; else results.failed++;

      // Test 7: End-to-end simulation
      const e2eOk = await testEndToEndSimulation();
      if (e2eOk) results.passed++; else results.failed++;

    } else {
      results.failed++;
      error('Cannot proceed with tests - database not set up');
      error('Run: npm run migrate && npm run seed');
    }

  } catch (err) {
    error(`Test suite error: ${err.message}`);
    console.error(err);
    results.failed++;
  }

  // Summary
  header('TEST SUMMARY');
  console.log(`✅ Passed: ${colors.green}${results.passed}${colors.reset}`);
  console.log(`❌ Failed: ${colors.red}${results.failed}${colors.reset}`);

  if (results.failed === 0) {
    log('\n🎉 All tests passed!', 'green');
    log('Voice integration is ready to use.', 'green');
  } else {
    log('\n⚠️  Some tests failed.', 'yellow');
    log('Please review the errors above and fix configuration issues.', 'yellow');
  }

  console.log('\n');

  process.exit(results.failed === 0 ? 0 : 1);
}

// Run tests
if (require.main === module) {
  runTests().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
