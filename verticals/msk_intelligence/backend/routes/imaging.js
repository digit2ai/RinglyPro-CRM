'use strict';

const express = require('express');
const router = express.Router();
const { sequelize, logAudit } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// File upload config
const uploadDir = path.join(__dirname, '../../uploads/imaging');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB for DICOM
  fileFilter: (req, file, cb) => {
    const allowed = ['.dcm', '.dicom', '.nii', '.nii.gz', '.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.mimetype.startsWith('application/dicom')) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file format'));
    }
  }
});

// GET /api/v1/imaging/orders — list imaging orders
router.get('/orders', async (req, res) => {
  try {
    const { caseId, status, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const binds = [];
    let idx = 1;

    if (caseId) { conditions.push(`io.case_id = $${idx++}`); binds.push(caseId); }
    if (status) { conditions.push(`io.status = $${idx++}`); binds.push(status); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [orders] = await sequelize.query(`
      SELECT io.*, ic.name AS center_name, ic.city, ic.state,
        (SELECT COUNT(*) FROM msk_imaging_files f WHERE f.imaging_order_id = io.id) AS file_count
      FROM msk_imaging_orders io
      LEFT JOIN msk_imaging_centers ic ON io.imaging_center_id = ic.id
      ${where}
      ORDER BY io.created_at DESC
      LIMIT $${idx++} OFFSET $${idx++}
    `, { bind: [...binds, parseInt(limit), parseInt(offset)] });

    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/imaging/orders — create imaging order
router.post('/orders', async (req, res) => {
  try {
    const { caseId, imagingCenterId, modality, bodyRegion, protocol, clinicalIndication, scheduledDate } = req.body;

    if (!caseId || !modality || !bodyRegion) {
      return res.status(400).json({ error: 'caseId, modality, and bodyRegion are required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO msk_imaging_orders (case_id, imaging_center_id, modality, body_region, protocol, clinical_indication, scheduled_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, {
      bind: [caseId, imagingCenterId || null, modality, bodyRegion, protocol || null, clinicalIndication || null, scheduledDate || null]
    });

    // Update case status
    await sequelize.query(`UPDATE msk_cases SET status = 'imaging_ordered', updated_at = NOW() WHERE id = $1`, { bind: [caseId] });

    // Timeline entry
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, performed_by)
      VALUES ($1, 'imaging_ordered', 'Imaging Ordered', $2, $3)
    `, { bind: [caseId, `${modality} - ${bodyRegion}${protocol ? ': ' + protocol : ''}`, req.user.userId] });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/imaging/upload — upload imaging files
router.post('/upload', upload.array('files', 20), async (req, res) => {
  try {
    const { caseId, imagingOrderId } = req.body;
    if (!caseId) return res.status(400).json({ error: 'caseId is required' });

    const uploaded = [];
    for (const file of req.files || []) {
      const ext = path.extname(file.originalname).toLowerCase();
      let fileType = 'jpg';
      if (['.dcm', '.dicom'].includes(ext)) fileType = 'dicom';
      else if (['.nii', '.nii.gz'].includes(ext)) fileType = 'nifti';
      else if (ext === '.png') fileType = 'png';
      else if (ext === '.pdf') fileType = 'pdf';

      const [result] = await sequelize.query(`
        INSERT INTO msk_imaging_files (imaging_order_id, case_id, file_name, file_type, file_size_bytes, storage_path, mime_type, uploaded_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, {
        bind: [
          imagingOrderId || null, caseId, file.originalname, fileType,
          file.size, file.path, file.mimetype, req.user.userId
        ]
      });

      uploaded.push(result[0]);
    }

    // Update case and order status
    if (imagingOrderId) {
      await sequelize.query(`UPDATE msk_imaging_orders SET status = 'uploaded', completed_date = NOW(), updated_at = NOW() WHERE id = $1`, { bind: [imagingOrderId] });
    }
    await sequelize.query(`UPDATE msk_cases SET status = 'imaging_received', updated_at = NOW() WHERE id = $1`, { bind: [caseId] });

    // Timeline
    await sequelize.query(`
      INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description, performed_by)
      VALUES ($1, 'imaging_uploaded', 'Imaging Uploaded', $2, $3)
    `, { bind: [caseId, `${uploaded.length} file(s) uploaded`, req.user.userId] });

    logAudit(req.user.userId, 'upload_imaging', 'imaging_file', null, req);

    res.status(201).json({ success: true, data: uploaded, count: uploaded.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/imaging/files/:caseId — get files for a case
router.get('/files/:caseId', async (req, res) => {
  try {
    const [files] = await sequelize.query(`
      SELECT f.*, u.first_name AS uploaded_by_name, u.last_name AS uploaded_by_last
      FROM msk_imaging_files f
      LEFT JOIN msk_users u ON f.uploaded_by = u.id
      WHERE f.case_id = $1
      ORDER BY f.created_at DESC
    `, { bind: [req.params.caseId] });

    logAudit(req.user.userId, 'view_imaging', 'imaging_file', null, req);

    res.json({ success: true, data: files });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/imaging/centers — list imaging centers
router.get('/centers', async (req, res) => {
  try {
    const { city, modality, limit = 50 } = req.query;
    const conditions = ['is_active = true'];
    const binds = [];
    let idx = 1;

    if (city) { conditions.push(`city ILIKE $${idx++}`); binds.push(`%${city}%`); }
    if (modality) { conditions.push(`modalities @> $${idx++}::jsonb`); binds.push(`["${modality}"]`); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    binds.push(parseInt(limit));

    const [centers] = await sequelize.query(`
      SELECT * FROM msk_imaging_centers ${where} ORDER BY name LIMIT $${idx}
    `, { bind: binds });

    res.json({ success: true, data: centers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/imaging/centers — add imaging center (admin only)
router.post('/centers', async (req, res) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

    const { name, address, city, state, zip, country, phone, email, website, modalities, operatingHours, acceptsDirectBooking, latitude, longitude } = req.body;

    const [result] = await sequelize.query(`
      INSERT INTO msk_imaging_centers (name, address, city, state, zip, country, phone, email, website, modalities, operating_hours, accepts_direct_booking, latitude, longitude)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      RETURNING *
    `, {
      bind: [
        name, address || null, city || null, state || null, zip || null, country || 'US',
        phone || null, email || null, website || null,
        modalities ? JSON.stringify(modalities) : '["MRI","CT","Ultrasound","X-Ray"]',
        operatingHours ? JSON.stringify(operatingHours) : '{}',
        acceptsDirectBooking || false, latitude || null, longitude || null
      ]
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
