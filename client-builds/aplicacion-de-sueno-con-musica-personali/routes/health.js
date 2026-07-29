// =====================================================
// routes/health.js — GET /health
// Always 200 while the process is up. The session-store backend is reported
// as detail, not as liveness: the player and the public track library work
// with or without Postgres.
// =====================================================

'use strict';

const express = require('express');

module.exports = function healthRoutes({ version, service, store, dbState }) {
  const router = express.Router();

  router.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service,
      version,
      session_store: store.backend(),
      db: dbState.ready ? 'connected' : (dbState.error || 'not configured'),
      time: new Date().toISOString(),
    });
  });

  return router;
};
