'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const enrich = require('../services/enrich');

router.get('/', async (req, res) => {
  let dbOk = false;
  try { await sequelize.authenticate(); dbOk = true; } catch (e) { dbOk = false; }
  res.json({
    service: 'AI Radar — capture AI discoveries from the share sheet',
    status: dbOk ? 'healthy' : 'degraded',
    db: dbOk,
    enrich_model: enrich.activeModel(),
    categories: enrich.CATEGORIES.length,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
