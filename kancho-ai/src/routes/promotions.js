'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) {}

// GET / - List promotions
router.get('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });

    const where = { school_id: schoolId };
    if (req.query.student_id) where.student_id = req.query.student_id;
    if (req.query.to_belt) where.to_belt = req.query.to_belt;
    if (req.query.date_from && req.query.date_to) {
      where.promotion_date = { [Op.between]: [req.query.date_from, req.query.date_to] };
    }

    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await kanchoModels.KanchoPromotion.findAndCountAll({
      where,
      include: [
        { model: kanchoModels.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name', 'belt_rank'] }
      ],
      order: [['promotion_date', 'DESC']],
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

// POST / - Record a promotion
router.post('/', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.body.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    if (!req.body.student_id || !req.body.to_belt) {
      return res.status(400).json({ success: false, error: 'student_id and to_belt required' });
    }

    // Get student current belt
    const student = await kanchoModels.KanchoStudent.findByPk(req.body.student_id);
    if (!student) return res.status(404).json({ success: false, error: 'Student not found' });

    const promotion = await kanchoModels.KanchoPromotion.create({
      school_id: schoolId,
      student_id: req.body.student_id,
      from_belt: student.belt_rank || null,
      to_belt: req.body.to_belt,
      promotion_date: req.body.promotion_date || new Date().toISOString().split('T')[0],
      promoted_by: req.body.promoted_by || null,
      testing_score: req.body.testing_score || null,
      testing_fee_paid: req.body.testing_fee_paid || 0,
      payment_id: req.body.payment_id || null,
      classes_at_promotion: req.body.classes_at_promotion || student.total_classes || 0,
      months_training: req.body.months_training || 0,
      notes: req.body.notes || null
    });

    // Update student belt_rank
    await student.update({ belt_rank: req.body.to_belt, updated_at: new Date() });

    // Fire automation event
    try {
      const app = req.app;
      if (app.locals.automationEngine) {
        app.locals.automationEngine.fireEvent('belt_rank_updated', schoolId, {
          ...student.toJSON(),
          old_belt_rank: promotion.from_belt,
          belt_rank: req.body.to_belt
        });
      }
    } catch (ae) { /* non-blocking */ }

    res.status(201).json({ success: true, data: promotion });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /summary - Promotion stats
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

    const [totalThisMonth, totalThisYear, byBelt, recentPromotions] = await Promise.all([
      kanchoModels.KanchoPromotion.count({ where: { school_id: schoolId, promotion_date: { [Op.between]: [firstOfMonth, lastOfMonth] } } }),
      kanchoModels.KanchoPromotion.count({ where: { school_id: schoolId, promotion_date: { [Op.gte]: `${today.getFullYear()}-01-01` } } }),
      kanchoModels.KanchoPromotion.findAll({
        where: { school_id: schoolId, promotion_date: { [Op.gte]: `${today.getFullYear()}-01-01` } },
        attributes: ['to_belt', [kanchoModels.sequelize.fn('COUNT', '*'), 'count']],
        group: ['to_belt'],
        raw: true
      }),
      kanchoModels.KanchoPromotion.findAll({
        where: { school_id: schoolId },
        include: [{ model: kanchoModels.KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name'] }],
        order: [['promotion_date', 'DESC']],
        limit: 10
      })
    ]);

    const totalFees = await kanchoModels.KanchoPromotion.sum('testing_fee_paid', {
      where: { school_id: schoolId, promotion_date: { [Op.gte]: `${today.getFullYear()}-01-01` } }
    });

    res.json({
      success: true,
      data: { thisMonth: totalThisMonth, thisYear: totalThisYear, byBelt, totalFees: totalFees || 0, recent: recentPromotions }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
