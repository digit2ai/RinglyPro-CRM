'use strict';

const express = require('express');
const router = express.Router();
const { sequelize, logAudit } = require('../middleware/auth');
const { triageCase } = require('../services/triage');

// Generate case number
function generateCaseNumber() {
  const d = new Date();
  const prefix = 'MSK';
  const ts = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
}

// GET /api/v1/cases — list cases
router.get('/', async (req, res) => {
  try {
    const { status, urgency, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const binds = [];
    let bindIdx = 1;

    // Role-based filtering
    if (req.user.role === 'patient') {
      const [patients] = await sequelize.query(
        `SELECT id FROM msk_patients WHERE user_id = $1`, { bind: [req.user.userId] }
      );
      if (patients.length === 0) return res.json({ success: true, data: [], count: 0 });
      conditions.push(`c.patient_id = $${bindIdx++}`);
      binds.push(patients[0].id);
    } else if (req.user.role === 'radiologist') {
      conditions.push(`(c.assigned_radiologist_id = $${bindIdx++} OR c.assigned_radiologist_id IS NULL)`);
      binds.push(req.user.userId);
    }

    if (status) { conditions.push(`c.status = $${bindIdx++}`); binds.push(status); }
    if (urgency) { conditions.push(`c.urgency = $${bindIdx++}`); binds.push(urgency); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [cases] = await sequelize.query(`
      SELECT c.*,
        p.sport, p.team,
        u.first_name AS patient_first_name, u.last_name AS patient_last_name,
        r.first_name AS radiologist_first_name, r.last_name AS radiologist_last_name
      FROM msk_cases c
      LEFT JOIN msk_patients p ON c.patient_id = p.id
      LEFT JOIN msk_users u ON p.user_id = u.id
      LEFT JOIN msk_users r ON c.assigned_radiologist_id = r.id
      ${where}
      ORDER BY
        CASE c.urgency
          WHEN 'emergency' THEN 1 WHEN 'urgent' THEN 2
          WHEN 'priority' THEN 3 ELSE 4 END,
        c.created_at DESC
      LIMIT $${bindIdx++} OFFSET $${bindIdx++}
    `, { bind: [...binds, parseInt(limit), parseInt(offset)] });

    const [countResult] = await sequelize.query(
      `SELECT COUNT(*) as total FROM msk_cases c ${where}`,
      { bind: binds }
    );

    res.json({ success: true, data: cases, count: parseInt(countResult[0].total) });
  } catch (err) {
    console.error('[ImagingMind] Cases list error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/cases/:id — single case with timeline
router.get('/:id', async (req, res) => {
  try {
    const [cases] = await sequelize.query(`
      SELECT c.*,
        p.sport, p.team, p.date_of_birth, p.gender, p.height_cm, p.weight_kg,
        u.first_name AS patient_first_name, u.last_name AS patient_last_name, u.email AS patient_email,
        r.first_name AS radiologist_first_name, r.last_name AS radiologist_last_name, r.credentials
      FROM msk_cases c
      LEFT JOIN msk_patients p ON c.patient_id = p.id
      LEFT JOIN msk_users u ON p.user_id = u.id
      LEFT JOIN msk_users r ON c.assigned_radiologist_id = r.id
      WHERE c.id = $1
    `, { bind: [req.params.id] });

    if (cases.length === 0) return res.status(404).json({ error: 'Case not found' });

    const caseData = cases[0];

    // Get timeline
    const [timeline] = await sequelize.query(`
      SELECT t.*, u.first_name, u.last_name
      FROM msk_case_timeline t
      LEFT JOIN msk_users u ON t.performed_by = u.id
      WHERE t.case_id = $1
      ORDER BY t.created_at ASC
    `, { bind: [req.params.id] });

    // Get imaging orders
    const [imaging] = await sequelize.query(`
      SELECT io.*, ic.name AS center_name
      FROM msk_imaging_orders io
      LEFT JOIN msk_imaging_centers ic ON io.imaging_center_id = ic.id
      WHERE io.case_id = $1
      ORDER BY io.created_at DESC
    `, { bind: [req.params.id] });

    // Get reports
    const [reports] = await sequelize.query(`
      SELECT r.*, u.first_name AS radiologist_first_name, u.last_name AS radiologist_last_name
      FROM msk_reports r
      LEFT JOIN msk_users u ON r.radiologist_id = u.id
      WHERE r.case_id = $1
      ORDER BY r.created_at DESC
    `, { bind: [req.params.id] });

    // Get active consultation
    const [consultations] = await sequelize.query(`
      SELECT co.*, ru.first_name AS radiologist_first_name, ru.last_name AS radiologist_last_name
      FROM msk_consultations co
      LEFT JOIN msk_users ru ON co.radiologist_id = ru.id
      WHERE co.case_id = $1
      ORDER BY co.created_at DESC
      LIMIT 1
    `, { bind: [req.params.id] });

    logAudit(req.user.userId, 'view_case', 'case', caseData.id, req);

    res.json({
      success: true,
      data: {
        ...caseData,
        timeline,
        imaging,
        reports,
        consultation: consultations[0] || null
      }
    });
  } catch (err) {
    console.error('[ImagingMind] Case detail error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/cases — create new case
router.post('/', async (req, res) => {
  try {
    const {
      chiefComplaint, painLocation, painLocationBodyMap,
      injuryMechanism, onsetDate, durationDescription,
      severity, functionalLimitations, sportContext,
      priorImagingHistory, caseType, urgency, pricingTier, source
    } = req.body;

    if (!chiefComplaint) {
      return res.status(400).json({ error: 'Chief complaint is required' });
    }

    // Resolve patient
    let patientId = null;
    if (req.user.role === 'patient') {
      const [patients] = await sequelize.query(
        `SELECT id FROM msk_patients WHERE user_id = $1`, { bind: [req.user.userId] }
      );
      patientId = patients[0]?.id || null;
    }

    const caseNumber = generateCaseNumber();

    const [result] = await sequelize.query(`
      INSERT INTO msk_cases (
        case_number, patient_id, status, urgency, case_type,
        chief_complaint, pain_location, pain_location_body_map,
        injury_mechanism, onset_date, duration_description,
        severity, functional_limitations, sport_context,
        prior_imaging_history, pricing_tier, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, {
      bind: [
        caseNumber, patientId, 'intake', urgency || 'routine', caseType || 'general',
        chiefComplaint, painLocation || null, painLocationBodyMap ? JSON.stringify(painLocationBodyMap) : null,
        injuryMechanism || 'unknown', onsetDate || null, durationDescription || null,
        severity || null, functionalLimitations || null, sportContext || null,
        priorImagingHistory || null, pricingTier || 'imaging_review', source || 'web'
      ]
    });

    const newCase = result[0];

    // Add timeline entry
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, performed_by)
      VALUES ($1, 'case_created', 'Case Created', $2, $3)
    `, { bind: [newCase.id, `New case ${caseNumber} created via ${source || 'web'}`, req.user.userId] });

    logAudit(req.user.userId, 'create_case', 'case', newCase.id, req);

    res.status(201).json({ success: true, data: newCase });
  } catch (err) {
    console.error('[ImagingMind] Create case error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/cases/:id — update case
router.put('/:id', async (req, res) => {
  try {
    const updates = [];
    const binds = [];
    let idx = 1;

    const allowedFields = [
      'status', 'urgency', 'case_type', 'chief_complaint', 'pain_location',
      'injury_mechanism', 'severity', 'functional_limitations', 'sport_context',
      'assigned_radiologist_id', 'pricing_tier', 'ai_preliminary_assessment'
    ];

    for (const field of allowedFields) {
      const camelField = field.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      if (req.body[camelField] !== undefined || req.body[field] !== undefined) {
        updates.push(`${field} = $${idx++}`);
        binds.push(req.body[camelField] ?? req.body[field]);
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    updates.push(`updated_at = NOW()`);
    binds.push(req.params.id);

    const [result] = await sequelize.query(`
      UPDATE msk_cases SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *
    `, { bind: binds });

    if (result.length === 0) return res.status(404).json({ error: 'Case not found' });

    // Timeline entry for status changes
    if (req.body.status) {
      await sequelize.query(`
        INSERT INTO msk_case_timeline (case_id, event_type, event_title, performed_by)
        VALUES ($1, 'status_change', $2, $3)
      `, { bind: [req.params.id, `Status changed to ${req.body.status}`, req.user.userId] });
    }

    logAudit(req.user.userId, 'update_case', 'case', parseInt(req.params.id), req);

    res.json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[ImagingMind] Update case error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/cases/:id/triage — run AI triage
router.post('/:id/triage', async (req, res) => {
  try {
    const [cases] = await sequelize.query(`SELECT * FROM msk_cases WHERE id = $1`, { bind: [req.params.id] });
    if (cases.length === 0) return res.status(404).json({ error: 'Case not found' });

    const triageResult = await triageCase(cases[0]);

    // Save triage decision
    await sequelize.query(`
      INSERT INTO msk_triage_decisions (case_id, decision_type, imaging_protocol, reasoning, confidence_score)
      VALUES ($1, $2, $3, $4, $5)
    `, {
      bind: [
        req.params.id,
        triageResult.decisionType,
        triageResult.imagingProtocol || null,
        triageResult.reasoning,
        triageResult.confidenceScore
      ]
    });

    // Update case status
    await sequelize.query(`
      UPDATE msk_cases SET status = 'triage', triage_result = $1, updated_at = NOW() WHERE id = $2
    `, { bind: [JSON.stringify(triageResult), req.params.id] });

    // Timeline entry
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, performed_by)
      VALUES ($1, 'triage_complete', 'Triage Complete', $2, $3)
    `, { bind: [req.params.id, `Decision: ${triageResult.decisionType}`, req.user.userId] });

    res.json({ success: true, data: triageResult });
  } catch (err) {
    console.error('[ImagingMind] Triage error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
