const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const { awardBadge } = require('../services/badge-service');

// GET /api/v1/events/public -- Public events
router.get('/public', async (req, res) => {
  try {
    const models = require('../../models');
    const events = await models.VisionariumEvent.findAll({
      where: { status: ['planned', 'registration_open'] },
      order: [['start_datetime', 'ASC']],
      limit: 20
    });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/v1/events -- All events (authenticated)
router.get('/', verifyToken, async (req, res) => {
  try {
    const models = require('../../models');
    const { cohort_id, type, status } = req.query;
    const where = {};
    if (cohort_id) where.cohort_id = cohort_id;
    if (type) where.type = type;
    if (status) where.status = status;

    const events = await models.VisionariumEvent.findAll({
      where,
      include: [{ model: models.VisionariumCohort, as: 'cohort', attributes: ['name'] }],
      order: [['start_datetime', 'ASC']]
    });
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: create event
router.post('/', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const event = await models.VisionariumEvent.create(req.body);
    res.status(201).json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: update event
router.put('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const event = await models.VisionariumEvent.findByPk(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    await event.update(req.body);
    res.json({ success: true, event });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Admin: delete event
router.delete('/:id', verifyToken, requireRole('admin'), async (req, res) => {
  try {
    const models = require('../../models');
    const event = await models.VisionariumEvent.findByPk(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    await event.destroy();
    res.json({ success: true, message: 'Event deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/v1/events/:id/rsvp
router.post('/:id/rsvp', verifyToken, async (req, res) => {
  try {
    const models = require('../../models');
    const event = await models.VisionariumEvent.findByPk(req.params.id);
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.max_attendees && event.current_rsvps >= event.max_attendees) {
      return res.status(400).json({ error: 'Event is full' });
    }
    await event.increment('current_rsvps');
    // Award first RSVP badge
    awardBadge(models, req.user.id, 'first_rsvp').catch(() => {});

    res.json({ success: true, message: 'RSVP confirmed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
