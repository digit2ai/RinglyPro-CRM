'use strict';

const express = require('express');
const router = express.Router();

/**
 * Health check endpoint
 * GET /health
 */
router.get('/', async (req, res) => {
  let dbStatus = 'unknown';
  let dbError = null;

  try {
    // Try to load models (may fail if DB not set up)
    const { sequelize } = require('../../models');
    await sequelize.authenticate();
    dbStatus = 'connected';
  } catch (error) {
    dbStatus = 'disconnected';
    dbError = error.message;
  }

  const response = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    environment: process.env.NODE_ENV || 'development'
  };

  if (dbError) {
    response.database_error = dbError;
  }

  res.json(response);
});

module.exports = router;
