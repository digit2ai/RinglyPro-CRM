const express = require('express');
const router = express.Router();
const analytics = require('../services/analytics.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET /dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const data = await analytics.getDashboard();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /lanes
router.get('/lanes', async (req, res) => {
  try {
    const data = await analytics.getLanes();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /carriers
router.get('/carriers', async (req, res) => {
  try {
    const data = await analytics.getCarrierPerformance();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /coverage
router.get('/coverage', async (req, res) => {
  try {
    const data = await analytics.getCoverageStats();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /calls
router.get('/calls', async (req, res) => {
  try {
    const data = await analytics.getCallStats();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
