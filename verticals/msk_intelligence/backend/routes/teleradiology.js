'use strict';

const express = require('express');
const router = express.Router();

module.exports = router;

function getDb(req) {
  return req.app.get('sequelize') || require('../index').sequelize;
}

// GET /teleradiology/requests — list queue
router.get('/requests', async (req, res) => {
  try {
    const db = getDb(req);
    const { status, priority, limit, offset } = req.query;
    let where = 'WHERE tr.tenant_id = $1';
    const binds = [req.user.tenantId || 1];

    if (status) {
      binds.push(status);
      where += ` AND tr.status = $${binds.length}`;
    }
    if (priority) {
      binds.push(priority);
      where += ` AND tr.priority = $${binds.length}`;
    }

    const [rows] = await db.query(`
      SELECT tr.*,
        c.case_number, c.chief_complaint,
        u.first_name || ' ' || u.last_name AS assigned_radiologist_name,
        rp.provider_name AS referring_provider_name
      FROM msk_teleradiology_requests tr
      LEFT JOIN msk_cases c ON tr.case_id = c.id
      LEFT JOIN msk_users u ON tr.assigned_radiologist_id = u.id
      LEFT JOIN msk_referring_providers rp ON tr.referring_provider_id = rp.id
      ${where}
      ORDER BY
        CASE tr.priority WHEN 'stat' THEN 1 WHEN 'urgent' THEN 2 WHEN 'priority' THEN 3 ELSE 4 END,
        tr.created_at ASC
      LIMIT $${binds.length + 1} OFFSET $${binds.length + 2}
    `, { bind: [...binds, parseInt(limit) || 50, parseInt(offset) || 0] });
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /teleradiology/requests/:id
router.get('/requests/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.query(
      `SELECT tr.*, c.case_number FROM msk_teleradiology_requests tr
       LEFT JOIN msk_cases c ON tr.case_id = c.id
       WHERE tr.id = $1 AND tr.tenant_id = $2`,
      { bind: [req.params.id, req.user.tenantId || 1] }
    );
    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /teleradiology/requests — create
router.post('/requests', async (req, res) => {
  try {
    const db = getDb(req);
    const { case_id, study_id, referring_provider_id, priority, modality,
            body_part, clinical_info, sla_hours, notes } = req.body;

    if (!case_id) return res.status(400).json({ error: 'case_id required' });

    const sla = sla_hours || (priority === 'stat' ? 1 : priority === 'urgent' ? 4 : priority === 'priority' ? 12 : 24);
    const sla_deadline = new Date(Date.now() + sla * 3600000).toISOString();

    const [rows] = await db.query(`
      INSERT INTO msk_teleradiology_requests
        (case_id, dicom_study_id, referring_provider_id, priority, modality,
         body_part, clinical_info, sla_hours, sla_deadline, notes, tenant_id, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'pending') RETURNING *
    `, { bind: [
      case_id, study_id || null, referring_provider_id || null,
      priority || 'routine', modality || null, body_part || null,
      clinical_info || null, sla, sla_deadline, notes || null,
      req.user.tenantId || 1
    ] });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /teleradiology/requests/:id — update status / assign
router.put('/requests/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const { status, assigned_radiologist_id, notes } = req.body;

    let setClause = 'updated_at = NOW()';
    const binds = [];
    let idx = 1;

    if (status) { binds.push(status); setClause += `, status = $${idx++}`; }
    if (assigned_radiologist_id) { binds.push(assigned_radiologist_id); setClause += `, assigned_radiologist_id = $${idx++}`; }
    if (notes) { binds.push(notes); setClause += `, notes = $${idx++}`; }

    // Set timestamps based on status
    if (status === 'in_progress') setClause += `, started_at = NOW()`;
    if (status === 'completed') setClause += `, completed_at = NOW()`;

    binds.push(req.params.id);
    binds.push(req.user.tenantId || 1);

    const [rows] = await db.query(`
      UPDATE msk_teleradiology_requests SET ${setClause}
      WHERE id = $${idx++} AND tenant_id = $${idx} RETURNING *
    `, { bind: binds });

    if (!rows.length) return res.status(404).json({ error: 'Request not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /teleradiology/stats — SLA stats
router.get('/stats', async (req, res) => {
  try {
    const db = getDb(req);
    const [stats] = await db.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
        COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at <= sla_deadline) AS sla_met,
        COUNT(*) FILTER (WHERE status = 'completed' AND completed_at > sla_deadline) AS sla_breached,
        COUNT(*) FILTER (WHERE status IN ('pending','in_progress') AND sla_deadline < NOW()) AS overdue,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) FILTER (WHERE status = 'completed') AS avg_tat_hours
      FROM msk_teleradiology_requests WHERE tenant_id = $1
    `, { bind: [req.user.tenantId || 1] });

    res.json({ success: true, data: stats[0] || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
