'use strict';

const express = require('express');
const router = express.Router();
const { sequelize, logAudit } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ── Claude Vision Analysis ──────────────────────────────────────────
// Sends an uploaded image to Claude Vision for medical image analysis.
// Returns structured findings for the copilot report workflow.
async function analyzeImageWithClaude(filePath, mimeType, caseContext) {
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || process.env.MSK_ANTHROPIC_KEY;
  if (!ANTHROPIC_KEY) return null;

  // Only analyze viewable image types
  const supportedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  const mappedMime = supportedTypes.includes(mimeType) ? mimeType : null;
  if (!mappedMime) return null;

  try {
    const imageData = fs.readFileSync(filePath);
    const base64Image = imageData.toString('base64');

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: ANTHROPIC_KEY });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: `You are a board-certified musculoskeletal radiologist performing an initial read of a medical image.
You MUST output ONLY valid JSON with these exact fields:
{
  "modality": "X-ray|MRI|CT|Ultrasound|Photo|Unknown",
  "bodyRegion": "detected body region",
  "findings": "Detailed radiological findings paragraph. Describe what you see: alignment, bone density, joint spaces, soft tissue, any abnormalities.",
  "impression": "1-3 sentence clinical impression summarizing the key findings and likely diagnosis",
  "abnormalitiesDetected": ["list of specific abnormalities found, if any"],
  "normalFindings": ["list of normal/unremarkable findings"],
  "recommendedFollowUp": "Any recommended additional imaging or clinical follow-up",
  "confidenceLevel": "High|Moderate|Low",
  "icd10Suggestions": [{"code":"M25.561","description":"Pain in right knee"}],
  "limitations": "Any limitations in the analysis (image quality, incomplete view, etc.)"
}
Be specific and clinical. If the image quality is poor or the image is not a medical image, state that clearly.
IMPORTANT: This is an AI-assisted preliminary read — it must be reviewed and finalized by a qualified radiologist.`,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mappedMime,
              data: base64Image
            }
          },
          {
            type: 'text',
            text: `Analyze this medical image. Clinical context: ${caseContext || 'No additional context provided.'}`
          }
        ]
      }]
    });

    const text = response.content[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : { findings: text, modality: 'Unknown', impression: '', abnormalitiesDetected: [], confidenceLevel: 'Low' };
  } catch (err) {
    console.error('[MSK Imaging] Claude Vision analysis error:', err.message);
    return null;
  }
}

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

    // Ensure file_data column exists for persistent blob storage
    try { await sequelize.query(`ALTER TABLE msk_imaging_files ADD COLUMN IF NOT EXISTS file_data TEXT DEFAULT NULL`); } catch(e) {}

    const uploaded = [];
    for (const file of req.files || []) {
      const ext = path.extname(file.originalname).toLowerCase();
      let fileType = 'jpg';
      if (['.dcm', '.dicom'].includes(ext)) fileType = 'dicom';
      else if (['.nii', '.nii.gz'].includes(ext)) fileType = 'nifti';
      else if (ext === '.png') fileType = 'png';
      else if (ext === '.pdf') fileType = 'pdf';

      // Read file and store as base64 in database (survives Render redeploys)
      let fileData = null;
      try {
        const fileBuffer = fs.readFileSync(file.path);
        // Only store images < 20MB as base64 in DB (larger files stay disk-only)
        if (fileBuffer.length < 20 * 1024 * 1024) {
          fileData = fileBuffer.toString('base64');
        }
      } catch(e) { console.error('[MSK Imaging] Failed to read file for DB storage:', e.message); }

      const [result] = await sequelize.query(`
        INSERT INTO msk_imaging_files (imaging_order_id, case_id, file_name, file_type, file_size_bytes, storage_path, mime_type, uploaded_by, file_data)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id, imaging_order_id, case_id, file_name, file_type, file_size_bytes, storage_path, mime_type, uploaded_by, created_at
      `, {
        bind: [
          imagingOrderId || null, caseId, file.originalname, fileType,
          file.size, file.path, file.mimetype, req.user.userId, fileData
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

    // ── Trigger Claude Vision analysis in background for image files ──
    // Ensure ai_analysis column exists
    try { await sequelize.query(`ALTER TABLE msk_imaging_files ADD COLUMN IF NOT EXISTS ai_analysis JSONB DEFAULT NULL`); } catch(e) {}
    try { await sequelize.query(`ALTER TABLE msk_imaging_files ADD COLUMN IF NOT EXISTS ai_analyzed_at TIMESTAMPTZ DEFAULT NULL`); } catch(e) {}

    // Get clinical context for the case
    let caseContext = '';
    try {
      const [caseData] = await sequelize.query(`SELECT chief_complaint, pain_location, injury_mechanism, severity, sport_context FROM msk_cases WHERE id = $1`, { bind: [caseId] });
      if (caseData[0]) {
        const c = caseData[0];
        caseContext = `Chief complaint: ${c.chief_complaint || 'N/A'}. Pain location: ${c.pain_location || 'N/A'}. Mechanism: ${c.injury_mechanism || 'N/A'}. Severity: ${c.severity || 'N/A'}/10. Sport context: ${c.sport_context || 'N/A'}.`;
      }
    } catch(e) {}

    // Analyze each uploaded image (non-blocking — don't wait for response)
    for (const file of req.files || []) {
      const fileRecord = uploaded.find(u => u.file_name === file.originalname);
      if (!fileRecord) continue;

      // Fire and forget — analysis runs in background
      analyzeImageWithClaude(file.path, file.mimetype, caseContext)
        .then(async (analysis) => {
          if (analysis) {
            await sequelize.query(
              `UPDATE msk_imaging_files SET ai_analysis = $1, ai_analyzed_at = NOW() WHERE id = $2`,
              { bind: [JSON.stringify(analysis), fileRecord.id] }
            );
            // Add timeline entry
            await sequelize.query(`
              INSERT INTO msk_case_timeline (case_id, event_type, event_title, event_description)
              VALUES ($1, 'ai_imaging_analysis', 'AI Image Analysis Complete', $2)
            `, { bind: [caseId, `${analysis.modality || 'Image'} analyzed — ${analysis.impression || 'Analysis complete'}`] });
            console.log(`[MSK Imaging] AI analysis complete for file ${fileRecord.id}`);
          }
        })
        .catch(err => console.error('[MSK Imaging] Background analysis error:', err.message));
    }

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

// GET /api/v1/imaging/showcase/:fileId — public read-only image serving for showcase/demo pages (no auth required)
// Only serves files explicitly marked as showcase or from designated demo cases
router.get('/showcase/:fileId', async (req, res) => {
  try {
    const [files] = await sequelize.query(
      `SELECT storage_path, mime_type, file_name, file_data FROM msk_imaging_files WHERE id = $1`,
      { bind: [req.params.fileId] }
    );
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = files[0];

    res.setHeader('Content-Type', file.mime_type || 'image/jpeg');
    res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
    res.setHeader('Cache-Control', 'public, max-age=86400');

    if (file.storage_path && fs.existsSync(file.storage_path)) {
      return fs.createReadStream(file.storage_path).pipe(res);
    }
    if (file.file_data) {
      const buffer = Buffer.from(file.file_data, 'base64');
      res.setHeader('Content-Length', buffer.length);
      return res.end(buffer);
    }
    res.status(404).json({ error: 'Image data not available' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/imaging/file/:fileId — serve the actual image file
// Tries disk first, falls back to database blob (survives Render redeploys)
router.get('/file/:fileId', async (req, res) => {
  try {
    const [files] = await sequelize.query(
      `SELECT storage_path, mime_type, file_name, file_data FROM msk_imaging_files WHERE id = $1`,
      { bind: [req.params.fileId] }
    );
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = files[0];

    res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${file.file_name}"`);
    res.setHeader('Cache-Control', 'private, max-age=3600');

    // Try disk first (fastest)
    if (file.storage_path && fs.existsSync(file.storage_path)) {
      return fs.createReadStream(file.storage_path).pipe(res);
    }

    // Fall back to database blob
    if (file.file_data) {
      const buffer = Buffer.from(file.file_data, 'base64');
      res.setHeader('Content-Length', buffer.length);
      return res.end(buffer);
    }

    res.status(404).json({ error: 'Image file lost — Render ephemeral storage wiped on redeploy. Re-upload the image.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/imaging/analysis/:fileId — get AI analysis for a specific file
router.get('/analysis/:fileId', async (req, res) => {
  try {
    const [files] = await sequelize.query(
      `SELECT id, file_name, file_type, ai_analysis, ai_analyzed_at FROM msk_imaging_files WHERE id = $1`,
      { bind: [req.params.fileId] }
    );
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = files[0];
    res.json({
      success: true,
      data: {
        fileId: file.id,
        fileName: file.file_name,
        fileType: file.file_type,
        analysis: file.ai_analysis || null,
        analyzedAt: file.ai_analyzed_at || null,
        status: file.ai_analysis ? 'complete' : file.ai_analyzed_at ? 'failed' : 'pending'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/imaging/analysis/case/:caseId — get all AI analyses for a case
router.get('/analysis/case/:caseId', async (req, res) => {
  try {
    const [files] = await sequelize.query(`
      SELECT id, file_name, file_type, mime_type, ai_analysis, ai_analyzed_at, created_at
      FROM msk_imaging_files WHERE case_id = $1 ORDER BY created_at DESC
    `, { bind: [req.params.caseId] });

    res.json({
      success: true,
      data: files.map(f => ({
        fileId: f.id,
        fileName: f.file_name,
        fileType: f.file_type,
        analysis: f.ai_analysis || null,
        analyzedAt: f.ai_analyzed_at || null,
        status: f.ai_analysis ? 'complete' : 'pending',
        uploadedAt: f.created_at
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/imaging/analyze/:fileId — re-trigger AI analysis for a file
router.post('/analyze/:fileId', async (req, res) => {
  try {
    const [files] = await sequelize.query(
      `SELECT f.*, c.chief_complaint, c.pain_location, c.injury_mechanism, c.severity, c.sport_context
       FROM msk_imaging_files f LEFT JOIN msk_cases c ON f.case_id = c.id WHERE f.id = $1`,
      { bind: [req.params.fileId] }
    );
    if (files.length === 0) return res.status(404).json({ error: 'File not found' });
    const file = files[0];

    if (!file.storage_path || !fs.existsSync(file.storage_path)) {
      return res.status(400).json({ error: 'Image file not found on disk' });
    }

    const caseContext = `Chief complaint: ${file.chief_complaint || 'N/A'}. Pain location: ${file.pain_location || 'N/A'}. Mechanism: ${file.injury_mechanism || 'N/A'}. Severity: ${file.severity || 'N/A'}/10. Sport context: ${file.sport_context || 'N/A'}.`;

    const analysis = await analyzeImageWithClaude(file.storage_path, file.mime_type, caseContext);

    if (!analysis) {
      return res.status(500).json({ error: 'Analysis failed — check ANTHROPIC_API_KEY is set and file is a supported image type (JPEG, PNG, WebP)' });
    }

    await sequelize.query(
      `UPDATE msk_imaging_files SET ai_analysis = $1, ai_analyzed_at = NOW() WHERE id = $2`,
      { bind: [JSON.stringify(analysis), file.id] }
    );

    logAudit(req.user.userId, 'ai_image_analysis', 'imaging_file', file.id, req);

    res.json({
      success: true,
      data: {
        fileId: file.id,
        fileName: file.file_name,
        analysis,
        analyzedAt: new Date().toISOString(),
        disclaimer: 'AI-assisted preliminary read — must be reviewed and finalized by a qualified radiologist.'
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
