const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const models = require('../../models');
    await models.sequelize.authenticate();
    const modelNames = Object.keys(models).filter(k => k !== 'sequelize' && k !== 'Sequelize');
    res.json({
      status: 'ok',
      service: 'Visionarium Foundation Platform',
      version: '1.0.0',
      database: 'connected',
      models_loaded: modelNames.length,
      models: modelNames,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

module.exports = router;
