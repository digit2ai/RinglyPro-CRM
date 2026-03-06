'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded for command route:', e.message); }

const KanchoNLPEngine = require('../../services/kancho-nlp-engine');
let nlpEngine;
try { nlpEngine = new KanchoNLPEngine(kanchoModels); } catch (e) { console.log('NLP engine init error:', e.message); }

// Pending confirmations stored in memory (keyed by schoolId:userId)
const pendingConfirmations = new Map();

// POST /process — Main NLP endpoint (chat + voice transcript)
router.post('/process', async (req, res) => {
  if (!nlpEngine) return res.status(503).json({ success: false, error: 'NLP engine unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    const userId = req.body.user_id || req.userId || null;
    const channel = req.body.channel || 'chat';
    const text = (req.body.text || '').trim();

    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    if (!text) return res.status(400).json({ success: false, error: 'text required' });

    // Check if this is a confirmation response to a pending action
    const confirmKey = schoolId + ':' + (userId || 'anon');
    const pending = pendingConfirmations.get(confirmKey);
    if (pending) {
      const lower = text.toLowerCase().trim();
      if (lower === 'yes' || lower === 'y' || lower === 'confirm' || lower === 'ok' || lower === 'do it') {
        pendingConfirmations.delete(confirmKey);
        // Execute the pending command
        const result = await nlpEngine.execute(pending, schoolId, userId);
        await nlpEngine._log(schoolId, userId, channel, 'CONFIRM: ' + pending.raw, pending, result.success ? 'executed' : 'failed', result.message, result.affected);
        return res.json({ success: true, type: 'result', message: result.message, data: result.data });
      } else if (lower === 'no' || lower === 'n' || lower === 'cancel' || lower === 'nevermind') {
        pendingConfirmations.delete(confirmKey);
        return res.json({ success: true, type: 'result', message: 'Action cancelled.' });
      }
      // If not a yes/no, treat as a new command (clear pending)
      pendingConfirmations.delete(confirmKey);
    }

    // Check if this is a disambiguation response (e.g. "1", "2", "#3")
    // For now, let normal flow handle it

    // Process the command
    const result = await nlpEngine.process(text, schoolId, userId, channel);

    // If confirmation needed, store pending
    if (result.type === 'confirmation' && result.parsed) {
      pendingConfirmations.set(confirmKey, result.parsed);
      // Auto-expire after 2 minutes
      setTimeout(() => pendingConfirmations.delete(confirmKey), 120000);
    }

    return res.json({
      success: true,
      type: result.type,
      message: result.message,
      data: result.data || null,
      candidates: result.candidates || null,
      parsed: {
        intent: result.parsed?.intent,
        domain: result.parsed?.domain,
        action: result.parsed?.action,
        confidence: result.parsed?.confidence,
        entities: result.parsed?.entities ? Object.keys(result.parsed.entities).filter(k => !k.startsWith('matched') && !k.endsWith('Candidates')) : []
      }
    });
  } catch (error) {
    console.error('NLP process error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /history — Recent command history for a school
router.get('/history', async (req, res) => {
  if (!kanchoModels?.KanchoCommandLog) return res.json({ success: true, data: [] });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    const logs = await kanchoModels.KanchoCommandLog.findAll({
      where: { school_id: schoolId },
      order: [['created_at', 'DESC']],
      limit: 50
    });
    res.json({ success: true, data: logs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /suggestions — Suggested prompts for a school
router.get('/suggestions', (req, res) => {
  res.json({
    success: true,
    data: [
      { category: 'Students', prompts: ['Show me at-risk students', 'Add a new student', 'List active students', 'Find inactive students'] },
      { category: 'Leads', prompts: ['Show recent leads', 'Create a new lead', 'List hot leads', 'Convert a lead to student'] },
      { category: 'Classes', prompts: ['List all classes', 'Show classes at full capacity', 'Create a new class'] },
      { category: 'Billing', prompts: ['Show failed payments', 'List overdue accounts', 'Pause billing for a student'] },
      { category: 'Staff', prompts: ['List all staff', 'Add a new instructor', 'Show staff tasks due today'] },
      { category: 'Growth', prompts: ['Give me growth insights', 'Show revenue trends', 'What programs are growing?'] },
      { category: 'Automations', prompts: ['List automations', 'Create a follow-up automation', 'Pause an automation'] },
      { category: 'Tasks', prompts: ['Show overdue tasks', 'Create a follow-up task', 'List today\'s tasks'] },
      { category: 'Campaigns', prompts: ['List campaigns', 'Create a reactivation campaign', 'Pause a campaign'] },
      { category: 'Calendar', prompts: ['Schedule a private lesson', 'Show upcoming events', 'Book an appointment'] },
      { category: 'Belts', prompts: ['Promote a student', 'Show students ready for testing', 'List promotions'] },
      { category: 'Merchandise', prompts: ['Show low stock items', 'Add a new product', 'List all merchandise'] },
      { category: 'Families', prompts: ['List family accounts', 'Create a new family', 'Show family balances'] },
      { category: 'Funnels', prompts: ['List funnels', 'Create a trial funnel', 'Show funnel performance'] }
    ]
  });
});

module.exports = router;
