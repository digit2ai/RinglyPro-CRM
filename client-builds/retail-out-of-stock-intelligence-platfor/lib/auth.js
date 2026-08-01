// =====================================================
// lib/auth.js — JWT gate for write endpoints.
//
// Reuses the EXISTING RinglyPro JWT scheme by verifying against the same
// `JWT_SECRET` the main CRM signs with. It deliberately does NOT import
// src/middleware/auth.js: that module pulls in the CRM's Sequelize models and
// the credit system at require-time, and a client-build sub-app that hard-fails
// on an unrelated model import takes itself off the air for no benefit. This
// module issues no tokens — verification only, no custom signer.
//
// tenant_id resolution order: JWT claim -> query/body -> 1 (demo default).
// Read endpoints are public but ALWAYS scoped to the resolved tenant.
// =====================================================

'use strict';

const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || '';

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return null;
}

/** Decode without throwing. Returns the payload or null. */
function verify(token) {
  if (!token || !SECRET) return null;
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

/**
 * Resolve the tenant for THIS request. Never trusts a body-supplied tenant_id
 * when a JWT is present — the token wins, so a caller cannot read another
 * tenant's stockouts by editing a query string.
 */
function resolveTenant(req) {
  const payload = verify(extractToken(req));
  if (payload) {
    const claim = payload.tenant_id || payload.client_id || payload.clientId;
    const n = parseInt(claim, 10);
    if (isFinite(n) && n > 0) return n;
  }
  const q = parseInt(req.query.tenant_id || (req.body && req.body.tenant_id), 10);
  if (isFinite(q) && q > 0) return q;
  return 1; // demo default
}

/** Hard gate — 401 unless a valid JWT is present. Applied to all writes. */
function requireJwt(req, res, next) {
  const token = extractToken(req);
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', detail: 'Bearer token required' });
  }
  const payload = verify(token);
  if (!payload) {
    return res.status(401).json({ error: 'unauthorized', detail: 'invalid or expired token' });
  }
  req.auth = payload;
  req.tenant_id = resolveTenant(req);
  next();
}

/** Soft gate — attaches tenant, never blocks. Applied to dashboard reads. */
function attachTenant(req, res, next) {
  req.tenant_id = resolveTenant(req);
  next();
}

module.exports = { requireJwt, attachTenant, resolveTenant, verify };
