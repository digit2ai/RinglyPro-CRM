'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const brain = require('../services/coach-brain');

router.get('/', async (req, res) => {
  let dbOk = false;
  try { await sequelize.authenticate(); dbOk = true; } catch (e) { dbOk = false; }
  res.json({
    service: 'Executive English Coaching — Digit2AI',
    status: dbOk ? 'healthy' : 'degraded',
    db: dbOk,
    ai_model: brain.activeModel(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
