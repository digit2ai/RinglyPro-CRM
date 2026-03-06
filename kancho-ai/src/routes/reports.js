'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

let kanchoModels;
try { kanchoModels = require('../../models'); } catch (e) {}

// Helper: Generate CSV string from array of objects
function toCSV(rows, columns) {
  if (!rows.length) return columns.join(',') + '\n';
  const header = columns.join(',');
  const lines = rows.map(row => columns.map(col => {
    let val = row[col] !== undefined && row[col] !== null ? String(row[col]) : '';
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      val = '"' + val.replace(/"/g, '""') + '"';
    }
    return val;
  }).join(','));
  return header + '\n' + lines.join('\n');
}

// GET /students - Export students
router.get('/students', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    const format = req.query.format || 'json';

    const where = { school_id: schoolId };
    if (req.query.status) where.status = req.query.status;

    const students = await kanchoModels.KanchoStudent.findAll({ where, order: [['last_name', 'ASC']], raw: true });

    if (format === 'csv') {
      const cols = ['id', 'first_name', 'last_name', 'email', 'phone', 'status', 'belt_rank', 'enrollment_date', 'membership_type', 'monthly_rate', 'churn_risk', 'total_classes', 'last_attendance'];
      const csv = toCSV(students, cols);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="students_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data: students, total: students.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /leads - Export leads
router.get('/leads', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    const format = req.query.format || 'json';

    const where = { school_id: schoolId };
    if (req.query.status) where.status = req.query.status;

    const leads = await kanchoModels.KanchoLead.findAll({ where, order: [['created_at', 'DESC']], raw: true });

    if (format === 'csv') {
      const cols = ['id', 'first_name', 'last_name', 'email', 'phone', 'status', 'temperature', 'source', 'lead_score', 'created_at', 'last_contact', 'next_follow_up'];
      const csv = toCSV(leads, cols);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="leads_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data: leads, total: leads.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /payments - Export payments
router.get('/payments', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    const format = req.query.format || 'json';

    const where = { school_id: schoolId };
    if (req.query.date_from && req.query.date_to) {
      where.payment_date = { [Op.between]: [req.query.date_from, req.query.date_to] };
    }
    if (req.query.status) where.status = req.query.status;

    const payments = await kanchoModels.KanchoPayment.findAll({
      where,
      include: [{ model: kanchoModels.KanchoStudent, as: 'student', attributes: ['first_name', 'last_name'] }],
      order: [['payment_date', 'DESC']],
      raw: true,
      nest: true
    });

    if (format === 'csv') {
      const flat = payments.map(p => ({
        ...p,
        student_name: p.student ? `${p.student.first_name} ${p.student.last_name}` : '',
      }));
      const cols = ['id', 'student_name', 'type', 'amount', 'tax', 'total', 'status', 'payment_method', 'payment_date', 'invoice_number', 'description'];
      const csv = toCSV(flat, cols);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="payments_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data: payments, total: payments.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /attendance - Export attendance
router.get('/attendance', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    const format = req.query.format || 'json';

    const where = { school_id: schoolId };
    if (req.query.date_from && req.query.date_to) {
      where.check_in_date = { [Op.between]: [req.query.date_from, req.query.date_to] };
    }

    const attendance = await kanchoModels.KanchoAttendance.findAll({ where, order: [['check_in_date', 'DESC']], raw: true });

    if (format === 'csv') {
      const cols = ['id', 'student_id', 'class_id', 'check_in_date', 'check_in_time', 'status'];
      const csv = toCSV(attendance, cols);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="attendance_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data: attendance, total: attendance.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /promotions - Export promotions
router.get('/promotions', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    const format = req.query.format || 'json';

    const where = { school_id: schoolId };
    const promotions = await kanchoModels.KanchoPromotion.findAll({
      where,
      include: [{ model: kanchoModels.KanchoStudent, as: 'student', attributes: ['first_name', 'last_name'] }],
      order: [['promotion_date', 'DESC']],
      raw: true,
      nest: true
    });

    if (format === 'csv') {
      const flat = promotions.map(p => ({
        ...p,
        student_name: p.student ? `${p.student.first_name} ${p.student.last_name}` : '',
      }));
      const cols = ['id', 'student_name', 'from_belt', 'to_belt', 'promotion_date', 'testing_score', 'testing_fee_paid', 'classes_at_promotion', 'months_training', 'notes'];
      const csv = toCSV(flat, cols);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="promotions_export.csv"');
      return res.send(csv);
    }

    res.json({ success: true, data: promotions, total: promotions.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /revenue-summary - Monthly revenue breakdown
router.get('/revenue-summary', async (req, res) => {
  if (!kanchoModels) return res.status(503).json({ success: false, error: 'Service unavailable' });
  try {
    const schoolId = req.query.school_id || req.schoolId;
    if (!schoolId) return res.status(400).json({ success: false, error: 'school_id required' });
    const format = req.query.format || 'json';

    const year = req.query.year || new Date().getFullYear();

    const monthly = await kanchoModels.KanchoPayment.findAll({
      where: {
        school_id: schoolId,
        status: 'completed',
        payment_date: { [Op.between]: [`${year}-01-01`, `${year}-12-31`] }
      },
      attributes: [
        [kanchoModels.sequelize.fn('TO_CHAR', kanchoModels.sequelize.col('payment_date'), 'YYYY-MM'), 'month'],
        [kanchoModels.sequelize.fn('SUM', kanchoModels.sequelize.col('total')), 'revenue'],
        [kanchoModels.sequelize.fn('COUNT', '*'), 'transactions']
      ],
      group: [kanchoModels.sequelize.fn('TO_CHAR', kanchoModels.sequelize.col('payment_date'), 'YYYY-MM')],
      order: [[kanchoModels.sequelize.fn('TO_CHAR', kanchoModels.sequelize.col('payment_date'), 'YYYY-MM'), 'ASC']],
      raw: true
    });

    if (format === 'csv') {
      const cols = ['month', 'revenue', 'transactions'];
      const csv = toCSV(monthly, cols);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="revenue_${year}.csv"`);
      return res.send(csv);
    }

    res.json({ success: true, data: monthly, year: parseInt(year) });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
