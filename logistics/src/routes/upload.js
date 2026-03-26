'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB
const parserService = require('../services/parser');

const VALID_FILE_TYPES = ['item_master', 'inventory', 'goods_in', 'goods_out', 'oee_machines', 'oee_machine_events', 'oee_production_runs'];

// POST /api/v1/upload/:projectId/:fileType — Upload a data file
// For large files: responds immediately with "parsing" status, processes in background
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

    // Create file tracking record
    const uploadedFile = await req.models.LogisticsUploadedFile.create({
      project_id: project.id,
      file_type: fileType,
      original_filename: req.file.originalname,
      file_size: req.file.size,
      mime_type: req.file.mimetype,
      parse_status: 'parsing'
    });

    // For large files (>10MB), respond immediately and process in background
    const isLargeFile = req.file.size > 10 * 1024 * 1024;

    const processFile = async () => {
      try {
        const parseResult = await parserService.parseFile(req.file, fileType);

        const modelMap = {
          item_master: 'LogisticsItemMaster',
          inventory: 'LogisticsInventoryData',
          goods_in: 'LogisticsGoodsInData',
          goods_out: 'LogisticsGoodsOutData',
          oee_machines: 'LogisticsOEEMachine',
          oee_machine_events: 'LogisticsOEEMachineEvent',
          oee_production_runs: 'LogisticsOEEProductionRun'
        };

        const tableMap = {
          item_master: 'logistics_item_master',
          inventory: 'logistics_inventory_data',
          goods_in: 'logistics_goods_in_data',
          goods_out: 'logistics_goods_out_data',
          oee_machines: 'logistics_oee_machines',
          oee_machine_events: 'logistics_oee_machine_events',
          oee_production_runs: 'logistics_oee_production_runs'
        };

        const tableName = tableMap[fileType];
        const seq = req.models.sequelize;

        // Delete existing data for this project/file type
        await seq.query(`DELETE FROM ${tableName} WHERE project_id = :pid`, { replacements: { pid: project.id } });

        if (parseResult.rows.length > 0) {
          // Use raw SQL multi-value INSERT — 50x faster than Sequelize bulkCreate
          const columns = Object.keys(parseResult.rows[0]);
          const allCols = ['project_id', ...columns, 'created_at', 'updated_at'];
          const now = new Date().toISOString();
          const CHUNK_SIZE = 2000;
          const totalChunks = Math.ceil(parseResult.rows.length / CHUNK_SIZE);
          console.log(`[UPLOAD] Raw SQL inserting ${parseResult.rows.length} rows in ${totalChunks} chunks into ${tableName}...`);

          for (let c = 0; c < parseResult.rows.length; c += CHUNK_SIZE) {
            const chunk = parseResult.rows.slice(c, c + CHUNK_SIZE);
            const values = [];
            const params = {};
            for (let r = 0; r < chunk.length; r++) {
              const row = chunk[r];
              const placeholders = allCols.map((col, ci) => {
                const key = `v${c + r}_${ci}`;
                if (col === 'project_id') params[key] = project.id;
                else if (col === 'created_at' || col === 'updated_at') params[key] = now;
                else params[key] = row[col] != null ? row[col] : null;
                return `:${key}`;
              });
              values.push(`(${placeholders.join(',')})`);
            }
            const sql = `INSERT INTO ${tableName} (${allCols.map(c => `"${c}"`).join(',')}) VALUES ${values.join(',')} ON CONFLICT DO NOTHING`;
            await seq.query(sql, { replacements: params });

            if ((Math.floor(c / CHUNK_SIZE)) % 5 === 0) {
              console.log(`[UPLOAD] Chunk ${Math.floor(c / CHUNK_SIZE) + 1}/${totalChunks}`);
            }
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

        console.log(`[UPLOAD] ${fileType}: Done — ${parseResult.rows.length} rows inserted`);
        return parseResult;
      } catch (parseError) {
        console.error(`[UPLOAD] ${fileType}: Parse/insert failed:`, parseError.message);
        await uploadedFile.update({
          parse_status: 'error',
          parse_errors: [{ message: parseError.message }]
        });
        throw parseError;
      }
    };

    if (isLargeFile) {
      // Respond immediately — frontend will poll status
      console.log(`[UPLOAD] Large file (${fileSizeMB}MB) — processing in background`);
      res.json({
        success: true,
        data: {
          file_id: uploadedFile.id,
          file_type: fileType,
          rows_parsed: 0,
          status: 'parsing',
          message: `Large file (${fileSizeMB}MB) — parsing in background. Poll /upload/${projectId}/status for updates.`
        }
      });

      // Process in background (don't await)
      processFile().catch(err => {
        console.error(`[UPLOAD] Background processing failed for ${fileType}:`, err.message);
      });
    } else {
      // Small file — process synchronously
      try {
        const parseResult = await processFile();
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
        res.status(422).json({
          success: false,
          error: 'File parsing failed',
          details: parseError.message
        });
      }
    }
  } catch (error) {
    console.error('LOGISTICS upload error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

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
