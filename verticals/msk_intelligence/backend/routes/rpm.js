'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, authorize, sequelize } = require('../middleware/auth');

// All routes require authentication
router.use(authenticate);

// POST /enroll — Enroll patient in RPM program
router.post('/enroll', authorize('admin', 'provider', 'physician'), async (req, res) => {
  try {
    const { patientId, caseId, providerId, startDate, endDate, monitoringType } = req.body;

    if (!patientId || !caseId || !providerId || !startDate || !monitoringType) {
      return res.status(400).json({ error: 'Missing required fields: patientId, caseId, providerId, startDate, monitoringType' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO msk_rpm_enrollments
        (patient_id, case_id, provider_id, start_date, end_date, monitoring_type, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'active', NOW(), NOW())
      RETURNING *
    `, {
      bind: [patientId, caseId, providerId, startDate, endDate || null, monitoringType]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    console.error('[MSK-RPM] Enroll error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /dashboard/:enrollmentId — Provider dashboard view
router.get('/dashboard/:enrollmentId', authorize('admin', 'provider', 'physician'), async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    // Get enrollment details
    const [enrollments] = await sequelize.query(`
      SELECT e.*,
        p.id AS pat_id, u.first_name AS patient_first_name, u.last_name AS patient_last_name,
        prov.first_name AS provider_first_name, prov.last_name AS provider_last_name
      FROM msk_rpm_enrollments e
      LEFT JOIN msk_patients p ON e.patient_id = p.id
      LEFT JOIN msk_users u ON p.user_id = u.id
      LEFT JOIN msk_users prov ON e.provider_id = prov.id
      WHERE e.id = $1
    `, { bind: [enrollmentId] });

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    const enrollment = enrollments[0];

    // Get all readings grouped by type — latest values
    const [latestReadings] = await sequelize.query(`
      SELECT DISTINCT ON (reading_type)
        reading_type, value, unit, source, recorded_at
      FROM msk_rpm_readings
      WHERE enrollment_id = $1
      ORDER BY reading_type, recorded_at DESC
    `, { bind: [enrollmentId] });

    // Daily aggregates (avg, min, max per type per day)
    const [dailyAggregates] = await sequelize.query(`
      SELECT
        reading_type,
        DATE(recorded_at) AS reading_date,
        COUNT(*) AS reading_count,
        ROUND(AVG(value::numeric), 2) AS avg_value,
        ROUND(MIN(value::numeric), 2) AS min_value,
        ROUND(MAX(value::numeric), 2) AS max_value,
        MIN(unit) AS unit
      FROM msk_rpm_readings
      WHERE enrollment_id = $1
      GROUP BY reading_type, DATE(recorded_at)
      ORDER BY reading_date DESC, reading_type
    `, { bind: [enrollmentId] });

    // Group daily aggregates by reading_type
    const groupedAggregates = {};
    for (const row of dailyAggregates) {
      if (!groupedAggregates[row.reading_type]) {
        groupedAggregates[row.reading_type] = [];
      }
      groupedAggregates[row.reading_type].push(row);
    }

    res.json({
      success: true,
      data: {
        enrollment,
        latestReadings,
        dailyAggregates: groupedAggregates
      }
    });
  } catch (err) {
    console.error('[MSK-RPM] Dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /readings — Batch sync readings from mobile device
router.post('/readings', async (req, res) => {
  try {
    const { enrollmentId, readings } = req.body;

    if (!enrollmentId || !Array.isArray(readings) || readings.length === 0) {
      return res.status(400).json({ error: 'Missing required fields: enrollmentId, readings (non-empty array)' });
    }

    // Verify enrollment exists and is active
    const [enrollments] = await sequelize.query(`
      SELECT id, patient_id, status FROM msk_rpm_enrollments WHERE id = $1
    `, { bind: [enrollmentId] });

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'Enrollment not found' });
    }

    if (enrollments[0].status !== 'active') {
      return res.status(400).json({ error: 'Enrollment is not active' });
    }

    // Build bulk insert
    const values = [];
    const binds = [];
    let bindIdx = 1;

    for (const r of readings) {
      if (!r.readingType || r.value === undefined || !r.unit || !r.recordedAt) {
        return res.status(400).json({ error: 'Each reading requires: readingType, value, unit, recordedAt' });
      }
      values.push(`($${bindIdx++}, $${bindIdx++}, $${bindIdx++}, $${bindIdx++}, $${bindIdx++}, $${bindIdx++}, NOW())`);
      binds.push(enrollmentId, r.readingType, String(r.value), r.unit, r.source || 'mobile', r.recordedAt);
    }

    const [inserted] = await sequelize.query(`
      INSERT INTO msk_rpm_readings
        (enrollment_id, reading_type, value, unit, source, recorded_at, created_at)
      VALUES ${values.join(', ')}
      RETURNING *
    `, { bind: binds });

    res.status(201).json({ success: true, count: inserted.length, data: inserted });
  } catch (err) {
    console.error('[MSK-RPM] Readings sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /billing-summary/:month — CPT 99454/99457 billing documentation
router.get('/billing-summary/:month', authorize('admin', 'provider', 'physician', 'billing'), async (req, res) => {
  try {
    const { month } = req.params; // YYYY-MM

    if (!/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({ error: 'Month must be in YYYY-MM format' });
    }

    const startDate = `${month}-01`;
    const endDate = `${month}-01::date + INTERVAL '1 month'`;

    // Per-enrollment: count distinct reading days
    const [summary] = await sequelize.query(`
      SELECT
        e.id AS enrollment_id,
        e.patient_id,
        e.provider_id,
        e.monitoring_type,
        u.first_name AS patient_first_name,
        u.last_name AS patient_last_name,
        COUNT(DISTINCT DATE(r.recorded_at)) AS reading_days,
        COUNT(r.id) AS total_readings,
        MIN(r.recorded_at) AS first_reading,
        MAX(r.recorded_at) AS last_reading,
        CASE
          WHEN COUNT(DISTINCT DATE(r.recorded_at)) >= 16 THEN true
          ELSE false
        END AS billable_99454,
        CASE
          WHEN COUNT(DISTINCT DATE(r.recorded_at)) >= 16 THEN 'CPT 99454'
          ELSE NULL
        END AS eligible_cpt_device,
        'CPT 99457' AS eligible_cpt_monitoring
      FROM msk_rpm_enrollments e
      LEFT JOIN msk_patients p ON e.patient_id = p.id
      LEFT JOIN msk_users u ON p.user_id = u.id
      LEFT JOIN msk_rpm_readings r
        ON r.enrollment_id = e.id
        AND r.recorded_at >= $1::date
        AND r.recorded_at < $1::date + INTERVAL '1 month'
      WHERE e.status = 'active'
        AND e.start_date <= ($1::date + INTERVAL '1 month' - INTERVAL '1 day')
        AND (e.end_date IS NULL OR e.end_date >= $1::date)
      GROUP BY e.id, e.patient_id, e.provider_id, e.monitoring_type,
        u.first_name, u.last_name
      ORDER BY u.last_name, u.first_name
    `, { bind: [startDate] });

    const billableCount = summary.filter(s => s.billable_99454).length;

    res.json({
      success: true,
      month,
      totalEnrollments: summary.length,
      billableFor99454: billableCount,
      data: summary
    });
  } catch (err) {
    console.error('[MSK-RPM] Billing summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /my-enrollment — Patient's active enrollment
router.get('/my-enrollment', async (req, res) => {
  try {
    // Get patient ID from user
    const [patients] = await sequelize.query(`
      SELECT id FROM msk_patients WHERE user_id = $1
    `, { bind: [req.user.userId] });

    if (patients.length === 0) {
      return res.status(404).json({ error: 'Patient record not found' });
    }

    const patientId = patients[0].id;

    const [enrollments] = await sequelize.query(`
      SELECT e.*,
        prov.first_name AS provider_first_name,
        prov.last_name AS provider_last_name,
        prov.credentials AS provider_credentials
      FROM msk_rpm_enrollments e
      LEFT JOIN msk_users prov ON e.provider_id = prov.id
      WHERE e.patient_id = $1
        AND e.status = 'active'
      ORDER BY e.created_at DESC
      LIMIT 1
    `, { bind: [patientId] });

    if (enrollments.length === 0) {
      return res.status(404).json({ error: 'No active enrollment found' });
    }

    res.json({ success: true, data: enrollments[0] });
  } catch (err) {
    console.error('[MSK-RPM] My enrollment error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
