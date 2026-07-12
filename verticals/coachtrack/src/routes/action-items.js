'use strict';

/**
 * CoachTrack — action items API (the accountability layer).
 *  GET   /                     all items across sessions (open/overdue first)
 *  PATCH /:id                  update status / due_date / notes
 *  GET   /:id/guidance         guidance thread for this item
 *  POST  /:id/guidance         ask the coaching AI agent about this item
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { ActionItem, Session, Guidance } = require('../models');
const brain = require('../services/coach-brain');

const TENANT = 1;

// Roll open items whose due date has passed into 'overdue' (display helper).
function withOverdue(item) {
  const j = item.toJSON ? item.toJSON() : item;
  if ((j.status === 'open' || j.status === 'in_progress') && j.due_date) {
    const today = new Date().toISOString().slice(0, 10);
    if (j.due_date < today) j.status = 'overdue';
  }
  return j;
}

// All action items across sessions — accountability board
router.get('/', async (req, res) => {
  try {
    const items = await ActionItem.findAll({
      where: { tenant_id: TENANT },
      order: [['status', 'ASC'], ['due_date', 'ASC'], ['id', 'DESC']],
      limit: 500
    });
    const sessionIds = [...new Set(items.map(i => i.session_id))];
    const sessions = sessionIds.length ? await Session.findAll({ where: { id: { [Op.in]: sessionIds } } }) : [];
    const subj = {};
    sessions.forEach(s => { subj[s.id] = { subject: s.subject, session_date: s.session_date }; });

    const mapped = items.map(withOverdue).map(i => ({ ...i, session: subj[i.session_id] || null }));
    // open/overdue/in_progress first, done last
    const rank = { overdue: 0, in_progress: 1, open: 2, done: 3 };
    mapped.sort((a, b) => (rank[a.status] ?? 5) - (rank[b.status] ?? 5));
    res.json({ success: true, action_items: mapped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Update an action item
router.patch('/:id', async (req, res) => {
  try {
    const item = await ActionItem.findOne({ where: { id: req.params.id, tenant_id: TENANT } });
    if (!item) return res.status(404).json({ error: 'Acción no encontrada' });

    if (req.body.status && ['open', 'in_progress', 'done', 'overdue'].includes(req.body.status)) {
      item.status = req.body.status;
      item.completed_at = req.body.status === 'done' ? new Date() : null;
    }
    if (req.body.due_date !== undefined) item.due_date = req.body.due_date || null;
    if (req.body.notes !== undefined) item.notes = String(req.body.notes).slice(0, 4000);
    if (req.body.text) item.text = String(req.body.text).slice(0, 500);
    await item.save();
    res.json({ success: true, action_item: item });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Guidance thread
router.get('/:id/guidance', async (req, res) => {
  try {
    const thread = await Guidance.findAll({ where: { action_item_id: req.params.id }, order: [['ts', 'ASC']] });
    res.json({ success: true, thread });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Ask the coaching AI agent about this item
router.post('/:id/guidance', async (req, res) => {
  try {
    const item = await ActionItem.findOne({ where: { id: req.params.id, tenant_id: TENANT } });
    if (!item) return res.status(404).json({ error: 'Acción no encontrada' });
    const question = String(req.body.question || '').trim();
    if (!question) return res.status(400).json({ error: 'Pregunta requerida' });

    const session = await Session.findByPk(item.session_id);
    const thread = await Guidance.findAll({ where: { action_item_id: item.id }, order: [['ts', 'ASC']] });

    const answer = await brain.guidance(
      item.toJSON(),
      { subject: session?.subject, summary: session?.summary },
      question,
      thread.map(g => g.toJSON())
    );

    const row = await Guidance.create({ action_item_id: item.id, question, ai_response: answer });
    res.json({ success: true, guidance: row });
  } catch (e) {
    console.error('CoachTrack guidance route error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
