'use strict';

const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const ai = require('../services/ai-editor');
const stt = require('../services/stt');
const subscription = require('../factory/claude-subscription');
const llm = require('../factory/llm');

router.get('/', async (req, res) => {
  let dbOk = false;
  try { await sequelize.authenticate(); dbOk = true; } catch (e) { dbOk = false; }
  res.json({
    service: 'SpeakUp — Voice-to-Text + AI editing (internal team tool)',
    status: dbOk ? 'healthy' : 'degraded',
    db: dbOk,
    ai_model: ai.activeModel(),
    stt_engine: stt.activeEngine(),
    // WHICH CLAUDE THE MEETINGS CHAT USES, AND WHY NOT THE SUBSCRIPTION IF IT IS NOT. Public, so
    // it carries yes/no answers and a version string only — never the token, never an error body.
    chat: await (async () => {
      const s = subscription.status();
      const p = await subscription.probe();
      return { uses: s.available ? 'claude_subscription' : (llm.configured() ? 'api_key' : 'none'),
        provider_setting: s.provider, subscription_token_set: s.token_set, cli_installed: s.cli_installed,
        cli_runs: p.runs, cli_version: p.version || null, api_key_set: llm.configured() };
    })(),
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
