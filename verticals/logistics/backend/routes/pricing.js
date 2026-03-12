const express = require('express');
const router = express.Router();
const pricing = require('../services/pricing.lg');

// GET /api/pricing/quote - Get rate recommendation
router.get('/quote', async (req, res) => {
  try {
    const result = await pricing.get_rate_recommendation(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/pricing/quote - Get rate recommendation (with body)
router.post('/quote', async (req, res) => {
  try {
    const result = await pricing.get_rate_recommendation(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/pricing/benchmarks - Import rate benchmarks
router.post('/benchmarks', async (req, res) => {
  try {
    const result = await pricing.import_rate_benchmarks(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/pricing/lane-analysis - Lane performance analysis
router.get('/lane-analysis', async (req, res) => {
  try {
    const result = await pricing.get_lane_analysis(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
