// =====================================================
// lib/auth.js — the Projects Hub session, exchanged for a local one.
//
// Self-contained on purpose. This is a client-build sub-app; reaching into the
// main app's middleware would couple its deploy to refactors in src/, which is
// exactly what the auto-mount loop exists to avoid. `jsonwebtoken` is the same
// library every vertical in this repo already signs with — no crypto invented
// here, just no cross-import either.
//
// PII: the only personal data in this app is an email address. It is masked
// before any console write, and no token is ever logged, in any environment, at
// any level.
// =====================================================

'use strict';

const jwt = require('jsonwebtoken');

const SERVICE = 'surgical-robotics-contract-advisory-firm';
const AUDIENCE = 'srcaf';
const SESSION_MAX_SECONDS = 12 * 60 * 60;

function secret() {
  return process.env.SRCAF_JWT_SECRET
    || process.env.JWT_SECRET
    || 'srcaf-dev-only-insecure-secret';
}

function usingDevSecret() {
  return !process.env.SRCAF_JWT_SECRET && !process.env.JWT_SECRET;
}

// e***@yahoo.com — enough to recognise, not enough to harvest.
function maskEmail(email) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at < 1) return '***';
  return `${s[0]}***${s.slice(at)}`;
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase().slice(0, 255);
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || ''));
}

// ---------------------------------------------------------------------------
// The Projects Hub session is the identity for this app.
//
// /projects signs its JWT with JWT_SECRET and carries { userId, email, clientId,
// businessName } with no audience claim. Our own session tokens carry
// aud='srcaf'. Verifying with `audience` set therefore keeps the two kinds
// strictly apart: a Projects token can never be mistaken for one of ours, and
// ours is not accepted by /projects either.
//
// A CRM token is exchanged for our session once, at the gate. It is not used as
// a bearer on every call, so that revoking someone's Projects access does not
// depend on this app re-reading a token it never sees again.
// ---------------------------------------------------------------------------
function projectsSecret() {
  return process.env.JWT_SECRET || 'your-super-secret-jwt-key';
}

function verifyProjectsToken(token) {
  try {
    const decoded = jwt.verify(String(token || ''), projectsSecret());
    if (!decoded || !decoded.email) return null;
    // A token bearing our own audience is one of ours, not a Projects session.
    if (decoded.aud === AUDIENCE) return null;
    return {
      email: String(decoded.email).toLowerCase(),
      userId: decoded.userId,
      clientId: decoded.clientId,
      businessName: decoded.businessName || null,
      exp: decoded.exp || null,
    };
  } catch (err) {
    return null;
  }
}

// The session lives for the SHORTER of twelve hours and whatever is left of the
// Projects session it was minted from.
//
// Both halves matter. Without the upstream cap, removing somebody from
// /projects would leave them holding access here until this token expired on
// its own. Without the twelve-hour cap, a fresh seven-day Projects token would
// mint a seven-day session here — and the cookie is set for twelve hours, so
// the bearer token would quietly outlive its own cookie and be the longer-lived
// of the two credentials. Revocation now takes effect within half a day.
function signSession({ email, tenant_id, expiresAtEpochSeconds }) {
  const payload = { aud: AUDIENCE, email, tenant_id };
  const nowSec = Math.floor(Date.now() / 1000);
  const ourCap = nowSec + SESSION_MAX_SECONDS;
  const upstream = Number.isFinite(expiresAtEpochSeconds) && expiresAtEpochSeconds > nowSec
    ? expiresAtEpochSeconds
    : ourCap;

  return jwt.sign(payload, secret(), { expiresIn: Math.min(ourCap, upstream) - nowSec });
}

function verifySession(token) {
  try {
    const decoded = jwt.verify(token, secret(), { audience: AUDIENCE });
    if (!decoded || !decoded.email) return null;
    return { email: decoded.email, tenant_id: decoded.tenant_id };
  } catch (err) {
    return null;
  }
}

function bearerFrom(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|;\s*)srcaf_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

// Every route that touches data requires a session. At the default `private`
// access level the gate in index.js has already refused anonymous callers, so
// this is the second of two independent checks rather than the only one.
function requireAuth(req, res, next) {
  const token = bearerFrom(req);
  const session = token ? verifySession(token) : null;
  if (!session) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  req.session = session;
  return next();
}

// Optional session, for endpoints that behave the same either way but want to
// stamp an owner when one is present.
function readSession(req, _res, next) {
  const token = bearerFrom(req);
  req.session = token ? verifySession(token) : null;
  return next();
}

module.exports = {
  SERVICE,
  AUDIENCE,
  secret,
  usingDevSecret,
  maskEmail,
  normaliseEmail,
  isEmail,
  signSession,
  verifySession,
  verifyProjectsToken,
  bearerFrom,
  requireAuth,
  readSession,
};
