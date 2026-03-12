const express = require('express');
const router = express.Router();
const loadmatching = require('../services/loadmatching.cw');

// POST /api/load-matching/pairs/:loadId - Find load pairs
router.post('/pairs/:loadId', async (req, res) => {
  try {
    const result = await loadmatching.find_load_pairs({ load_id: parseInt(req.params.loadId), ...req.body });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/load-matching/pair/:pairId - Get pair detail
router.get('/pair/:pairId', async (req, res) => {
  try {
    const result = await loadmatching.get_pair_detail({ pair_id: parseInt(req.params.pairId), ...req.query });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/load-matching/pair/:pairId/accept - Accept pair
router.post('/pair/:pairId/accept', async (req, res) => {
  try {
    const result = await loadmatching.accept_pair({ pair_id: parseInt(req.params.pairId), user_id: req.body.user_id });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/load-matching/pair/:pairId/reject - Reject pair
router.post('/pair/:pairId/reject', async (req, res) => {
  try {
    const result = await loadmatching.reject_pair({ pair_id: parseInt(req.params.pairId), reason: req.body.reason, user_id: req.body.user_id });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
