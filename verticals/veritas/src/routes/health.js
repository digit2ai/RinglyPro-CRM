'use strict';

const express = require('express');
const router = express.Router();
const { sequelize, Detection, Takedown, Monitor } = require('../models');
const detection = require('../services/detection');

router.get('/', async (req, res) => {
  let dbOk = false;
  try { await sequelize.authenticate(); dbOk = true; } catch (e) { dbOk = false; }
  res.json({
    service: 'Veritas — AI Deepfake Detection & Takedown',
    status: dbOk ? 'healthy' : 'degraded',
    db: dbOk,
    detection_provider: detection.activeProvider(),
    detection: detection.diagnostics(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
