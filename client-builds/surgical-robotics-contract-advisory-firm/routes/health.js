// =====================================================
// routes/health.js — GET /health
//
// Reports which storage backend actually won, so "the scenario saved" and "the
// scenario is in this process's memory and will not survive a redeploy" are
// never ambiguous. Also reports whether the JWT secret is a development default
// and whether the sign-in link is being returned rather than emailed, because
// both are things an operator needs to know without reading the logs.
// =====================================================

'use strict';

const express = require('express');
const authLib = require('../lib/auth');
const { autosendDisabled } = require('./auth');

function healthRoutes({ version, service, store, dbState, modelVersion }) {
  const router = express.Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service,
      version,
      model_version: modelVersion,
      db_backend: store.backend(),
      db_error: dbState.error || null,
      magic_link_delivery: autosendDisabled() ? 'returned_in_response' : 'email',
      jwt_secret_configured: !authLib.usingDevSecret(),
    });
  });

  return router;
}

module.exports = healthRoutes;
