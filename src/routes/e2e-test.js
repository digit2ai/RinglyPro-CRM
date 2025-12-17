/**
 * E2E Test Routes
 *
 * API endpoints for running and managing E2E tests for the
 * WhatsApp → HubSpot → RinglyPro booking flow.
 *
 * Base path: /api/e2e-test
 */

const express = require('express');
const router = express.Router();
const e2eTestService = require('../services/e2eTestService');
const e2eTestHarness = require('../services/e2eTestHarness');

// Simple auth middleware - restrict to admin users
const requireTestAuth = (req, res, next) => {
  // Check for API key or admin session
  const apiKey = req.headers['x-test-api-key'];
  const expectedKey = process.env.E2E_TEST_API_KEY || 'e2e-test-key-dev';

  if (apiKey === expectedKey || req.session?.user?.role === 'admin') {
    return next();
  }

  // In development, allow without auth
  if (process.env.NODE_ENV === 'development') {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Test API authentication required',
    hint: 'Set X-Test-API-Key header or use admin session'
  });
};

/**
 * POST /api/e2e-test/run
 * Run a single E2E test
 * Body: { clientId }
 */
router.post('/run', requireTestAuth, async (req, res) => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'clientId is required'
      });
    }

    console.log(`[E2E-TEST API] Running single test for client ${clientId}`);
    const result = await e2eTestHarness.runSingle(clientId);

    res.json({
      success: result.overallSuccess,
      result
    });
  } catch (error) {
    console.error('[E2E-TEST API] Run error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/e2e-test/run-healing
 * Run E2E test with self-healing retry loop
 * Body: { clientId, maxRetries?, retryDelayMs? }
 */
router.post('/run-healing', requireTestAuth, async (req, res) => {
  try {
    const { clientId, maxRetries, retryDelayMs } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'clientId is required'
      });
    }

    console.log(`[E2E-TEST API] Running self-healing test for client ${clientId}`);
    const result = await e2eTestHarness.runWithSelfHealing(clientId, {
      maxRetries: maxRetries || 3,
      retryDelayMs: retryDelayMs || 5000
    });

    res.json({
      success: result.success,
      result,
      report: e2eTestHarness.generateReport(result)
    });
  } catch (error) {
    console.error('[E2E-TEST API] Run-healing error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/e2e-test/failures
 * Get all logged failures
 */
router.get('/failures', requireTestAuth, async (req, res) => {
  try {
    await e2eTestService.initialize();
    const failures = e2eTestService.getFailureLog();

    res.json({
      success: true,
      count: failures.length,
      failures
    });
  } catch (error) {
    console.error('[E2E-TEST API] Get failures error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/e2e-test/failures/open
 * Get open (unfixed) failures
 */
router.get('/failures/open', requireTestAuth, async (req, res) => {
  try {
    await e2eTestService.initialize();
    const openFailures = e2eTestService.getOpenFailures();

    res.json({
      success: true,
      count: openFailures.length,
      openFailures
    });
  } catch (error) {
    console.error('[E2E-TEST API] Get open failures error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/e2e-test/failures
 * Clear all failures (for testing)
 */
router.delete('/failures', requireTestAuth, async (req, res) => {
  try {
    await e2eTestService.clearFailureLog();

    res.json({
      success: true,
      message: 'Failure log cleared'
    });
  } catch (error) {
    console.error('[E2E-TEST API] Clear failures error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/e2e-test/step/:step
 * Run a specific test step
 * Params: step (connection, upsert, availability, booking, confirmation)
 * Body: { clientId, ...stepParams }
 */
router.post('/step/:step', requireTestAuth, async (req, res) => {
  try {
    const { step } = req.params;
    const { clientId, ...params } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'clientId is required'
      });
    }

    await e2eTestService.initialize();
    let result;

    switch (step) {
      case 'connection':
        result = await e2eTestService.stepTestConnection(clientId);
        break;
      case 'upsert':
        result = await e2eTestService.stepHubSpotUpsert(clientId, params.contactData);
        break;
      case 'availability':
        result = await e2eTestService.stepAvailability(clientId);
        break;
      case 'booking':
        if (!params.slot) {
          return res.status(400).json({
            success: false,
            error: 'slot is required for booking step'
          });
        }
        result = await e2eTestService.stepBooking(clientId, params.slot, params.contactData);
        break;
      case 'confirmation':
        if (!params.bookingId) {
          return res.status(400).json({
            success: false,
            error: 'bookingId is required for confirmation step'
          });
        }
        result = await e2eTestService.stepConfirmation(clientId, params.bookingId);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: `Unknown step: ${step}`,
          validSteps: ['connection', 'upsert', 'availability', 'booking', 'confirmation']
        });
    }

    res.json({
      success: result.success,
      step,
      result
    });
  } catch (error) {
    console.error(`[E2E-TEST API] Step ${req.params.step} error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/e2e-test/status
 * Get test service status
 */
router.get('/status', requireTestAuth, async (req, res) => {
  try {
    await e2eTestService.initialize();
    const failures = e2eTestService.getFailureLog();
    const openFailures = e2eTestService.getOpenFailures();

    res.json({
      success: true,
      status: 'ready',
      totalFailures: failures.length,
      openFailures: openFailures.length,
      lastFailure: failures.length > 0 ? failures[failures.length - 1] : null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message
    });
  }
});

module.exports = router;
