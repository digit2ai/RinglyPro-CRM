'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../middleware/auth');

// GET /api/v1/messages/:caseId
router.get('/:caseId', async (req, res) => {
  try {
    const [messages] = await sequelize.query(`
      SELECT m.*, u.first_name, u.last_name, u.role
      FROM msk_messages m
      JOIN msk_users u ON m.sender_id = u.id
      WHERE m.case_id = $1
      ORDER BY m.created_at ASC
    `, { bind: [req.params.caseId] });

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/messages
router.post('/', async (req, res) => {
  try {
    const { caseId, recipientId, content, messageType } = req.body;

    if (!caseId || !content) {
      return res.status(400).json({ error: 'caseId and content are required' });
    }

    const [result] = await sequelize.query(`
      INSERT INTO msk_messages (case_id, sender_id, recipient_id, content, message_type)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, {
      bind: [caseId, req.user.userId, recipientId || null, content, messageType || 'text']
    });

    res.status(201).json({ success: true, data: result[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/v1/messages/:id/read
router.put('/:id/read', async (req, res) => {
  try {
    await sequelize.query(`UPDATE msk_messages SET is_read = true WHERE id = $1`, { bind: [req.params.id] });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
