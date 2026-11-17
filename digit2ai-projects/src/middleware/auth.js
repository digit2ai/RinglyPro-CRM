'use strict';

const jwt = require('jsonwebtoken');
const { UserAccess } = require('../models');


// Who may use the Projects Hub (the owner's private command center):
//   1. the owner tenant: a CRM session token whose clientId is the Digit2AI
//      client (PROJECTS_OWNER_CLIENT_IDS, default 15), or
//   2. an email listed in PROJECTS_ALLOWED_EMAILS (default the owner), or
//   3. an existing access row whose role an operator set by hand to something
//      other than 'admin' (e.g. 'calendar_only').
// Only a CRM session token counts: it must carry a numeric userId and no
// `aud` claim (tokens minted for other products carry other shapes).
const OWNER_CLIENT_IDS = String(process.env.PROJECTS_OWNER_CLIENT_IDS || '15')
  .split(',').map(s => parseInt(s.trim(), 10)).filter(Number.isFinite);
const ALLOWED_EMAILS = String(process.env.PROJECTS_ALLOWED_EMAILS || 'mstagg@digit2ai.com')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

async function hubGate(decoded) {
  if (!decoded || typeof decoded !== 'object' || decoded.aud) return { ok: false };
  const userId = parseInt(decoded.userId, 10);
  const email = String(decoded.email || '').trim().toLowerCase();
  if (!Number.isFinite(userId) || userId <= 0 || !email) return { ok: false };

  let access = null;
  try {
    access = await UserAccess.findOne({ where: { email, workspace_id: 1 } });
  } catch (_) { access = null; }

  const ownerTenant = OWNER_CLIENT_IDS.includes(parseInt(decoded.clientId, 10));
  const listed = ALLOWED_EMAILS.includes(email);
  if (ownerTenant || listed) {
    if (!access) {
      try {
        [access] = await UserAccess.findOrCreate({
          where: { email, workspace_id: 1 },
          defaults: { user_id: userId, email, display_name: decoded.businessName || email, role: 'admin', active: true }
        });
      } catch (_) { access = null; }
    }
    if (access && access.active === false) return { ok: false };
    return { ok: true, access };
  }
  if (access && access.active !== false && access.role && access.role !== 'admin') {
    return { ok: true, access };
  }
  return { ok: false };
}

// Reuse JWT verification from main CRM
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');

    const gate = await hubGate(decoded);
    if (!gate.ok) {
      // 403, never a fresh admin row: before 2026-11-17 ANY token signed with
      // the shared JWT_SECRET (every RinglyPro customer login, and public
      // signups of other products that sign with the same secret) was
      // auto-provisioned as an ADMIN of this owner-only hub.
      return res.status(403).json({ success: false, error: 'This account has no access to the Projects Hub' });
    }

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      clientId: decoded.clientId,
      businessName: decoded.businessName
    };
    req.userAccess = gate.access || null;
    if (gate.access) {
      gate.access.last_login = new Date();
      gate.access.save().catch(() => {});
    }

    // Enforce calendar_only role: deny anything that isn't calendar-related.
    // The digit2ai-projects router is mounted at /projects in the parent app,
    // so the resolved path can be either '/api/v1/...' or '/projects/api/v1/...'.
    if (req.userAccess && req.userAccess.role === 'calendar_only') {
      const path = (req.originalUrl || '').split('?')[0];
      const allowed = /\/api\/v1\/(calendar|me)(\/|$)/.test(path);
      if (!allowed) {
        return res.status(403).json({ success: false, error: 'This account is limited to the Calendar module' });
      }
    }

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    return res.status(500).json({ success: false, error: 'Authentication failed' });
  }
};

// Role check middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.userAccess) return next(); // Skip if access tracking failed
    if (!roles.includes(req.userAccess.role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };
};

module.exports = { authenticateToken, requireRole, hubGate };
