'use strict';

const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const models = req.models;
  let dbStatus = 'unknown';

  try {
    await models.sequelize.authenticate();
    dbStatus = 'connected';
  } catch (e) {
    dbStatus = 'disconnected';
  }

  res.json({
    service: 'LOGISTICS Warehouse Data Analytics',
    status: 'ok',
    version: '1.0.0',
    database: dbStatus,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
