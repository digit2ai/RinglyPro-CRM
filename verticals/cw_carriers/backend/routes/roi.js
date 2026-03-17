/**
 * ROI & Predictive Analytics API Routes — CW Carriers
 */
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth.cw');
const roiService = require('../services/roi.cw');

// GET /api/roi/summary — Hero KPIs
router.get('/summary', auth, async (req, res) => {
  try {
    const period = req.query.period || 'all';
    const data = await roiService.getSummary(period);
    res.json({ success: true, data });
  } catch (err) {
    console.error('ROI summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roi/savings — Category breakdown
router.get('/savings', auth, async (req, res) => {
  try {
    const period = req.query.period || 'all';
    const data = await roiService.getSavings(period);
    res.json({ success: true, data });
  } catch (err) {
    console.error('ROI savings error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roi/process — Before/after process improvements
router.get('/process', auth, async (req, res) => {
  try {
    const period = req.query.period || 'all';
    const data = await roiService.getProcessImprovements(period);
    res.json({ success: true, data });
  } catch (err) {
    console.error('ROI process error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/roi/predictions — Projections + AI insights
router.get('/predictions', auth, async (req, res) => {
  try {
    const period = req.query.period || 'all';
    const data = await roiService.getPredictions(period);
    res.json({ success: true, data });
  } catch (err) {
    console.error('ROI predictions error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
