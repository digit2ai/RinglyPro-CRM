'use strict';

/**
 * v2 Profesora Isabel Routes — AI Spanish tutor (text chat)
 *
 * Auth: learner JWT required (student/bpo_worker/teacher/admin roles)
 *
 *   POST /api/v2/isabel/chat    — body: { message } → Isabel's response
 *   GET  /api/v2/isabel/history — last N messages
 *   POST /api/v2/isabel/reset   — clear conversation + memory
 *   GET  /api/v2/isabel/status  — configuration check (is LLM configured?)
 */

const express = require('express');
const router = express.Router();
const sequelize = require('../../services/db.ti');
const v2Auth = require('../middleware/v2-auth');
const isabelLLM = require('../services/isabel-llm');
const gamification = require('../services/gamification');

async function getLearnerId(userId) {
  const [rows] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  if (rows.length > 0) return rows[0].id;
  await sequelize.query(
    `INSERT INTO ti_v2_learners (user_id, created_at, updated_at) VALUES ($1, NOW(), NOW()) ON CONFLICT (user_id) DO NOTHING`,
    { bind: [userId] }
  );
  const [created] = await sequelize.query(
    `SELECT id FROM ti_v2_learners WHERE user_id = $1 LIMIT 1`,
    { bind: [userId] }
  );
  return created[0].id;
}

// GET /api/v2/isabel/status
router.get('/status', async (req, res) => {
  res.json({
    success: true,
    configured: isabelLLM.isConfigured(),
    models: isabelLLM.modelConfig(),
    message: isabelLLM.isConfigured()
      ? 'Profesora Isabel is online and ready to teach.'
      : 'Isabel is running in mock mode. Set TI_V2_ANTHROPIC_KEY or TI_V2_OPENAI_KEY to enable live AI.'
  });
});

// POST /api/v2/isabel/chat
router.post('/chat', v2Auth.learner, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'message is required' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'message too long (max 2000 chars)' });
    }

    const learnerId = await getLearnerId(req.user.id);
    // Optional: ?model=proprietary to use fine-tuned model first (Step 12)
    const useProprietary = req.query.model === 'proprietary' || req.body.model === 'proprietary';
    const result = await isabelLLM.chat(learnerId, message.trim(), { useProprietary });

    // Award XP for the exchange
    let gamificationResult = null;
    try {
      gamificationResult = await gamification.recordActivity(learnerId, 'isabel_chat', null, {
        tokens: result.tokens,
        model: result.model
      });
    } catch (e) {
      console.warn('[isabel] gamification side-effect failed:', e.message);
    }

    res.json({
      success: true,
      response: {
        text: result.text,
        model: result.model,
        tokens: result.tokens,
        latency_ms: result.latency_ms,
        conversation_id: result.conversation_id,
        fallback: result.fallback
      },
      gamification: gamificationResult
    });
  } catch (err) {
    console.error('[v2/isabel] chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v2/isabel/history?limit=50
router.get('/history', v2Auth.learner, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const learnerId = await getLearnerId(req.user.id);
    const history = await isabelLLM.getHistory(learnerId, limit);
    res.json({ success: true, count: history.length, history });
  } catch (err) {
    console.error('[v2/isabel] history error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v2/isabel/reset
router.post('/reset', v2Auth.learner, async (req, res) => {
  try {
    const learnerId = await getLearnerId(req.user.id);
    await isabelLLM.resetConversation(learnerId);
    res.json({ success: true, message: 'Conversation reset' });
  } catch (err) {
    console.error('[v2/isabel] reset error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
