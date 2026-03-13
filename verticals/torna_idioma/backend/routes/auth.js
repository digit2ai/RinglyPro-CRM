const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('../services/db.ti');

const JWT_SECRET = process.env.JWT_SECRET || 'ringlypro-jwt-secret';
const TENANT_ID = 'torna_idioma';

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const [[user]] = await sequelize.query(
      `SELECT * FROM ti_users WHERE email = $1 AND tenant_id = $2 AND status = 'active'`,
      { bind: [email.toLowerCase(), TENANT_ID] }
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    await sequelize.query(`UPDATE ti_users SET last_login = NOW() WHERE id = $1`, { bind: [user.id] });
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenant_id: TENANT_ID, full_name: user.full_name, organization: user.organization, language_pref: user.language_pref },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.json({ success: true, token, user: { id: user.id, email: user.email, role: user.role, full_name: user.full_name, organization: user.organization, language_pref: user.language_pref } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, full_name, organization, phone, role, language_pref } = req.body;
    if (!email || !password || !full_name) return res.status(400).json({ error: 'Email, password, and name required' });
    const allowedRoles = ['student', 'bpo_worker', 'teacher', 'partner'];
    if (!allowedRoles.includes(role)) return res.status(400).json({ error: `Role must be one of: ${allowedRoles.join(', ')}` });
    const [[existing]] = await sequelize.query(`SELECT id FROM ti_users WHERE email = $1`, { bind: [email.toLowerCase()] });
    if (existing) return res.status(409).json({ error: 'Email already registered' });
    const hash = await bcrypt.hash(password, 12);
    const [[newUser]] = await sequelize.query(
      `INSERT INTO ti_users (email, password_hash, tenant_id, role, full_name, organization, phone, language_pref, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active', NOW(), NOW()) RETURNING id, email, role, full_name, organization, language_pref`,
      { bind: [email.toLowerCase(), hash, TENANT_ID, role, full_name, organization || null, phone || null, language_pref || 'en'] }
    );
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role, tenant_id: TENANT_ID, full_name: newUser.full_name, organization: newUser.organization, language_pref: newUser.language_pref },
      JWT_SECRET, { expiresIn: '24h' }
    );
    res.status(201).json({ success: true, token, user: newUser });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/me', require('../middleware/auth.ti').any, async (req, res) => {
  res.json({ success: true, user: req.user });
});

module.exports = router;
