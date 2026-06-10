'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');

router.get('/', async (req, res) => {
  let db = 'unknown';
  try { await sequelize.authenticate(); db = 'connected'; } catch (e) { db = 'error: ' + e.message; }
  res.json({
    service: 'AgroMercadoDigital',
    developer: 'ISTC (Ingeniería y Servicios Tecnológicos Colón)',
    ai_partner: 'Digit2AI',
    status: 'ok',
    database: db,
    time: new Date().toISOString()
  });
});

module.exports = router;
