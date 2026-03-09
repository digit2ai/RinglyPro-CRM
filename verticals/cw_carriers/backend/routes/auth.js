const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('../services/db.cw');

const JWT_SECRET = process.env.JWT_SECRET || 'ringlypro-jwt-secret';
const TENANT_ID = 'cw_carriers';

// Async wrapper to catch rejected promises in Express 4
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// POST /login
router.post('/login', asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  let rows;
  try {
    [rows] = await sequelize.query(
      `SELECT * FROM cw_users WHERE email = $1 AND status = 'active'`,
      { bind: [email.toLowerCase()] }
    );
  } catch (dbErr) {
    return res.status(500).json({ error: 'Database error: ' + dbErr.message });
  }

  const user = rows && rows[0];
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  let valid;
  try {
    valid = await bcrypt.compare(password, user.password_hash);
  } catch (bcryptErr) {
    return res.status(500).json({ error: 'Auth error: ' + bcryptErr.message });
  }

  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, tenant_id: TENANT_ID, role: user.role },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  return res.json({
    success: true,
    token,
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role }
  });
}));

// POST /logout
router.post('/logout', (req, res) => {
  res.json({ success: true, message: 'Logged out' });
});

// GET /me
router.get('/me', require('../middleware/auth.cw'), asyncHandler(async (req, res) => {
  const [rows] = await sequelize.query(
    `SELECT id, email, full_name, role, tenant_id, status FROM cw_users WHERE id = $1`,
    { bind: [req.user.userId] }
  );
  const user = rows && rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ success: true, user });
}));

// GET /debug - temp: check if admin user exists and test bcrypt
router.get('/debug', asyncHandler(async (req, res) => {
  const [rows] = await sequelize.query(`SELECT id, email, role, status, length(password_hash) as hash_len, substring(password_hash, 1, 7) as hash_prefix FROM cw_users LIMIT 5`);

  // Test bcrypt with fallback password against stored hash
  let bcryptTest = 'skipped';
  if (rows && rows[0]) {
    const [fullRows] = await sequelize.query(`SELECT password_hash FROM cw_users WHERE id = $1`, { bind: [rows[0].id] });
    if (fullRows[0]) {
      try {
        const testResult = await bcrypt.compare('CWCarriers2026!', fullRows[0].password_hash);
        bcryptTest = testResult ? 'MATCH' : 'NO_MATCH';
      } catch (e) {
        bcryptTest = 'ERROR: ' + e.message;
      }
    }
  }

  res.json({ users: rows, bcrypt_test_fallback_password: bcryptTest });
}));

module.exports = router;
