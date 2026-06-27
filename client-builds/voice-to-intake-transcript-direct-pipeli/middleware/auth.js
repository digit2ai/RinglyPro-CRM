// =====================================================
// Auth -> req.tenantId + req.jwt
//
// Accepts TWO credential types on write/read endpoints:
//   1) A RinglyPro CRM JWT (verified with JWT_SECRET) — the owner / signed-in user.
//   2) An app-scoped "champion code" (verified with CHAMPION_LINK_SECRET) — a
//      capability token embedded in a champion's personal magic link (?c=<code>).
//      It carries the champion's identity (email/name) so the inbox stays scoped
//      and submissions are attributable, with NO CRM login required.
//
// Champion codes are minted ONLY by signChampion() below, gated behind
// requireCrmAuth (a genuine CRM token). A champion code can never mint another.
// =====================================================

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key';
const CHAMPION_SECRET = process.env.CHAMPION_LINK_SECRET || JWT_SECRET;
const CHAMPION_PURPOSE = 'voice-champion';

// Stable positive integer tenant id derived from the champion email (djb2),
// kept below the reserved test-tenant range (>=990000).
function emailToTenant(email) {
  let h = 5381;
  const s = String(email || '').toLowerCase();
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return (h % 800000) + 1000; // 1000 .. 800999
}

function signChampion({ name, email }) {
  return jwt.sign({
    purpose: CHAMPION_PURPOSE,
    email,
    name: name || email,
    businessName: name || email,
    tenant_id: emailToTenant(email)
  }, CHAMPION_SECRET, { expiresIn: '365d' });
}

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

// Pull the credential from the Authorization header, a champion header, or the
// ?c= query param (first visit via magic link before JS persists it).
function getCredential(req) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7).trim();
  if (req.headers['x-champion-code']) return String(req.headers['x-champion-code']).trim();
  if (req.query && req.query.c) return String(req.query.c).trim();
  return null;
}

// Try CRM secret first, then the champion secret (when distinct).
function verifyAny(token) {
  try { return jwt.verify(token, JWT_SECRET); } catch (e) { /* fall through */ }
  if (CHAMPION_SECRET !== JWT_SECRET) {
    try { return jwt.verify(token, CHAMPION_SECRET); } catch (e) { /* fall through */ }
  }
  return null;
}

// CRM session OR champion code accepted.
function requireAuth(req, res, next) {
  const token = getCredential(req);
  if (!token) return res.status(401).json({ error: 'Access token required', reason: 'no_token' });
  const decoded = verifyAny(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid or expired token', reason: 'verify_failed' });
  const tenantId = extractTenantId(decoded);
  if (tenantId == null) return res.status(401).json({ error: 'Token missing tenant context', reason: 'no_tenant_claim' });
  req.tenantId = tenantId;
  req.jwt = decoded;
  req.isChampion = decoded.purpose === CHAMPION_PURPOSE;
  next();
}

// Owner-only: a genuine CRM token (NOT a champion code). Used to mint links.
function requireCrmAuth(req, res, next) {
  const token = getCredential(req);
  if (!token) return res.status(401).json({ error: 'Access token required' });
  let decoded;
  try { decoded = jwt.verify(token, JWT_SECRET); } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  if (decoded.purpose === CHAMPION_PURPOSE) {
    return res.status(403).json({ error: 'Champion links cannot mint other links' });
  }
  const tenantId = extractTenantId(decoded);
  if (tenantId == null) return res.status(401).json({ error: 'Token missing tenant context' });
  req.tenantId = tenantId;
  req.jwt = decoded;
  next();
}

module.exports = { requireAuth, requireCrmAuth, extractTenantId, signChampion, emailToTenant };
