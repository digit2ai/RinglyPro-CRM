'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List families
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const families = await kanchoModels.KanchoFamily.findAll({
      where: { school_id: schoolId, is_active: true },
      include: [
        { model: kanchoModels.KanchoStudent, as: 'members', attributes: ['id', 'first_name', 'last_name', 'belt_rank', 'status'] }
      ],
      order: [['family_name', 'ASC']]
    });
    res.json({ success: true, data: families });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - Get family with members
router.get('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const family = await kanchoModels.KanchoFamily.findByPk(req.params.id, {
      include: [
        { model: kanchoModels.KanchoStudent, as: 'members', attributes: ['id', 'first_name', 'last_name', 'belt_rank', 'status', 'email', 'phone', 'monthly_rate'] },
        { model: kanchoModels.KanchoSubscription, as: 'subscriptions', include: [{ model: kanchoModels.KanchoMembershipPlan, as: 'plan', attributes: ['id', 'name', 'price'] }] },
        { model: kanchoModels.KanchoPayment, as: 'payments', limit: 10, order: [['payment_date', 'DESC']] }
      ]
    });
    if (!family) return res.status(404).json({ success: false, error: 'Family not found' });
    res.json({ success: true, data: family });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create family
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const family = await kanchoModels.KanchoFamily.create({
      school_id: schoolId,
      family_name: req.body.family_name,
      primary_contact_name: req.body.primary_contact_name,
      primary_contact_email: req.body.primary_contact_email,
      primary_contact_phone: req.body.primary_contact_phone,
      secondary_contact_name: req.body.secondary_contact_name,
      secondary_contact_phone: req.body.secondary_contact_phone,
      secondary_contact_email: req.body.secondary_contact_email,
      address: req.body.address,
      city: req.body.city,
      state: req.body.state,
      zip: req.body.zip,
      billing_method: req.body.billing_method || 'combined',
      notes: req.body.notes
    });

    // Link existing students if provided
    if (req.body.student_ids && Array.isArray(req.body.student_ids)) {
      await kanchoModels.KanchoStudent.update(
        { family_id: family.id, updated_at: new Date() },
        { where: { id: req.body.student_ids, school_id: schoolId } }
      );
    }

    res.status(201).json({ success: true, data: family });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update family
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const family = await kanchoModels.KanchoFamily.findByPk(req.params.id);
    if (!family) return res.status(404).json({ success: false, error: 'Family not found' });

    const allowed = ['family_name', 'primary_contact_name', 'primary_contact_email', 'primary_contact_phone', 'secondary_contact_name', 'secondary_contact_phone', 'secondary_contact_email', 'address', 'city', 'state', 'zip', 'billing_method', 'notes', 'is_active'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await family.update(updates);
    res.json({ success: true, data: family });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/add-member - Add student to family
router.post('/:id/add-member', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const family = await kanchoModels.KanchoFamily.findByPk(req.params.id);
    if (!family) return res.status(404).json({ success: false, error: 'Family not found' });

    await kanchoModels.KanchoStudent.update(
      { family_id: family.id, updated_at: new Date() },
      { where: { id: req.body.student_id, school_id: family.school_id } }
    );
    res.json({ success: true, message: 'Member added to family' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/remove-member - Remove student from family
router.post('/:id/remove-member', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    await kanchoModels.KanchoStudent.update(
      { family_id: null, updated_at: new Date() },
      { where: { id: req.body.student_id, family_id: parseInt(req.params.id) } }
    );
    res.json({ success: true, message: 'Member removed from family' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
