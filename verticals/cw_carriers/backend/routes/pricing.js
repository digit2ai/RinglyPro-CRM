const express = require('express');
const router = express.Router();
const pricing = require('../services/pricing.cw');

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

// GET /api/pricing/dat/status — Check DAT API connection status
router.get('/dat/status', (req, res) => {
  const configured = !!(process.env.DAT_API_CLIENT_ID && process.env.DAT_API_CLIENT_SECRET);
  res.json({
    success: true,
    dat: {
      configured,
      client_id_set: !!process.env.DAT_API_CLIENT_ID,
      client_secret_set: !!process.env.DAT_API_CLIENT_SECRET,
      status: configured ? 'ready' : 'not_configured',
      instructions: configured ? 'DAT API credentials are configured. Rates will auto-pull from DAT RateView.' : 'Set DAT_API_CLIENT_ID and DAT_API_CLIENT_SECRET environment variables in Render to enable DAT market rates.',
      docs: 'https://developers.dat.com/',
    }
  });
});

module.exports = router;
