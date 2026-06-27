// GET /health — public health check
const express = require('express');
const router = express.Router();
const store = require('../models/intake');

const VERSION = '1.0.0';

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'voice-to-intake-transcript-direct-pipeli',
    version: VERSION,
    store: store.mode()
  });
});

module.exports = router;
