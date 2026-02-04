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

// Debug endpoint to test Store model
router.get('/debug', async (req, res) => {
  try {
    const { Store, sequelize } = require('../../models');

    // Raw SQL count
    const [rawCount] = await sequelize.query('SELECT COUNT(*) as count FROM stores');

    // Model count
    const modelCount = await Store.count();

    // Model findAll
    const stores = await Store.findAll({ limit: 3 });

    // Get database name
    const [dbInfo] = await sequelize.query('SELECT current_database() as db');

    res.json({
      database: dbInfo[0].db,
      rawSqlCount: rawCount[0].count,
      modelCount,
      storesFound: stores.length,
      sampleStores: stores.map(s => ({ id: s.id, code: s.store_code, name: s.name }))
    });
  } catch (error) {
    res.json({ error: error.message, stack: error.stack });
  }
});

module.exports = router;
