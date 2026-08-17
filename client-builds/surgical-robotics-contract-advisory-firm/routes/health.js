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
const access = require('../lib/access');

function healthRoutes({ version, service, store, dbState, modelVersion }) {
  const router = express.Router();

  // /health stays reachable without a session so uptime checks and the
  // orchestrator's deploy poller keep working — but an unauthenticated caller
  // gets liveness only. Storage backend, error strings and secret-configuration
  // booleans are operational detail, and operational detail is reconnaissance
  // when the app behind it is private.
  router.get('/health', authLib.readSession, (req, res) => {
    const base = {
      status: 'ok',
      service,
      version,
      access_level: access.level(),
    };

    if (!req.session && access.isPrivate()) {
      return res.json(base);
    }

    return res.json({
      ...base,
      model_version: modelVersion,
      db_backend: store.backend(),
      db_error: dbState.error || null,
      identity_provider: 'digit2ai-projects',
      sign_in_url: access.projectsUrl(),
      jwt_secret_configured: !authLib.usingDevSecret(),
    });
  });

  // Where to sign in, and nothing that helps an attacker. Named separately from
  // /health so the gate page can ask without pretending to be a monitor.
  router.get('/api/v1/auth/status', (_req, res) => {
    res.json({
      success: true,
      access_level: access.level(),
      jwt_secret_configured: !authLib.usingDevSecret(),
    });
  });

  return router;
}

module.exports = healthRoutes;
