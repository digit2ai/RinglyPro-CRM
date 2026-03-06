'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List subscriptions
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.status) where.status = req.query.status;
    if (req.query.student_id) where.student_id = req.query.student_id;
    if (req.query.plan_id) where.plan_id = req.query.plan_id;

    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await kanchoModels.KanchoSubscription.findAndCountAll({
      where,
      include: [
        { model: kanchoModels.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'belt_rank'] },
        { model: kanchoModels.KanchoMembershipPlan, as: 'plan', attributes: ['id', 'name', 'price', 'type', 'billing_frequency'] }
      ],
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset
    });

    res.json({
      success: true,
      data: rows,
      pagination: { total: count, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)) }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /summary - Subscription metrics
router.get('/summary', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const [active, paused, pastDue, cancelled, trial] = await Promise.all([
      kanchoModels.KanchoSubscription.count({ where: { school_id: schoolId, status: 'active' } }),
      kanchoModels.KanchoSubscription.count({ where: { school_id: schoolId, status: 'paused' } }),
      kanchoModels.KanchoSubscription.count({ where: { school_id: schoolId, status: 'past_due' } }),
      kanchoModels.KanchoSubscription.count({ where: { school_id: schoolId, status: 'cancelled' } }),
      kanchoModels.KanchoSubscription.count({ where: { school_id: schoolId, status: 'trial' } })
    ]);

    const mrr = await kanchoModels.KanchoSubscription.sum('amount', { where: { school_id: schoolId, status: 'active' } });

    res.json({
      success: true,
      data: { active, paused, pastDue, cancelled, trial, mrr: mrr || 0 }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /past-due - Past due subscriptions needing attention
router.get('/past-due', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const pastDue = await kanchoModels.KanchoSubscription.findAll({
      where: { school_id: schoolId, status: 'past_due' },
      include: [
        { model: kanchoModels.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name', 'phone', 'email'] },
        { model: kanchoModels.KanchoMembershipPlan, as: 'plan', attributes: ['id', 'name', 'price'] }
      ],
      order: [['next_billing_date', 'ASC']]
    });

    res.json({ success: true, data: pastDue });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Create subscription
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const plan = await kanchoModels.KanchoMembershipPlan.findByPk(req.body.plan_id);
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });

    const startDate = req.body.start_date || new Date().toISOString().split('T')[0];
    let trialEndDate = null;
    if (plan.trial_days > 0) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + plan.trial_days);
      trialEndDate = d.toISOString().split('T')[0];
    }

    const amount = req.body.discount_percent
      ? plan.price * (1 - req.body.discount_percent / 100)
      : plan.price;

    const sub = await kanchoModels.KanchoSubscription.create({
      school_id: schoolId,
      student_id: req.body.student_id,
      plan_id: req.body.plan_id,
      family_id: req.body.family_id || null,
      status: trialEndDate ? 'trial' : 'active',
      start_date: startDate,
      end_date: plan.contract_months > 0 ? (() => { const d = new Date(startDate); d.setMonth(d.getMonth() + plan.contract_months); return d.toISOString().split('T')[0]; })() : null,
      trial_end_date: trialEndDate,
      next_billing_date: trialEndDate || startDate,
      amount: parseFloat(amount).toFixed(2),
      discount_percent: req.body.discount_percent || 0,
      discount_reason: req.body.discount_reason || null,
      payment_method: req.body.payment_method || 'card',
      auto_renew: req.body.auto_renew !== false,
      notes: req.body.notes || null
    });

    // Update plan subscriber count
    await plan.increment('active_subscribers');

    // Update student membership info
    await kanchoModels.KanchoStudent.update(
      { membership_type: plan.name, monthly_rate: amount, status: 'active', updated_at: new Date() },
      { where: { id: req.body.student_id } }
    );

    res.status(201).json({ success: true, data: sub });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update subscription
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const sub = await kanchoModels.KanchoSubscription.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    const allowed = ['status', 'amount', 'discount_percent', 'discount_reason', 'payment_method', 'auto_renew', 'next_billing_date', 'notes', 'pause_start', 'pause_end'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    updates.updated_at = new Date();
    await sub.update(updates);
    res.json({ success: true, data: sub });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/cancel - Cancel subscription
router.post('/:id/cancel', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const sub = await kanchoModels.KanchoSubscription.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    await sub.update({
      status: 'cancelled',
      cancellation_date: new Date().toISOString().split('T')[0],
      cancellation_reason: req.body.reason || null,
      updated_at: new Date()
    });

    // Update plan count
    await kanchoModels.KanchoMembershipPlan.decrement('active_subscribers', { where: { id: sub.plan_id } });

    res.json({ success: true, data: sub });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /:id/pause - Pause subscription
router.post('/:id/pause', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const sub = await kanchoModels.KanchoSubscription.findByPk(req.params.id);
    if (!sub) return res.status(404).json({ success: false, error: 'Subscription not found' });

    await sub.update({
      status: 'paused',
      pause_start: req.body.pause_start || new Date().toISOString().split('T')[0],
      pause_end: req.body.pause_end || null,
      updated_at: new Date()
    });

    res.json({ success: true, data: sub });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
