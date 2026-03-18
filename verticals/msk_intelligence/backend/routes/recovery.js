'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../middleware/auth');

// GET /api/v1/recovery/plans
router.get('/plans', async (req, res) => {
  try {
    const { caseId, patientId, status } = req.query;
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (caseId) { conditions.push(`rp.case_id = $${idx++}`); binds.push(caseId); }
    if (patientId) { conditions.push(`rp.patient_id = $${idx++}`); binds.push(patientId); }
    if (status) { conditions.push(`rp.status = $${idx++}`); binds.push(status); }

    if (req.user.role === 'patient') {
      conditions.push(`rp.patient_id IN (SELECT id FROM msk_patients WHERE user_id = $${idx++})`);
      binds.push(req.user.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [plans] = await sequelize.query(`
      SELECT rp.*, c.case_number, u.first_name AS created_by_first, u.last_name AS created_by_last
      FROM msk_recovery_plans rp
      JOIN msk_cases c ON rp.case_id = c.id
      LEFT JOIN msk_users u ON rp.created_by = u.id
      ${where}
      ORDER BY rp.created_at DESC
    `, { bind: binds });

    res.json({ success: true, data: plans });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/recovery/plans
router.post('/plans', async (req, res) => {
  try {
    const { caseId, patientId, planType, startDate, targetEndDate, milestones, protocols, notes } = req.body;

    if (!caseId || !patientId) {
      return res.status(400).json({ error: 'caseId and patientId are required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO msk_recovery_plans (case_id, patient_id, plan_type, start_date, target_end_date, milestones, protocols, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, {
      bind: [
        caseId, patientId, planType || 'rehabilitation',
        startDate || new Date().toISOString().slice(0, 10),
        targetEndDate || null,
        milestones ? JSON.stringify(milestones) : '[]',
        protocols ? JSON.stringify(protocols) : '[]',
        notes || null, req.user.userId
      ]
    });

    // Update case
    await sequelize.query(`UPDATE msk_cases SET status = 'follow_up', updated_at = NOW() WHERE id = $1`, { bind: [caseId] });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/recovery/referrals
router.get('/referrals', async (req, res) => {
  try {
    const { caseId } = req.query;
    const where = caseId ? 'WHERE r.case_id = $1' : '';

    const [referrals] = await sequelize.query(`
      SELECT r.*, c.case_number, u.first_name AS created_by_first, u.last_name AS created_by_last
      FROM msk_referrals r
      JOIN msk_cases c ON r.case_id = c.id
      LEFT JOIN msk_users u ON r.created_by = u.id
      ${where}
      ORDER BY r.created_at DESC
    `, { bind: caseId ? [caseId] : [] });

    res.json({ success: true, data: referrals });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/recovery/referrals
router.post('/referrals', async (req, res) => {
  try {
    const { caseId, patientId, referralType, providerName, providerContact, reason, urgency, notes } = req.body;

    const [result] = await sequelize.query(`
      INSERT INTO msk_referrals (case_id, patient_id, referral_type, provider_name, provider_contact, reason, urgency, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *
    `, {
      bind: [
        caseId, patientId, referralType || 'physiotherapy',
        providerName || null, providerContact || null,
        reason || null, urgency || 'routine', notes || null, req.user.userId
      ]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
