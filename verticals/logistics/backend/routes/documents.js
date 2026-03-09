const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.lg');
const sequelize = require('../services/db.lg');
const path = require('path');
const fs = require('fs');
const UPLOAD_DIR = path.join(__dirname, '../../uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

router.get('/', auth.any, async (req, res) => {
  try {
    const { load_id, carrier_id, doc_type, limit } = req.query;
    let where = `WHERE d.status = 'active'`, binds = [], idx = 1;
    if (load_id) { where += ` AND d.load_id = $${idx}`; binds.push(load_id); idx++; }
    if (carrier_id) { where += ` AND d.carrier_id = $${idx}`; binds.push(carrier_id); idx++; }
    if (doc_type) { where += ` AND d.doc_type = $${idx}`; binds.push(doc_type); idx++; }
    const [docs] = await sequelize.query(`SELECT d.*, u.full_name as uploaded_by_name FROM lg_documents d LEFT JOIN lg_users u ON u.id = d.uploaded_by ${where} ORDER BY d.created_at DESC LIMIT $${idx}`, { bind: [...binds, parseInt(limit) || 100] });
    res.json({ success: true, data: docs });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/upload', auth.any, async (req, res) => {
  try {
    const { doc_type, load_id, carrier_id, shipper_id, contact_id, filename, file_data, mime_type } = req.body;
    if (!doc_type || !filename) return res.status(400).json({ error: 'doc_type and filename required' });
    const storageName = `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`;
    const storagePath = path.join(UPLOAD_DIR, storageName);
    let fileSize = 0;
    if (file_data) { const buf = Buffer.from(file_data, 'base64'); fs.writeFileSync(storagePath, buf); fileSize = buf.length; }
    const [[doc]] = await sequelize.query(`INSERT INTO lg_documents (tenant_id, doc_type, filename, original_name, mime_type, file_size, storage_path, load_id, carrier_id, shipper_id, contact_id, uploaded_by, status, created_at) VALUES ('logistics', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', NOW()) RETURNING *`, { bind: [doc_type, storageName, filename, mime_type || 'application/octet-stream', fileSize, storagePath, load_id || null, carrier_id || null, shipper_id || null, contact_id || null, req.user?.id || null] });
    res.status(201).json({ success: true, data: doc });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', auth.dispatcher, async (req, res) => {
  try {
    await sequelize.query(`UPDATE lg_documents SET status = 'deleted' WHERE id = $1`, { bind: [req.params.id] });
    res.json({ success: true, message: 'Document deleted' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/load/:loadId/verify', auth.any, async (req, res) => {
  try {
    const docService = require('../services/documents.lg');
    const result = await docService.verify_documents_complete({ load_id: req.params.loadId });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
