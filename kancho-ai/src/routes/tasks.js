'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List tasks
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.status) where.status = req.query.status;
    if (req.query.priority) where.priority = req.query.priority;
    if (req.query.type) where.type = req.query.type;
    if (req.query.assigned_to) where.assigned_to = req.query.assigned_to;

    // Default: show non-completed tasks
    if (!req.query.status && !req.query.show_all) {
      where.status = { [Op.notIn]: ['completed', 'cancelled'] };
    }

    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await kanchoModels.KanchoTask.findAndCountAll({
      where,
      include: [
        { model: kanchoModels.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name'], required: false },
        { model: kanchoModels.KanchoLead, as: 'lead', attributes: ['id', 'first_name', 'last_name'], required: false }
      ],
      order: [
        [kanchoModels.sequelize.literal("CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END"), 'ASC'],
        ['due_date', 'ASC NULLS LAST'],
        ['created_at', 'DESC']
      ],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /summary - Task counts by status/priority
router.get('/summary', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const today = new Date().toISOString().split('T')[0];
    const [pending, inProgress, overdue, urgent, completedToday] = await Promise.all([
      kanchoModels.KanchoTask.count({ where: { school_id: schoolId, status: 'pending' } }),
      kanchoModels.KanchoTask.count({ where: { school_id: schoolId, status: 'in_progress' } }),
      kanchoModels.KanchoTask.count({ where: { school_id: schoolId, status: { [Op.notIn]: ['completed', 'cancelled'] }, due_date: { [Op.lt]: today } } }),
      kanchoModels.KanchoTask.count({ where: { school_id: schoolId, priority: 'urgent', status: { [Op.notIn]: ['completed', 'cancelled'] } } }),
      kanchoModels.KanchoTask.count({ where: { school_id: schoolId, status: 'completed', completed_at: { [Op.gte]: today } } })
    ]);

    res.json({ success: true, data: { pending, inProgress, overdue, urgent, completedToday, total: pending + inProgress } });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create task
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const task = await kanchoModels.KanchoTask.create({
      school_id: schoolId,
      automation_id: req.body.automation_id || null,
      title: req.body.title,
      description: req.body.description,
      type: req.body.type || 'general',
      priority: req.body.priority || 'medium',
      assigned_to: req.body.assigned_to,
      related_student_id: req.body.student_id || null,
      related_lead_id: req.body.lead_id || null,
      due_date: req.body.due_date || null,
      metadata: req.body.metadata || {}
    });
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update task
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const task = await kanchoModels.KanchoTask.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    const allowed = ['title', 'description', 'type', 'priority', 'status', 'assigned_to', 'due_date', 'result', 'metadata'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.status === 'completed') updates.completed_at = new Date();
    updates.updated_at = new Date();
    await task.update(updates);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/complete - Quick complete
router.post('/:id/complete', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const task = await kanchoModels.KanchoTask.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    await task.update({ status: 'completed', completed_at: new Date(), result: req.body.result || null, updated_at: new Date() });
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Delete task
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const task = await kanchoModels.KanchoTask.findByPk(req.params.id);
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    await task.destroy();
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
