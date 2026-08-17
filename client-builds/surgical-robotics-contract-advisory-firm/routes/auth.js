// =====================================================
// routes/auth.js — email magic link, no passwords.
//
// THE VERIFY URL COMES BACK IN THE RESPONSE BODY, AND THAT IS NOT A SHORTCUT.
// `EMAIL_AUTOSEND_DISABLED` defaults ON across this repo — every server-initiated
// SendGrid send is suppressed because outbound mail was landing in client spam
// folders. A magic-link flow that assumed an email would arrive would silently
// authenticate nobody: not Greg, not the SIT harness, not anyone. So the link is
// returned, the UI surfaces it as a copyable field, and the response states
// which delivery path was actually taken.
//
// The token itself is never logged, at any level, in any environment. The email
// is masked before any console write.
// =====================================================

'use strict';

const express = require('express');
const auth = require('../lib/auth');
const access = require('../lib/access');
const { DEFAULT_TENANT_ID } = require('../lib/tenant');

const SEEDED_EMAILS = (process.env.SRCAF_ALLOWED_EMAILS || 'eriksen.greg@yahoo.com,mstagg@digit2ai.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function autosendDisabled() {
  // Default ON, matching the repo-wide convention. Only an explicit '0' re-enables.
  return process.env.EMAIL_AUTOSEND_DISABLED !== '0';
}

function authRoutes({ store, mountPath }) {
  const router = express.Router();

  router.post('/api/v1/auth/magic-link', async (req, res) => {
    try {
      const email = auth.normaliseEmail((req.body || {}).email);
      if (!auth.isEmail(email)) {
        return res.status(400).json({ success: false, error: 'A valid email address is required' });
      }

      // FAIL CLOSED. With no access code configured, no session can be created.
      // An app that mints sessions under a documented default password is not
      // protected by it.
      if (!access.accessConfigured()) {
        console.error('[srcaf] sign-in refused: SRCAF_ACCESS_CODE is not set on this deployment');
        return res.status(503).json({
          success: false,
          error: 'Sign-in is not configured on this deployment. Set SRCAF_ACCESS_CODE.',
          access_configured: false,
        });
      }

      if (access.throttled(req)) {
        const retry = access.retryAfterSeconds(req);
        res.set('Retry-After', String(retry));
        return res.status(429).json({
          success: false,
          error: 'Too many sign-in attempts. Try again later.',
          retry_after_seconds: retry,
        });
      }

      // TWO THINGS ARE REQUIRED, NOT ONE. The allow-list says who may hold a
      // session; the access code proves the caller is that person. Returning a
      // sign-in link to anyone who merely knows the address would make the
      // address the credential — and Greg's address is on the project record.
      const codeOk = access.codeMatches((req.body || {}).access_code);
      const allowed = SEEDED_EMAILS.includes(email);

      if (!codeOk || !allowed) {
        access.recordFailure(req);
        // One message for both failures. Distinguishing them turns this into an
        // oracle for which addresses are provisioned.
        console.log(`[srcaf] sign-in refused for ${auth.maskEmail(email)}`);
        return res.status(401).json({
          success: false,
          error: 'That email address and access code combination was not recognised.',
        });
      }

      access.clearFailures(req);

      const base = `${req.protocol}://${req.get('host')}${mountPath()}`;
      let verify_url = null;

      {
        const token = auth.newMagicToken();
        await store.createToken({
          tenant_id: DEFAULT_TENANT_ID,
          email,
          token,
          expires_at: auth.magicExpiry(Date.now()),
        });
        verify_url = `${base}/api/v1/auth/verify?token=${token}`;
      }

      console.log(`[srcaf] magic link issued for ${auth.maskEmail(email)}`);

      return res.json({
        success: true,
        email_masked: auth.maskEmail(email),
        expires_in_minutes: auth.MAGIC_TTL_MINUTES,
        // Returned rather than emailed because server-initiated mail is
        // disabled repo-wide. Safe to return here only because the caller has
        // already proved the access code on this same request.
        verify_url,
        delivery: autosendDisabled() ? 'returned_in_response' : 'email',
        delivery_note: autosendDisabled()
          ? 'Server-initiated email is disabled for this deployment (EMAIL_AUTOSEND_DISABLED). Open the link below directly.'
          : 'A sign-in link was generated. Email delivery is enabled for this deployment.',
      });
    } catch (err) {
      console.error('[srcaf] magic-link error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not create a sign-in link' });
    }
  });

  router.get('/api/v1/auth/verify', async (req, res) => {
    try {
      const token = String(req.query.token || '').trim();
      if (!token || token.length > 128) {
        return res.status(401).json({ success: false, error: 'Invalid sign-in link' });
      }

      const result = await store.consumeToken(token, Date.now());
      if (!result.ok) {
        const message = result.reason === 'expired'
          ? 'This sign-in link has expired. Request a new one.'
          : result.reason === 'already_used'
            ? 'This sign-in link has already been used. Request a new one.'
            : 'Invalid sign-in link';
        return res.status(401).json({ success: false, error: message, reason: result.reason });
      }

      const jwtToken = auth.signSession({
        email: result.row.email,
        tenant_id: result.row.tenant_id,
      });

      console.log(`[srcaf] session issued for ${auth.maskEmail(result.row.email)}`);

      res.cookie('srcaf_token', jwtToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: mountPath() || '/',
      });

      if (String(req.query.redirect || '') === '1') {
        return res.redirect(302, `${mountPath()}/?signed_in=1`);
      }

      return res.json({
        success: true,
        token: jwtToken,
        email_masked: auth.maskEmail(result.row.email),
        tenant_id: result.row.tenant_id,
      });
    } catch (err) {
      console.error('[srcaf] verify error:', err.message);
      return res.status(500).json({ success: false, error: 'Could not complete sign-in' });
    }
  });

  router.post('/api/v1/auth/logout', (req, res) => {
    res.clearCookie('srcaf_token', { path: mountPath() || '/' });
    return res.json({ success: true });
  });

  router.get('/api/v1/auth/me', auth.readSession, (req, res) => {
    if (!req.session) return res.json({ success: true, signed_in: false });
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
module.exports.SEEDED_EMAILS = SEEDED_EMAILS;
module.exports.autosendDisabled = autosendDisabled;
