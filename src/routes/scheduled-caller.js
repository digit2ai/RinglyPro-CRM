// Scheduled Caller Routes - API endpoints for automated prospect calling
const express = require('express');
const router = express.Router();
const scheduledAutoCallerService = require('../services/scheduled-auto-caller');
const logger = require('../utils/logger');

/**
 * POST /api/scheduled-caller/start
 * Start the automated calling scheduler
 */
router.post('/start', async (req, res) => {
  try {
    const { clientId, location, category } = req.body;

    logger.info(`🚀 Starting scheduled auto-caller (clientId: ${clientId || 'all'})`);

    const result = await scheduledAutoCallerService.start(clientId, {
      location,
      category
    });

    res.json(result);

  } catch (error) {
    logger.error('Error starting scheduler:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/scheduled-caller/pause
 * Pause the scheduler (maintains queue position)
 */
router.post('/pause', (req, res) => {
  try {
    const result = scheduledAutoCallerService.pause();
    res.json(result);

  } catch (error) {
    logger.error('Error pausing scheduler:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/scheduled-caller/resume
 * Resume the scheduler from paused state
 */
router.post('/resume', async (req, res) => {
  try {
    const result = await scheduledAutoCallerService.resume();
    res.json(result);

  } catch (error) {
    logger.error('Error resuming scheduler:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/scheduled-caller/stop
 * Stop the scheduler completely
 */
router.post('/stop', (req, res) => {
  try {
    const result = scheduledAutoCallerService.stop();
    res.json(result);

  } catch (error) {
    logger.error('Error stopping scheduler:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/scheduled-caller/status
 * Get current scheduler status
 */
router.get('/status', async (req, res) => {
  try {
    const status = await scheduledAutoCallerService.getStatus();
    res.json({
      success: true,
      ...status
    });

  } catch (error) {
    logger.error('Error getting scheduler status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/scheduled-caller/config
 * Update scheduler configuration
 */
router.post('/config', (req, res) => {
  try {
    const { schedule, timezone, minInterval, maxCallsPerHour, maxCallsPerDay } = req.body;

    const result = scheduledAutoCallerService.updateConfig({
      schedule,
      timezone,
      minInterval,
      maxCallsPerHour,
      maxCallsPerDay
    });

    res.json(result);

  } catch (error) {
    logger.error('Error updating scheduler config:', error);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
