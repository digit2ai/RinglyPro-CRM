'use strict';

const express = require('express');
const router = express.Router();
const { authenticate, authorize, sequelize } = require('../middleware/auth');

// All analytics routes require admin or radiologist role
router.use(authenticate, authorize('admin', 'radiologist'));

// GET /overview — high-level platform metrics
router.get('/overview', async (req, res) => {
  try {
    const [caseVolume] = await sequelize.query(`
      SELECT COUNT(*) AS total_cases FROM msk_cases
    `);

    const [avgTurnaround] = await sequelize.query(`
      SELECT
        ROUND(AVG(EXTRACT(EPOCH FROM (
          CASE WHEN status_updated_at IS NOT NULL AND status = 'report_ready'
               THEN status_updated_at ELSE NOW() END
          - created_at
        )) / 3600)::numeric, 1) AS avg_turnaround_hours
      FROM msk_cases
      WHERE status = 'report_ready'
    `);

    const [totalPatients] = await sequelize.query(`
      SELECT COUNT(*) AS total_patients FROM msk_patients
    `);

    const [totalFinalized] = await sequelize.query(`
      SELECT COUNT(*) AS total_finalized
      FROM msk_reports
      WHERE status = 'finalized'
    `);

    res.json({
      success: true,
      data: {
        totalCases: parseInt(caseVolume[0].total_cases) || 0,
        avgTurnaroundHours: parseFloat(avgTurnaround[0]?.avg_turnaround_hours) || null,
        totalPatients: parseInt(totalPatients[0].total_patients) || 0,
        totalReportsFinalized: parseInt(totalFinalized[0].total_finalized) || 0
      }
    });
  } catch (err) {
    console.error('[MSK-ANALYTICS] overview error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /proms — population PROM averages by instrument and collection point
router.get('/proms', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        instrument_code,
        collection_point,
        COUNT(*) AS submissions,
        ROUND(AVG(score)::numeric, 2) AS avg_score,
        ROUND(MIN(score)::numeric, 2) AS min_score,
        ROUND(MAX(score)::numeric, 2) AS max_score,
        ROUND(STDDEV(score)::numeric, 2) AS stddev_score
      FROM msk_prom_submissions
      GROUP BY instrument_code, collection_point
      ORDER BY instrument_code, collection_point
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[MSK-ANALYTICS] proms error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /providers — cases per provider, avg consult time
router.get('/providers', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        u.id AS provider_id,
        u.first_name,
        u.last_name,
        u.role,
        COUNT(c.id) AS total_cases,
        ROUND(AVG(
          CASE WHEN con.duration_minutes IS NOT NULL
               THEN con.duration_minutes ELSE NULL END
        )::numeric, 1) AS avg_consult_minutes
      FROM msk_users u
      LEFT JOIN msk_cases c ON c.assigned_radiologist_id = u.id
      LEFT JOIN msk_consultations con ON con.case_id = c.id
      WHERE u.role IN ('radiologist', 'admin')
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY total_cases DESC
    `);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('[MSK-ANALYTICS] providers error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /revenue — invoices aggregated by month
router.get('/revenue', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        SUM(amount_cents) FILTER (WHERE status IN ('sent', 'paid', 'overdue')) AS billed_cents,
        SUM(amount_cents) FILTER (WHERE status = 'paid') AS paid_cents,
        SUM(amount_cents) FILTER (WHERE status IN ('sent', 'overdue')) AS outstanding_cents,
        COUNT(*) AS invoice_count
      FROM msk_invoices
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `);

    res.json({
      success: true,
      data: rows.map(r => ({
        month: r.month,
        billedCents: parseInt(r.billed_cents) || 0,
        paidCents: parseInt(r.paid_cents) || 0,
        outstandingCents: parseInt(r.outstanding_cents) || 0,
        invoiceCount: parseInt(r.invoice_count) || 0
      }))
    });
  } catch (err) {
    console.error('[MSK-ANALYTICS] revenue error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /billing — denial rate and top denial reasons
router.get('/billing', async (req, res) => {
  try {
    const [totals] = await sequelize.query(`
      SELECT
        COUNT(*) AS total_invoices,
        COUNT(*) FILTER (WHERE status = 'denied') AS denied_count
      FROM msk_invoices
    `);

    const total = parseInt(totals[0].total_invoices) || 0;
    const denied = parseInt(totals[0].denied_count) || 0;
    const denialRate = total > 0 ? parseFloat((denied / total * 100).toFixed(2)) : 0;

    const [reasons] = await sequelize.query(`
      SELECT
        denial_reason,
        COUNT(*) AS count
      FROM msk_invoices
      WHERE status = 'denied' AND denial_reason IS NOT NULL
      GROUP BY denial_reason
      ORDER BY count DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        totalInvoices: total,
        deniedCount: denied,
        denialRatePercent: denialRate,
        topDenialReasons: reasons
      }
    });
  } catch (err) {
    console.error('[MSK-ANALYTICS] billing error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /case-pipeline — count of cases in each status
router.get('/case-pipeline', async (req, res) => {
  try {
    const [rows] = await sequelize.query(`
      SELECT
        status,
        COUNT(*) AS count
      FROM msk_cases
      GROUP BY status
      ORDER BY count DESC
    `);

    res.json({
      success: true,
      data: rows.map(r => ({
        status: r.status,
        count: parseInt(r.count) || 0
      }))
    });
  } catch (err) {
    console.error('[MSK-ANALYTICS] case-pipeline error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
