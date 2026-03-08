'use strict';

const express = require('express');
const router = express.Router();
const { ActivityLog } = require('../models');

// GET /api/v1/activity - Activity feed
router.get('/', async (req, res) => {
  try {
    const { entity_type, entity_id, limit: lim = 50 } = req.query;
    const where = { workspace_id: 1 };

    if (entity_type) where.entity_type = entity_type;
    if (entity_id) where.entity_id = entity_id;

    const activity = await ActivityLog.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(lim)
    });
    res.json({ success: true, data: activity });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
