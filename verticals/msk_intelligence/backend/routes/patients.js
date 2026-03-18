'use strict';

const express = require('express');
const router = express.Router();
const { sequelize, logAudit } = require('../middleware/auth');

// GET /api/v1/patients — list patients (admin/radiologist only)
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

// GET /api/v1/patients/:id
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

// PUT /api/v1/patients/:id — update patient profile
router.put('/:id', async (req, res) => {
  try {
    const {
      dateOfBirth, gender, sport, team, position,
      heightCm, weightKg, medicalHistory, allergies,
      currentMedications, insuranceInfo, emergencyContact
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
      emergency_contact: emergencyContact ? JSON.stringify(emergencyContact) : undefined
    };

    for (const [field, value] of Object.entries(fieldMap)) {
      if (value !== undefined) {
        updates.push(`${field} = $${idx++}`);
        binds.push(value);
      }
    }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = NOW()');
    binds.push(req.params.id);

    const [result] = await sequelize.query(`
      UPDATE msk_patients SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *
    `, { bind: binds });

    if (result.length === 0) return res.status(404).json({ error: 'Patient not found' });

    res.json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
