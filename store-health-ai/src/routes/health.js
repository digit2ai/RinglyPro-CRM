'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../../models');

/**
 * Health check endpoint
 * GET /health
 */
router.get('/', async (req, res) => {
  try {
    // Check database connection
    await sequelize.authenticate();

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      error: error.message
    });
  }
});

module.exports = router;
