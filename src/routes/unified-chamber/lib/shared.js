/**
 * Shared utilities for the unified chamber router.
 * Single Sequelize instance, single JWT secret, single auth middleware.
 */
const { Sequelize, QueryTypes } = require('sequelize');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const sequelize = new Sequelize(process.env.CRM_DATABASE_URL || process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
  logging: false
});

const JWT_SECRET = process.env.CHAMBER_JWT_SECRET || 'chamber-multitenant-secret-change-me';
const JWT_EXPIRY = '30d';

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ success: false, error: 'Token required' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.chamber_id !== req.chamber_id) {
      return res.status(403).json({ success: false, error: 'Token does not match this chamber' });
    }
    req.member = decoded;
    req.member.id = decoded.member_id;
    next();
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (!req.member || !['superadmin', 'admin_global', 'admin_regional'].includes(req.member.access_level)) {
    return res.status(403).json({ success: false, error: 'Admin access required' });
  }
  next();
}

async function isSuperadmin(memberId, chamberId) {
  const [v] = await sequelize.query(
    `SELECT access_level FROM members WHERE chamber_id = :c AND id = :m`,
    { replacements: { c: chamberId, m: memberId }, type: QueryTypes.SELECT }
  );
  return !!(v && v.access_level === 'superadmin');
}

module.exports = { sequelize, QueryTypes, jwt, bcrypt, JWT_SECRET, signToken, authMiddleware, requireAdmin, isSuperadmin };
