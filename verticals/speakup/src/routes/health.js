'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const ai = require('../services/ai-editor');
const stt = require('../services/stt');

router.get('/', async (req, res) => {
  let dbOk = false;
  try { await sequelize.authenticate(); dbOk = true; } catch (e) { dbOk = false; }
  res.json({
    service: 'SpeakUp — Voice-to-Text + AI editing (internal team tool)',
    status: dbOk ? 'healthy' : 'degraded',
    db: dbOk,
    ai_model: ai.activeModel(),
    stt_engine: stt.activeEngine(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
