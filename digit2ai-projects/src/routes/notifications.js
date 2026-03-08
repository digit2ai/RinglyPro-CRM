'use strict';

const express = require('express');
const router = express.Router();
const { Notification } = require('../models');

// GET /api/v1/notifications
router.get('/', async (req, res) => {
  try {
    const { unread_only } = req.query;
    const where = { workspace_id: 1 };
    if (unread_only === 'true') where.read = false;
    if (req.user?.email) where.user_email = req.user.email;

    const notifications = await Notification.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: notifications });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    await Notification.update({ read: true }, { where: { id: req.params.id } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/read-all
router.put('/read-all', async (req, res) => {
  try {
    const where = { workspace_id: 1, read: false };
    if (req.user?.email) where.user_email = req.user.email;
    await Notification.update({ read: true }, { where });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
