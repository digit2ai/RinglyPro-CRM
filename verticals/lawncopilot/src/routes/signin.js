'use strict';

/**
 * Lawn Co-Pilot — the ONE sign-in.
 *
 * Platform-level (no tenant in the URL). Resolves who the person is and sends
 * them to the dashboard they're entitled to. See services/identity.js.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

const identity = require('../services/identity');
const { basePath } = require('../tenancy');
const { PlatformUser, User, Customer, Tenant } = require('../models');
const { sendEmail } = require('../services/notify');

const SECRET = () => process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';

// ── Rate limit by IP: credential stuffing hits one door now, so guard it ────
const buckets = new Map();
router.use((req, res, next) => {
  const ip = (req.headers['x-forwarded-for'] || req.ip || 'x').split(',')[0].trim();
  const now = Date.now();
  const b = buckets.get(ip) || { n: 0, reset: now + 900000 };
  if (now > b.reset) { b.n = 0; b.reset = now + 900000; }
  b.n++; buckets.set(ip, b);
  if (b.n > 40) return res.status(429).json({ success: false, error: 'Too many attempts. Try again in a few minutes.' });
  next();
});

/**
 * Sign in. One match signs straight in; several hands back a chooser.
 */
router.post('/', async (req, res) => {
  const { email, password } = req.body || {};
  const base = basePath(req);

  let ids;
  try { ids = await identity.resolveIdentities(email, password); }
  catch (e) { return res.status(500).json({ success: false, error: 'Sign-in is temporarily unavailable.' }); }

  if (!ids.length) {
    return res.status(401).json({ success: false, error: 'Invalid email or password' });
  }

  const e = String(email).toLowerCase().trim();

  if (ids.length === 1) {
    const only = ids[0];
    identity.grant(res, { ...only, email: e });
    if (only.kind === 'staff') {
      try { await User.update({ last_login_at: new Date() }, { where: { id: only.id } }); } catch (x) {}
    } else if (only.kind === 'platform') {
      try { await PlatformUser.update({ last_login_at: new Date() }, { where: { id: only.id } }); } catch (x) {}
    }
    return res.json({
      success: true, kind: only.kind, redirect: `${base}${only.path}`,
      label: only.label
    });
  }

  // More than one place this person belongs. Never guess — let them choose.
  return res.json({
    success: true,
    multiple: true,
    selection_token: identity.selectionToken(e, ids),
    choices: ids.map(i => identity.publicChoice(i, base))
  });
});

/**
 * Complete a multi-identity sign-in. The list was already password-verified and
 * signed, so no password crosses the wire twice.
 */
router.post('/select', async (req, res) => {
  const { selection_token, index } = req.body || {};
  const base = basePath(req);
  const payload = identity.readSelection(selection_token);
  if (!payload) return res.status(400).json({ success: false, error: 'That sign-in expired. Please sign in again.' });

  const i = Number(index);
  const chosen = payload.ids[i];
  if (!chosen) return res.status(400).json({ success: false, error: 'Pick one of the listed accounts.' });

  identity.grant(res, { ...chosen, email: payload.email });
  return res.json({ success: true, kind: chosen.kind, redirect: `${base}${chosen.path}` });
});

router.post('/logout', (req, res) => {
  ['lawncopilot_platform', 'lawncopilot_staff', 'lawncopilot_token']
    .forEach(c => res.clearCookie(c, { path: '/' }));
  res.json({ success: true });
});

// ── Forgot password, for whichever kind of account the email belongs to ─────
function resetSecret(kind, id, hash) {
  return `${SECRET()}|${kind}|${id}|${hash || 'new'}`;
}
function resetBase() {
  return (process.env.LAWNCOPILOT_BASE_DOMAIN || 'https://lawncopilot.com').replace(/\/+$/, '');
}

/**
 * Sends one email containing a reset link for EVERY account on that address,
 * each labeled. Most people have exactly one; someone who is both an owner and
 * a customer elsewhere gets both, clearly named, instead of us silently
 * resetting the wrong one.
 */
