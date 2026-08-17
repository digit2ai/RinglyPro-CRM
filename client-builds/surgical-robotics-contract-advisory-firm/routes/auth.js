// =====================================================
// routes/auth.js — sign-in is the Projects Hub session, and nothing else.
//
// THERE IS ONE DOOR. Earlier this app had its own magic-link plus a shared
// access code. That was a second credential to distribute, rotate and lose, for
// an audience of two people who already sign in at /projects every day. It is
// gone. Access to this model is now exactly access to the Projects Hub, so
// removing someone there removes them here.
//
// HOW THE HANDOFF WORKS. /projects stores its CRM JWT in localStorage on
// aiagent.ringlypro.com. This app is served from the SAME ORIGIN, so its gate
// page can read that value directly — no redirect dance, no shared secret in a
// URL, no third-party cookie. The gate posts the token here once; this endpoint
// verifies it against JWT_SECRET, checks the address against the viewer list,
// and exchanges it for a short-lived HttpOnly cookie scoped to this app.
//
// WHY EXCHANGE RATHER THAN ACCEPT THE CRM TOKEN ON EVERY CALL. A CRM token is a
// broad credential; this app should hold the narrowest thing that identifies
// its viewer, for the shortest time. The exchanged session also never outlives
// the Projects session it came from (see lib/auth.js signSession).
// =====================================================

'use strict';

const express = require('express');
const auth = require('../lib/auth');
const access = require('../lib/access');
const { DEFAULT_TENANT_ID } = require('../lib/tenant');

// A valid Projects session is necessary but not sufficient. The Hub is the
// owner's command centre and carries accounts that have no business reading one
// named person's departure plan, so the viewer list is a second, narrower gate.
// Set to `*` to admit any authenticated Projects user.
const VIEWERS = (process.env.SRCAF_ALLOWED_EMAILS || 'eriksen.greg@yahoo.com,mstagg@digit2ai.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function isViewer(email) {
  if (VIEWERS.includes('*')) return true;
  return VIEWERS.includes(String(email || '').toLowerCase());
}

function authRoutes({ mountPath }) {
  const router = express.Router();

  // POST /api/v1/auth/sso { token }
  // The token is the CRM JWT the Projects Hub already holds in localStorage.
  router.post('/api/v1/auth/sso', (req, res) => {
    try {
      if (access.throttled(req)) {
        const retry = access.retryAfterSeconds(req);
        res.set('Retry-After', String(retry));
        return res.status(429).json({
          success: false,
          error: 'Too many sign-in attempts. Try again shortly.',
          retry_after_seconds: retry,
        });
      }

      const claims = auth.verifyProjectsToken((req.body || {}).token);
      if (!claims) {
        access.recordFailure(req);
        return res.status(401).json({
          success: false,
          error: 'Not signed in to the Projects Hub.',
          sign_in_url: access.projectsUrl(),
        });
      }

      if (!isViewer(claims.email)) {
        // Distinguished from "not signed in" deliberately. This person HAS a
        // valid session; telling them they lack access is accurate and lets
        // them ask for it, and it reveals nothing they could not already infer
        // from being logged in.
        access.recordFailure(req);
        console.log(`[srcaf] access denied for ${auth.maskEmail(claims.email)} (valid Projects session, not on the viewer list)`);
        return res.status(403).json({
          success: false,
          error: 'Your Projects account does not have access to this model.',
          email_masked: auth.maskEmail(claims.email),
        });
      }

      access.clearFailures(req);

      const token = auth.signSession({
        email: claims.email,
        tenant_id: DEFAULT_TENANT_ID,
        expiresAtEpochSeconds: claims.exp,
      });

      res.cookie('srcaf_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 12 * 60 * 60 * 1000,
        path: mountPath() || '/',
      });

      console.log(`[srcaf] session issued via Projects SSO for ${auth.maskEmail(claims.email)}`);

      return res.json({
        success: true,
        token,
        email_masked: auth.maskEmail(claims.email),
        tenant_id: DEFAULT_TENANT_ID,
      });
    } catch (err) {
      console.error('[srcaf] sso error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not complete sign-in' });
    }
  });

  router.post('/api/v1/auth/logout', (req, res) => {
    res.clearCookie('srcaf_token', { path: mountPath() || '/' });
    return res.json({ success: true, sign_in_url: access.projectsUrl() });
  });

  router.get('/api/v1/auth/me', auth.readSession, (req, res) => {
    if (!req.session) {
      return res.json({ success: true, signed_in: false, sign_in_url: access.projectsUrl() });
    }
    return res.json({
      success: true,
      signed_in: true,
      email_masked: auth.maskEmail(req.session.email),
      tenant_id: req.session.tenant_id,
    });
  });

  return router;
}

module.exports = authRoutes;
module.exports.VIEWERS = VIEWERS;
module.exports.isViewer = isViewer;
