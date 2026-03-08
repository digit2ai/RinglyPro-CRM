'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const { CalendarEvent, Project, Contact } = require('../models');
const { logActivity } = require('../services/activityService');

// GET /api/v1/calendar - List events
router.get('/', async (req, res) => {
  try {
    const { start, end, event_type } = req.query;
    const where = { workspace_id: 1 };

    if (start && end) {
      where.start_time = { [Op.between]: [new Date(start), new Date(end)] };
    } else if (start) {
      where.start_time = { [Op.gte]: new Date(start) };
    } else {
      // Default: next 30 days
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
    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/calendar/upcoming - Next 7 days
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
    res.json({ success: true, data: events });
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
