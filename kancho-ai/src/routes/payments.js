'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) { console.log('Kancho models not loaded:', e.message); }

// GET / - List payments
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.student_id) where.student_id = req.query.student_id;
    if (req.query.type) where.type = req.query.type;
    if (req.query.status) where.status = req.query.status;
    if (req.query.date_from && req.query.date_to) {
      where.payment_date = { [Op.between]: [req.query.date_from, req.query.date_to] };
    }

    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await kanchoModels.KanchoPayment.findAndCountAll({
      where,
      include: [
        { model: kanchoModels.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name'] }
      ],
      order: [['payment_date', 'DESC'], ['created_at', 'DESC']],
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

// GET /summary - Revenue summary
router.get('/summary', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const today = new Date();
    const thisMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const firstOfMonth = thisMonth + '-01';
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const lastOfMonth = thisMonth + '-' + lastDay;

    const [monthTotal, monthCount, byType, collected, pending] = await Promise.all([
      kanchoModels.KanchoPayment.sum('total', { where: { school_id: schoolId, payment_date: { [Op.between]: [firstOfMonth, lastOfMonth] }, status: 'completed' } }),
      kanchoModels.KanchoPayment.count({ where: { school_id: schoolId, payment_date: { [Op.between]: [firstOfMonth, lastOfMonth] } } }),
      kanchoModels.KanchoPayment.findAll({
        where: { school_id: schoolId, payment_date: { [Op.between]: [firstOfMonth, lastOfMonth] }, status: 'completed' },
        attributes: ['type', [kanchoModels.sequelize.fn('SUM', kanchoModels.sequelize.col('total')), 'total'], [kanchoModels.sequelize.fn('COUNT', '*'), 'count']],
        group: ['type'],
        raw: true
      }),
      kanchoModels.KanchoPayment.sum('total', { where: { school_id: schoolId, status: 'completed', payment_date: { [Op.between]: [firstOfMonth, lastOfMonth] } } }),
      kanchoModels.KanchoPayment.sum('total', { where: { school_id: schoolId, status: 'pending' } })
    ]);

    res.json({
      success: true,
      data: {
        thisMonth: { total: monthTotal || 0, count: monthCount },
        byType,
        collected: collected || 0,
        pending: pending || 0
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST / - Record payment
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const total = parseFloat(req.body.amount || 0) + parseFloat(req.body.tax || 0);
    const invoiceNumber = 'KA-' + Date.now().toString(36).toUpperCase();

    const payment = await kanchoModels.KanchoPayment.create({
      school_id: schoolId,
      student_id: req.body.student_id || null,
      subscription_id: req.body.subscription_id || null,
      family_id: req.body.family_id || null,
      type: req.body.type || 'membership',
      amount: req.body.amount,
      tax: req.body.tax || 0,
      total: req.body.total || total,
      status: req.body.status || 'completed',
      payment_method: req.body.payment_method || 'card',
      payment_date: req.body.payment_date || new Date().toISOString().split('T')[0],
      description: req.body.description || null,
      invoice_number: invoiceNumber,
      metadata: req.body.metadata || {}
    });

    // Update student last payment if student-linked
    if (req.body.student_id && req.body.status !== 'failed') {
      await kanchoModels.KanchoStudent.update(
        { last_payment_date: payment.payment_date, payment_status: 'current', updated_at: new Date() },
        { where: { id: req.body.student_id } }
      );
    }

    res.status(201).json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /:id - Update payment
router.put('/:id', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const payment = await kanchoModels.KanchoPayment.findByPk(req.params.id);
    if (!payment) return res.status(404).json({ success: false, error: 'Payment not found' });

    const allowed = ['status', 'payment_method', 'description', 'refund_amount', 'refund_reason', 'metadata'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }
    if (req.body.refund_amount) updates.status = 'refunded';
    updates.updated_at = new Date();
    await payment.update(updates);
    res.json({ success: true, data: payment });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
