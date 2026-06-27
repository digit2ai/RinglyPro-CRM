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

// Derive the tenant id from a verified CRM token. The RinglyPro login token
// carries clientId; we also accept the explicit tenant_* names and, as a last
// resort, userId/sub/id so any valid signed-in CRM session can submit (a row
// is always attributable to the account that sent it).
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

function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!token) {
    return res.status(401).json({ error: 'Access token required', reason: 'no_token' });
  }
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token', reason: 'verify_failed' });
  }
  const tenantId = extractTenantId(decoded);
  if (tenantId == null) {
    return res.status(401).json({ error: 'Token missing tenant context', reason: 'no_tenant_claim' });
  }
  req.tenantId = tenantId;
  req.jwt = decoded;
  next();
}

module.exports = { requireAuth, extractTenantId };
