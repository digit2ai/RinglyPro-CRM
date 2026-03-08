'use strict';

const express = require('express');
const router = express.Router();
const { NlpCommand } = require('../models');
const { executeCommand } = require('../services/nlpService');

// POST /api/v1/nlp/command - Execute NLP command
router.post('/command', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Command text required' });
    }

    const userEmail = req.user?.email || 'system';
    const result = await executeCommand(text.trim(), userEmail);

    // Log the NLP command
    await NlpCommand.create({
      workspace_id: 1,
      user_email: userEmail,
      input_text: text.trim(),
      intent: result.intent,
      entities: result.entities,
      action_taken: result.actionTaken,
      response: result.response,
      success: result.success
    });

    res.json({
      success: result.success,
      data: {
        intent: result.intent,
        entities: result.entities,
        response: result.response
      }
    });
  } catch (error) {
    console.error('[D2AI NLP] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/nlp/history - Command history
router.get('/history', async (req, res) => {
  try {
    const commands = await NlpCommand.findAll({
      where: { workspace_id: 1 },
      order: [['created_at', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: commands });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
