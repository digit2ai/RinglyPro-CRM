'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, authorize, sequelize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// GET /employers — List employers
router.get('/employers', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const [employers] = await sequelize.query(`
      SELECT * FROM msk_employers
      ORDER BY name ASC
      LIMIT $1 OFFSET $2
    `, { bind: [parseInt(limit), parseInt(offset)] });

    const [countResult] = await sequelize.query(`
      SELECT COUNT(*) AS total FROM msk_employers
    `);

    res.json({
      success: true,
      data: employers,
      count: parseInt(countResult[0].total)
    });
  } catch (err) {
    console.error('[MSK-WC] List employers error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /employers — Create employer (admin only)
router.post('/employers', authorize('admin'), async (req, res) => {
  try {
    const { name, contactName, contactEmail, contactPhone, address, insuranceCarrier, policyNumber } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Employer name is required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO msk_employers
        (name, contact_name, contact_email, contact_phone, address, insurance_carrier, policy_number, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `, {
      bind: [name, contactName || null, contactEmail || null, contactPhone || null, address || null, insuranceCarrier || null, policyNumber || null]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[MSK-WC] Create employer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /ime-reports — Create IME (Independent Medical Examination) report
router.post('/ime-reports', authorize('admin', 'provider', 'physician'), async (req, res) => {
  try {
    const {
      caseId, employerId, workRelated, causationOpinion,
      mmiDate, impairmentRating, workRestrictions, returnToWorkDate, reportText
    } = req.body;

    if (!caseId || !employerId || workRelated === undefined || !reportText) {
      return res.status(400).json({ error: 'Missing required fields: caseId, employerId, workRelated, reportText' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO msk_ime_reports
        (case_id, employer_id, evaluator_id, work_related, causation_opinion,
         mmi_date, impairment_rating, work_restrictions, return_to_work_date,
         report_text, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'draft', NOW(), NOW())
      RETURNING *
    `, {
      bind: [
        caseId, employerId, req.user.userId, workRelated, causationOpinion || null,
        mmiDate || null, impairmentRating || null, workRestrictions || null,
        returnToWorkDate || null, reportText
      ]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[MSK-WC] Create IME report error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /ime-reports/:caseId — Get IME reports for a case
router.get('/ime-reports/:caseId', async (req, res) => {
  try {
    const { caseId } = req.params;

    const [reports] = await sequelize.query(`
      SELECT r.*,
        e.name AS employer_name,
        e.insurance_carrier,
        u.first_name AS evaluator_first_name,
        u.last_name AS evaluator_last_name,
        u.credentials AS evaluator_credentials
      FROM msk_ime_reports r
      LEFT JOIN msk_employers e ON r.employer_id = e.id
      LEFT JOIN msk_users u ON r.evaluator_id = u.id
      WHERE r.case_id = $1
      ORDER BY r.created_at DESC
    `, { bind: [caseId] });

    res.json({ success: true, data: reports });
  } catch (err) {
    console.error('[MSK-WC] Get IME reports error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /employer-portal/:employerId — Employer portal view (no PHI beyond status and RTW date)
router.get('/employer-portal/:employerId', async (req, res) => {
  try {
    const { employerId } = req.params;

    // Verify employer exists
    const [employers] = await sequelize.query(`
      SELECT id, name, contact_name, contact_email FROM msk_employers WHERE id = $1
    `, { bind: [employerId] });

    if (employers.length === 0) {
      return res.status(404).json({ error: 'Employer not found' });
    }

    const employer = employers[0];

    // Aggregate case stats — no PHI, only status and return-to-work date
    const [caseStats] = await sequelize.query(`
      SELECT
        c.status,
        COUNT(*) AS case_count,
        COUNT(CASE WHEN r.return_to_work_date IS NOT NULL THEN 1 END) AS with_rtw_date,
        COUNT(CASE WHEN r.work_related = true THEN 1 END) AS work_related_count,
        COUNT(CASE WHEN r.mmi_date IS NOT NULL AND r.mmi_date <= NOW() THEN 1 END) AS at_mmi
      FROM msk_ime_reports r
      INNER JOIN msk_cases c ON r.case_id = c.id
      WHERE r.employer_id = $1
      GROUP BY c.status
      ORDER BY c.status
    `, { bind: [employerId] });

    // Summary of upcoming return-to-work dates (no patient names)
    const [upcomingRtw] = await sequelize.query(`
      SELECT
        r.case_id,
        c.case_number,
        c.status AS case_status,
        r.return_to_work_date,
        r.work_restrictions,
        r.impairment_rating
      FROM msk_ime_reports r
      INNER JOIN msk_cases c ON r.case_id = c.id
      WHERE r.employer_id = $1
        AND r.return_to_work_date IS NOT NULL
        AND r.return_to_work_date >= NOW()
      ORDER BY r.return_to_work_date ASC
      LIMIT 20
    `, { bind: [employerId] });

    // Totals
    const [totals] = await sequelize.query(`
      SELECT
        COUNT(DISTINCT r.case_id) AS total_cases,
        COUNT(r.id) AS total_reports,
        COUNT(CASE WHEN r.work_related = true THEN 1 END) AS work_related,
        COUNT(CASE WHEN r.work_related = false THEN 1 END) AS not_work_related,
        ROUND(AVG(CASE WHEN r.impairment_rating IS NOT NULL THEN r.impairment_rating::numeric END), 1) AS avg_impairment_rating
      FROM msk_ime_reports r
      WHERE r.employer_id = $1
    `, { bind: [employerId] });

    res.json({
      success: true,
      data: {
        employer,
        summary: totals[0] || {},
        casesByStatus: caseStats,
        upcomingReturnToWork: upcomingRtw
      }
    });
  } catch (err) {
    console.error('[MSK-WC] Employer portal error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