router.post('/forgot', async (req, res) => {
  const e = String((req.body || {}).email || '').toLowerCase().trim();
  const generic = { success: true, message: 'If that email is on file, a reset link is on its way.' };
  if (!e) return res.json(generic);

  const links = [];
  const add = (kind, row, label, hash) => {
    const token = jwt.sign({ kind, id: row.id, purpose: 'pw_reset' },
      resetSecret(kind, row.id, hash), { expiresIn: '1h' });
    links.push({ label, url: `${resetBase()}/lawncopilot/reset?token=${encodeURIComponent(token)}` });
  };

  try {
    const pu = await PlatformUser.findOne({ where: { email: e }, raw: true });
    if (pu) add('platform', pu, 'Digit2AI Platform (admin)', pu.password_hash);

    for (const u of await User.findAll({ where: { email: e }, raw: true })) {
      const t = await Tenant.findByPk(u.tenant_id, { raw: true });
      if (t && t.status !== 'deleted') add('staff', u, `${t.name} — company office`, u.password_hash);
    }
    for (const c of await Customer.findAll({ where: { email: e }, raw: true })) {
      const t = await Tenant.findByPk(c.tenant_id, { raw: true });
      if (t && t.status !== 'deleted') add('customer', c, `${t.name} — your customer account`, c.password_hash);
    }
  } catch (x) { /* fall through to the generic answer */ }

  if (!links.length) return res.json(generic);

  const from = process.env.LAWNCOPILOT_RESET_FROM_EMAIL || 'info@digit2ai.com';
  const one = links.length === 1;
  const body = `Reset your Lawn Co-Pilot password.\n\n`
    + (one ? '' : 'This email is attached to more than one account. Use the link for the one you want to reset:\n\n')
    + links.map(l => (one ? '' : `${l.label}:\n`) + l.url).join('\n\n')
    + `\n\nThese links expire in one hour and can each be used once.\nIf you did not request this, ignore this email.\n\n— Lawn Co-Pilot`;
  const html = `<p>Reset your Lawn Co-Pilot password.</p>`
    + (one ? '' : '<p>This email is attached to more than one account — pick the one you want to reset:</p>')
    + links.map(l => `<p>${one ? '' : `<b>${l.label}</b><br>`}`
      + `<a href="${l.url}" style="display:inline-block;background:#307f44;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700">Reset password</a></p>`).join('')
    + `<p style="color:#667">Links expire in one hour. If you did not request this, ignore this email.</p>`;

  const sent = await sendEmail(e, 'Reset your Lawn Co-Pilot password', body,
    { from, fromName: 'Lawn Co-Pilot', html });

  if (!sent.ok && !process.env.SENDGRID_API_KEY) {
    return res.json({ ...generic, dev_reset_links: links, note: 'SendGrid not configured; links returned for setup only.' });
  }
  return res.json(generic);
});

router.post('/reset', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ success: false, error: 'Token and a new password are required.' });
  if (String(password).length < 8) return res.status(400).json({ success: false, error: 'Choose a password of at least 8 characters.' });

  let claims;
  try { claims = jwt.decode(token); } catch (e) { claims = null; }
  if (!claims || claims.purpose !== 'pw_reset' || !claims.id || !claims.kind) {
    return res.status(400).json({ success: false, error: 'This reset link is invalid.' });
  }

  const Model = { platform: PlatformUser, staff: User, customer: Customer }[claims.kind];
  if (!Model) return res.status(400).json({ success: false, error: 'This reset link is invalid.' });

  const row = await Model.findByPk(claims.id);
  if (!row) return res.status(400).json({ success: false, error: 'This reset link is invalid.' });

  try {
    jwt.verify(token, resetSecret(claims.kind, row.id, row.password_hash));
  } catch (e) {
    return res.status(400).json({ success: false, error: 'This reset link has expired or was already used. Request a new one.' });
  }

  row.password_hash = await bcrypt.hash(String(password), 10);
  await row.save();
  res.json({ success: true, message: 'Your password was reset. Sign in with your new password.' });
});

module.exports = router;
