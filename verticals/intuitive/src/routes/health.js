'use strict';
const router = require('express').Router();

router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'intuitive-surgical-matching-engine',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    dbReady: req.dbReady
  });
});

module.exports = router;
