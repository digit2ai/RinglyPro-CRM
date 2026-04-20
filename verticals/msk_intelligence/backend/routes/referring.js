'use strict';

const express = require('express');
const router = express.Router();

module.exports = router;

function getDb(req) {
  return req.app.get('sequelize') || require('../index').sequelize;
}

// GET /referring/providers — list
router.get('/providers', async (req, res) => {
  try {
    const db = getDb(req);
    const { search, specialty } = req.query;
    let where = 'WHERE tenant_id = $1';
    const binds = [req.user.tenantId || 1];

    if (search) {
      binds.push(`%${search}%`);
      where += ` AND (provider_name ILIKE $${binds.length} OR npi ILIKE $${binds.length} OR facility_name ILIKE $${binds.length})`;
    }
    if (specialty) {
      binds.push(specialty);
      where += ` AND specialty = $${binds.length}`;
    }

    const [rows] = await db.query(`
      SELECT * FROM msk_referring_providers ${where} ORDER BY provider_name
    `, { bind: binds });
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /referring/providers/:id
router.get('/providers/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.query(
      `SELECT * FROM msk_referring_providers WHERE id = $1 AND tenant_id = $2`,
      { bind: [req.params.id, req.user.tenantId || 1] }
    );
    if (!rows.length) return res.status(404).json({ error: 'Provider not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /referring/providers — create
router.post('/providers', async (req, res) => {
  try {
    const db = getDb(req);
    const { provider_name, npi, specialty, facility_name, facility_address,
            phone, fax, email, preferred_report_format, preferred_delivery_method,
            notes } = req.body;

    if (!provider_name) return res.status(400).json({ error: 'provider_name required' });

    const [rows] = await db.query(`
      INSERT INTO msk_referring_providers
        (provider_name, npi, specialty, facility_name, facility_address,
         phone, fax, email, preferred_report_format, preferred_delivery_method,
         notes, tenant_id, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE) RETURNING *
    `, { bind: [
      provider_name, npi || null, specialty || null, facility_name || null,
      facility_address || null, phone || null, fax || null, email || null,
      preferred_report_format || 'pdf', preferred_delivery_method || 'fax',
      notes || null, req.user.tenantId || 1
    ] });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /referring/providers/:id — update
router.put('/providers/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const { provider_name, npi, specialty, facility_name, facility_address,
            phone, fax, email, preferred_report_format, preferred_delivery_method,
            notes, is_active } = req.body;

    const [rows] = await db.query(`
      UPDATE msk_referring_providers SET
        provider_name = COALESCE($1, provider_name),
        npi = COALESCE($2, npi),
        specialty = COALESCE($3, specialty),
        facility_name = COALESCE($4, facility_name),
        facility_address = COALESCE($5, facility_address),
        phone = COALESCE($6, phone),
        fax = COALESCE($7, fax),
        email = COALESCE($8, email),
        preferred_report_format = COALESCE($9, preferred_report_format),
        preferred_delivery_method = COALESCE($10, preferred_delivery_method),
        notes = COALESCE($11, notes),
        is_active = COALESCE($12, is_active),
        updated_at = NOW()
      WHERE id = $13 AND tenant_id = $14 RETURNING *
    `, { bind: [
      provider_name || null, npi || null, specialty || null,
      facility_name || null, facility_address || null,
      phone || null, fax || null, email || null,
      preferred_report_format || null, preferred_delivery_method || null,
      notes || null, is_active != null ? is_active : null,
      req.params.id, req.user.tenantId || 1
    ] });

    if (!rows.length) return res.status(404).json({ error: 'Provider not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /referring/providers/:id
router.delete('/providers/:id', async (req, res) => {
  try {
    const db = getDb(req);
    await db.query(
      `UPDATE msk_referring_providers SET is_active = FALSE, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      { bind: [req.params.id, req.user.tenantId || 1] }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /referring/providers/search?q=... — quick NPI/name search
router.get('/search', async (req, res) => {
  try {
    const db = getDb(req);
    const q = req.query.q;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const [rows] = await db.query(`
      SELECT id, provider_name, npi, specialty, facility_name, phone, fax, email
      FROM msk_referring_providers
      WHERE tenant_id = $1 AND is_active = TRUE
        AND (provider_name ILIKE $2 OR npi ILIKE $2 OR facility_name ILIKE $2)
      ORDER BY provider_name LIMIT 20
    `, { bind: [req.user.tenantId || 1, `%${q}%`] });
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
