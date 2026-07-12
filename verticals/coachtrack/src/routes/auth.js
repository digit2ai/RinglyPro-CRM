'use strict';

/**
 * CoachTrack — authentication (cookie-based JWT login).
 * POST /api/v1/auth/login  { email, password } -> sets httpOnly cookie
 * POST /api/v1/auth/logout -> clears cookie
 * GET  /api/v1/auth/me     -> current user
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { User } = require('../models');

const SECRET = process.env.COACHTRACK_JWT_SECRET || process.env.JWT_SECRET || 'coachtrack-2026-secret';
const COOKIE = 'coachtrack_token';
const MAX_AGE = 1000 * 60 * 60 * 12; // 12h

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    maxAge: MAX_AGE,
    path: '/coaching'
  });
}

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Correo y contraseña requeridos' });

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, role: user.role }, SECRET, { expiresIn: '12h' });
    setAuthCookie(res, token);
    res.json({ success: true, user: { email: user.email, name: user.name, role: user.role } });
  } catch (e) {
    console.error('CoachTrack login error:', e.message);
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
