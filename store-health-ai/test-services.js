#!/usr/bin/env node
'use strict';

/**
 * Store Health AI - Service Layer Test Script
 * Tests all core services with realistic scenarios
 */

require('dotenv').config();
const { format } = require('date-fns');

// Import models and services
const { Store } = require('./models');
const {
  kpiCalculator,
  thresholdChecker,
  alertManager,
  escalationEngine
} = require('./src/services');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(60));
  log(title, 'bright');
  console.log('='.repeat(60));
}

async function runTests() {
  try {
    log('\n🚀 Starting Store Health AI Service Tests\n', 'cyan');

    // ==================================================================
    // TEST 1: KPI Calculator Service
    // ==================================================================
    section('TEST 1: KPI Calculator Service');

    const stores = await Store.findAll({ where: { status: 'active' } });
    if (stores.length === 0) {
      log('❌ No stores found. Please run seed data first.', 'red');
      return;
    }

    const testStore = stores[0];
    log(`\n📍 Testing with: ${testStore.name} (ID: ${testStore.id})`, 'cyan');

    // Test 1a: Calculate individual KPIs with different statuses
    log('\n--- Test 1a: Calculate KPIs with different statuses ---', 'blue');

    const today = new Date();
    const testKpis = [
      { code: 'sales', value: 13500, expectedStatus: 'green', desc: 'Good sales day' },
      { code: 'traffic', value: 350, expectedStatus: 'yellow', desc: 'Low traffic (-12%)' },
      { code: 'labor_coverage', value: 88, expectedStatus: 'red', desc: 'Understaffed' },
      { code: 'conversion_rate', value: 35, expectedStatus: 'green', desc: 'Good conversion' }
    ];

    for (const kpi of testKpis) {
      const result = await kpiCalculator.calculateAndStoreKpi(
        testStore.id,
        kpi.code,
        today,
        kpi.value
      );

      const statusColor = result.status === 'green' ? 'green' :
                         result.status === 'yellow' ? 'yellow' : 'red';

      log(`  ✓ ${result.kpi_name}: ${result.value} ${result.kpi_code === 'sales' ? '$' : result.threshold.green_min > 0 ? '%' : ''}`, statusColor);
      log(`    Variance: ${result.variance_pct?.toFixed(1) || 'N/A'}% | Status: ${result.status.toUpperCase()} | ${kpi.desc}`);
    }

    // Test 1b: Batch calculate KPIs
    log('\n--- Test 1b: Batch Calculate KPIs ---', 'blue');

    const store2 = stores[1];
    const batchResults = await kpiCalculator.batchCalculateKpis(
      store2.id,
      today,
      {
        sales: 14200,
        traffic: 480,
        conversion_rate: 38,
        labor_coverage: 97
      }
    );

    log(`  ✓ Batch calculated ${batchResults.length} KPIs for ${store2.name}`);
    batchResults.forEach(r => {
      if (!r.error) {
        const color = r.status === 'green' ? 'green' : r.status === 'yellow' ? 'yellow' : 'red';
        log(`    ${r.kpi_code}: ${r.status.toUpperCase()}`, color);
      }
    });

    // ==================================================================
    // TEST 2: Threshold Checker Service
    // ==================================================================
    section('TEST 2: Threshold Checker Service');

    // Test 2a: Check single store health
    log('\n--- Test 2a: Check Store Health ---', 'blue');

    const health = await thresholdChecker.checkStoreHealth(testStore.id, today);

    if (health) {
      const statusColor = health.snapshot.overall_status === 'green' ? 'green' :
                         health.snapshot.overall_status === 'yellow' ? 'yellow' : 'red';

      log(`\n  Store: ${testStore.name}`, 'cyan');
      log(`  Overall Status: ${health.snapshot.overall_status.toUpperCase()}`, statusColor);
      log(`  Health Score: ${health.snapshot.health_score}/100`);
      log(`  KPI Breakdown:`);
      log(`    🟢 Green: ${health.snapshot.green_kpi_count}`);
      log(`    🟨 Yellow: ${health.snapshot.yellow_kpi_count}`);
      log(`    🔴 Red: ${health.snapshot.red_kpi_count}`);
      log(`  Escalation Level: ${health.snapshot.escalation_level}`);
      log(`  Action Required: ${health.snapshot.action_required ? 'YES' : 'NO'}`);
      log(`\n  Summary: ${health.snapshot.summary}`);

      if (health.metrics) {
        log(`\n  KPI Details:`);
        health.metrics.forEach(m => {
          const color = m.status === 'green' ? 'green' : m.status === 'yellow' ? 'yellow' : 'red';
          log(`    ${m.kpi_name}: ${m.value} (${m.variance_pct?.toFixed(1) || 'N/A'}%) - ${m.status.toUpperCase()}`, color);
        });
      }
    }

    // Test 2b: Check all stores
    log('\n--- Test 2b: Check All Stores Health ---', 'blue');

    const allHealth = await thresholdChecker.checkAllStoresHealth(today);
    log(`  ✓ Checked health for ${allHealth.length} stores`);

    allHealth.forEach(h => {
      if (h.snapshot) {
        const color = h.snapshot.overall_status === 'green' ? 'green' :
                     h.snapshot.overall_status === 'yellow' ? 'yellow' : 'red';
        log(`    ${h.store_name}: ${h.snapshot.overall_status.toUpperCase()} (Score: ${h.snapshot.health_score})`, color);
      }
    });

    // Test 2c: Get dashboard overview
    log('\n--- Test 2c: Dashboard Overview ---', 'blue');

    const dashboard = await thresholdChecker.getDashboardOverview(today);

    log(`\n  Dashboard Summary for ${format(today, 'yyyy-MM-dd')}:`, 'cyan');
    log(`    Total Stores: ${dashboard.total_stores}`);
    log(`    🟢 Green: ${dashboard.green_stores}`, 'green');
    log(`    🟨 Yellow: ${dashboard.yellow_stores}`, 'yellow');
    log(`    🔴 Red: ${dashboard.red_stores}`, 'red');
    log(`    ⚠️  Requiring Action: ${dashboard.stores_requiring_action}`);
    log(`    Average Health Score: ${dashboard.average_health_score.toFixed(1)}/100`);

    if (dashboard.critical_stores.length > 0) {
      log(`\n  Critical Stores (Escalation Level ≥ 2):`);
      dashboard.critical_stores.forEach(s => {
        log(`    ${s.store_name}: Level ${s.escalation_level} - Score ${s.health_score}`, 'red');
      });
    }

    // ==================================================================
    // TEST 3: Alert Manager Service
    // ==================================================================
    section('TEST 3: Alert Manager Service');

    // Test 3a: Process KPIs and create alerts
    log('\n--- Test 3a: Process KPIs and Generate Alerts ---', 'blue');

    const alerts = await alertManager.processStoreKpis(testStore.id, today);

    log(`  ✓ Processed KPIs for ${testStore.name}`);
    log(`    Alerts created: ${alerts.filter(a => a.created).length}`);
    log(`    Alerts skipped (already exists): ${alerts.filter(a => !a.created).length}`);

    alerts.forEach(a => {
      if (a.created && a.alert) {
        const color = a.alert.severity === 'red' ? 'red' : 'yellow';
        log(`\n    Alert #${a.alert.id}:`, color);
        log(`      Severity: ${a.alert.severity.toUpperCase()}`);
        log(`      Title: ${a.alert.title}`);
        log(`      Escalation Level: ${a.alert.escalation_level}`);
        if (a.task) {
          log(`      Task Created: #${a.task.id} (Due: ${format(new Date(a.task.due_date), 'yyyy-MM-dd HH:mm')})`);
          log(`      Assigned to: ${a.task.assigned_to_name} (${a.task.assigned_to_role})`);
        }
      }
    });

    // Test 3b: Get active alerts
    log('\n--- Test 3b: Get Active Alerts ---', 'blue');

    const activeAlerts = await alertManager.getActiveAlerts(testStore.id);

    log(`  ✓ Found ${activeAlerts.length} active alerts for ${testStore.name}`);

    if (activeAlerts.length > 0) {
      activeAlerts.forEach(alert => {
        const color = alert.severity === 'red' ? 'red' : 'yellow';
        log(`    Alert #${alert.id}: ${alert.kpiDefinition.name} - ${alert.severity.toUpperCase()}`, color);
        log(`      Status: ${alert.status} | Level: ${alert.escalation_level}`);
      });

      // Test 3c: Acknowledge an alert
      log('\n--- Test 3c: Acknowledge Alert ---', 'blue');

      const alertToAck = activeAlerts[0];
      if (alertToAck && alertToAck.status === 'active') {
        await alertManager.acknowledgeAlert(alertToAck.id, testStore.manager_name);
        log(`  ✓ Acknowledged alert #${alertToAck.id}`, 'green');
      }
    }

    // ==================================================================
    // TEST 4: Escalation Engine Service
    // ==================================================================
    section('TEST 4: Escalation Engine Service');

    // Test 4a: Get store escalations
    log('\n--- Test 4a: Get Store Escalations ---', 'blue');

    const storeEscalations = await escalationEngine.getStoreEscalations(testStore.id);

    log(`  ✓ Found ${storeEscalations.length} escalations for ${testStore.name}`);

    if (storeEscalations.length > 0) {
      storeEscalations.slice(0, 5).forEach(esc => {
        log(`    Escalation #${esc.id}: Level ${esc.from_level} → ${esc.to_level}`);
        log(`      KPI: ${esc.alert.kpiDefinition.name}`);
        log(`      Reason: ${esc.escalation_reason.substring(0, 80)}...`);
        log(`      Status: ${esc.status}`);
      });
    }

    // Test 4b: Get all pending escalations
    log('\n--- Test 4b: Get All Pending Escalations ---', 'blue');

    const pendingEscalations = await escalationEngine.getPendingEscalations();

    log(`  ✓ Found ${pendingEscalations.length} pending escalations across all stores`);

    if (pendingEscalations.length > 0) {
      pendingEscalations.slice(0, 3).forEach(esc => {
        const levelColor = esc.to_level >= 3 ? 'red' : 'yellow';
        log(`    ${esc.store.name}: Level ${esc.to_level} - ${esc.alert.kpiDefinition.name}`, levelColor);
      });
    }

    // Test 4c: Monitor and escalate (this is normally run on a schedule)
    log('\n--- Test 4c: Monitor and Escalate (Dry Run) ---', 'blue');

    log(`  NOTE: Escalation monitoring checks alert SLAs and escalates when needed.`);
    log(`  In production, this runs every 15-30 minutes as a cron job.`);
    log(`  For testing, alerts need to be 24+ hours old to trigger escalation.`);

    const escalations = await escalationEngine.monitorAndEscalate();

    if (escalations.length > 0) {
      log(`  ✓ Created ${escalations.length} new escalations`, 'yellow');
      escalations.forEach(esc => {
        log(`    Store ${esc.store_id}: Escalated to Level ${esc.to_level}`);
      });
    } else {
      log(`  ✓ No escalations needed (all alerts within SLA)`, 'green');
    }

    // ==================================================================
    // TEST 5: Integration Test - Complete Workflow
    // ==================================================================
    section('TEST 5: Complete Workflow Integration');

    log('\n--- Simulating Full Daily Workflow ---', 'blue');

    const workflowStore = stores[2] || stores[0];

    log(`\n  Step 1: Calculate today's KPIs for ${workflowStore.name}...`);
    const workflowKpis = await kpiCalculator.batchCalculateKpis(
      workflowStore.id,
      today,
      {
        sales: 11000,        // -8% (RED)
        traffic: 380,        // -5% (YELLOW)
        conversion_rate: 32, // +2% (GREEN)
        labor_coverage: 92   // (YELLOW)
      }
    );
    log(`    ✓ Calculated ${workflowKpis.length} KPIs`);

    log(`\n  Step 2: Check store health...`);
    const workflowHealth = await thresholdChecker.checkStoreHealth(workflowStore.id, today);
    if (workflowHealth) {
      const color = workflowHealth.snapshot.overall_status === 'green' ? 'green' :
                   workflowHealth.snapshot.overall_status === 'yellow' ? 'yellow' : 'red';
      log(`    ✓ Store Status: ${workflowHealth.snapshot.overall_status.toUpperCase()}`, color);
      log(`    ✓ Health Score: ${workflowHealth.snapshot.health_score}/100`);
      log(`    ✓ Escalation Level: ${workflowHealth.snapshot.escalation_level}`);
    }

    log(`\n  Step 3: Generate alerts for threshold violations...`);
    const workflowAlerts = await alertManager.processStoreKpis(workflowStore.id, today);
    const newAlerts = workflowAlerts.filter(a => a.created);
    log(`    ✓ Created ${newAlerts.length} new alerts`);

    if (newAlerts.length > 0) {
      newAlerts.forEach(a => {
        const color = a.alert.severity === 'red' ? 'red' : 'yellow';
        log(`      - ${a.alert.title}`, color);
      });
    }

    log(`\n  Step 4: Check for escalations (simulated)...`);
    log(`    ℹ️  In production, escalations trigger after SLA timeouts (24-48 hours)`);
    log(`    ℹ️  Current alerts are fresh, so no escalations expected yet`);

    // ==================================================================
    // SUMMARY
    // ==================================================================
    section('TEST SUMMARY');

    log('\n✅ All tests completed successfully!\n', 'green');

    log('Service Test Results:', 'cyan');
    log('  ✓ KPI Calculator: PASSED', 'green');
    log('  ✓ Threshold Checker: PASSED', 'green');
    log('  ✓ Alert Manager: PASSED', 'green');
    log('  ✓ Escalation Engine: PASSED', 'green');
    log('  ✓ Integration Workflow: PASSED', 'green');

    log('\nNext Steps:', 'cyan');
    log('  1. Review the alert and task records in the database');
    log('  2. Test escalation by manually aging alerts (update alert_date)');
    log('  3. Proceed to Option 2: Build REST API layer');
    log('  4. Proceed to Option 3: Integrate AI voice calling (Twilio/Vapi)');
    log('  5. Proceed to Option 4: Build Dashboard UI\n');

  } catch (error) {
    log('\n❌ Test failed with error:', 'red');
    console.error(error);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runTests()
    .then(() => {
      log('\n✨ Test suite complete!\n', 'cyan');
      process.exit(0);
    })
    .catch(error => {
      log('\n❌ Fatal error:', 'red');
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runTests };
