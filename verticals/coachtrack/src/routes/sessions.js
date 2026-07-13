'use strict';

/**
 * CoachTrack — sessions API.
 *  POST /                 start a session
 *  GET  /                 list sessions (with open action-item counts)
 *  GET  /:id              session + full transcript + action items
 *  POST /:id/turn         append a transcript turn (voice or typed)
 *  POST /:id/finalize     AI-extract subject + summary + action items
 */

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Session, Transcript, ActionItem } = require('../models');
const brain = require('../services/coach-brain');

function tenantOf(req) { return (req.user && req.user.tenant_id) || (req.user && req.user.id) || 0; }


// Start a session
router.post('/', async (req, res) => {
  try {
    const s = await Session.create({
      tenant_id: tenantOf(req),
      coach_name: (req.body.coach_name || 'Lala').slice(0, 80),
      session_date: req.body.session_date || undefined,
      status: 'in_progress'
    });
    res.json({ success: true, session: s });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// List sessions with open action-item counts
router.get('/', async (req, res) => {
  try {
    const sessions = await Session.findAll({
      where: { tenant_id: tenantOf(req) },
      order: [['created_at', 'DESC']],
      limit: 200
    });
    const ids = sessions.map(s => s.id);
    const items = ids.length ? await ActionItem.findAll({ where: { session_id: { [Op.in]: ids } } }) : [];
    const openBy = {};
    for (const it of items) {
      if (it.status !== 'done') openBy[it.session_id] = (openBy[it.session_id] || 0) + 1;
    }
    res.json({
      success: true,
      sessions: sessions.map(s => ({ ...s.toJSON(), open_action_items: openBy[s.id] || 0 }))
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Session detail
router.get('/:id', async (req, res) => {
  try {
    const s = await Session.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const transcript = await Transcript.findAll({ where: { session_id: s.id }, order: [['turn_index', 'ASC'], ['id', 'ASC']] });
    const action_items = await ActionItem.findAll({ where: { session_id: s.id }, order: [['id', 'ASC']] });
    res.json({ success: true, session: s, transcript, action_items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Append a transcript turn (voice or typed — same pipeline)
router.post('/:id/turn', async (req, res) => {
  try {
    const s = await Session.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const text = String(req.body.text || '').trim();
    if (!text) return res.status(400).json({ error: 'Texto requerido' });
    const count = await Transcript.count({ where: { session_id: s.id } });
    const turn = await Transcript.create({
      session_id: s.id,
      turn_index: count,
      role: req.body.role === 'coach' ? 'coach' : 'me',
      text: text.slice(0, 8000),
      source: req.body.source === 'voice' ? 'voice' : 'typed'
    });
    res.json({ success: true, turn });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Finalize: AI-extract subject + summary + action items
router.post('/:id/finalize', async (req, res) => {
  try {
    const s = await Session.findOne({ where: { id: req.params.id, tenant_id: tenantOf(req) } });
    if (!s) return res.status(404).json({ error: 'Sesión no encontrada' });
    const turns = await Transcript.findAll({ where: { session_id: s.id }, order: [['turn_index', 'ASC'], ['id', 'ASC']] });

    const result = await brain.finalizeSession(turns.map(t => ({ role: t.role, text: t.text })));

    s.subject = result.subject;
    s.summary = result.summary;
    s.status = 'finalized';
    if (req.body.duration_min) s.duration_min = parseInt(req.body.duration_min, 10) || null;
    await s.save();

    // Replace prior AI-generated action items on re-finalize (keep manual edits simple)
    await ActionItem.destroy({ where: { session_id: s.id } });
    const created = [];
    for (const a of result.action_items) {
      created.push(await ActionItem.create({
        tenant_id: tenantOf(req),
        session_id: s.id,
        text: a.text,
        due_date: a.due_date || null,
        status: 'open'
      }));
    }
    res.json({ success: true, session: s, action_items: created });
  } catch (e) {
    console.error('CoachTrack finalize route error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
