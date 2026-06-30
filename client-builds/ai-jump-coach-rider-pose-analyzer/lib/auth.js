// =====================================================
// Auth — reuse the RinglyPro CRM JWT (verified with JWT_SECRET) and derive a
// tenant_id from the token claims. No custom JWT signer. Every write endpoint
// and every read of analyses goes through requireAuth, which sets req.tenantId
// so the route layer can scope all queries to the caller's tenant.
// =====================================================

'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

// Accept any of the common tenant-bearing claims the CRM mints.
function extractTenantId(decoded) {
  const candidates = [
    decoded.tenant_id, decoded.tenantId,
    decoded.clientId, decoded.client_id,
    decoded.userId, decoded.user_id, decoded.sub, decoded.id
  ];
  for (const c of candidates) {
    if (c == null) continue;
    const n = parseInt(c, 10);
    if (Number.isInteger(n)) return n;
  }
  return null;
}

function getToken(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token).trim();
  return null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'Access token required' });
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); }
  catch (e) { return res.status(401).json({ error: 'Invalid or expired token' }); }
  const tenantId = extractTenantId(decoded);
  if (tenantId == null) return res.status(401).json({ error: 'Token missing tenant context' });
  req.tenantId = tenantId;
  req.jwt = decoded;
  next();
}

module.exports = { requireAuth, extractTenantId, getToken, JWT_SECRET };
