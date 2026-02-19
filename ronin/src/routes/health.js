'use strict';

const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.json({
    status: 'OK',
    service: 'Ronin Brotherhood Ecosystem',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    modules: {
      membership: 'active',
      store: 'active',
      training: 'active',
      events: 'active',
      sponsors: 'active',
      press: 'active',
      voice_agents: 'configured'
    },
    groups: ['RGRK', 'IRMAF', 'RPDTA', 'Red Belt Society', 'Ronin MMA']
  });
});

module.exports = router;
