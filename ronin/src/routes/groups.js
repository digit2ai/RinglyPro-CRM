'use strict';

const express = require('express');
const router = express.Router();

let models;
try { models = require('../../models'); } catch (e) { console.log('Ronin models not loaded:', e.message); }

// GET / - List all groups
router.get('/', async (req, res) => {
  try {
    const groups = await models.RoninGroup.findAll({
      where: { tenant_id: 1, status: 'active' },
      order: [['sort_order', 'ASC']]
    });
    res.json({ success: true, data: groups });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:code - Get group by code
router.get('/:code', async (req, res) => {
  try {
    const group = await models.RoninGroup.findOne({
      where: { tenant_id: 1, code: req.params.code.toUpperCase() }
    });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create group (admin)
router.post('/', async (req, res) => {
  try {
    const group = await models.RoninGroup.create({ ...req.body, tenant_id: 1 });
    res.status(201).json({ success: true, data: group });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update group
router.put('/:id', async (req, res) => {
  try {
    const group = await models.RoninGroup.findOne({ where: { id: req.params.id, tenant_id: 1 } });
    if (!group) return res.status(404).json({ success: false, error: 'Group not found' });
    await group.update(req.body);
    res.json({ success: true, data: group });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
