// =====================================================
// JWT verify -> req.tenantId
//
// Reuses the RinglyPro JWT secret (process.env.JWT_SECRET) and verifies the
// Bearer token with jsonwebtoken. We NEVER sign tokens here — verify only.
// tenant_id is read from the token claims, accepting the several names the
// CRM issues across its routes (tenant_id | clientId | client_id).
// =====================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

function extractTenantId(decoded) {
  const raw = decoded.tenant_id != null ? decoded.tenant_id
    : decoded.tenantId != null ? decoded.tenantId
    : decoded.clientId != null ? decoded.clientId
    : decoded.client_id != null ? decoded.client_id
    : null;
  if (raw == null) return null;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) ? n : null;
}

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  const tenantId = extractTenantId(decoded);
  if (tenantId == null) {
    return res.status(401).json({ error: 'Token missing tenant context' });
  }
  req.tenantId = tenantId;
  req.jwt = decoded;
  next();
}

module.exports = { requireAuth, extractTenantId };
