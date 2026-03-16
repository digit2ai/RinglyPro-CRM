/**
 * RinglyPro CRM — Tasks API
 */
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

function getClientId(req) {
  return parseInt(req.query.client_id || req.body?.client_id || req.user?.clientId);
}

// GET /api/tasks — List tasks
router.get('/', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const { status, priority, task_type, contact_id, deal_id, limit = 100 } = req.query;
    let where = 'WHERE t.client_id = :clientId';
    const replacements = { clientId, limit: parseInt(limit) };
    if (status) { where += ' AND t.status = :status'; replacements.status = status; }
    if (priority) { where += ' AND t.priority = :priority'; replacements.priority = priority; }
    if (task_type) { where += ' AND t.task_type = :taskType'; replacements.taskType = task_type; }
    if (contact_id) { where += ' AND t.contact_id = :contactId'; replacements.contactId = parseInt(contact_id); }
    if (deal_id) { where += ' AND t.deal_id = :dealId'; replacements.dealId = parseInt(deal_id); }

    const tasks = await sequelize.query(
      `SELECT t.*, c.first_name, c.last_name, c.phone as contact_phone,
              d.title as deal_title
       FROM tasks t
       LEFT JOIN contacts c ON t.contact_id = c.id
       LEFT JOIN deals d ON t.deal_id = d.id
       ${where} ORDER BY
         CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         t.due_date ASC NULLS LAST
       LIMIT :limit`,
      { replacements, type: QueryTypes.SELECT }
    );
    res.json({ success: true, count: tasks.length, tasks });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/tasks/today — Today's + overdue
router.get('/today', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const tasks = await sequelize.query(
      `SELECT t.*, c.first_name, c.last_name, c.phone as contact_phone,
              CASE WHEN t.due_date < CURRENT_DATE THEN true ELSE false END as is_overdue
       FROM tasks t LEFT JOIN contacts c ON t.contact_id = c.id
       WHERE t.client_id = :clientId AND t.status IN ('pending','in_progress')
         AND (t.due_date <= CURRENT_DATE OR t.due_date IS NULL)
       ORDER BY t.due_date ASC NULLS LAST, t.priority ASC`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, count: tasks.length, tasks });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/tasks/stats — Counts
router.get('/stats', async (req, res) => {
  try {
    const clientId = getClientId(req);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });

    const [stats] = await sequelize.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'pending') as pending,
         COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
         COUNT(*) FILTER (WHERE status = 'completed') as completed,
         COUNT(*) FILTER (WHERE status IN ('pending','in_progress') AND due_date < CURRENT_DATE) as overdue,
         COUNT(*) FILTER (WHERE status IN ('pending','in_progress') AND due_date = CURRENT_DATE) as due_today
       FROM tasks WHERE client_id = :clientId`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );
    res.json({ success: true, stats });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/tasks — Create
router.post('/', async (req, res) => {
  try {
    const { client_id, contact_id, deal_id, title, description, task_type = 'follow_up', priority = 'medium', due_date, due_time, source = 'manual' } = req.body;
    if (!client_id || !title) return res.status(400).json({ success: false, error: 'client_id and title required' });

    const [task] = await sequelize.query(
      `INSERT INTO tasks (client_id, contact_id, deal_id, title, description, task_type, priority, status, due_date, due_time, source, created_at, updated_at)
       VALUES (:clientId, :contactId, :dealId, :title, :desc, :type, :priority, 'pending', :dueDate, :dueTime, :source, NOW(), NOW())
       RETURNING *`,
      { replacements: { clientId: client_id, contactId: contact_id || null, dealId: deal_id || null, title, desc: description || null, type: task_type, priority, dueDate: due_date || null, dueTime: due_time || null, source }, type: QueryTypes.SELECT }
    );

    // Log activity
    try {
      await sequelize.query(
        `INSERT INTO activities (client_id, contact_id, deal_id, activity_type, title, metadata, created_at)
         VALUES (:clientId, :contactId, :dealId, 'task_created', :title, :meta, NOW())`,
        { replacements: { clientId: client_id, contactId: contact_id || null, dealId: deal_id || null, title: `Task: ${title}`, meta: JSON.stringify({ task_type, priority, due_date }) } }
      );
    } catch (e) { /* non-critical */ }

    res.status(201).json({ success: true, task });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/tasks/:id — Update
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const fields = req.body;
    const setClauses = [];
    const replacements = { id };
    for (const [key, value] of Object.entries(fields)) {
      if (['client_id', 'id'].includes(key)) continue;
      setClauses.push(`${key} = :${key}`);
      replacements[key] = value;
    }
    if (setClauses.length === 0) return res.status(400).json({ success: false, error: 'No fields' });
    setClauses.push('updated_at = NOW()');
    await sequelize.query(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = :id`, { replacements });
    const [task] = await sequelize.query('SELECT * FROM tasks WHERE id = :id', { replacements: { id }, type: QueryTypes.SELECT });
    res.json({ success: true, task });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/tasks/:id/complete
router.put('/:id/complete', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await sequelize.query("UPDATE tasks SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = :id", { replacements: { id } });
    const [task] = await sequelize.query('SELECT * FROM tasks WHERE id = :id', { replacements: { id }, type: QueryTypes.SELECT });

    // Log activity
    if (task) {
      try {
        await sequelize.query(
          `INSERT INTO activities (client_id, contact_id, deal_id, activity_type, title, created_at)
           VALUES (:clientId, :contactId, :dealId, 'task_completed', :title, NOW())`,
          { replacements: { clientId: task.client_id, contactId: task.contact_id, dealId: task.deal_id, title: `Completed: ${task.title}` } }
        );
      } catch (e) { /* non-critical */ }
    }

    res.json({ success: true, task });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/tasks/:id
router.delete('/:id', async (req, res) => {
  try {
    await sequelize.query('DELETE FROM tasks WHERE id = :id', { replacements: { id: parseInt(req.params.id) } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = router;
