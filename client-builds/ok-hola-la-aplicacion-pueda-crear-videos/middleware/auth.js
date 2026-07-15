'use strict';
// Reuse the existing RinglyPro JWT lib — never roll a custom signer.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || process.env.OKHOLA_JWT_SECRET || 'okhola-dev-secret-change-me';
const JWT_TTL = '30d';

function signJwt(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_TTL });
}

// Verify JWT from Authorization: Bearer <token>. Attaches req.tenantId + req.email.
function requireAuth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const m = hdr.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'missing bearer token' });
  try {
    const decoded = jwt.verify(m[1], JWT_SECRET);
    if (!decoded || typeof decoded.tenant_id === 'undefined') {
      return res.status(401).json({ error: 'invalid token' });
    }
    req.tenantId = decoded.tenant_id;
    req.userId = decoded.uid;
    req.email = decoded.email;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
}

module.exports = { signJwt, requireAuth, JWT_SECRET };
