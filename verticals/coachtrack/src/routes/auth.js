'use strict';

/**
 * Visionarium Coaching — authentication (cookie-based JWT).
 * Open, free self-signup for Visionarium users. Each user is their own private
 * tenant (tenant_id = user id) so coaching data is fully isolated per person.
 *
 * POST /api/v1/auth/signup { name, email, password } -> create + login
 * POST /api/v1/auth/login  { email, password }       -> login
 * POST /api/v1/auth/logout                           -> clear cookie
 * GET  /api/v1/auth/me                               -> current user
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { User } = require('../models');

const SECRET = process.env.COACHTRACK_JWT_SECRET || process.env.JWT_SECRET || 'coachtrack-2026-secret';
const COOKIE = 'coachtrack_token';
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30d

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: MAX_AGE,
    path: '/coaching'
  });
}

function sign(user) {
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id || user.id, email: user.email, name: user.name, role: user.role },
    SECRET,
    { expiresIn: '30d' }
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Open, free signup (Visionarium users) ──────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim().slice(0, 120);
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Correo inválido' });
    if (password.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

    const existing = await User.findOne({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Ese correo ya está registrado. Inicia sesión.' });

    const password_hash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, password_hash, org: 'visionarium', role: 'member' });
    // Each user is their own tenant.
    user.tenant_id = user.id;
    await user.save();

    setAuthCookie(res, sign(user));
    res.json({ success: true, user: { email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    console.error('Visionarium signup error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    if (!user.tenant_id) { user.tenant_id = user.id; await user.save(); }

    setAuthCookie(res, sign(user));
    res.json({ success: true, user: { email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    console.error('Visionarium login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/coaching' });
  res.json({ success: true });
});

router.get('/me', (req, res) => {
  res.json({ success: true, user: req.user || null });
});

module.exports = router;
