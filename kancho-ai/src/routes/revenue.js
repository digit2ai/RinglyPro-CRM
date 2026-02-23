// kancho-ai/src/routes/revenue.js
// Revenue CRUD + summary routes for Kancho AI

const express = require('express');
const router = express.Router();
const { Op, fn, col, literal } = require('sequelize');

module.exports = (models) => {
  const { KanchoRevenue, KanchoStudent, KanchoSchool } = models;

  // GET /api/v1/revenue - List revenue entries
  router.get('/', async (req, res) => {
    try {
      const { school_id, type, date_from, date_to, limit = 50, offset = 0 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const { student_id } = req.query;
      const where = { school_id };
      if (student_id) where.student_id = student_id;
      if (type) where.type = type;
      if (date_from || date_to) {
        where.date = {};
        if (date_from) where.date[Op.gte] = date_from;
        if (date_to) where.date[Op.lte] = date_to;
      }

      const result = await KanchoRevenue.findAndCountAll({
        where,
        include: [{ model: KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name'] }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['date', 'DESC'], ['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: result.rows,
        total: result.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('Error fetching revenue:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/revenue/summary - Revenue summary stats
  router.get('/summary', async (req, res) => {
    try {
      const { school_id, months = 6 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - parseInt(months));
      const startStr = startDate.toISOString().split('T')[0];

      // Total revenue in period
      const totalResult = await KanchoRevenue.sum('amount', {
        where: { school_id, date: { [Op.gte]: startStr } }
      });

      // Recurring revenue
      const recurringResult = await KanchoRevenue.sum('amount', {
        where: { school_id, date: { [Op.gte]: startStr }, is_recurring: true }
      });

      // By type breakdown
      const byType = await KanchoRevenue.findAll({
        where: { school_id, date: { [Op.gte]: startStr } },
        attributes: [
          'type',
          [fn('SUM', col('amount')), 'total'],
          [fn('COUNT', col('id')), 'count']
        ],
        group: ['type'],
        raw: true
      });

      // Monthly trend
      const monthlyTrend = await KanchoRevenue.findAll({
        where: { school_id, date: { [Op.gte]: startStr } },
        attributes: [
          [fn('DATE_TRUNC', 'month', col('date')), 'month'],
          [fn('SUM', col('amount')), 'total'],
          [fn('COUNT', col('id')), 'count']
        ],
        group: [fn('DATE_TRUNC', 'month', col('date'))],
        order: [[fn('DATE_TRUNC', 'month', col('date')), 'ASC']],
        raw: true
      });

      // Active student count for avg calculation
      const activeStudents = await KanchoStudent.count({
        where: { school_id, status: 'active' }
      });

      const total = parseFloat(totalResult) || 0;
      const recurring = parseFloat(recurringResult) || 0;
      const avgPerStudent = activeStudents > 0 ? Math.round((total / activeStudents) * 100) / 100 : 0;

      res.json({
        success: true,
        data: {
          total,
          recurring,
          avgPerStudent,
          activeStudents,
          byType,
          monthlyTrend,
          period: { months: parseInt(months), from: startStr }
        }
      });
    } catch (error) {
      console.error('Error fetching revenue summary:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/revenue - Create revenue entry
  router.post('/', async (req, res) => {
    try {
      const { school_id, date, type, amount } = req.body;

      if (!school_id || !date || !type || amount === undefined) {
        return res.status(400).json({ error: 'school_id, date, type, and amount required' });
      }

      const revenue = await KanchoRevenue.create({
        ...req.body,
        created_at: new Date()
      });

      res.status(201).json({ success: true, data: revenue });
    } catch (error) {
      console.error('Error creating revenue:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/revenue/:id - Delete revenue entry
  router.delete('/:id', async (req, res) => {
    try {
      const revenue = await KanchoRevenue.findByPk(req.params.id);

      if (!revenue) {
        return res.status(404).json({ error: 'Revenue entry not found' });
      }

      await revenue.destroy();
      res.json({ success: true, message: 'Revenue entry deleted' });
    } catch (error) {
      console.error('Error deleting revenue:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
