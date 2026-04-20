'use strict';

const express = require('express');
const router = express.Router();

module.exports = router;

function getDb(req) {
  return req.app.get('sequelize') || require('../index').sequelize;
}

// GET /report-delivery — list deliveries
router.get('/', async (req, res) => {
  try {
    const db = getDb(req);
    const { report_id, status, limit, offset } = req.query;
    let where = 'WHERE rd.tenant_id = $1';
    const binds = [req.user.tenantId || 1];

    if (report_id) {
      binds.push(report_id);
      where += ` AND rd.report_id = $${binds.length}`;
    }
    if (status) {
      binds.push(status);
      where += ` AND rd.delivery_status = $${binds.length}`;
    }

    const [rows] = await db.query(`
      SELECT rd.*,
        r.case_id, r.report_type,
        rp.provider_name AS recipient_provider_name
      FROM msk_report_deliveries rd
      LEFT JOIN msk_reports r ON rd.report_id = r.id
      LEFT JOIN msk_referring_providers rp ON rd.referring_provider_id = rp.id
      ${where}
      ORDER BY rd.created_at DESC
      LIMIT $${binds.length + 1} OFFSET $${binds.length + 2}
    `, { bind: [...binds, parseInt(limit) || 50, parseInt(offset) || 0] });
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /report-delivery — create delivery record
router.post('/', async (req, res) => {
  try {
    const db = getDb(req);
    const { report_id, referring_provider_id, delivery_method, recipient_address,
            format, notes } = req.body;

    if (!report_id || !delivery_method) {
      return res.status(400).json({ error: 'report_id and delivery_method required' });
    }

    const [rows] = await db.query(`
      INSERT INTO msk_report_deliveries
        (report_id, referring_provider_id, delivery_method, recipient_address,
         format, notes, delivery_status, tenant_id)
      VALUES ($1,$2,$3,$4,$5,$6,'pending',$7) RETURNING *
    `, { bind: [
      report_id, referring_provider_id || null, delivery_method,
      recipient_address || null, format || 'pdf', notes || null,
      req.user.tenantId || 1
    ] });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /report-delivery/:id — update status
router.put('/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const { delivery_status, error_message, delivered_at } = req.body;

    const [rows] = await db.query(`
      UPDATE msk_report_deliveries SET
        delivery_status = COALESCE($1, delivery_status),
        error_message = COALESCE($2, error_message),
        delivered_at = COALESCE($3, delivered_at),
        attempts = attempts + 1,
        last_attempt_at = NOW(),
        updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5 RETURNING *
    `, { bind: [
      delivery_status || null, error_message || null,
      delivered_at || null, req.params.id, req.user.tenantId || 1
    ] });

    if (!rows.length) return res.status(404).json({ error: 'Delivery not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /report-delivery/:id/retry — retry failed delivery
router.post('/:id/retry', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.query(`
      UPDATE msk_report_deliveries SET
        delivery_status = 'pending', error_message = NULL, updated_at = NOW()
      WHERE id = $1 AND tenant_id = $2 AND delivery_status = 'failed'
      RETURNING *
    `, { bind: [req.params.id, req.user.tenantId || 1] });

    if (!rows.length) return res.status(404).json({ error: 'Delivery not found or not in failed state' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /report-delivery/stats
router.get('/stats', async (req, res) => {
  try {
    const db = getDb(req);
    const [stats] = await db.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE delivery_status = 'delivered') AS delivered,
        COUNT(*) FILTER (WHERE delivery_status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE delivery_status = 'failed') AS failed,
        COUNT(*) FILTER (WHERE delivery_status = 'in_transit') AS in_transit
      FROM msk_report_deliveries WHERE tenant_id = $1
    `, { bind: [req.user.tenantId || 1] });
    res.json({ success: true, data: stats[0] || {} });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
