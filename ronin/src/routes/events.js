'use strict';

const express = require('express');
const router = express.Router();

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// GET / - List events
router.get('/', async (req, res) => {
  try {
    const { event_type, group, status, featured, upcoming } = req.query;
    const where = { tenant_id: 1 };
    if (event_type) where.event_type = event_type;
    if (group) where.group = group;
    if (status) where.status = status;
    if (featured === 'true') where.featured = true;
    if (upcoming === 'true') {
      const { Op } = models.Sequelize;
      where.start_date = { [Op.gte]: new Date() };
    }

    const events = await models.RoninEvent.findAll({
      where,
      order: [['start_date', 'ASC']]
    });

    res.json({ success: true, data: events });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:slug - Get event by slug
router.get('/:slug', async (req, res) => {
  try {
    const event = await models.RoninEvent.findOne({
      where: { tenant_id: 1, slug: req.params.slug }
    });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create event (admin)
router.post('/', async (req, res) => {
  try {
    const event = await models.RoninEvent.create({ ...req.body, tenant_id: 1 });
    res.status(201).json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update event
router.put('/:id', async (req, res) => {
  try {
    const event = await models.RoninEvent.findOne({ where: { id: req.params.id, tenant_id: 1 } });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found' });
    await event.update(req.body);
    res.json({ success: true, data: event });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Cancel event
router.delete('/:id', async (req, res) => {
  try {
    await models.RoninEvent.update({ status: 'cancelled' }, { where: { id: req.params.id, tenant_id: 1 } });
    res.json({ success: true, message: 'Event cancelled' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
