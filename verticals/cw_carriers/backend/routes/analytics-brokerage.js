const express = require('express');
const router = express.Router();
const analytics = require('../services/brokerage-analytics.cw');

// GET /api/brokerage-analytics/dashboard - Operations dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const result = await analytics.get_operations_dashboard(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/brokerage-analytics/carrier/:id - Carrier scorecard
router.get('/carrier/:id', async (req, res) => {
  try {
    const result = await analytics.get_carrier_scorecard({ carrier_id: parseInt(req.params.id), ...req.query });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/brokerage-analytics/customers - Customer profitability
router.get('/customers', async (req, res) => {
  try {
    const result = await analytics.get_customer_profitability(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/brokerage-analytics/customer/:id - Single customer profitability
router.get('/customer/:id', async (req, res) => {
  try {
    const result = await analytics.get_customer_profitability({ customer_id: parseInt(req.params.id), ...req.query });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/brokerage-analytics/exceptions - Exception summary
router.get('/exceptions', async (req, res) => {
  try {
    const result = await analytics.get_exception_summary(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/brokerage-analytics/daily-report - Daily report
router.get('/daily-report', async (req, res) => {
  try {
    const result = await analytics.get_daily_report(req.query);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
