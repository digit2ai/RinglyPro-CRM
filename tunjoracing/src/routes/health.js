'use strict';

/**
 * Health Check Routes - TunjoRacing
 */

const express = require('express');
const router = express.Router();

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

module.exports = router;
