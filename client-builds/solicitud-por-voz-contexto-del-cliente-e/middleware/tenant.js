// =====================================================
// Auth -> req.tenantId + req.jwt
//
// Reuses the existing RinglyPro CRM JWT (verified with JWT_SECRET). No custom
// signer. A valid token without a tenant claim defaults to tenant_id = 1 (demo).
// Missing / invalid token -> 401. Applied to ALL /api/v1 read + write endpoints
// since this is internal financial data (do not expose P&L publicly).
// =====================================================

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';

function extractTenant(decoded) {
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
  return 1; // default tenant for demo when the token lacks one
}

function getToken(req) {
  const h = req.headers['authorization'] || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  if (req.query && req.query.token) return String(req.query.token).trim();
  return null;
}

function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ error: 'authentication required' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'invalid or expired token' });
  }
  req.jwt = decoded;
  req.tenantId = extractTenant(decoded);
  next();
}

module.exports = { requireAuth, extractTenant, JWT_SECRET };
