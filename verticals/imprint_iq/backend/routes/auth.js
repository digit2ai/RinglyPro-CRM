const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('../services/db.iq');

const JWT_SECRET = process.env.JWT_SECRET || 'ringlypro-jwt-secret';
const TENANT_ID = 'imprint_iq';

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// POST /login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const [rows] = await sequelize.query(
    `SELECT * FROM iq_users WHERE email = $1 AND status = 'active'`,
    { bind: [email.toLowerCase()] }
  );

  const user = rows && rows[0];
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  await sequelize.query(`UPDATE iq_users SET last_login = NOW() WHERE id = $1`, { bind: [user.id] });

  const token = jwt.sign(
    { id: user.id, email: user.email, tenant_id: TENANT_ID, role: user.role, name: user.full_name },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, role: user.role, name: user.full_name }
  });
}));

// GET /verify
router.get('/verify', asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ valid: false });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.tenant_id !== TENANT_ID) return res.status(403).json({ valid: false });
    res.json({ valid: true, user: { id: decoded.id, email: decoded.email, role: decoded.role, name: decoded.name } });
  } catch (err) {
    res.status(401).json({ valid: false });
  }
}));

module.exports = router;
