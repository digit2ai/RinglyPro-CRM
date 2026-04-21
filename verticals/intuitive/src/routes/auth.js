'use strict';
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || process.env.SECRET_KEY || 'surgicalmind-jwt-secret-2026';
const TOKEN_EXPIRY = '7d';

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const { IntuitiveUser } = req.models;
    const user = await IntuitiveUser.findOne({ where: { email: email.toLowerCase().trim() } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: 'Account is deactivated' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await user.increment('failed_login_attempts');
      // Lock after 10 failed attempts
      if ((user.failed_login_attempts || 0) >= 9) {
        await user.update({ is_active: false });
        return res.status(403).json({ error: 'Account locked due to too many failed attempts. Contact admin.' });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Success -- reset failed attempts, update last login
    await user.update({
      failed_login_attempts: 0,
      last_login_at: new Date()
    });

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/v1/auth/me -- verify token and return user info
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { IntuitiveUser } = req.models;
    const user = await IntuitiveUser.findByPk(decoded.id, {
      attributes: ['id', 'name', 'email', 'role', 'is_active']
    });

    if (!user || !user.is_active) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    res.json({ success: true, user });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/auth/change-password
router.post('/change-password', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    const { IntuitiveUser } = req.models;
    const user = await IntuitiveUser.findByPk(decoded.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new password required' });
    }
    if (new_password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(new_password, 12);
    await user.update({ password_hash: hash });

    res.json({ success: true, message: 'Password changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
