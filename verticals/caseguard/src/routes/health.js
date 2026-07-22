'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const brain = require('../services/case-brain');

router.get('/', async (req, res) => {
  let dbOk = false;
  try { await sequelize.authenticate(); dbOk = true; } catch (e) { dbOk = false; }
  res.json({
    service: 'CaseGuard — Administrative Review & Regulatory Escalation Case Manager',
    status: dbOk ? 'healthy' : 'degraded',
    db: dbOk,
    ai_model: brain.activeModel(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
