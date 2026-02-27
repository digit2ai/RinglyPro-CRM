'use strict';

const express = require('express');
const router = express.Router();

/**
 * GET / - Health check endpoint
 * Returns service status and timestamp
 */
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'web-call-center',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
