'use strict';

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { requireApiKey } = require('../middleware/api-auth');
const { SCHEMAS } = require('../services/parser');

// Rate limiting: 60 requests per minute per IP
const ingestLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, error: 'Rate limit exceeded. Max 60 requests per minute.' }
});

router.use(ingestLimiter);
router.use(requireApiKey);

// Model map for each data type
const MODEL_MAP = {
  'item-master':          { model: 'LogisticsItemMaster',         fileType: 'item_master' },
  'inventory':            { model: 'LogisticsInventoryData',       fileType: 'inventory' },
  'goods-in':             { model: 'LogisticsGoodsInData',         fileType: 'goods_in' },
  'goods-out':            { model: 'LogisticsGoodsOutData',        fileType: 'goods_out' },
  'oee-machines':         { model: 'LogisticsOEEMachine',          fileType: 'oee_machines' },
  'oee-machine-events':   { model: 'LogisticsOEEMachineEvent',     fileType: 'oee_machine_events' },
  'oee-production-runs':  { model: 'LogisticsOEEProductionRun',    fileType: 'oee_production_runs' }
};

/**
 * POST /:projectId/item-master
 * POST /:projectId/inventory
 * POST /:projectId/goods-in
 * POST /:projectId/goods-out
 *
 * Body: { records: [...], mode: "insert" | "upsert" }
 * Also accepts single record: { sku: "...", ... }
 */
for (const [urlSegment, config] of Object.entries(MODEL_MAP)) {
  router.post(`/:projectId/${urlSegment}`, async (req, res) => {
    try {
      const projectId = parseInt(req.params.projectId);
      const Model = req.models[config.model];
      const schema = SCHEMAS[config.fileType];
      const mode = req.body.mode || 'upsert';

      // Accept single record or batch
      let records = req.body.records || req.body.data;
      if (!records) {
        if (req.body.sku || req.body.order_id || req.body.name || req.body.machine_name) {
          records = [req.body];
        } else {
          return res.status(400).json({
            success: false,
            error: 'Request body must contain "records" array or a single record with required fields'
          });
        }
      }
      if (!Array.isArray(records)) records = [records];

      if (records.length === 0) {
        return res.status(400).json({ success: false, error: 'No records provided' });
      }

      if (records.length > 10000) {
        return res.status(400).json({
          success: false,
          error: 'Batch too large. Maximum 10,000 records per request.'
        });
      }

      // Validate and transform records
      const errors = [];
      const validRecords = [];
      const allowedFields = ['project_id', ...schema.required, ...schema.optional, 'metadata'];

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const missing = schema.required.filter(f => !rec[f] && rec[f] !== 0);
        if (missing.length > 0) {
          errors.push({ index: i, missing, sku: rec.sku || null });
          continue;
        }

        // Apply transforms
        const transformed = { ...rec, project_id: projectId };
        for (const [field, fn] of Object.entries(schema.transforms || {})) {
          if (transformed[field] != null && transformed[field] !== '') {
            try { transformed[field] = fn(transformed[field]); } catch (e) { /* keep raw */ }
          }
        }

        // Compute bin_capable for item_master
        if (config.fileType === 'item_master') {
          const l = transformed.length_mm;
          const w = transformed.width_mm;
          const h = transformed.height_mm;
          if (l && w && h) {
            transformed.bin_capable = l <= 600 && w <= 400 && h <= 450;
          }
        }

        // Clean to allowed fields only
        const cleaned = {};
        for (const key of allowedFields) {
          if (transformed[key] !== undefined) cleaned[key] = transformed[key];
        }
        validRecords.push(cleaned);
      }

      let processed = 0;

      if (validRecords.length > 0) {
        const CHUNK_SIZE = 500;

        if (mode === 'upsert') {
          const updateFields = schema.optional.filter(f => f !== 'metadata');
          updateFields.push('metadata');
          for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
            const chunk = validRecords.slice(i, i + CHUNK_SIZE);
            await Model.bulkCreate(chunk, {
              updateOnDuplicate: updateFields
            });
          }
        } else {
          for (let i = 0; i < validRecords.length; i += CHUNK_SIZE) {
            const chunk = validRecords.slice(i, i + CHUNK_SIZE);
            await Model.bulkCreate(chunk, { ignoreDuplicates: true });
          }
        }
        processed = validRecords.length;
      }

      res.json({
        success: true,
        data: {
          processed,
          errors: errors.length,
          error_details: errors.length > 0 ? errors.slice(0, 20) : undefined,
          mode,
          data_type: config.fileType
        }
      });
    } catch (error) {
      console.error(`LOGISTICS ingest ${urlSegment} error:`, error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}

/**
 * GET /:projectId/status — Row counts and last sync for all data types
 */
router.get('/:projectId/status', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const project = await req.models.LogisticsProject.findByPk(projectId);
    if (!project) return res.status(404).json({ success: false, error: 'Project not found' });

    const status = {};
    for (const [urlSegment, config] of Object.entries(MODEL_MAP)) {
      const Model = req.models[config.model];
      const count = await Model.count({ where: { project_id: projectId } });
      const latest = await Model.findOne({
        where: { project_id: projectId },
        order: [['updated_at', 'DESC']],
        attributes: ['updated_at']
      });
      status[config.fileType] = {
        row_count: count,
        last_sync: latest ? latest.updated_at : null
      };
    }

    res.json({
      success: true,
      data: {
        project_id: projectId,
        project_code: project.project_code,
        company_name: project.company_name,
        project_status: project.status,
        data_status: status,
        api_key: {
          prefix: req.apiKey.key_prefix,
          request_count: req.apiKey.request_count,
          last_used_at: req.apiKey.last_used_at
        }
      }
    });
  } catch (error) {
    console.error('LOGISTICS ingest status error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /:projectId/:dataType — Clear all data of a given type
 */
router.delete('/:projectId/:dataType', async (req, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const dataType = req.params.dataType;
    const normalized = dataType.replace(/-/g, '_');

    const config = MODEL_MAP[dataType] ||
      Object.values(MODEL_MAP).find(c => c.fileType === normalized);

    if (!config) {
      return res.status(400).json({
        success: false,
        error: `Invalid data type. Must be one of: ${Object.keys(MODEL_MAP).join(', ')}`
      });
    }

    const Model = req.models[config.model];
    const deleted = await Model.destroy({ where: { project_id: projectId } });

    res.json({
      success: true,
      data: { data_type: config.fileType, rows_deleted: deleted }
    });
  } catch (error) {
    console.error('LOGISTICS ingest delete error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
