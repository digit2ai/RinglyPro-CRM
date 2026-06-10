'use strict';

/**
 * AgroMercado — auth helpers: JWT cookie verification, role guards, tenant resolver.
 */

const jwt = require('jsonwebtoken');
const { DEFAULT_TENANT } = require('../models');

const AUTH_SECRET = process.env.AGROMERCADO_JWT_SECRET || process.env.JWT_SECRET || 'agromercado-istc-2026-secret';
const COOKIE_NAME = 'agromercado_token';

function sign(user) {
  return jwt.sign(
    { id: user.id, role: user.role, tenant_id: user.tenant_id, nombre: user.nombre, is_verified: user.is_verified },
    AUTH_SECRET,
    { expiresIn: '7d' }
  );
}

function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// Populates req.amUser from the cookie (if present + valid). Never blocks.
function loadUser(req, _res, next) {
  const token = getCookie(req, COOKIE_NAME);
  if (token) { try { req.amUser = jwt.verify(token, AUTH_SECRET); } catch (e) { /* invalid */ } }
  next();
}

// Resolve the active tenant: an authed user's tenant, else ?tenant_id, else default.
function tenantId(req) {
  if (req.amUser && req.amUser.tenant_id) return Number(req.amUser.tenant_id);
  const q = req.query.tenant_id || req.body.tenant_id;
  return q ? Number(q) : DEFAULT_TENANT;
}

function requireAuth(req, res, next) {
  if (!req.amUser) return res.status(401).json({ error: 'No autorizado' });
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.amUser) return res.status(401).json({ error: 'No autorizado' });
    if (!roles.includes(req.amUser.role)) return res.status(403).json({ error: 'Permiso insuficiente' });
    next();
  };
}

function requireVerifiedProducer(req, res, next) {
  if (!req.amUser) return res.status(401).json({ error: 'No autorizado' });
  if (req.amUser.role !== 'producer' && req.amUser.role !== 'admin') {
    return res.status(403).json({ error: 'Solo productores pueden publicar' });
  }
  if (req.amUser.role === 'producer' && !req.amUser.is_verified) {
    return res.status(403).json({ error: 'Verificación KYC requerida para publicar' });
  }
  next();
}

module.exports = {
  AUTH_SECRET, COOKIE_NAME, sign, loadUser, tenantId,
  requireAuth, requireRole, requireVerifiedProducer
};
