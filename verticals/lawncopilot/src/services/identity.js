'use strict';

/**
 * Lawn Co-Pilot — ONE DOOR, three destinations.
 *
 * A person types an email and a password on lawncopilot.com/login. Who they are
 * decides where they land:
 *
 *   Digit2AI admin  → /platform            every company on the platform
 *   Company staff   → /<slug>/admin        that landscaper's own office
 *   Homeowner       → /<slug>/portal       their services, schedule and billing
 *
 * Entitlement is RESOLVED, never asked. The form has no "I am a…" selector —
 * the account itself says which it is, and the same email can legitimately be
 * more than one thing (an owner who is also a customer of another company, or
 * the operator who also owns a company). When more than one matches, we hand
 * back the list and let them pick rather than guessing and dropping access.
 *
 * Priority is most-privileged first, so a single-match admin goes straight to
 * the platform view.
 *
 * SECURITY: the password is verified against EVERY candidate independently.
 * Matching an email in one table never grants a session in another.
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { PlatformUser, User, Customer, Tenant } = require('../models');

const SECRET = () => process.env.LAWNCOPILOT_JWT_SECRET || process.env.JWT_SECRET || 'lawncopilot-dev-secret';
const COOKIE = { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 86400000, path: '/' };

const ROLE_LABEL = {
  owner: 'Owner', admin: 'Administrator', dispatcher: 'Dispatcher',
  csr: 'Office', tech: 'Crew'
};

function sign(payload) { return jwt.sign(payload, SECRET(), { expiresIn: '30d' }); }

/**
 * Every identity this email+password legitimately unlocks, most privileged
 * first. An empty array means "invalid email or password" — the caller must not
 * say which part was wrong.
 */
async function resolveIdentities(email, password) {
  const e = String(email || '').toLowerCase().trim();
  const pw = String(password || '');
  const found = [];
  if (!e || !pw) return found;

  // 1. Digit2AI platform admin — above all companies.
  try {
    const pu = await PlatformUser.findOne({ where: { email: e } });
    if (pu && pu.password_hash && pu.status !== 'disabled'
        && await bcrypt.compare(pw, pu.password_hash)) {
      found.push({
        kind: 'platform', id: pu.id, name: pu.name, role: pu.role,
        label: 'Digit2AI Platform', sublabel: 'Every company, billing and AI spend',
        path: '/platform'
      });
    }
  } catch (e2) { /* a broken table must not block the other paths */ }

  // 2. Company staff — the landscaper's own office. Can span companies.
  try {
    const staff = await User.findAll({ where: { email: e } });
    for (const u of staff) {
      if (!u.password_hash || u.status === 'inactive') continue;
      if (!await bcrypt.compare(pw, u.password_hash)) continue;
      const t = await Tenant.findByPk(u.tenant_id, { raw: true });
      if (!t || t.status === 'deleted') continue;
      found.push({
        kind: 'staff', id: u.id, tenant_id: t.id, slug: t.slug,
        name: u.name, role: u.role,
        label: t.name, sublabel: `${ROLE_LABEL[u.role] || u.role} · your company office`,
        path: `/${t.slug}/admin`
      });
    }
  } catch (e2) { /* keep going */ }

  // 3. Homeowner — a customer of one of our companies.
  try {
    const custs = await Customer.findAll({ where: { email: e } });
    for (const c of custs) {
      if (!c.password_hash || c.status === 'archived') continue;
      if (!await bcrypt.compare(pw, c.password_hash)) continue;
      const t = await Tenant.findByPk(c.tenant_id, { raw: true });
      if (!t || t.status === 'deleted') continue;
      found.push({
        kind: 'customer', id: c.id, tenant_id: t.id, slug: t.slug,
        name: c.name,
        label: t.name, sublabel: 'Your schedule, services and billing',
        path: `/${t.slug}/portal`
      });
    }
  } catch (e2) { /* keep going */ }

  return found;
}

/**
 * Mint the session for ONE identity. Each kind gets its own cookie, so a
 * customer session can never be read as a staff session.
 */
function grant(res, identity) {
  if (identity.kind === 'platform') {
    res.cookie('lawncopilot_platform', sign({
      id: identity.id, email: identity.email, role: identity.role, kind: 'platform'
    }), COOKIE);
  } else if (identity.kind === 'staff') {
    res.cookie('lawncopilot_staff', sign({
      id: identity.id, tenant_id: identity.tenant_id, email: identity.email,
      role: identity.role, kind: 'staff'
    }), COOKIE);
  } else if (identity.kind === 'customer') {
    res.cookie('lawncopilot_token', sign({
      id: identity.id, tenant_id: identity.tenant_id, email: identity.email, kind: 'customer'
    }), COOKIE);
  }
}

/**
 * A short-lived, signed record of an already-verified identity list, so the
 * chooser step never re-sends the password.
 */
function selectionToken(email, identities) {
  return jwt.sign({
    purpose: 'signin_select',
    email,
    ids: identities.map(i => ({
      kind: i.kind, id: i.id, tenant_id: i.tenant_id || null,
      role: i.role || null, slug: i.slug || null, path: i.path
    }))
  }, SECRET(), { expiresIn: '10m' });
}

function readSelection(token) {
  try {
    const p = jwt.verify(token, SECRET());
    return (p && p.purpose === 'signin_select') ? p : null;
  } catch (e) { return null; }
}

/** Strip anything the browser has no business seeing. */
function publicChoice(i, base) {
  return {
    kind: i.kind, label: i.label, sublabel: i.sublabel,
    slug: i.slug || null, url: `${base}${i.path}`
  };
}

module.exports = {
  resolveIdentities, grant, selectionToken, readSelection, publicChoice,
  ROLE_LABEL, COOKIE, sign
};
