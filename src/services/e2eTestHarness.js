/**
 * E2E Test Harness with Self-Healing Loop
 *
 * Orchestrates the complete E2E testing workflow with automatic retry,
 * failure diagnosis, and patch plan generation.
 *
 * Usage:
 *   const harness = require('./e2eTestHarness');
 *   await harness.runWithSelfHealing(clientId, { maxRetries: 3 });
 */

const e2eTestService = require('./e2eTestService');
const logger = require('../utils/logger');

class E2ETestHarness {
  constructor() {
    this.maxRetries = 3;
    this.retryDelayMs = 5000;
    this.currentRun = null;
  }

  /**
   * Sleep helper
   * @param {number} ms
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Run E2E test with self-healing retry loop
   * @param {number} clientId
   * @param {object} options
   * @returns {Promise<object>} Final test results
   */
  async runWithSelfHealing(clientId, options = {}) {
    const maxRetries = options.maxRetries || this.maxRetries;
    const retryDelay = options.retryDelayMs || this.retryDelayMs;

    let attempt = 0;
    let lastResult = null;
    const allResults = [];

    logger.info(`\n${'#'.repeat(70)}`);
    logger.info(`# E2E TEST HARNESS - SELF-HEALING MODE`);
    logger.info(`# Client ID: ${clientId}`);
    logger.info(`# Max Retries: ${maxRetries}`);
    logger.info(`${'#'.repeat(70)}\n`);

    while (attempt < maxRetries) {
      attempt++;
      logger.info(`\n>>> ATTEMPT ${attempt}/${maxRetries} <<<\n`);

      try {
        // Run the full E2E test
        lastResult = await e2eTestService.runFullE2ETest(clientId, options);
        allResults.push(lastResult);

        // Check if successful
        if (lastResult.overallSuccess) {
          logger.info(`\n${'*'.repeat(70)}`);
          logger.info(`* SUCCESS! E2E Test passed on attempt ${attempt}`);
          logger.info(`${'*'.repeat(70)}\n`);

          return {
            success: true,
            attempts: attempt,
            finalResult: lastResult,
            allResults,
            message: `E2E test passed on attempt ${attempt}`
          };
        }

        // Test failed - analyze and log
        logger.warn(`\n[HARNESS] Attempt ${attempt} FAILED with ${lastResult.failureCount} failures`);

        // Log failure summary
        const openFailures = e2eTestService.getOpenFailures();
        if (openFailures.length > 0) {
          logger.warn('[HARNESS] Open Failures:');
          openFailures.forEach((f, i) => {
            logger.warn(`  ${i + 1}. [${f.step}] ${f.symptom}`);
            logger.warn(`     Root cause: ${f.suspected_root_cause}`);
          });
        }

        // Generate and log patch plan
        if (lastResult.patchPlan) {
          logger.info('\n[HARNESS] PATCH PLAN:');
          logger.info(JSON.stringify(lastResult.patchPlan, null, 2));
        }

        // Wait before retry
        if (attempt < maxRetries) {
          logger.info(`\n[HARNESS] Waiting ${retryDelay / 1000}s before retry...`);
          await this.sleep(retryDelay);
        }

      } catch (error) {
        logger.error(`[HARNESS] Unexpected error on attempt ${attempt}:`, error.message);
        allResults.push({ error: error.message, attempt });

        if (attempt < maxRetries) {
          await this.sleep(retryDelay);
        }
      }
    }

    // All retries exhausted
    logger.error(`\n${'!'.repeat(70)}`);
    logger.error(`! E2E TEST FAILED after ${maxRetries} attempts`);
    logger.error(`${'!'.repeat(70)}\n`);

    // Final failure report
    const finalReport = {
      success: false,
      attempts: attempt,
      finalResult: lastResult,
      allResults,
      openFailures: e2eTestService.getOpenFailures(),
      patchPlan: lastResult?.patchPlan,
      message: `E2E test failed after ${maxRetries} attempts`
    };

    // Log detailed failure report
    logger.error('\n[HARNESS] FINAL FAILURE REPORT:');
    logger.error(`Total attempts: ${attempt}`);
    logger.error(`Open failures: ${finalReport.openFailures.length}`);

    if (finalReport.openFailures.length > 0) {
      logger.error('\nFailure Details:');
      finalReport.openFailures.forEach((f, i) => {
        logger.error(`\n--- Failure ${i + 1} ---`);
        logger.error(`Step: ${f.step}`);
        logger.error(`Symptom: ${f.symptom}`);
        logger.error(`Expected: ${f.expected}`);
        logger.error(`Actual: ${f.actual}`);
        logger.error(`Root Cause: ${f.suspected_root_cause}`);
        if (f.endpoint) logger.error(`Endpoint: ${f.endpoint}`);
        if (f.response_code) logger.error(`HTTP Status: ${f.response_code}`);
      });
    }

    if (finalReport.patchPlan) {
      logger.error('\nRECOMMENDED PATCH PLAN:');
      logger.error(JSON.stringify(finalReport.patchPlan, null, 2));
    }

    return finalReport;
  }

