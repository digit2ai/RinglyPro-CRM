'use strict';

const express = require('express');
const router = express.Router();
const { MeetingMinute, Project } = require('../models');

// GET /api/v1/meeting-minutes — list all (most recent first)
router.get('/', async (req, res) => {
  try {
    const where = { workspace_id: 1 };
    if (req.query.project_id) where.project_id = parseInt(req.query.project_id, 10);
    const rows = await MeetingMinute.findAll({
      where,
      include: [{ model: Project, as: 'project', attributes: ['id', 'name'] }],
      order: [['meeting_date', 'DESC'], ['created_at', 'DESC']],
      limit: 200
    });
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/meeting-minutes/:id
router.get('/:id', async (req, res) => {
  try {
    const row = await MeetingMinute.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      include: [{ model: Project, as: 'project', attributes: ['id', 'name'] }]
    });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/meeting-minutes
router.post('/', async (req, res) => {
  try {
    const { meeting_date, subject, notes, project_id } = req.body || {};
    if (!subject || !String(subject).trim()) {
      return res.status(400).json({ success: false, error: 'Subject is required' });
    }
    const row = await MeetingMinute.create({
      workspace_id: 1,
      meeting_date: meeting_date || new Date().toISOString().slice(0, 10),
      subject: String(subject).trim(),
      notes: notes || null,
      project_id: project_id ? parseInt(project_id, 10) : null,
      created_by_email: req.user?.email || null
    });
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/meeting-minutes/:id
router.put('/:id', async (req, res) => {
  try {
    const row = await MeetingMinute.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    const { meeting_date, subject, notes, project_id } = req.body || {};
    if (meeting_date !== undefined) row.meeting_date = meeting_date;
    if (subject !== undefined) row.subject = String(subject).trim();
    if (notes !== undefined) row.notes = notes;
    if (project_id !== undefined) row.project_id = project_id ? parseInt(project_id, 10) : null;
    await row.save();
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/meeting-minutes/:id
router.delete('/:id', async (req, res) => {
  try {
    const n = await MeetingMinute.destroy({ where: { id: req.params.id, workspace_id: 1 } });
    if (!n) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
