'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List locations for a school
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const locations = await kanchoModels.KanchoLocation.findAll({
      where: { school_id: schoolId },
      order: [['is_primary', 'DESC'], ['name', 'ASC']]
    });
    res.json({ success: true, data: locations });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create location
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const location = await kanchoModels.KanchoLocation.create({
      school_id: schoolId,
      name: req.body.name,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zip: req.body.zip,
      phone: req.body.phone,
      email: req.body.email,
      timezone: req.body.timezone || 'America/New_York',
      business_hours: req.body.business_hours || {},
      is_primary: req.body.is_primary || false,
      capacity: req.body.capacity || 100
    });
    res.status(201).json({ success: true, data: location });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update location
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const location = await kanchoModels.KanchoLocation.findByPk(req.params.id);
    if (!location) return res.status(404).json({ success: false, error: 'Location not found' });

    const allowed = ['name', 'address', 'city', 'state', 'zip', 'phone', 'email', 'timezone', 'business_hours', 'is_primary', 'is_active', 'capacity', 'settings'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await location.update(updates);
    res.json({ success: true, data: location });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Deactivate location
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const location = await kanchoModels.KanchoLocation.findByPk(req.params.id);
    if (!location) return res.status(404).json({ success: false, error: 'Location not found' });
    await location.update({ is_active: false, updated_at: new Date() });
    res.json({ success: true, message: 'Location deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
