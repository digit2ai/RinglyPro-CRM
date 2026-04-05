'use strict';

/**
 * v2 Authentication Middleware
 *
 * Reuses the existing JWT_SECRET from v1 — learners log in through the
 * existing /Torna_Idioma/api/auth/login endpoint and the same token works
 * for v2 routes. This is intentional: v2 is additive, not a replacement.
 *
 * The middleware:
 *   1. Verifies the Bearer token
 *   2. Confirms tenant_id = 'torna_idioma'
 *   3. Optionally restricts by role
 *   4. Attaches req.user = { id, email, role, tenant_id, full_name, ... }
 *
 * Usage:
 *   router.get('/me',       v2Auth.any,     handler);
 *   router.post('/admin',   v2Auth.admin,   handler);
 *   router.get('/learner',  v2Auth.learner, handler);  // student/bpo_worker/admin
 */

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'ringlypro-jwt-secret';
const TENANT_ID = 'torna_idioma';

function v2Auth(roles = []) {
  return (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required', hint: 'Login at /Torna_Idioma/api/auth/login first' });
    }

    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.tenant_id !== TENANT_ID) {
        return res.status(403).json({ error: 'Invalid tenant access' });
      }
      if (roles.length > 0 && !roles.includes(decoded.role)) {
        return res.status(403).json({ error: 'Insufficient permissions for this learner route' });
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  };
}

// Role presets for v2 learner platform
v2Auth.any = v2Auth([]);
v2Auth.admin = v2Auth(['admin']);
// Learner-facing routes — anyone who can take lessons: students, BPO workers, teachers (for testing), admins
v2Auth.learner = v2Auth(['admin', 'teacher', 'student', 'bpo_worker']);

module.exports = v2Auth;
