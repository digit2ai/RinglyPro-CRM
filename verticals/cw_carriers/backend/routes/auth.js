const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('../services/db.cw');

const JWT_SECRET = process.env.JWT_SECRET || 'ringlypro-jwt-secret';
const TENANT_ID = 'cw_carriers';

// POST /login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const [[user]] = await sequelize.query(
      `SELECT * FROM cw_users WHERE email = $1 AND status = 'active'`,
      { bind: [email.toLowerCase()] }
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, tenant_id: TENANT_ID, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
    });
  } catch (err) {
    console.error('CW auth login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /logout
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

// GET /me
router.get('/me', require('../middleware/auth.cw'), async (req, res) => {
  try {
    const [[user]] = await sequelize.query(
      `SELECT id, email, full_name, role, tenant_id, status FROM cw_users WHERE id = $1`,
      { bind: [req.user.userId] }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
