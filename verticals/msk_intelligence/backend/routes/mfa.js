'use strict';

const express = require('express');
const router = express.Router();
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { authenticate, generateToken, sequelize } = require('../middleware/auth');

const MFA_REQUIRED_ROLES = ['radiologist', 'admin', 'staff', 'b2b_manager'];

// POST /api/v1/auth/mfa/setup — Generate TOTP secret + QR code
router.post('/setup', authenticate, async (req, res) => {
  try {
    const [users] = await sequelize.query(
      `SELECT id, email, mfa_enabled FROM msk_users WHERE id = $1 LIMIT 1`,
      { bind: [req.user.userId] }
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    if (users[0].mfa_enabled) {
      return res.status(400).json({ error: 'MFA is already enabled. Disable it first to reconfigure.' });
    }

    const secret = speakeasy.generateSecret({
      name: `MSK Intelligence (${users[0].email})`,
      issuer: 'MSK Intelligence'
    });

    // Store secret (not yet enabled)
    await sequelize.query(
      `UPDATE msk_users SET mfa_secret = $1 WHERE id = $2`,
      { bind: [secret.base32, req.user.userId] }
    );

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      success: true,
      secret: secret.base32,
      qrCode: qrDataUrl,
      message: 'Scan the QR code with your authenticator app, then verify with a code.'
    });
  } catch (err) {
    console.error('[MSK] MFA setup error:', err);
    res.status(500).json({ error: 'MFA setup failed' });
  }
});

// POST /api/v1/auth/mfa/verify-setup — Verify first TOTP code and enable MFA
router.post('/verify-setup', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'TOTP code required' });

    const [users] = await sequelize.query(
      `SELECT id, mfa_secret, mfa_enabled FROM msk_users WHERE id = $1 LIMIT 1`,
      { bind: [req.user.userId] }
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!users[0].mfa_secret) return res.status(400).json({ error: 'Run /mfa/setup first' });
    if (users[0].mfa_enabled) return res.status(400).json({ error: 'MFA already enabled' });

    const verified = speakeasy.totp.verify({
      secret: users[0].mfa_secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid code. Try again.' });
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    await sequelize.query(
      `UPDATE msk_users SET mfa_enabled = TRUE, mfa_backup_codes = $1 WHERE id = $2`,
      { bind: [backupCodes, req.user.userId] }
    );

    res.json({
      success: true,
      backupCodes,
      message: 'MFA enabled. Save your backup codes in a safe place.'
    });
  } catch (err) {
    console.error('[MSK] MFA verify-setup error:', err);
    res.status(500).json({ error: 'MFA verification failed' });
  }
});

// POST /api/v1/auth/mfa/challenge — Validate TOTP on login (called after password check)
router.post('/challenge', async (req, res) => {
  try {
    const { tempToken, code } = req.body;
    if (!tempToken || !code) {
      return res.status(400).json({ error: 'tempToken and code required' });
    }

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.MSK_JWT_SECRET || process.env.JWT_SECRET;
    if (!JWT_SECRET) return res.status(500).json({ error: 'Server configuration error' });

    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Temporary token expired or invalid. Please login again.' });
    }

    if (!decoded.mfaPending) {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    const [users] = await sequelize.query(
      `SELECT id, email, first_name, last_name, role, mfa_secret, mfa_enabled FROM msk_users WHERE id = $1 LIMIT 1`,
      { bind: [decoded.userId] }
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    const verified = speakeasy.totp.verify({
      secret: user.mfa_secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid MFA code' });
    }

    // Issue full JWT
    const fullToken = generateToken(user);

    // Get patient profile if needed
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
      token: fullToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role,
        patientProfile
      }
    });
  } catch (err) {
    console.error('[MSK] MFA challenge error:', err);
    res.status(500).json({ error: 'MFA challenge failed' });
  }
});

// POST /api/v1/auth/mfa/backup — Validate and consume a backup code
router.post('/backup', async (req, res) => {
  try {
    const { tempToken, backupCode } = req.body;
    if (!tempToken || !backupCode) {
      return res.status(400).json({ error: 'tempToken and backupCode required' });
    }

    const jwt = require('jsonwebtoken');
    const JWT_SECRET = process.env.MSK_JWT_SECRET || process.env.JWT_SECRET;
    if (!JWT_SECRET) return res.status(500).json({ error: 'Server configuration error' });

    let decoded;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ error: 'Temporary token expired. Please login again.' });
    }

    if (!decoded.mfaPending) {
      return res.status(400).json({ error: 'Invalid token type' });
    }

    const [users] = await sequelize.query(
      `SELECT id, email, first_name, last_name, role, mfa_backup_codes FROM msk_users WHERE id = $1 LIMIT 1`,
      { bind: [decoded.userId] }
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });

    const user = users[0];
    const codes = user.mfa_backup_codes || [];
    const normalizedInput = backupCode.toUpperCase().trim();
    const codeIndex = codes.indexOf(normalizedInput);

    if (codeIndex === -1) {
      return res.status(401).json({ error: 'Invalid backup code' });
    }

    // Consume the backup code
    codes.splice(codeIndex, 1);
    await sequelize.query(
      `UPDATE msk_users SET mfa_backup_codes = $1 WHERE id = $2`,
      { bind: [codes, user.id] }
    );

    // Issue full JWT
    const fullToken = generateToken(user);

    res.json({
      success: true,
      token: fullToken,
      remainingBackupCodes: codes.length,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error('[MSK] MFA backup error:', err);
    res.status(500).json({ error: 'Backup code validation failed' });
  }
});

// POST /api/v1/auth/mfa/disable — Disable MFA (requires current TOTP code)
router.post('/disable', authenticate, async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Current TOTP code required' });

    const [users] = await sequelize.query(
      `SELECT id, mfa_secret, mfa_enabled FROM msk_users WHERE id = $1 LIMIT 1`,
      { bind: [req.user.userId] }
    );
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    if (!users[0].mfa_enabled) return res.status(400).json({ error: 'MFA is not enabled' });

    const verified = speakeasy.totp.verify({
      secret: users[0].mfa_secret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) return res.status(401).json({ error: 'Invalid code' });

    await sequelize.query(
      `UPDATE msk_users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL WHERE id = $1`,
      { bind: [req.user.userId] }
    );

    res.json({ success: true, message: 'MFA disabled' });
  } catch (err) {
    console.error('[MSK] MFA disable error:', err);
    res.status(500).json({ error: 'Failed to disable MFA' });
  }
});

// Export the roles that require MFA for use in the login route
router.MFA_REQUIRED_ROLES = MFA_REQUIRED_ROLES;

module.exports = router;
