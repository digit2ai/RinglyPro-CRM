'use strict';
const express = require('express');
const crypto = require('crypto');
const store = require('../models');
const { signJwt } = require('../middleware/auth');

const router = express.Router();

const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Sanitize email for logs: s***@domain
function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '***';
  return s[0] + '***' + s.slice(at);
}

// POST /api/v1/auth/magic-link  { email }
// Issues a one-time login token. In non-prod, returns the token in the body for SIT.
router.post('/magic-link', async (req, res) => {
  try {
    const email = String((req.body && req.body.email) || '').toLowerCase().trim();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ error: 'valid email required' });
    }
    const user = await store.findOrCreateUserByEmail(email);
    const token = crypto.randomBytes(32).toString('hex');
    const expires_at = new Date(Date.now() + MAGIC_TTL_MS);
    await store.createMagicLink({ tenant_id: user.tenant_id, email, token, expires_at });

    // NEVER log the token. Mask the email.
    console.log(`[okhola] magic-link issued for ${maskEmail(email)}`);

    // Email delivery is NOT wired yet (no SMTP/SendGrid). Until it is, we return
    // the token so the frontend can auto-verify and log the user in one step —
    // no token to copy, no email to check. Once OKHOLA_EMAIL_ENABLED=1 (real
    // delivery configured), the token is withheld and only emailed.
    // TODO: real email delivery (SMTP/SendGrid).
    const emailEnabled = process.env.OKHOLA_EMAIL_ENABLED === '1';
    const body = { ok: true, emailEnabled, message: emailEnabled ? 'Enlace enviado. Revisa tu correo.' : 'Listo, entrando...' };
    if (!emailEnabled) body.loginToken = token; // frictionless auto-login
    return res.status(200).json(body);
  } catch (e) {
    process.stderr.write(`[okhola] magic-link error: ${e.message}\n`);
    return res.status(500).json({ error: 'internal error' });
  }
});

// POST /api/v1/auth/verify  { token }  -> JWT
router.post('/verify', async (req, res) => {
  try {
    const token = String((req.body && req.body.token) || '').trim();
    if (!token) return res.status(400).json({ error: 'token required' });
    const link = await store.consumeMagicLink(token);
    if (!link) return res.status(401).json({ error: 'invalid or expired token' });
    const jwtToken = signJwt({ uid: link.tenant_id, tenant_id: link.tenant_id, email: link.email });
    return res.status(200).json({ ok: true, jwt: jwtToken, email: link.email });
  } catch (e) {
    process.stderr.write(`[okhola] verify error: ${e.message}\n`);
    return res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
