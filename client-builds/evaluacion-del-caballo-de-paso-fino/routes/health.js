// =====================================================
// Health — GET /health (public, no auth). Acceptance #1.
// =====================================================

'use strict';

const express = require('express');
const router = express.Router();

const SERVICE = 'evaluacion-del-caballo-de-paso-fino';
const VERSION = '1.0.0';

router.get('/', (req, res) => {
  res.json({ status: 'ok', service: SERVICE, version: VERSION });
});

module.exports = router;
