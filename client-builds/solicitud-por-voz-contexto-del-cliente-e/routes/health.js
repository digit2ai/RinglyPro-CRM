const express = require('express');
const router = express.Router();

const SERVICE = 'solicitud-por-voz-contexto-del-cliente-e';
const VERSION = '1.0.0';

// GET /health — public, 200 JSON.
router.get('/', (req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: VERSION });
});

module.exports = router;
module.exports.VERSION = VERSION;
module.exports.SERVICE = SERVICE;
