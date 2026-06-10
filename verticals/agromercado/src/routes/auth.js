'use strict';

/**
 * AgroMercado — Phase 1: Unified auth (Cédula/RIF, roles admin|producer|buyer).
 * JWT in HttpOnly+Secure cookie. Registration, login, logout, me, KYC submit.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

const { User, Kyc } = require('../models');
const { sign, COOKIE_NAME, tenantId, requireAuth } = require('../middleware/auth');

const ROLES = ['admin', 'producer', 'buyer'];

function setCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true, secure: true, sameSite: 'none', maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

// POST /auth/register
router.post('/register', async (req, res) => {
  try {
    const { cedula_rif, nombre, password, role, phone } = req.body;
    if (!cedula_rif || !nombre || !password) {
      return res.status(400).json({ error: 'cedula_rif, nombre y password son requeridos' });
    }
    const r = ROLES.includes(role) ? role : 'buyer';
    const tid = tenantId(req);
    const exists = await User.findOne({ where: { tenant_id: tid, cedula_rif } });
    if (exists) return res.status(409).json({ error: 'Ya existe un usuario con esa cédula/RIF' });

    const password_hash = await bcrypt.hash(password, 10);
    const user = await User.create({ tenant_id: tid, cedula_rif, nombre, role: r, password_hash, phone });
    const token = sign(user);
    setCookie(res, token);
    res.status(201).json({ success: true, user: publicUser(user), dashboard: dashboardFor(user.role) });
  } catch (e) {
    console.error('AgroMercado register error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/login
router.post('/login', async (req, res) => {
  try {
    const { cedula_rif, password } = req.body;
    if (!cedula_rif || !password) return res.status(400).json({ error: 'cedula_rif y password requeridos' });
    const tid = tenantId(req);
    const user = await User.findOne({ where: { tenant_id: tid, cedula_rif } });
    if (!user || !user.password_hash) return res.status(401).json({ error: 'Credenciales inválidas' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });
    const token = sign(user);
    setCookie(res, token);
    res.json({ success: true, user: publicUser(user), dashboard: dashboardFor(user.role) });
  } catch (e) {
    console.error('AgroMercado login error:', e);
    res.status(500).json({ error: e.message });
  }
});

// POST /auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: true, sameSite: 'none' });
  res.json({ success: true });
});

// GET /auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await User.findByPk(req.amUser.id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json({ success: true, user: publicUser(user), dashboard: dashboardFor(user.role) });
});

// POST /auth/verify — submit KYC (flips is_verified only after admin approval)
router.post('/verify', requireAuth, async (req, res) => {
  try {
    const { doc_url } = req.body;
    const user = await User.findByPk(req.amUser.id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    const kyc = await Kyc.create({
      tenant_id: user.tenant_id, user_id: user.id, cedula_rif: user.cedula_rif, doc_url, status: 'pending'
    });
    res.status(201).json({ success: true, kyc_id: kyc.id, status: 'pending', message: 'Solicitud de verificación enviada' });
  } catch (e) {
    console.error('AgroMercado verify error:', e);
    res.status(500).json({ error: e.message });
  }
});

function publicUser(u) {
  return { id: u.id, cedula_rif: u.cedula_rif, nombre: u.nombre, role: u.role, is_verified: u.is_verified, phone: u.phone };
}
function dashboardFor(role) {
  return role === 'admin' ? '/agromercado/admin' : role === 'producer' ? '/agromercado/productor' : '/agromercado/comprador';
}

module.exports = router;
