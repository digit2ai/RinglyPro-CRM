'use strict';

const express = require('express');
const router = express.Router();
const { sequelize, logAudit, authorize } = require('../middleware/auth');

// GET /api/v1/reports — list reports
router.get('/', async (req, res) => {
  try {
    const { caseId, status, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (caseId) { conditions.push(`r.case_id = $${idx++}`); binds.push(caseId); }
    if (status) { conditions.push(`r.status = $${idx++}`); binds.push(status); }

    // Patients only see their own reports
    if (req.user.role === 'patient') {
      conditions.push(`r.case_id IN (SELECT id FROM msk_cases WHERE patient_id IN (SELECT id FROM msk_patients WHERE user_id = $${idx++}))`);
      binds.push(req.user.userId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [reports] = await sequelize.query(`
      SELECT r.*,
        u.first_name AS radiologist_first_name, u.last_name AS radiologist_last_name, u.credentials,
        c.case_number, c.chief_complaint, c.pain_location
      FROM msk_reports r
      JOIN msk_users u ON r.radiologist_id = u.id
      JOIN msk_cases c ON r.case_id = c.id
      ${where}
      ORDER BY r.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, { bind: [...binds, parseInt(limit), parseInt(offset)] });

    res.json({ success: true, data: reports });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/reports/:id — get report with findings
router.get('/:id', async (req, res) => {
  try {
    const [reports] = await sequelize.query(`
      SELECT r.*,
        u.first_name AS radiologist_first_name, u.last_name AS radiologist_last_name,
        u.credentials, u.specialty,
        c.case_number, c.chief_complaint, c.pain_location, c.sport_context, c.severity AS case_severity
      FROM msk_reports r
      JOIN msk_users u ON r.radiologist_id = u.id
      JOIN msk_cases c ON r.case_id = c.id
      WHERE r.id = $1
    `, { bind: [req.params.id] });

    if (reports.length === 0) return res.status(404).json({ error: 'Report not found' });

    const [findings] = await sequelize.query(
      `SELECT * FROM msk_findings WHERE report_id = $1 ORDER BY id`,
      { bind: [req.params.id] }
    );

    logAudit(req.user.userId, 'view_report', 'report', parseInt(req.params.id), req);

    res.json({ success: true, data: { ...reports[0], findings } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/reports — create report (radiologist only)
router.post('/', async (req, res) => {
  try {
    if (!['radiologist', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only radiologists can create reports' });
    }

    const {
      caseId, reportType, summary, detailedFindings, impression,
      icd10Codes, severityGrade, severityScale, recoveryTimelineWeeks,
      recoveryDescription, performanceImpact, returnToPlayRecommendation,
      sportSpecificNotes, comparisonWithPrior, recommendations, findings
    } = req.body;

    if (!caseId || !summary) {
      return res.status(400).json({ error: 'caseId and summary are required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO msk_reports (
        case_id, radiologist_id, report_type, status, summary, detailed_findings, impression,
        icd10_codes, severity_grade, severity_scale, recovery_timeline_weeks,
        recovery_description, performance_impact, return_to_play_recommendation,
        sport_specific_notes, comparison_with_prior, recommendations
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *
    `, {
      bind: [
        caseId, req.user.userId, reportType || 'diagnostic', 'draft',
        summary, detailedFindings || null, impression || null,
        icd10Codes ? JSON.stringify(icd10Codes) : '[]',
        severityGrade || null, severityScale || null, recoveryTimelineWeeks || null,
        recoveryDescription || null, performanceImpact || null,
        returnToPlayRecommendation || null, sportSpecificNotes || null,
        comparisonWithPrior || null,
        recommendations ? JSON.stringify(recommendations) : '[]'
      ]
    });

    const report = result[0];

    // Insert findings if provided
    if (findings && Array.isArray(findings)) {
      for (const f of findings) {
        await sequelize.query(`
          INSERT INTO msk_findings (report_id, body_region, structure, finding_type, description, severity, measurements, imaging_reference)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        `, {
          bind: [
            report.id, f.bodyRegion || null, f.structure || null,
            f.findingType || null, f.description, f.severity || null,
            f.measurements ? JSON.stringify(f.measurements) : '{}',
            f.imagingReference || null
          ]
        });
      }
    }

    // Update case status
    await sequelize.query(`UPDATE msk_cases SET status = 'under_review', assigned_radiologist_id = $1, updated_at = NOW() WHERE id = $2`,
      { bind: [req.user.userId, caseId] });

    // Timeline
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, performed_by)
      VALUES ($1, 'report_created', 'Report Draft Created', $2)
    `, { bind: [caseId, req.user.userId] });

    logAudit(req.user.userId, 'create_report', 'report', report.id, req);

    res.status(201).json({ success: true, data: report });
  } catch (err) {
    console.error('[MSK] Create report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/reports/:id/finalize — finalize report
router.put('/:id/finalize', async (req, res) => {
  try {
    if (!['radiologist', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only radiologists can finalize reports' });
    }

    const [result] = await sequelize.query(`
      UPDATE msk_reports SET status = 'finalized', finalized_at = NOW(), updated_at = NOW()
      WHERE id = $1 RETURNING *
    `, { bind: [req.params.id] });

    if (result.length === 0) return res.status(404).json({ error: 'Report not found' });

    // Update case status
    await sequelize.query(`UPDATE msk_cases SET status = 'report_ready', updated_at = NOW() WHERE id = $1`,
      { bind: [result[0].case_id] });

    // Timeline
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, performed_by)
      VALUES ($1, 'report_finalized', 'Diagnostic Report Finalized', $2)
    `, { bind: [result[0].case_id, req.user.userId] });

    logAudit(req.user.userId, 'finalize_report', 'report', parseInt(req.params.id), req);

    res.json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
