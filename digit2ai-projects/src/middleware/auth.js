'use strict';

const jwt = require('jsonwebtoken');
const { UserAccess } = require('../models');

// Reuse JWT verification from main CRM
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access token required' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key');

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      clientId: decoded.clientId,
      businessName: decoded.businessName
    };

    // Auto-provision user access on first visit
    try {
      const [access] = await UserAccess.findOrCreate({
        where: { email: decoded.email, workspace_id: 1 },
        defaults: {
          user_id: decoded.userId,
          email: decoded.email,
          display_name: decoded.businessName || decoded.email,
          role: 'admin',
          active: true
        }
      });
      access.last_login = new Date();
      await access.save();
      req.userAccess = access;
    } catch (accessErr) {
      // Non-blocking - don't fail auth if access tracking fails
      console.log('[D2AI] User access tracking skipped:', accessErr.message);
    }

    // Enforce calendar_only role: deny anything that isn't calendar-related
    if (req.userAccess && req.userAccess.role === 'calendar_only') {
      // baseUrl gives the prefix mounted at app.use('/api/v1/<thing>', ...) so we
      // need to inspect the original URL path for gating.
      const fullPath = req.baseUrl + req.path;
      const allowed = /^\/api\/v1\/(calendar|me)(\/|$)/.test(fullPath);
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

module.exports = { authenticateToken, requireRole };
