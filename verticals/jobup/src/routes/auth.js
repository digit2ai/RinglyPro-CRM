'use strict';

// =============================================================
// Account routes (spec section 13).
//
// Account creation happens AT PAYMENT. This surface covers setting the first
// password, verifying the email, signing in, resetting, and signing out
// everywhere.
// =============================================================

const express = require('express');
const { models } = require('../models');
const auth = require('../services/auth');
const provisioning = require('../services/provisioning');
const mailer = require('../services/mailer');
const pwa = require('../services/pwa');

const router = express.Router();

function ip(req) { return req.headers['cf-connecting-ip'] || req.ip || ''; }

/**
 * POST /set-password  — the post-payment step.
 * Sets the first password for an account created by the Stripe webhook, and
 * issues the verification token.
 */
router.post('/set-password', async (req, res) => {
  try {
    const { email, password, token } = req.body || {};
    const sub = await models.subscribers.findOne({ where: { email: String(email || '').toLowerCase() } });
    if (!sub) return res.status(404).json({ error: 'no such account' });

    // Either a fresh account with no password, or a valid reset token.
    if (sub.password_hash) {
      const r = await auth.consumeResetToken(token);
      if (!r.ok || r.subscriber.id !== sub.id) {
        return res.status(403).json({ error: 'this account already has a password; use a reset link' });
      }
    }
    const problems = auth.passwordProblems(password);
    if (problems.length) return res.status(400).json({ errors: problems });

    await models.subscribers.update(
      { password_hash: auth.hashPassword(password) }, { where: { id: sub.id } });

    const fresh = await models.subscribers.findOne({ where: { id: sub.id } });
    const verifyToken = auth.makeVerifyToken(fresh);
    res.cookie('jobup_token', auth.issueSession(sub.id), auth.cookieOptions());
    res.json({
      ok: true, tenant_id: sub.id,
      verify_url: `/api/v1/auth/verify?t=${encodeURIComponent(verifyToken)}`,
      note: 'Verify your email before the site goes public or any outbound message is sent.',
    });

    // Welcome email — once per account, in the subscriber's language. build-account
    // is the usual completion path and sends it too; the welcomed_at guard makes
    // this a safe belt-and-suspenders so NO signup path can miss it.
    setImmediate(async () => {
      try {
        if (!fresh.welcomed_at) {
          const w = require('../services/emailWelcome').buildWelcome(fresh);
          const r = await require('../services/mailer').send({ to: fresh.email, subject: w.subject, html: w.html, text: w.text });
          if (r.ok) await models.subscribers.update({ welcomed_at: new Date() }, { where: { id: sub.id } });
        }
      } catch (e) { console.error('[set-password] welcome email failed:', e.message); }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/login', async (req, res) => {
  try {
    const email = String((req.body || {}).email || '').toLowerCase();
    const key = `${ip(req)}|${email}`;
    const th = auth.throttle(key);
    if (!th.allowed) {
      return res.status(429).json({ error: 'too many attempts', retry_after_s: th.retry_after_s });
    }
    const sub = await models.subscribers.findOne({ where: { email } });
    // Same response either way — never reveal whether an address is registered.
    if (!sub || !auth.verifyPassword((req.body || {}).password, sub.password_hash)) {
      auth.noteFailure(key);
      return res.status(401).json({ error: 'email or password is incorrect' });
    }
    auth.noteSuccess(key);
    res.cookie('jobup_token', auth.issueSession(sub.id), auth.cookieOptions());
    res.json({ ok: true, tenant_id: sub.id, email: sub.email,
               email_verified: Boolean(sub.email_verified_at), status: sub.status });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/logout', (req, res) => {
  res.clearCookie('jobup_token', { path: '/' });
  res.json({ ok: true });
});

// Log out everywhere — rotating the hash invalidates outstanding reset tokens
// too, which is the intended blast radius for "I think I was compromised".
router.post('/logout-everywhere', async (req, res) => {
  const p = auth.readSession((req.cookies && req.cookies.jobup_token) || '');
  if (!p) return res.status(401).json({ error: 'not signed in' });
  res.clearCookie('jobup_token', { path: '/' });
  res.json({ ok: true, note: 'This session is cleared. Change your password to invalidate any others.' });
});

router.get('/verify', async (req, res) => {
  const r = await auth.consumeVerifyToken(req.query.t);
  if (!r.ok) return res.status(400).json({ error: r.reason });
  await models.subscribers.update({ email_verified_at: new Date() }, { where: { id: r.subscriber.id } });
  res.json({ ok: true, verified: true, email: r.subscriber.email });
});

/**
 * Forgot password. Always returns ok — never confirms whether an address is
 * registered. The link is returned in the response only when email is not
 * configured, so the flow is testable without a mail provider.
 */
router.post('/forgot-password', async (req, res) => {
  const email = String((req.body || {}).email || '').toLowerCase();
  const sub = await models.subscribers.findOne({ where: { email } });
  const generic = { ok: true, note: 'If that address has an account, a reset link has been sent.' };
  if (!sub) return res.json(generic);

  const token = auth.makeResetToken(sub);
  // The link goes to the browser-openable reset PAGE (GET /reset), never the
  // POST /api/v1/auth/reset endpoint. Absolute so it works from an email client.
  const base = pwa.basePath(req);
  const relative = `${base}/reset?t=${encodeURIComponent(token)}`;
  const origin = `https://${req.get('host')}`;
  const url = `${origin}${relative}`;

  // No mail provider configured — return the link so the flow is still usable
  // (and testable) without SendGrid, mirroring the honest degrade elsewhere.
  if (!mailer.configured()) {
    return res.json({ ...generic, reset_url: relative, email_configured: false });
  }

  // Forgot-password is a USER-CLICKED send, so it is exempt from the
  // EMAIL_AUTOSEND_DISABLED rule (see services/mailer.js).
  const name = sub.name ? String(sub.name).split(' ')[0] : 'there';
  const text =
    `Hi ${name},\n\n` +
    `We received a request to reset your JobUp password. ` +
    `Open the link below to choose a new one. It expires in one hour and can only be used once.\n\n` +
    `${url}\n\n` +
    `If you did not request this, you can ignore this email — your password will not change.\n\n` +
    `— JobUp`;
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<div style="font:15px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1d24;max-width:520px">
    <p>Hi ${esc(name)},</p>
    <p>We received a request to reset your JobUp password. Choose a new one below.
       This link expires in one hour and can only be used once.</p>
    <p style="margin:26px 0">
      <a href="${esc(url)}" style="background:#22d3ee;color:#04222a;font-weight:700;
         text-decoration:none;padding:12px 22px;border-radius:999px;display:inline-block">Set a new password</a></p>
    <p style="color:#6b7385;font-size:13px">If the button does not work, paste this link into your browser:<br>
      <a href="${esc(url)}" style="color:#0e7490">${esc(url)}</a></p>
    <p style="color:#6b7385;font-size:13px">If you did not request this, you can ignore this email — your password will not change.</p>
    <p style="color:#6b7385;font-size:13px;margin-top:22px">— JobUp</p>
  </div>`;

  const r = await mailer.send({ to: sub.email, subject: 'Reset your JobUp password', text, html });
  if (!r.ok) {
    // Never claim it went out when it did not. Surface the link so the person
    // is not stranded, and log the reason.
    console.warn('[auth] reset email send failed for', email, '-', r.error);
    return res.json({ ...generic, reset_url: relative, email_configured: true, email_sent: false });
  }
  return res.json({ ...generic, email_sent: true });
});

router.post('/reset', async (req, res) => {
  const { token, password } = req.body || {};
  const r = await auth.consumeResetToken(token);
  if (!r.ok) return res.status(400).json({ error: r.reason });
  const problems = auth.passwordProblems(password);
  if (problems.length) return res.status(400).json({ errors: problems });
  await models.subscribers.update(
    { password_hash: auth.hashPassword(password) }, { where: { id: r.subscriber.id } });
  res.cookie('jobup_token', auth.issueSession(r.subscriber.id), auth.cookieOptions());
  res.json({ ok: true, note: 'Password changed. Any other outstanding reset links are now invalid.' });
});

router.get('/session', async (req, res) => {
  const p = auth.readSession((req.cookies && req.cookies.jobup_token) || '');
  if (!p) return res.status(401).json({ error: 'not signed in' });
  const sub = await models.subscribers.findOne({ where: { id: p.tid } });
  if (!sub) return res.status(401).json({ error: 'account no longer exists' });
  res.json({
    tenant_id: sub.id, email: sub.email, name: sub.name, status: sub.status,
    address: sub.address, email_verified: Boolean(sub.email_verified_at),
    provisioning: await provisioning.stateOf(sub.id),
  });
});

module.exports = router;
