'use strict';

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'ronin-brotherhood-secret-2024';

/**
 * Authenticate member JWT token
 */
const authenticateMember = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    req.member = decoded;
    req.memberId = decoded.memberId;
    req.tenantId = decoded.tenantId || 1;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
};

/**
 * Authenticate admin (email-based check)
 */
const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Admin authentication required' });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);

    if (!decoded.isAdmin) {
      return res.status(403).json({ success: false, error: 'Admin access required' });
    }

    req.member = decoded;
    req.memberId = decoded.memberId;
    req.tenantId = decoded.tenantId || 1;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid admin token' });
  }
};

/**
 * Optional auth - sets member if token present, continues if not
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, JWT_SECRET);
      req.member = decoded;
      req.memberId = decoded.memberId;
      req.tenantId = decoded.tenantId || 1;
    }
  } catch (error) {
    // Token invalid, continue as guest
  }
  req.tenantId = req.tenantId || 1;
  next();
};

/**
 * Generate JWT token for a member
 */
const generateToken = (member, isAdmin = false) => {
  return jwt.sign(
    {
      memberId: member.id,
      email: member.email,
      tenantId: member.tenant_id || 1,
      isAdmin
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
};

module.exports = { authenticateMember, authenticateAdmin, optionalAuth, generateToken };