  /**
   * Run a single E2E test (no retry)
   * @param {number} clientId
   * @returns {Promise<object>} Test result
   */
  async runSingle(clientId) {
    return e2eTestService.runFullE2ETest(clientId);
  }

  /**
   * Get all failures from the current session
   * @returns {Array} Failure log
   */
  getFailures() {
    return e2eTestService.getFailureLog();
  }

  /**
   * Get open (unfixed) failures
   * @returns {Array} Open failures
   */
  getOpenFailures() {
    return e2eTestService.getOpenFailures();
  }

  /**
   * Clear failure log
   */
  async clearFailures() {
    return e2eTestService.clearFailureLog();
  }

  /**
   * Generate a human-readable test report
   * @param {object} results
   * @returns {string} Report text
   */
  generateReport(results) {
    const lines = [];
    lines.push('═'.repeat(70));
    lines.push('E2E TEST REPORT');
    lines.push('═'.repeat(70));
    lines.push('');
    lines.push(`Status: ${results.success ? '✅ PASSED' : '❌ FAILED'}`);
    lines.push(`Attempts: ${results.attempts}`);
    lines.push(`Message: ${results.message}`);
    lines.push('');

    if (results.finalResult) {
      lines.push('─'.repeat(40));
      lines.push('STEP RESULTS:');
      lines.push('─'.repeat(40));

      results.finalResult.steps.forEach((step, i) => {
        const icon = step.success ? '✅' : '❌';
        lines.push(`${i + 1}. ${icon} ${step.step}`);
        if (!step.success && step.error) {
          lines.push(`   Error: ${step.error}`);
        }
      });
    }

    if (results.openFailures && results.openFailures.length > 0) {
      lines.push('');
      lines.push('─'.repeat(40));
      lines.push('OPEN FAILURES:');
      lines.push('─'.repeat(40));

      results.openFailures.forEach((f, i) => {
        lines.push(`\n${i + 1}. ${f.step}`);
        lines.push(`   Symptom: ${f.symptom}`);
        lines.push(`   Root Cause: ${f.suspected_root_cause}`);
      });
    }

    if (results.patchPlan) {
      lines.push('');
      lines.push('─'.repeat(40));
      lines.push('PATCH PLAN:');
      lines.push('─'.repeat(40));
      lines.push(`Root Cause: ${results.patchPlan.root_cause}`);
      lines.push(`Files to Edit: ${results.patchPlan.files_to_edit.join(', ')}`);
      lines.push('Logic Changes:');
      results.patchPlan.logic_changes.forEach(c => lines.push(`  - ${c}`));
      lines.push(`Acceptance Test: ${results.patchPlan.acceptance_test}`);
    }

    lines.push('');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * Interactive test runner for CLI
   * @param {number} clientId
   */
  async runInteractive(clientId) {
    console.log('\n🧪 E2E Test Harness - Interactive Mode\n');

    const results = await this.runWithSelfHealing(clientId);
    const report = this.generateReport(results);

    console.log('\n' + report);

    return results;
  }
}

module.exports = new E2ETestHarness();
