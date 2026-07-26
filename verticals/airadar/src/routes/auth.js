'use strict';

/**
 * AI Radar — authentication (cookie-based JWT). LOGIN ONLY, no public signup.
 *
 * POST /api/v1/auth/login   { email, password }
 * POST /api/v1/auth/logout
 * GET  /api/v1/auth/me                      -> user + capture token + share endpoints
 * POST /api/v1/auth/rotate-capture-token    -> new token (invalidates the old shortcut)
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { User } = require('../models');
const { newCaptureToken } = require('../services/users');

const SECRET = process.env.AIRADAR_JWT_SECRET || process.env.JWT_SECRET || 'airadar-2026-secret';
const COOKIE = 'airadar_token';
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30d

function sign(user) {
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id || user.id, email: user.email, name: user.name, role: user.role, lang: user.lang },
    SECRET,
    { expiresIn: '30d' }
  );
}

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const password = String(req.body.password || '');
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    if (!user.tenant_id) { user.tenant_id = user.id; await user.save(); }
    if (!user.capture_token) { user.capture_token = newCaptureToken(); await user.save(); }

    res.cookie(COOKIE, sign(user), {
      httpOnly: true, secure: true, sameSite: 'none', maxAge: MAX_AGE, path: '/airadar'
    });
    res.json({ success: true, user: { email: user.email, name: user.name, role: user.role, lang: user.lang } });
  } catch (e) {
    console.error('AI Radar login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/airadar' });
  res.json({ success: true });
});

router.get('/me', async (req, res) => {
  if (!req.user) return res.json({ success: true, user: null });
  const user = await User.findByPk(req.user.id);
  if (!user) return res.json({ success: true, user: null });
  if (!user.capture_token) { user.capture_token = newCaptureToken(); await user.save(); }
  res.json({
    success: true,
    user: {
      id: user.id, tenant_id: user.tenant_id || user.id, email: user.email,
      name: user.name, role: user.role, lang: user.lang,
      capture_token: user.capture_token
    }
  });
});

router.post('/rotate-capture-token', async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const user = await User.findByPk(req.user.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  user.capture_token = newCaptureToken();
  await user.save();
  res.json({ success: true, capture_token: user.capture_token });
});

module.exports = router;
