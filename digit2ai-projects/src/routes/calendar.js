'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { CalendarEvent, Project, Contact, Task, StaffMember } = require('../models');
const { logActivity } = require('../services/activityService');

// Convert a Task row into a calendar-event-shaped object
function taskToEvent(task) {
  const t = task.toJSON ? task.toJSON() : task;
  const due = t.due_date ? new Date(t.due_date) : null;
  return {
    id: `task-${t.id}`,
    source: 'task',
    task_id: t.id,
    workspace_id: t.workspace_id,
    user_email: t.user_email,
    project_id: t.project_id,
    contact_id: t.contact_id,
    title: t.title,
    description: t.description,
    event_type: 'task',
    start_time: due,
    end_time: due,
    all_day: true,
    location: null,
    task_status: t.status,
    task_priority: t.priority,
    assigned_staff_id: t.assigned_staff_id,
    project: t.project || null,
    contact: t.contact || null,
    assignee: t.assignee || null
  };
}

async function fetchTasksForRange(start, end) {
  const where = { workspace_id: 1, due_date: { [Op.ne]: null } };
  if (start && end) {
    where.due_date = { [Op.between]: [new Date(start), new Date(end)] };
  } else if (start) {
    where.due_date = { [Op.gte]: new Date(start) };
  }
  const tasks = await Task.findAll({
    where,
    include: [
      { model: Project, as: 'project', attributes: ['id', 'name'] },
      { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name'] },
      { model: StaffMember, as: 'assignee', attributes: ['id', 'first_name', 'last_name'], required: false }
    ],
    order: [['due_date', 'ASC']]
  });
  return tasks.map(taskToEvent);
}

// GET /api/v1/calendar - List events (merges tasks with due dates)
router.get('/', async (req, res) => {
  try {
    const { start, end, event_type } = req.query;
    const where = { workspace_id: 1 };

    if (start && end) {
      where.start_time = { [Op.between]: [new Date(start), new Date(end)] };
    } else if (start) {
      where.start_time = { [Op.gte]: new Date(start) };
    } else {
      where.start_time = { [Op.gte]: new Date() };
    }
    if (event_type) where.event_type = event_type;

    const events = await CalendarEvent.findAll({
      where,
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['start_time', 'ASC']],
      limit: 200
    });

    let merged = events.map(e => ({ ...e.toJSON(), source: 'event' }));
    if (!event_type || event_type === 'task') {
      const taskEvents = await fetchTasksForRange(start, end);
      merged = merged.concat(taskEvents);
      merged.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    }

    res.json({ success: true, data: merged });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/calendar/upcoming - Next 7 days (merges tasks with due dates)
router.get('/upcoming', async (req, res) => {
  try {
    const now = new Date();
    const weekLater = new Date(now.getTime() + 7 * 86400000);
    const events = await CalendarEvent.findAll({
      where: { workspace_id: 1, start_time: { [Op.between]: [now, weekLater] } },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['start_time', 'ASC']]
    });
    const taskEvents = await fetchTasksForRange(now, weekLater);
    const merged = events.map(e => ({ ...e.toJSON(), source: 'event' })).concat(taskEvents);
    merged.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
    res.json({ success: true, data: merged });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/calendar/:id - Single event
router.get('/:id', async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({
      where: { id: req.params.id, workspace_id: 1 },
      include: [
        { model: Project, as: 'project', attributes: ['id', 'name', 'status'] },
        { model: Contact, as: 'contact', attributes: ['id', 'first_name', 'last_name', 'email'] }
      ]
    });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/calendar - Create event
router.post('/', async (req, res) => {
  try {
    const data = { workspace_id: 1, user_email: req.user?.email, ...req.body };
    const event = await CalendarEvent.create(data);
    await logActivity(req.user?.email, 'created', 'calendar_event', event.id, event.title);
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/calendar/:id - Update event
router.put('/:id', async (req, res) => {
  try {
    const event = await CalendarEvent.findOne({ where: { id: req.params.id, workspace_id: 1 } });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    await event.update(req.body);
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/calendar/:id - Delete event
router.delete('/:id', async (req, res) => {
  try {
    await CalendarEvent.destroy({ where: { id: req.params.id, workspace_id: 1 } });
    res.json({ success: true, message: 'Event deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
