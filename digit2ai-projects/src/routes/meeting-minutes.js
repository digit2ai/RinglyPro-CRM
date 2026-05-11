'use strict';

const express = require('express');
const router = express.Router();
const { MeetingMinute, Project, Task } = require('../models');
const { extractActionItems } = require('../services/actionItemExtractor');

// Fire Claude to extract action items + summary and auto-create Tasks
// under the linked project. Non-blocking: callers continue while this
// runs in the background. Updates the MeetingMinute row in place.
function processMeetingAsync(meetingMinuteId) {
  setImmediate(async () => {
    try {
      const row = await MeetingMinute.findByPk(meetingMinuteId);
      if (!row) return;
      let projectName = null, projectDescription = null, projectId = row.project_id || null;
      if (projectId) {
        const proj = await Project.findByPk(projectId);
        if (proj) {
          projectName = proj.name;
          projectDescription = proj.description;
        }
      }
      const result = await extractActionItems({
        subject: row.subject,
        notes: row.notes,
        projectName,
        projectDescription
      });
      let createdCount = 0;
      if (projectId && Array.isArray(result.action_items) && result.action_items.length) {
        for (const item of result.action_items) {
          try {
            const due = new Date();
            due.setDate(due.getDate() + (item.due_in_days || 7));
            await Task.create({
              workspace_id: row.workspace_id || 1,
              project_id: projectId,
              title: item.title,
              description: item.description + (item.assignee_hint ? `\n\nSuggested owner: ${item.assignee_hint}` : '') + `\n\n(Auto-created from meeting minutes #${row.id})`,
              priority: item.priority || 'medium',
              status: 'pending',
              task_type: 'task',
              due_date: due.toISOString().slice(0, 10)
            });
            createdCount++;
          } catch (taskErr) {
            console.error('[D2AI-MeetingMinutes] Task create failed:', taskErr.message);
          }
        }
      }
      row.ai_summary = result.summary || null;
      row.action_items_json = result.action_items || [];
      row.ai_processed_at = new Date();
      row.auto_tasks_created = createdCount;
      await row.save();
      console.log(`[D2AI-MeetingMinutes] Processed minute #${row.id}: ${result.action_items.length} items extracted, ${createdCount} tasks created`);
    } catch (err) {
      console.error('[D2AI-MeetingMinutes] processMeetingAsync error:', err.message);
    }
  });
}

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
    if (row.notes && row.notes.trim()) processMeetingAsync(row.id);
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
    const notesChanged = notes !== undefined && notes !== row.notes;
    if (meeting_date !== undefined) row.meeting_date = meeting_date;
    if (subject !== undefined) row.subject = String(subject).trim();
    if (notes !== undefined) row.notes = notes;
    if (project_id !== undefined) row.project_id = project_id ? parseInt(project_id, 10) : null;
    await row.save();
    if (notesChanged && row.notes && row.notes.trim()) processMeetingAsync(row.id);
    res.json({ success: true, data: row });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/meeting-minutes/:id/reprocess — force AI re-extraction
router.post('/:id/reprocess', async (req, res) => {
  try {
    const row = await MeetingMinute.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!row) return res.status(404).json({ success: false, error: 'Not found' });
    if (!row.notes || !row.notes.trim()) {
      return res.status(400).json({ success: false, error: 'No notes to process' });
    }
    processMeetingAsync(row.id);
    res.json({ success: true, message: 'Reprocessing queued' });
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
