'use strict';

const express = require('express');
const router = express.Router();

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List membership plans for a school
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.active !== undefined) where.is_active = req.query.active === 'true';
    if (req.query.type) where.type = req.query.type;

    const plans = await kanchoModels.KanchoMembershipPlan.findAll({
      where,
      order: [['sort_order', 'ASC'], ['price', 'ASC']],
      include: req.query.include_stats ? [{
        model: kanchoModels.KanchoSubscription,
        as: 'subscriptions',
        attributes: ['id', 'status'],
        required: false,
        where: { status: 'active' }
      }] : []
    });

    res.json({ success: true, data: plans });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /:id - Get single plan
router.get('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const plan = await kanchoModels.KanchoMembershipPlan.findByPk(req.params.id, {
      include: [{ model: kanchoModels.KanchoSubscription, as: 'subscriptions', attributes: ['id', 'status', 'student_id', 'amount'] }]
    });
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create plan
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const plan = await kanchoModels.KanchoMembershipPlan.create({
      school_id: schoolId,
      name: req.body.name,
      description: req.body.description,
      type: req.body.type || 'recurring',
      billing_frequency: req.body.billing_frequency || 'monthly',
      price: req.body.price,
      setup_fee: req.body.setup_fee || 0,
      trial_days: req.body.trial_days || 0,
      classes_per_week: req.body.classes_per_week || null,
      allowed_programs: req.body.allowed_programs || null,
      family_discount_percent: req.body.family_discount_percent || 0,
      max_family_members: req.body.max_family_members || null,
      contract_months: req.body.contract_months || 0,
      cancellation_notice_days: req.body.cancellation_notice_days || 30,
      stripe_price_id: req.body.stripe_price_id || null,
      features: req.body.features || [],
      sort_order: req.body.sort_order || 0
    });
    res.status(201).json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update plan
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const plan = await kanchoModels.KanchoMembershipPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

    const allowed = ['name', 'description', 'type', 'billing_frequency', 'price', 'setup_fee', 'trial_days', 'classes_per_week', 'allowed_programs', 'family_discount_percent', 'max_family_members', 'contract_months', 'cancellation_notice_days', 'stripe_price_id', 'features', 'is_active', 'sort_order'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await plan.update(updates);
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /:id - Deactivate plan
router.delete('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const plan = await kanchoModels.KanchoMembershipPlan.findByPk(req.params.id);
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });
    await plan.update({ is_active: false, updated_at: new Date() });
    res.json({ success: true, message: 'Plan deactivated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
