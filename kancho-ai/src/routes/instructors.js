'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List instructors
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.active !== undefined) where.is_active = req.query.active === 'true';
    if (req.query.role) where.role = req.query.role;

    const instructors = await kanchoModels.KanchoInstructor.findAll({ where, order: [['role', 'ASC'], ['last_name', 'ASC']] });
    res.json({ success: true, data: instructors });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - Get instructor
router.get('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const instructor = await kanchoModels.KanchoInstructor.findByPk(req.params.id);
    if (!instructor) return res.status(404).json({ success: false, error: 'Instructor not found' });
    res.json({ success: true, data: instructor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create instructor
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const instructor = await kanchoModels.KanchoInstructor.create({
      school_id: schoolId,
      first_name: req.body.first_name,
      last_name: req.body.last_name,
      email: req.body.email,
      phone: req.body.phone,
      role: req.body.role || 'instructor',
      belt_rank: req.body.belt_rank,
      specialties: req.body.specialties || [],
      bio: req.body.bio,
      photo_url: req.body.photo_url,
      hire_date: req.body.hire_date,
      pay_type: req.body.pay_type,
      pay_rate: req.body.pay_rate,
      schedule: req.body.schedule || {},
      certifications: req.body.certifications || [],
      emergency_contact: req.body.emergency_contact
    });
    res.status(201).json({ success: true, data: instructor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update instructor
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const instructor = await kanchoModels.KanchoInstructor.findByPk(req.params.id);
    if (!instructor) return res.status(404).json({ success: false, error: 'Instructor not found' });

    const allowed = ['first_name', 'last_name', 'email', 'phone', 'role', 'belt_rank', 'specialties', 'bio', 'photo_url', 'hire_date', 'pay_type', 'pay_rate', 'schedule', 'certifications', 'emergency_contact', 'is_active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await instructor.update(updates);
    res.json({ success: true, data: instructor });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Deactivate instructor
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const instructor = await kanchoModels.KanchoInstructor.findByPk(req.params.id);
    if (!instructor) return res.status(404).json({ success: false, error: 'Instructor not found' });
    await instructor.update({ is_active: false, updated_at: new Date() });
    res.json({ success: true, message: 'Instructor deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
