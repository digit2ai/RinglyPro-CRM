// =====================================================
// lib/auth.js — magic-link tokens and session JWTs.
//
// Self-contained on purpose. This is a client-build sub-app; reaching into the
// main app's middleware would couple its deploy to refactors in src/, which is
// exactly what the auto-mount loop exists to avoid. `jsonwebtoken` is the same
// library every vertical in this repo already signs with — no crypto invented
// here, just no cross-import either.
//
// PII: the only personal data in this app is Greg's email address. It is masked
// before any console write, and magic-link tokens are never logged in any
// environment, at any level.
// =====================================================

'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SERVICE = 'surgical-robotics-contract-advisory-firm';
const AUDIENCE = 'srcaf';
const SESSION_TTL = '30d';
const MAGIC_TTL_MINUTES = 30;

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

function newMagicToken() {
  return crypto.randomBytes(32).toString('hex');
}

function magicExpiry(nowMs) {
  return new Date((nowMs || Date.now()) + MAGIC_TTL_MINUTES * 60 * 1000);
}

function signSession({ email, tenant_id }) {
  return jwt.sign(
    { aud: AUDIENCE, email, tenant_id },
    secret(),
    { expiresIn: SESSION_TTL },
  );
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

// Writes require a session. Reads are deliberately public — the whole artifact
// is public-benchmark market modelling, and a login wall on a calculator Greg
// wants to show people would be friction with no security value.
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
  MAGIC_TTL_MINUTES,
  secret,
  usingDevSecret,
  maskEmail,
  normaliseEmail,
  isEmail,
  newMagicToken,
  magicExpiry,
  signSession,
  verifySession,
  bearerFrom,
  requireAuth,
  readSession,
};
