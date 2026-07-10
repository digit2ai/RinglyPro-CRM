'use strict';

/**
 * Cookie-based JWT auth (mirrors the Veritas vertical pattern).
 * Token cookie: lite_token. Secret: LITE_JWT_SECRET || JWT_SECRET.
 * Payload: { user_id, tenant_id, email, name }.
 */
const jwt = require('jsonwebtoken');

const SECRET = process.env.LITE_JWT_SECRET || process.env.JWT_SECRET || 'ringlypro-lite-dev-secret';
const COOKIE = 'lite_token';

function sign(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: '30d' });
}

function setCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'none', path: '/', maxAge: 30 * 24 * 3600 * 1000
  });
}

function clearCookie(res) {
  res.clearCookie(COOKIE, { path: '/' });
}

function readToken(req) {
  if (req.cookies && req.cookies[COOKIE]) return req.cookies[COOKIE];
  const h = req.headers['authorization'];
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return null;
}

// Hard gate for API routes.
function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'unauthorized' });
  try {
    req.user = jwt.verify(token, SECRET);
    req.tenantId = req.user.tenant_id;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

// Soft check for pages (attaches req.user if present, never blocks).
function optionalAuth(req, res, next) {
  const token = readToken(req);
  if (token) { try { req.user = jwt.verify(token, SECRET); req.tenantId = req.user.tenant_id; } catch (_) {} }
  next();
}

module.exports = { sign, setCookie, clearCookie, requireAuth, optionalAuth, SECRET, COOKIE };
