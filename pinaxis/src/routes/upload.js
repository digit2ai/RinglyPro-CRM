'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const parserService = require('../services/parser');

const VALID_FILE_TYPES = ['item_master', 'inventory', 'goods_in', 'goods_out'];

// POST /api/v1/upload/:projectId/:fileType — Upload a data file
router.post('/:projectId/:fileType', upload.single('file'), async (req, res) => {
  try {
    const { projectId, fileType } = req.params;

    if (!VALID_FILE_TYPES.includes(fileType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid file type. Must be one of: ${VALID_FILE_TYPES.join(', ')}`
      });
    }

    const project = await req.models.PinaxisProject.findByPk(projectId);
    if (!project) {
      return res.status(404).json({ success: false, error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Create file tracking record
    const uploadedFile = await req.models.PinaxisUploadedFile.create({
      project_id: project.id,
      file_type: fileType,
      original_filename: req.file.originalname,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      parse_status: 'parsing'
    });

    // Parse the file
    try {
      const parseResult = await parserService.parseFile(req.file, fileType);

      // Store parsed data in the appropriate table
      const modelMap = {
        item_master: 'PinaxisItemMaster',
        inventory: 'PinaxisInventoryData',
        goods_in: 'PinaxisGoodsInData',
        goods_out: 'PinaxisGoodsOutData'
      };

      const modelName = modelMap[fileType];
      const Model = req.models[modelName];

      // Delete existing data for this project/file type and bulk insert
      await Model.destroy({ where: { project_id: project.id } });

      const records = parseResult.rows.map(row => ({
        ...row,
        project_id: project.id
      }));

      if (records.length > 0) {
        // Chunk large inserts to avoid DB connection timeouts
        const CHUNK_SIZE = 500;
        for (let i = 0; i < records.length; i += CHUNK_SIZE) {
          await Model.bulkCreate(records.slice(i, i + CHUNK_SIZE), { ignoreDuplicates: true });
        }
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

      res.json({
        success: true,
        data: {
          file_id: uploadedFile.id,
          file_type: fileType,
          rows_parsed: parseResult.rows.length,
          columns: parseResult.columnCount,
          errors: parseResult.errors,
          warnings: parseResult.warnings,
          status: 'parsed'
        }
      });
    } catch (parseError) {
      await uploadedFile.update({
        parse_status: 'error',
        parse_errors: [{ message: parseError.message }]
      });

      res.status(422).json({
        success: false,
        error: 'File parsing failed',
        details: parseError.message
      });
    }
  } catch (error) {
    console.error('PINAXIS upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/upload/:projectId/status — Get upload status for all file types
router.get('/:projectId/status', async (req, res) => {
  try {
    const files = await req.models.PinaxisUploadedFile.findAll({
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
    console.error('PINAXIS upload status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
