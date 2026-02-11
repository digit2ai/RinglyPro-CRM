'use strict';

/**
 * Health Check Routes - TunjoRacing
 */

const express = require('express');
const router = express.Router();

let models;
try {
  models = require('../../models');
} catch (e) {
  models = null;
}

// GET /health
router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'TunjoRacing Platform',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    modules: {
      sponsors: 'active',
      fans: 'active',
      store: 'active',
      media: 'active',
      analytics: 'active'
    }
  });
});

// GET /health/db - Database health check with counts
router.get('/db', async (req, res) => {
  if (!models || !models.sequelize) {
    return res.status(500).json({ status: 'error', message: 'Models not loaded' });
  }

  try {
    // Get database connection info (sanitized)
    const dbUrl = process.env.DATABASE_URL || '';
    const dbHost = dbUrl.includes('@') ? dbUrl.split('@')[1]?.split('/')[0] : 'unknown';

    // Get table counts
    const [tables] = await models.sequelize.query(
      "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename LIKE 'tunjo%'"
    );

    const counts = {};
    for (const table of tables) {
      const [[result]] = await models.sequelize.query(
        `SELECT COUNT(*) as count FROM "${table.tablename}"`
      );
      counts[table.tablename] = parseInt(result.count);
    }

    res.json({
      status: 'OK',
      database: {
        host: dbHost,
        connected: true,
        tables: tables.length,
        counts
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

module.exports = router;
