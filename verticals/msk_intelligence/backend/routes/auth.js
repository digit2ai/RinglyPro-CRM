'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { generateToken, authenticate, sequelize, JWT_SECRET } = require('../middleware/auth');

const MFA_REQUIRED_ROLES = ['radiologist', 'admin', 'staff', 'b2b_manager'];

// POST /api/v1/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const [users] = await sequelize.query(
      `SELECT * FROM msk_users WHERE email = $1 AND is_active = true LIMIT 1`,
      { bind: [email.toLowerCase().trim()] }
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last login
    await sequelize.query(`UPDATE msk_users SET last_login = NOW() WHERE id = $1`, { bind: [user.id] });

    // Check if MFA is enabled for this user
    if (user.mfa_enabled && MFA_REQUIRED_ROLES.includes(user.role)) {
      // Issue short-lived temp token for MFA challenge
      const tempToken = jwt.sign(
        { userId: user.id, mfaPending: true },
        JWT_SECRET,
        { expiresIn: '2m' }
      );
      return res.json({
        success: true,
        mfaRequired: true,
        tempToken,
        message: 'Enter your authenticator code to complete login.'
      });
    }

    const token = generateToken(user);

    // Get patient profile if patient role
    let patientProfile = null;
    if (user.role === 'patient') {
      const [profiles] = await sequelize.query(
        `SELECT * FROM msk_patients WHERE user_id = $1 LIMIT 1`,
        { bind: [user.id] }
      );
      patientProfile = profiles[0] || null;
    }

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        specialty: user.specialty,
        credentials: user.credentials,
        avatarUrl: user.avatar_url,
        mfaEnabled: user.mfa_enabled || false,
        patientProfile
      }
    });
  } catch (err) {
    console.error('[MSK] Login error:', err);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

// POST /api/v1/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, role = 'patient' } = req.body;

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, password, first name, and last name required' });
    }

    // Only allow patient self-registration
    const allowedRoles = ['patient'];
    const effectiveRole = allowedRoles.includes(role) ? role : 'patient';

    const [existing] = await sequelize.query(
      `SELECT id FROM msk_users WHERE email = $1 LIMIT 1`,
      { bind: [email.toLowerCase().trim()] }
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 12);

    const [result] = await sequelize.query(`
      INSERT INTO msk_users (email, password_hash, first_name, last_name, phone, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, email, first_name, last_name, role
    `, {
      bind: [email.toLowerCase().trim(), hash, firstName, lastName, phone || null, effectiveRole]
    });

    const user = result[0];

    // Create patient profile
    if (effectiveRole === 'patient') {
      await sequelize.query(`INSERT INTO msk_patients (user_id) VALUES ($1)`, { bind: [user.id] });
    }

    const token = generateToken({ ...user, id: user.id });

    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[MSK] Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req, res) => {
  try {
    const [users] = await sequelize.query(
      `SELECT id, email, first_name, last_name, role, phone, specialty, credentials, avatar_url
       FROM msk_users WHERE id = $1 LIMIT 1`,
      { bind: [req.user.userId] }
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = users[0];
    let patientProfile = null;
    if (user.role === 'patient') {
      const [profiles] = await sequelize.query(
        `SELECT * FROM msk_patients WHERE user_id = $1 LIMIT 1`,
        { bind: [user.id] }
      );
      patientProfile = profiles[0] || null;
    }

    res.json({ success: true, user: { ...user, patientProfile } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
