'use strict';
const express = require('express');
const crypto = require('crypto');
const store = require('../models');
const { signJwt } = require('../middleware/auth');

const router = express.Router();

const MAGIC_TTL_MS = 15 * 60 * 1000; // 15 minutes
const IS_PROD = process.env.NODE_ENV === 'production';

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

    // TODO: real email delivery (SMTP/SendGrid). Until then, non-prod returns the token.
    const body = { ok: true, message: 'Magic link generado. Revisa tu correo.' };
    if (!IS_PROD) body.loginToken = token;
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
