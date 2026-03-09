'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { Pool } = require('pg');
const { Task, Project, Contact, StaffMember, sequelize } = require('../models');
const { logActivity } = require('../services/activityService');

// =====================================================
// QUICKTASK SYNC — bidirectional sync with follow_up_items
// QuickTask's follow_up_items live on DATABASE_URL (may differ from D2AI's DB)
// =====================================================

const qtPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
const d2DbSource = process.env.PROJECTS_DATABASE_URL ? 'PROJECTS_DATABASE_URL' : (process.env.CRM_DATABASE_URL ? 'CRM_DATABASE_URL' : 'DATABASE_URL');
console.log(`[D2AI-Tasks] QuickTask sync DB: DATABASE_URL (D2AI uses ${d2DbSource})`);

async function getStaffName(staffId) {
  if (!staffId) return 'manuel';
  try {
    const rows = await sequelize.query(
      `SELECT LOWER(first_name) as name FROM d2_staff_members WHERE id = $1 LIMIT 1`,
      { bind: [staffId], type: sequelize.QueryTypes.SELECT }
    );
    return rows[0]?.name || 'manuel';
  } catch (e) { return 'manuel'; }
}

async function syncToQuickTask(task) {
  try {
    const assignee = await getStaffName(task.assigned_staff_id);
    // Insert into follow_up_items on QuickTask database (DATABASE_URL)
    const r = await qtPool.query(
      `INSERT INTO follow_up_items (message, assigned_to, source, event_date, event_title, d2_task_id, status)
       VALUES ($1, $2, 'text', $3, $4, $5, $6) RETURNING id`,
      [
        task.description || task.title,
        assignee,
        task.due_date || null,
        task.title,
        task.id,
        task.status || 'pending'
      ]
    );
    if (r.rows.length > 0) {
      // Update d2_tasks on D2AI's own database
      await sequelize.query(
        `UPDATE d2_tasks SET quicktask_id = $1 WHERE id = $2`,
        { bind: [r.rows[0].id, task.id] }
      );
      console.log(`[D2AI] Synced d2#${task.id} → qt#${r.rows[0].id}`);
    }
  } catch (e) {
    console.log('[D2AI] QuickTask sync error (create):', e.message?.substring(0, 100));
  }
}

async function syncStatusToQuickTask(d2TaskId, status) {
  try {
    const completedAt = status === 'completed' ? 'NOW()' : 'NULL';
    // Update on QuickTask database
    await qtPool.query(
      `UPDATE follow_up_items SET status = $1, completed_at = ${completedAt} WHERE d2_task_id = $2`,
      [status, d2TaskId]
    );
  } catch (e) { /* ignore */ }
}

async function syncDeleteToQuickTask(d2TaskId) {
  try {
    // Delete from QuickTask database
    await qtPool.query(
      `DELETE FROM follow_up_items WHERE d2_task_id = $1`,
      [d2TaskId]
    );
  } catch (e) { /* ignore */ }
}

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
        { model: StaffMember, as: 'assignee', attributes: ['id', 'first_name', 'last_name'], required: false }
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
        { model: StaffMember, as: 'assignee', attributes: ['id', 'first_name', 'last_name'], required: false }
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
        { model: StaffMember, as: 'assignee', attributes: ['id', 'first_name', 'last_name', 'email', 'position'], required: false }
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
    // Async sync to QuickTask (non-blocking)
    syncToQuickTask(task).catch(() => {});
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
    const oldStatus = task.status;
    await task.update(req.body);
    await logActivity(req.user?.email, 'updated', 'task', task.id, task.title);
    res.json({ success: true, data: task });
    // Sync status change to QuickTask
    if (req.body.status && req.body.status !== oldStatus) {
      syncStatusToQuickTask(task.id, req.body.status).catch(() => {});
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/tasks/:id - Delete task
router.delete('/:id', async (req, res) => {
  try {
    // Sync delete to QuickTask before removing
    syncDeleteToQuickTask(parseInt(req.params.id)).catch(() => {});
    await Task.destroy({ where: { id: req.params.id, workspace_id: 1 } });
    res.json({ success: true, message: 'Task deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Export sync function for test endpoint
router._syncToQuickTask = syncToQuickTask;

module.exports = router;
