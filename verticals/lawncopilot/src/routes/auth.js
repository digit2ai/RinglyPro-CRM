'use strict';

/**
 * Lawn Co-Pilot — authentication
 * Customers (portal) and staff (admin) both live here, on separate cookies so
 * a customer session can never be mistaken for a staff session.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const router = express.Router();

const { Customer, User } = require('../models');
const { notify } = require('../services/notify');

function T(req) {
  if (!req.tenant_id) throw new Error('auth route reached without a resolved tenant');
  return req.tenant_id;
}
const SECRET = () => process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';
const COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000, path: '/' };

const magicLinks = new Map(); // token -> { customer_id, expires }

function sign(payload) { return jwt.sign(payload, SECRET(), { expiresIn: '30d' }); }

// ── Customer ───────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const tenant_id = T(req);
  const c = await Customer.findOne({ where: { tenant_id, email: String(email || '').toLowerCase().trim() } });
  if (!c || !c.password_hash) return res.status(401).json({ success: false, error: 'Invalid email or password' });
  const ok = await bcrypt.compare(String(password || ''), c.password_hash);
  if (!ok) return res.status(401).json({ success: false, error: 'Invalid email or password' });

  res.cookie('lawncopilot_token', sign({ id: c.id, tenant_id, email: c.email, kind: 'customer' }), COOKIE);
  res.json({ success: true, customer: { id: c.id, name: c.name, email: c.email } });
});

router.post('/magic-link', async (req, res) => {
  const { email } = req.body || {};
  const tenant_id = T(req);
  const c = await Customer.findOne({ where: { tenant_id, email: String(email || '').toLowerCase().trim() }, raw: true });
  // Always answer the same way — never leak whether an address is on file.
  const generic = { success: true, message: 'If that email is on file, a sign-in link is on its way.' };
  if (!c) return res.json(generic);

  const token = crypto.randomBytes(24).toString('hex');
  magicLinks.set(token, { customer_id: c.id, expires: Date.now() + 20 * 60000 });
  const base = process.env.LAWNCOPILOT_BASE_URL || 'https://aiagent.ringlypro.com';
  const url = `${base}/lawncopilot/api/v1/auth/verify?token=${token}`;

  await notify({
    tenant_id, customer_id: c.id, channel: 'email', template: 'account_registration',
    vars: { name: c.name, portal_url: url }, userInitiated: true
  });
  const dev = process.env.NODE_ENV !== 'production';
  res.json({ ...generic, ...(dev ? { url } : {}) });
});

router.get('/verify', (req, res) => {
  const rec = magicLinks.get(req.query.token);
  if (!rec || rec.expires < Date.now()) {
    magicLinks.delete(req.query.token);
    return res.redirect(`${require('../tenancy').basePath(req)}/${req.tenantSlug}/login?expired=1`);
  }
  magicLinks.delete(req.query.token);
  res.cookie('lawncopilot_token', sign({ id: rec.customer_id, tenant_id: T(req), kind: 'customer' }), COOKIE);
  res.redirect(`${require('../tenancy').basePath(req)}/${req.tenantSlug}/portal/`);
});

router.post('/logout', (req, res) => {
  res.clearCookie('lawncopilot_token', { path: '/' });
  res.json({ success: true });
});

router.get('/me', async (req, res) => {
  if (!req.customer) return res.status(401).json({ success: false, error: 'Not signed in' });
  const c = await Customer.findOne({ where: { id: req.customer.id, tenant_id: req.customer.tenant_id }, raw: true });
  if (!c) return res.status(401).json({ success: false, error: 'Not signed in' });
  res.json({
    success: true,
    customer: {
      id: c.id, name: c.name, email: c.email, phone: c.phone,
      status: c.status, balance_cents: c.balance_cents, autopay_enabled: c.autopay_enabled
    }
  });
});

// ── Staff ──────────────────────────────────────────────────────────────────
router.post('/staff/login', async (req, res) => {
  const { email, password } = req.body || {};
  const tenant_id = T(req);
  const u = await User.findOne({ where: { tenant_id, email: String(email || '').toLowerCase().trim() } });
  if (!u || !u.password_hash) return res.status(401).json({ success: false, error: 'Invalid email or password' });
  const ok = await bcrypt.compare(String(password || ''), u.password_hash);
  if (!ok) return res.status(401).json({ success: false, error: 'Invalid email or password' });

  u.last_login_at = new Date();
  await u.save();
  res.cookie('lawncopilot_staff', sign({ id: u.id, tenant_id, email: u.email, role: u.role, kind: 'staff' }), COOKIE);
  res.json({ success: true, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});

router.post('/staff/logout', (req, res) => {
  res.clearCookie('lawncopilot_staff', { path: '/' });
  res.json({ success: true });
});

router.get('/staff/me', async (req, res) => {
  if (!req.staff) return res.status(401).json({ success: false, error: 'Not signed in' });
  // The JWT carries id/tenant/role but no display name, so returning it raw
  // rendered "undefined (owner)" in the admin header. Read the row.
  const u = await User.findOne({
    where: { id: req.staff.id, tenant_id: req.staff.tenant_id }, raw: true
  });
  if (!u) return res.status(401).json({ success: false, error: 'Not signed in' });
  res.json({
    success: true,
    user: {
      id: u.id, tenant_id: u.tenant_id, name: u.name || u.email,
      email: u.email, role: u.role, kind: 'staff'
    },
    // The admin rail shows whose office this is; it comes from the tenant, not
    // the user, so it ships here rather than costing a second request.
    company: req.tenant ? { name: req.tenant.name, slug: req.tenant.slug, plan: req.tenant.plan } : null
  });
});

module.exports = router;
