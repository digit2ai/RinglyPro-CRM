'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sequelize, logAudit } = require('../middleware/auth');

// POST /api/v1/patients/register — Staff registers a patient
router.post('/register', async (req, res) => {
  try {
    if (!['admin', 'radiologist', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const {
      firstName, lastName, email, phone, dateOfBirth, gender,
      insuranceProvider, policyNumber, groupNumber, subscriberName,
      hipaaConsent
    } = req.body;

    if (!firstName || !lastName || !email) {
      return res.status(400).json({ error: 'First name, last name, and email are required' });
    }

    if (!hipaaConsent) {
      return res.status(400).json({ error: 'HIPAA consent is required to register a patient' });
    }

    // Check if email already exists
    const [existing] = await sequelize.query(
      `SELECT id FROM msk_users WHERE email = $1 LIMIT 1`,
      { bind: [email.toLowerCase().trim()] }
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    // Generate random temporary password
    const tempPassword = crypto.randomBytes(12).toString('base64url');
    const hash = await bcrypt.hash(tempPassword, 12);

    // Create msk_users entry
    const [userResult] = await sequelize.query(`
      INSERT INTO msk_users (email, password_hash, first_name, last_name, phone, role)
      VALUES ($1, $2, $3, $4, $5, 'patient')
      RETURNING id, email, first_name, last_name, phone, role
    `, {
      bind: [email.toLowerCase().trim(), hash, firstName, lastName, phone || null]
    });

    const newUser = userResult[0];

    // Create msk_patients entry with insurance info
    const [patientResult] = await sequelize.query(`
      INSERT INTO msk_patients (
        user_id, date_of_birth, gender,
        insurance_provider, policy_number, group_number, subscriber_name,
        hipaa_consent, hipaa_consent_date, registered_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9)
      RETURNING *
    `, {
      bind: [
        newUser.id,
        dateOfBirth || null,
        gender || null,
        insuranceProvider || null,
        policyNumber || null,
        groupNumber || null,
        subscriberName || null,
        true,
        req.user.userId
      ]
    });

    logAudit(req.user.userId, 'register_patient', 'patient', patientResult[0].id, req);

    res.status(201).json({
      success: true,
      data: {
        patientId: patientResult[0].id,
        userId: newUser.id,
        firstName: newUser.first_name,
        lastName: newUser.last_name,
        email: newUser.email,
        phone: newUser.phone,
        dateOfBirth: patientResult[0].date_of_birth,
        gender: patientResult[0].gender,
        insuranceProvider: patientResult[0].insurance_provider,
        policyNumber: patientResult[0].policy_number,
        groupNumber: patientResult[0].group_number,
        subscriberName: patientResult[0].subscriber_name,
        hipaaConsent: patientResult[0].hipaa_consent
      }
    });
  } catch (err) {
    console.error('[ImagingMind] Patient register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/patients/send-registration-link
router.post('/send-registration-link', async (req, res) => {
  try {
    if (!['admin', 'radiologist', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { email, firstName } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const registrationUrl = `/msk/register?ref=office`;

    // TODO: Send actual email via SendGrid/SES/etc.
    res.json({
      success: true,
      message: `Registration link ready for ${firstName || email}`,
      registrationUrl
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/patients/search?q= — Search patients
router.get('/search', async (req, res) => {
  try {
    if (!['admin', 'radiologist', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { q } = req.query;
    if (!q || q.trim().length < 2) {
      return res.json({ success: true, data: [] });
    }

    const searchTerm = `%${q.trim()}%`;

    const [patients] = await sequelize.query(`
      SELECT p.id, p.date_of_birth, p.gender,
        p.insurance_provider, p.policy_number,
        u.id AS user_id, u.first_name, u.last_name, u.email, u.phone
      FROM msk_patients p
      JOIN msk_users u ON p.user_id = u.id
      WHERE u.first_name ILIKE $1
        OR u.last_name ILIKE $1
        OR u.email ILIKE $1
        OR CONCAT(u.first_name, ' ', u.last_name) ILIKE $1
        OR CAST(p.date_of_birth AS TEXT) ILIKE $1
      ORDER BY u.last_name, u.first_name
      LIMIT 20
    `, { bind: [searchTerm] });

    res.json({ success: true, data: patients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/patients — list patients (admin/radiologist/staff only)
router.get('/', async (req, res) => {
  try {
    if (!['admin', 'radiologist', 'staff'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { search, sport, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (search) {
      conditions.push(`(u.first_name ILIKE $${idx} OR u.last_name ILIKE $${idx} OR u.email ILIKE $${idx})`);
      binds.push(`%${search}%`);
      idx++;
    }
    if (sport) {
      conditions.push(`p.sport ILIKE $${idx++}`);
      binds.push(`%${sport}%`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [patients] = await sequelize.query(`
      SELECT p.*, u.first_name, u.last_name, u.email, u.phone,
        (SELECT COUNT(*) FROM msk_cases c WHERE c.patient_id = p.id) AS case_count
      FROM msk_patients p
      JOIN msk_users u ON p.user_id = u.id
      ${where}
      ORDER BY u.last_name, u.first_name
      LIMIT $${idx++} OFFSET $${idx++}
    `, { bind: [...binds, parseInt(limit), parseInt(offset)] });

    res.json({ success: true, data: patients, count: patients.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/patients/:id — Get patient details
router.get('/:id', async (req, res) => {
  try {
    const [patients] = await sequelize.query(`
      SELECT p.*, u.first_name, u.last_name, u.email, u.phone
      FROM msk_patients p
      JOIN msk_users u ON p.user_id = u.id
      WHERE p.id = $1
    `, { bind: [req.params.id] });

    if (patients.length === 0) return res.status(404).json({ error: 'Patient not found' });

    logAudit(req.user.userId, 'view_patient', 'patient', parseInt(req.params.id), req);

    res.json({ success: true, data: patients[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/patients/:id — Update patient
router.put('/:id', async (req, res) => {
  try {
    const {
      dateOfBirth, gender, sport, team, position,
      heightCm, weightKg, medicalHistory, allergies,
      currentMedications, insuranceInfo, emergencyContact,
      insuranceProvider, policyNumber, groupNumber, subscriberName,
      phone
    } = req.body;

    const updates = [];
    const binds = [];
    let idx = 1;

    const fieldMap = {
      date_of_birth: dateOfBirth,
      gender, sport, team, position,
      height_cm: heightCm,
      weight_kg: weightKg,
      medical_history: medicalHistory ? JSON.stringify(medicalHistory) : undefined,
      allergies: allergies ? JSON.stringify(allergies) : undefined,
      current_medications: currentMedications ? JSON.stringify(currentMedications) : undefined,
      insurance_info: insuranceInfo ? JSON.stringify(insuranceInfo) : undefined,
      emergency_contact: emergencyContact ? JSON.stringify(emergencyContact) : undefined,
      insurance_provider: insuranceProvider,
      policy_number: policyNumber,
      group_number: groupNumber,
      subscriber_name: subscriberName
    };

    for (const [field, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        updates.push(`${field} = $${idx++}`);
        binds.push(value);
      }
    }

    if (updates.length === 0 && !phone) return res.status(400).json({ error: 'No fields to update' });

    // Update patient table
    if (updates.length > 0) {
      updates.push('updated_at = NOW()');
      binds.push(req.params.id);

      const [result] = await sequelize.query(`
        UPDATE msk_patients SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *
      `, { bind: binds });

      if (result.length === 0) return res.status(404).json({ error: 'Patient not found' });
    }

    // Update phone on msk_users if provided
    if (phone) {
      await sequelize.query(`
        UPDATE msk_users SET phone = $1 WHERE id = (SELECT user_id FROM msk_patients WHERE id = $2)
      `, { bind: [phone, req.params.id] });
    }

    // Return updated patient
    const [updated] = await sequelize.query(`
      SELECT p.*, u.first_name, u.last_name, u.email, u.phone
      FROM msk_patients p
      JOIN msk_users u ON p.user_id = u.id
      WHERE p.id = $1
    `, { bind: [req.params.id] });

    res.json({ success: true, data: updated[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
