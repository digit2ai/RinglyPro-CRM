'use strict';

/**
 * CaseGuard — authentication (cookie-based JWT). LOGIN ONLY — no public signup.
 * Each user is their own private tenant (tenant_id = user id).
 */

const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { User } = require('../models');

const SECRET = process.env.CASEGUARD_JWT_SECRET || process.env.JWT_SECRET || 'caseguard-2026-secret';
const COOKIE = 'caseguard_token';
const MAX_AGE = 1000 * 60 * 60 * 24 * 30; // 30d

function setAuthCookie(res, token) {
  res.cookie(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'none', maxAge: MAX_AGE, path: '/caseguard' });
}
function sign(user) {
  return jwt.sign(
    { id: user.id, tenant_id: user.tenant_id || user.id, email: user.email, name: user.name, role: user.role, lang: user.lang },
    SECRET, { expiresIn: '30d' }
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
    setAuthCookie(res, sign(user));
    res.json({ success: true, user: { email: user.email, name: user.name, role: user.role, lang: user.lang } });
  } catch (e) {
    console.error('CaseGuard login error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE, { path: '/caseguard' });
  res.json({ success: true });
});

router.get('/me', (req, res) => res.json({ success: true, user: req.user || null }));

module.exports = router;
