// Scheduled Caller Routes - API endpoints for automated prospect calling
const express = require('express');
const router = express.Router();
const scheduledAutoCallerService = require('../services/scheduled-auto-caller');
const logger = require('../utils/logger');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

/**
 * POST /api/scheduled-caller/start
 * Start the automated calling scheduler
 */
router.post('/start', async (req, res) => {
  try {
    const { clientId, location, category } = req.body;

    logger.info(`🚀 Starting scheduled auto-caller (clientId: ${clientId || 'all'})`);

    // If already running, stop it first
    if (scheduledAutoCallerService.isRunning) {
      logger.info('⏹️ Stopping existing scheduler before starting new one');
      scheduledAutoCallerService.stop();
    }

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

/**
 * GET /api/scheduled-caller/prospects
 * Get list of prospects from database
 * Query params: status, clientId (REQUIRED), location, category, limit, offset
 */
router.get('/prospects', async (req, res) => {
  try {
    const {
      status = 'TO_BE_CALLED',
      clientId,
      location,
      category,
      limit = 100,
      offset = 0
    } = req.query;

    // SECURITY: clientId is REQUIRED for multi-tenant data isolation
    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'clientId is required for data security'
      });
    }

    // Build WHERE clause dynamically
    let whereConditions = [];
    const replacements = {};

    if (status) {
      whereConditions.push('call_status = :status');
      replacements.status = status;
    }

    // ALWAYS filter by client_id (REQUIRED for multi-tenant security)
    whereConditions.push('client_id = :clientId');
    replacements.clientId = parseInt(clientId);

    if (location) {
      whereConditions.push('location = :location');
      replacements.location = location;
    }

    if (category) {
      whereConditions.push('category ILIKE :category');
      replacements.category = `%${category}%`;
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Get total count
    const countQuery = `
      SELECT COUNT(*) as total
      FROM business_directory
      ${whereClause}
    `;

    const countResult = await sequelize.query(countQuery, {
      replacements,
      type: QueryTypes.SELECT
    });

    const total = parseInt(countResult[0].total);

    // Get prospects
    const query = `
      SELECT
        id,
        business_name,
        phone_number,
        email,
        website,
        street,
        city,
        state,
        postal_code,
        location,
        category,
        call_status,
        call_attempts,
        last_called_at,
        call_result,
        call_notes,
        created_at,
        updated_at
      FROM business_directory
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT :limit
      OFFSET :offset
    `;

    replacements.limit = parseInt(limit);
    replacements.offset = parseInt(offset);

    const prospects = await sequelize.query(query, {
      replacements,
      type: QueryTypes.SELECT
    });

    logger.info(`📋 Fetched ${prospects.length} prospects (total: ${total})`);

    res.json({
      success: true,
      prospects,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + prospects.length) < total
    });

  } catch (error) {
    logger.error('Error fetching prospects:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
