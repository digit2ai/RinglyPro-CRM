// kancho-ai/src/routes/students.js
// Students CRUD routes for Kancho AI

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { KanchoStudent, KanchoSchool, KanchoAttendance, KanchoClassEnrollment, KanchoRevenue, KanchoStudentAuth } = models;

  // GET /api/v1/students - List students
  router.get('/', async (req, res) => {
    try {
      const { school_id, status, churn_risk, search, limit = 100, offset = 0 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const where = { school_id };
      if (status) where.status = status;
      if (churn_risk) where.churn_risk = churn_risk;
      if (search) {
        where[Op.or] = [
          { first_name: { [Op.iLike]: `%${search}%` } },
          { last_name: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { phone: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const students = await KanchoStudent.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['last_name', 'ASC'], ['first_name', 'ASC']]
      });

      res.json({
        success: true,
        data: students.rows,
        total: students.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('Error fetching students:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/students/at-risk - Get at-risk students
  router.get('/at-risk', async (req, res) => {
    try {
      const { school_id, limit = 20 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const students = await KanchoStudent.findAll({
        where: {
          school_id,
          status: 'active',
          churn_risk: { [Op.in]: ['high', 'critical'] }
        },
        order: [['churn_risk_score', 'DESC']],
        limit: parseInt(limit)
      });

      res.json({ success: true, data: students });
    } catch (error) {
      console.error('Error fetching at-risk students:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/students/:id - Get single student
  router.get('/:id', async (req, res) => {
    try {
      const student = await KanchoStudent.findByPk(req.params.id, {
        include: [{ model: KanchoSchool, as: 'school', attributes: ['id', 'name'] }]
      });

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      res.json({ success: true, data: student });
    } catch (error) {
      console.error('Error fetching student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/students - Create student
  router.post('/', async (req, res) => {
    try {
      const { school_id, first_name, last_name } = req.body;

      if (!school_id || !first_name || !last_name) {
        return res.status(400).json({ error: 'school_id, first_name, and last_name required' });
      }

      const student = await KanchoStudent.create({
        ...req.body,
        status: req.body.status || 'active',
        churn_risk: 'low',
        churn_risk_score: 0,
        enrollment_date: req.body.enrollment_date || new Date()
      });

      // Update school active_students count
      await KanchoSchool.increment('active_students', { where: { id: school_id } });

      res.status(201).json({ success: true, data: student });
    } catch (error) {
      console.error('Error creating student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/students/:id - Update student
  router.put('/:id', async (req, res) => {
    try {
      const student = await KanchoStudent.findByPk(req.params.id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      await student.update({
        ...req.body,
        updated_at: new Date()
      });

      res.json({ success: true, data: student });
    } catch (error) {
      console.error('Error updating student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/students/:id - Delete student
  router.delete('/:id', async (req, res) => {
    try {
      const student = await KanchoStudent.findByPk(req.params.id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const school_id = student.school_id;
      const studentId = student.id;

      // Cascade delete related records
      await KanchoAttendance.destroy({ where: { student_id: studentId } });
      await KanchoClassEnrollment.destroy({ where: { student_id: studentId } });
      await KanchoRevenue.destroy({ where: { student_id: studentId } });
      await KanchoStudentAuth.destroy({ where: { student_id: studentId } });

      await student.destroy();

      // Update school active_students count
      await KanchoSchool.decrement('active_students', { where: { id: school_id } });

      res.json({ success: true, message: 'Student deleted' });
    } catch (error) {
      console.error('Error deleting student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
