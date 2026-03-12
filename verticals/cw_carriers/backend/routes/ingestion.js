const express = require('express');
const router = express.Router();
const ingestion = require('../services/ingestion.cw');

// POST /api/ingestion/upload - Process file upload
router.post('/upload', async (req, res) => {
  try {
    const result = await ingestion.process_upload(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/ingestion/history - Upload history
router.get('/history', async (req, res) => {
  try {
    const result = await ingestion.get_upload_history(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/ingestion/preview-mapping - Preview column mapping
router.post('/preview-mapping', async (req, res) => {
  try {
    const result = await ingestion.get_column_mapping_preview(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/ingestion/presets - Get column mapping presets
router.get('/presets', (req, res) => {
  const presets = {};
  for (const [type, preset] of Object.entries(ingestion.COLUMN_PRESETS)) {
    presets[type] = { expected_fields: preset.expected, aliases: Object.keys(preset.aliases) };
  }
  res.json({ success: true, data: presets });
});

module.exports = router;
