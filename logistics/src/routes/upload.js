'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB
const parserService = require('../services/parser');
const { bulkInsert } = require('../services/bulk-inserter');

const VALID_FILE_TYPES = ['item_master', 'inventory', 'goods_in', 'goods_out', 'oee_machines', 'oee_machine_events', 'oee_production_runs'];

const TABLE_MAP = {
  item_master: 'logistics_item_master',
  inventory: 'logistics_inventory_data',
  goods_in: 'logistics_goods_in_data',
  goods_out: 'logistics_goods_out_data',
  oee_machines: 'logistics_oee_machines',
  oee_machine_events: 'logistics_oee_machine_events',
  oee_production_runs: 'logistics_oee_production_runs'
};

// POST /api/v1/upload/:projectId/:fileType — Upload a data file
// Step 1: Validate headers instantly
// Step 2: If valid, respond immediately + insert in background
router.post('/:projectId/:fileType', upload.single('file'), async (req, res) => {
  try {
    const { projectId, fileType } = req.params;

    if (!VALID_FILE_TYPES.includes(fileType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid file type. Must be one of: ${VALID_FILE_TYPES.join(', ')}`
      });
    }

    const project = await req.models.LogisticsProject.findByPk(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const fileSizeMB = (req.file.size / 1024 / 1024).toFixed(1);
    console.log(`[UPLOAD] ${fileType}: ${req.file.originalname} (${fileSizeMB}MB) for project ${projectId}`);

    // ================================================================
    // STEP 1: Validate headers ONLY — instant feedback
    // ================================================================
    const headerCheck = parserService.parseHeadersOnly(req.file.buffer, req.file.mimetype, req.file.originalname, fileType);

    if (!headerCheck.valid) {
      return res.status(422).json({
        success: false,
        error: 'Invalid file headers',
        details: headerCheck.errors
      });
    }

    // ================================================================
    // STEP 2: Headers valid — create tracking record, respond immediately
    // ================================================================
    const uploadedFile = await req.models.LogisticsUploadedFile.create({
      project_id: project.id,
      file_type: fileType,
      original_filename: req.file.originalname,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      parse_status: 'parsing'
    });

    // Respond immediately — "validated, inserting N rows in background"
    res.json({
      success: true,
      data: {
        file_id: uploadedFile.id,
        file_type: fileType,
        headers: headerCheck.headers,
        row_estimate: headerCheck.rowEstimate,
        status: 'parsing',
        message: `Validated. Inserting ~${headerCheck.rowEstimate.toLocaleString()} rows in background. Poll /upload/${projectId}/status for updates.`
      }
    });

    // ================================================================
    // STEP 3: Background — full parse + insert using shared bulk-inserter
    // ================================================================
    processFileInBackground(req.models, project, uploadedFile, req.file, fileType).catch(err => {
      console.error(`[UPLOAD] Background processing failed for ${fileType}:`, err.message);
    });

  } catch (error) {
    console.error('LOGISTICS upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Background file processing — parse full CSV + validate + insert via bulk-inserter
 */
async function processFileInBackground(models, project, uploadedFile, file, fileType) {
  try {
    const parseResult = await parserService.parseFile(file, fileType);

    const tableName = TABLE_MAP[fileType];
    const seq = models.sequelize;

    // Delete existing data for this project/file type
    await seq.query(`DELETE FROM ${tableName} WHERE project_id = :pid`, { replacements: { pid: project.id } });

    if (parseResult.rows.length > 0) {
      // Convert parsed row objects into column-ordered arrays for bulk-inserter
      const columns = Object.keys(parseResult.rows[0]);
      const rowArrays = parseResult.rows.map(row => columns.map(col => row[col] != null ? row[col] : null));

      await bulkInsert(seq, tableName, columns, rowArrays, {
        projectId: project.id,
        label: '[UPLOAD]',
        chunkSize: 2000
      });
    }

    // Update file record
    await uploadedFile.update({
      row_count: parseResult.rows.length,
      column_count: parseResult.columnCount,
      parse_status: 'parsed',
      parse_errors: parseResult.errors.length > 0 ? parseResult.errors : null,
      plausibility_warnings: parseResult.warnings.length > 0 ? parseResult.warnings : null
    });

    // Update project status
    if (project.status === 'pending') {
      await project.update({ status: 'uploading' });
    }

    console.log(`[UPLOAD] ${fileType}: Done — ${parseResult.rows.length} rows inserted`);
  } catch (parseError) {
    console.error(`[UPLOAD] ${fileType}: Parse/insert failed:`, parseError.message);
    await uploadedFile.update({
      parse_status: 'error',
      parse_errors: [{ message: parseError.message }]
    });
  }
}

// GET /api/v1/upload/:projectId/status — Get upload status for all file types
router.get('/:projectId/status', async (req, res) => {
  try {
    const files = await req.models.LogisticsUploadedFile.findAll({
      where: { project_id: req.params.projectId },
      order: [['created_at', 'DESC']]
    });

    const status = {};
    for (const ft of VALID_FILE_TYPES) {
      const file = files.find(f => f.file_type === ft);
      status[ft] = file ? {
        uploaded: true,
        filename: file.original_filename,
        rows: file.row_count,
        status: file.parse_status,
        errors: file.parse_errors,
        warnings: file.plausibility_warnings
      } : { uploaded: false };
    }

    res.json({ success: true, data: status });
  } catch (error) {
    console.error('LOGISTICS upload status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
