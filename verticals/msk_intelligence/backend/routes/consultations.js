'use strict';

const express = require('express');
const router = express.Router();
const { sequelize, logAudit } = require('../middleware/auth');

// GET /api/v1/consultations
router.get('/', async (req, res) => {
  try {
    const { caseId, status, upcoming, limit = 50 } = req.query;
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (caseId) { conditions.push(`co.case_id = $${idx++}`); binds.push(caseId); }
    if (status) { conditions.push(`co.status = $${idx++}`); binds.push(status); }
    if (upcoming === 'true') { conditions.push(`co.scheduled_at > NOW()`); }

    if (req.user.role === 'patient') {
      conditions.push(`co.patient_id IN (SELECT id FROM msk_patients WHERE user_id = $${idx++})`);
      binds.push(req.user.userId);
    } else if (req.user.role === 'radiologist') {
      conditions.push(`co.radiologist_id = $${idx++}`);
      binds.push(req.user.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    binds.push(parseInt(limit));

    const [consults] = await sequelize.query(`
      SELECT co.*,
        pu.first_name AS patient_first_name, pu.last_name AS patient_last_name,
        ru.first_name AS radiologist_first_name, ru.last_name AS radiologist_last_name,
        c.case_number
      FROM msk_consultations co
      JOIN msk_patients p ON co.patient_id = p.id
      JOIN msk_users pu ON p.user_id = pu.id
      JOIN msk_users ru ON co.radiologist_id = ru.id
      JOIN msk_cases c ON co.case_id = c.id
      ${where}
      ORDER BY co.scheduled_at ASC
      LIMIT $${idx}
    `, { bind: binds });

    res.json({ success: true, data: consults });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/consultations — schedule consultation
router.post('/', async (req, res) => {
  try {
    const { caseId, patientId, radiologistId, scheduledAt, durationMinutes } = req.body;

    if (!caseId || !patientId || !radiologistId || !scheduledAt) {
      return res.status(400).json({ error: 'caseId, patientId, radiologistId, and scheduledAt are required' });
    }

    const meetingId = `msk-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    const meetingUrl = `https://aiagent.ringlypro.com/msk/video/${meetingId}`;

    const [result] = await sequelize.query(`
      INSERT INTO msk_consultations (case_id, patient_id, radiologist_id, scheduled_at, duration_minutes, meeting_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, {
      bind: [caseId, patientId, radiologistId, scheduledAt, durationMinutes || 30, meetingUrl]
    });

    // Update case status
    await sequelize.query(`UPDATE msk_cases SET status = 'consult_scheduled', updated_at = NOW() WHERE id = $1`, { bind: [caseId] });

    // Timeline
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, performed_by)
      VALUES ($1, 'consult_scheduled', 'Video Consultation Scheduled', $2, $3)
    `, { bind: [caseId, `Scheduled for ${new Date(scheduledAt).toISOString()}`, req.user.userId] });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/consultations/:id — update consultation
router.put('/:id', async (req, res) => {
  try {
    const { status, notes, cancelledReason } = req.body;
    const updates = [];
    const binds = [];
    let idx = 1;

    if (status) { updates.push(`status = $${idx++}`); binds.push(status); }
    if (notes) { updates.push(`notes = $${idx++}`); binds.push(notes); }
    if (cancelledReason) { updates.push(`cancelled_reason = $${idx++}`); binds.push(cancelledReason); }
    if (status === 'completed') { updates.push('completed_at = NOW()'); }

    updates.push('updated_at = NOW()');
    binds.push(req.params.id);

    const [result] = await sequelize.query(`
      UPDATE msk_consultations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *
    `, { bind: binds });

    if (result.length === 0) return res.status(404).json({ error: 'Consultation not found' });

    if (status === 'completed') {
      await sequelize.query(`UPDATE msk_cases SET status = 'consult_complete', updated_at = NOW() WHERE id = $1`,
        { bind: [result[0].case_id] });
    }

    res.json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
