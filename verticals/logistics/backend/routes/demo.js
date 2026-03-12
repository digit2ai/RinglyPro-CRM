const express = require('express');
const router = express.Router();
const demo = require('../services/demo.lg');

// POST /api/demo/workspace - Create demo workspace
router.post('/workspace', async (req, res) => {
  try {
    const result = await demo.create_workspace(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/demo/workspace/:code - Get workspace by access code
router.get('/workspace/:code', async (req, res) => {
  try {
    const result = await demo.get_workspace({ access_code: req.params.code });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

// GET /api/demo/workspaces - List all workspaces
router.get('/workspaces', async (req, res) => {
  try {
    const result = await demo.list_workspaces(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/demo/upload - Upload data to demo workspace
router.post('/upload', async (req, res) => {
  try {
    const result = await demo.demo_upload_data(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/demo/generate - Generate sample data for demo
router.post('/generate', async (req, res) => {
  try {
    const result = await demo.generate_demo_data(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
