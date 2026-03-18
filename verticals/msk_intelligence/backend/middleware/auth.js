'use strict';

const jwt = require('jsonwebtoken');
const { Sequelize } = require('sequelize');

const JWT_SECRET = process.env.MSK_JWT_SECRET || process.env.JWT_SECRET || 'msk-intelligence-secret-2026';

const dbUrl = process.env.DATABASE_URL || 'postgres://localhost:5432/msk_dev';
const sequelize = new Sequelize(dbUrl, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

/**
 * JWT Authentication middleware
 */
function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    // Audit log for HIPAA
    logAudit(decoded.userId, 'api_access', 'endpoint', null, req);

    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Role-based authorization middleware
 */
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Generate JWT token
 */
function generateToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      firstName: user.first_name,
      lastName: user.last_name
    },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

/**
 * Audit logging for HIPAA compliance
 */
async function logAudit(userId, action, resourceType, resourceId, req) {
  try {
    await sequelize.query(`
      INSERT INTO msk_audit_log (user_id, action, resource_type, resource_id, ip_address, user_agent)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, {
      bind: [
        userId,
        action,
        resourceType,
        resourceId,
        req?.ip || req?.connection?.remoteAddress || null,
        req?.headers?.['user-agent']?.substring(0, 500) || null
      ]
    });
  } catch (err) {
    // Don't block requests for audit failures
    console.error('[MSK] Audit log error:', err.message);
  }
}

module.exports = { authenticate, authorize, generateToken, logAudit, JWT_SECRET, sequelize };
