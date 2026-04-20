'use strict';

const express = require('express');
const router = express.Router();

module.exports = router;

// Lazy sequelize getter
function getDb(req) {
  return req.app.get('sequelize') || require('../index').sequelize;
}

// GET /pacs/connections — list PACS connections for tenant
router.get('/connections', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.query(
      `SELECT id, name, ae_title, host, port, protocol, base_url, polling_interval_seconds,
              auto_import, auto_analyze, match_strategy, status, last_poll_at, last_poll_status,
              studies_imported, errors_count, tenant_id, created_at, updated_at
       FROM msk_pacs_connections WHERE tenant_id = $1 ORDER BY name`,
      { bind: [req.user.tenantId || 1] }
    );
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /pacs/connections/:id
router.get('/connections/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.query(
      `SELECT * FROM msk_pacs_connections WHERE id = $1 AND tenant_id = $2`,
      { bind: [req.params.id, req.user.tenantId || 1] }
    );
    if (!rows.length) return res.status(404).json({ error: 'Connection not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /pacs/connections — create
router.post('/connections', async (req, res) => {
  try {
    const db = getDb(req);
    const { name, ae_title, host, port, protocol, base_url, polling_interval_seconds,
            auto_import, auto_analyze, match_strategy, auth_type, auth_credentials } = req.body;

    if (!name || !host) return res.status(400).json({ error: 'name and host required' });

    const [rows] = await db.query(`
      INSERT INTO msk_pacs_connections
        (name, ae_title, host, port, protocol, base_url, polling_interval_seconds,
         auto_import, auto_analyze, match_strategy, auth_type, auth_credentials, tenant_id, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'inactive')
      RETURNING *
    `, { bind: [
      name, ae_title || '', host, port || 4242, protocol || 'dicomweb',
      base_url || '', polling_interval_seconds || 300,
      auto_import !== false, auto_analyze !== false,
      match_strategy || 'mrn_accession', auth_type || 'none',
      JSON.stringify(auth_credentials || {}), req.user.tenantId || 1
    ] });

    res.status(201).json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /pacs/connections/:id — update
router.put('/connections/:id', async (req, res) => {
  try {
    const db = getDb(req);
    const { name, ae_title, host, port, protocol, base_url, polling_interval_seconds,
            auto_import, auto_analyze, match_strategy, auth_type, auth_credentials, status } = req.body;

    const [rows] = await db.query(`
      UPDATE msk_pacs_connections SET
        name = COALESCE($1, name), ae_title = COALESCE($2, ae_title),
        host = COALESCE($3, host), port = COALESCE($4, port),
        protocol = COALESCE($5, protocol), base_url = COALESCE($6, base_url),
        polling_interval_seconds = COALESCE($7, polling_interval_seconds),
        auto_import = COALESCE($8, auto_import), auto_analyze = COALESCE($9, auto_analyze),
        match_strategy = COALESCE($10, match_strategy), auth_type = COALESCE($11, auth_type),
        auth_credentials = COALESCE($12, auth_credentials),
        status = COALESCE($13, status), updated_at = NOW()
      WHERE id = $14 AND tenant_id = $15 RETURNING *
    `, { bind: [
      name || null, ae_title || null, host || null, port || null,
      protocol || null, base_url || null, polling_interval_seconds || null,
      auto_import != null ? auto_import : null, auto_analyze != null ? auto_analyze : null,
      match_strategy || null, auth_type || null,
      auth_credentials ? JSON.stringify(auth_credentials) : null,
      status || null, req.params.id, req.user.tenantId || 1
    ] });

    if (!rows.length) return res.status(404).json({ error: 'Connection not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// DELETE /pacs/connections/:id
router.delete('/connections/:id', async (req, res) => {
  try {
    const db = getDb(req);
    await db.query(
      `DELETE FROM msk_pacs_connections WHERE id = $1 AND tenant_id = $2`,
      { bind: [req.params.id, req.user.tenantId || 1] }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /pacs/connections/:id/poll — manual poll trigger
router.post('/connections/:id/poll', async (req, res) => {
  try {
    const db = getDb(req);
    const [rows] = await db.query(
      `SELECT * FROM msk_pacs_connections WHERE id = $1 AND tenant_id = $2`,
      { bind: [req.params.id, req.user.tenantId || 1] }
    );
    if (!rows.length) return res.status(404).json({ error: 'Connection not found' });

    // Trigger poll (fire and forget)
    const PACSPoller = require('../services/pacsPoller');
    const poller = new PACSPoller(db);
    poller.pollConnection(rows[0]).then(result => {
      console.log(`[PACS] Manual poll complete for ${rows[0].name}: ${JSON.stringify(result)}`);
    }).catch(err => {
      console.error(`[PACS] Manual poll error for ${rows[0].name}: ${err.message}`);
    });

    await db.query(
      `UPDATE msk_pacs_connections SET last_poll_at = NOW() WHERE id = $1`,
      { bind: [req.params.id] }
    );

    res.json({ success: true, message: 'Poll triggered' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /pacs/studies — list DICOM studies
router.get('/studies', async (req, res) => {
  try {
    const db = getDb(req);
    const { limit, offset, status } = req.query;
    let where = 'WHERE ds.tenant_id = $1';
    const binds = [req.user.tenantId || 1];
    if (status) {
      binds.push(status);
      where += ` AND ds.import_status = $${binds.length}`;
    }
    const [rows] = await db.query(`
      SELECT ds.*, pc.name as connection_name
      FROM msk_dicom_studies ds
      LEFT JOIN msk_pacs_connections pc ON ds.pacs_connection_id = pc.id
      ${where}
      ORDER BY ds.study_date DESC NULLS LAST, ds.discovered_at DESC
      LIMIT $${binds.length + 1} OFFSET $${binds.length + 2}
    `, { bind: [...binds, parseInt(limit) || 50, parseInt(offset) || 0] });
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
