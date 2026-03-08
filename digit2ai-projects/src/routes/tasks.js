'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Task, Project, Contact, StaffMember } = require('../models');
const { logActivity } = require('../services/activityService');

// GET /api/v1/tasks - List tasks
router.get('/', async (req, res) => {
  try {
    const { status, priority, task_type, project_id } = req.query;
    const where = { workspace_id: 1 };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (task_type) where.task_type = task_type;
    if (project_id) where.project_id = project_id;

    const tasks = await Task.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name'] },
        { model: StaffMember, as: 'assignee', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['due_date', 'ASC NULLS LAST'], ['priority', 'ASC']]
    });
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/tasks/overdue - Overdue tasks
router.get('/overdue', async (req, res) => {
  try {
    const tasks = await Task.findAll({
      where: { workspace_id: 1, status: 'pending', due_date: { [Op.lt]: new Date() } },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name'] },
        { model: StaffMember, as: 'assignee', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['due_date', 'ASC']]
    });
    res.json({ success: true, data: tasks });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/tasks/:id - Single task
router.get('/:id', async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name', 'status'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name', 'email'] },
        { model: StaffMember, as: 'assignee', attributes: ['id', 'first_name', 'last_name', 'email', 'position'] }
      ]
    });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/tasks - Create task
router.post('/', async (req, res) => {
  try {
    const data = { workspace_id: 1, user_email: req.user?.email, ...req.body };
    const task = await Task.create(data);
    await logActivity(req.user?.email, 'created', 'task', task.id, task.title);
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/tasks/:id - Update task
router.put('/:id', async (req, res) => {
  try {
    const task = await Task.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!task) return res.status(404).json({ success: false, error: 'Task not found' });

    if (req.body.status === 'completed' && task.status !== 'completed') {
      req.body.completed_at = new Date();
    }
    await task.update(req.body);
    await logActivity(req.user?.email, 'updated', 'task', task.id, task.title);
    res.json({ success: true, data: task });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/tasks/:id - Delete task
router.delete('/:id', async (req, res) => {
  try {
    await Task.destroy({ where: { id: req.params.id, workspace_id: 1 } });
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
