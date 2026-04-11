'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { sequelize } = require('../middleware/auth');

// POST /api/v1/admin/users/:id/reset-password — admin sets a new password for any user
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'newPassword required (min 8 chars)' });
    }
    const hash = await bcrypt.hash(newPassword, 12);
    const [result] = await sequelize.query(
      `UPDATE msk_users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, email, first_name, last_name, role`,
      { bind: [hash, req.params.id] }
    );
    if (result.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, data: result[0], message: 'Password reset successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/admin/dashboard — KPI dashboard
router.get('/dashboard', async (req, res) => {
  try {
    // Case stats
    const [caseStats] = await sequelize.query(`
      SELECT
        COUNT(*) AS total_cases,
        COUNT(*) FILTER (WHERE status = 'intake') AS intake,
        COUNT(*) FILTER (WHERE status = 'triage') AS triage,
        COUNT(*) FILTER (WHERE status IN ('imaging_ordered','imaging_received')) AS imaging,
        COUNT(*) FILTER (WHERE status = 'under_review') AS under_review,
        COUNT(*) FILTER (WHERE status = 'report_ready') AS report_ready,
        COUNT(*) FILTER (WHERE status IN ('consult_scheduled','consult_complete')) AS consultations,
        COUNT(*) FILTER (WHERE status = 'closed') AS closed,
        COUNT(*) FILTER (WHERE urgency = 'emergency') AS emergencies,
        COUNT(*) FILTER (WHERE urgency = 'urgent') AS urgent_cases,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS new_last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS new_last_7d
      FROM msk_cases
    `);

    // Patient stats
    const [patientStats] = await sequelize.query(`
      SELECT COUNT(*) AS total_patients,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') AS new_last_30d
      FROM msk_patients
    `);

    // Report stats
    const [reportStats] = await sequelize.query(`
      SELECT
        COUNT(*) AS total_reports,
        COUNT(*) FILTER (WHERE status = 'finalized') AS finalized,
        COUNT(*) FILTER (WHERE status = 'draft') AS drafts,
        AVG(EXTRACT(EPOCH FROM (finalized_at - created_at)) / 3600)
          FILTER (WHERE finalized_at IS NOT NULL) AS avg_turnaround_hours
      FROM msk_reports
    `);

    // Revenue stats
    const [revenueStats] = await sequelize.query(`
      SELECT
        COALESCE(SUM(amount_cents), 0) AS total_revenue_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE status = 'paid'), 0) AS paid_revenue_cents,
        COALESCE(SUM(amount_cents) FILTER (WHERE paid_at > NOW() - INTERVAL '30 days' AND status = 'paid'), 0) AS revenue_last_30d_cents,
        COUNT(*) AS total_invoices,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_invoices
      FROM msk_invoices
    `);

    // Active subscriptions
    const [subStats] = await sequelize.query(`
      SELECT
        COUNT(*) AS active_subscriptions,
        COALESCE(SUM(price_cents), 0) AS monthly_recurring_cents
      FROM msk_subscriptions WHERE status = 'active'
    `);

    // B2B contracts
    const [b2bStats] = await sequelize.query(`
      SELECT
        COUNT(*) AS active_contracts,
        COALESCE(SUM(monthly_value_cents), 0) AS total_contract_value_cents
      FROM msk_b2b_contracts WHERE status = 'active'
    `);

    // Recent cases
    const [recentCases] = await sequelize.query(`
      SELECT c.id, c.case_number, c.status, c.urgency, c.chief_complaint, c.created_at,
        u.first_name AS patient_first_name, u.last_name AS patient_last_name
      FROM msk_cases c
      LEFT JOIN msk_patients p ON c.patient_id = p.id
      LEFT JOIN msk_users u ON p.user_id = u.id
      ORDER BY c.created_at DESC LIMIT 10
    `);

    res.json({
      success: true,
      data: {
        cases: caseStats[0],
        patients: patientStats[0],
        reports: reportStats[0],
        revenue: revenueStats[0],
        subscriptions: subStats[0],
        b2b: b2bStats[0],
        recentCases
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/admin/users — user management
router.get('/users', async (req, res) => {
  try {
    const { role, search, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (role) { conditions.push(`role = $${idx++}`); binds.push(role); }
    if (search) {
      conditions.push(`(first_name ILIKE $${idx} OR last_name ILIKE $${idx} OR email ILIKE $${idx})`);
      binds.push(`%${search}%`);
      idx++;
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    binds.push(parseInt(limit), parseInt(offset));

    const [users] = await sequelize.query(`
      SELECT id, email, first_name, last_name, role, phone, specialty, is_active, last_login, created_at
      FROM msk_users ${where}
      ORDER BY created_at DESC
      LIMIT $${idx++} OFFSET $${idx}
    `, { bind: binds });

    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/admin/users/:id — update user (admin)
router.put('/users/:id', async (req, res) => {
  try {
    const { role, isActive, specialty, credentials } = req.body;
    const updates = [];
    const binds = [];
    let idx = 1;

    if (role) { updates.push(`role = $${idx++}`); binds.push(role); }
    if (isActive !== undefined) { updates.push(`is_active = $${idx++}`); binds.push(isActive); }
    if (specialty) { updates.push(`specialty = $${idx++}`); binds.push(specialty); }
    if (credentials) { updates.push(`credentials = $${idx++}`); binds.push(credentials); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    updates.push('updated_at = NOW()');
    binds.push(req.params.id);

    const [result] = await sequelize.query(`
      UPDATE msk_users SET ${updates.join(', ')} WHERE id = $${idx} RETURNING id, email, first_name, last_name, role, is_active
    `, { bind: binds });

    if (result.length === 0) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/admin/audit-log
router.get('/audit-log', async (req, res) => {
  try {
    const { userId, action, limit = 100 } = req.query;
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (userId) { conditions.push(`a.user_id = $${idx++}`); binds.push(userId); }
    if (action) { conditions.push(`a.action = $${idx++}`); binds.push(action); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    binds.push(parseInt(limit));

    const [logs] = await sequelize.query(`
      SELECT a.*, u.first_name, u.last_name, u.email
      FROM msk_audit_log a
      LEFT JOIN msk_users u ON a.user_id = u.id
      ${where}
      ORDER BY a.created_at DESC
      LIMIT $${idx}
    `, { bind: binds });

    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
