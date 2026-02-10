// spark-ai/src/routes/students.js
// CRUD routes for students/members

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { SparkStudent, SparkSchool } = models;

  // GET /api/v1/students - List students for school
  router.get('/', async (req, res) => {
    try {
      const { school_id, status, churn_risk, belt_rank, limit = 50, offset = 0 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const where = { school_id };
      if (status) where.status = status;
      if (churn_risk) where.churn_risk = churn_risk;
      if (belt_rank) where.belt_rank = belt_rank;

      const students = await SparkStudent.findAndCountAll({
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

  // GET /api/v1/students/at-risk - Get students at risk of churning
  router.get('/at-risk', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const atRiskStudents = await SparkStudent.findAll({
        where: {
          school_id,
          status: 'active',
          churn_risk: { [Op.in]: ['high', 'critical'] }
        },
        order: [['churn_risk_score', 'DESC']],
        limit: 20
      });

      res.json({ success: true, data: atRiskStudents });
    } catch (error) {
      console.error('Error fetching at-risk students:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/students/stats - Get student statistics
  router.get('/stats', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const [
        total,
        active,
        inactive,
        frozen,
        cancelled,
        lowRisk,
        mediumRisk,
        highRisk,
        criticalRisk
      ] = await Promise.all([
        SparkStudent.count({ where: { school_id } }),
        SparkStudent.count({ where: { school_id, status: 'active' } }),
        SparkStudent.count({ where: { school_id, status: 'inactive' } }),
        SparkStudent.count({ where: { school_id, status: 'frozen' } }),
        SparkStudent.count({ where: { school_id, status: 'cancelled' } }),
        SparkStudent.count({ where: { school_id, churn_risk: 'low' } }),
        SparkStudent.count({ where: { school_id, churn_risk: 'medium' } }),
        SparkStudent.count({ where: { school_id, churn_risk: 'high' } }),
        SparkStudent.count({ where: { school_id, churn_risk: 'critical' } })
      ]);

      res.json({
        success: true,
        data: {
          total,
          by_status: { active, inactive, frozen, cancelled },
          by_churn_risk: { low: lowRisk, medium: mediumRisk, high: highRisk, critical: criticalRisk },
          retention_rate: total > 0 ? ((active / total) * 100).toFixed(1) : 0
        }
      });
    } catch (error) {
      console.error('Error fetching student stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/students/:id - Get single student
  router.get('/:id', async (req, res) => {
    try {
      const student = await SparkStudent.findByPk(req.params.id, {
        include: [{ model: SparkSchool, as: 'school', attributes: ['id', 'name'] }]
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

  // POST /api/v1/students - Create new student
  router.post('/', async (req, res) => {
    try {
      const { school_id, first_name, last_name, ...data } = req.body;

      if (!school_id || !first_name || !last_name) {
        return res.status(400).json({ error: 'school_id, first_name, and last_name required' });
      }

      const student = await SparkStudent.create({
        school_id,
        first_name,
        last_name,
        enrollment_date: new Date(),
        ...data
      });

      // Update school's active_students count
      await SparkSchool.increment('active_students', { where: { id: school_id } });

      res.status(201).json({ success: true, data: student });
    } catch (error) {
      console.error('Error creating student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/students/:id - Update student
  router.put('/:id', async (req, res) => {
    try {
      const student = await SparkStudent.findByPk(req.params.id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const oldStatus = student.status;
      await student.update({ ...req.body, updated_at: new Date() });

      // Update school counts if status changed
      if (oldStatus !== student.status) {
        if (oldStatus === 'active' && student.status !== 'active') {
          await SparkSchool.decrement('active_students', { where: { id: student.school_id } });
        } else if (oldStatus !== 'active' && student.status === 'active') {
          await SparkSchool.increment('active_students', { where: { id: student.school_id } });
        }
      }

      res.json({ success: true, data: student });
    } catch (error) {
      console.error('Error updating student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/students/:id - Delete student
  router.delete('/:id', async (req, res) => {
    try {
      const student = await SparkStudent.findByPk(req.params.id);

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      if (student.status === 'active') {
        await SparkSchool.decrement('active_students', { where: { id: student.school_id } });
      }

      await student.destroy();
      res.json({ success: true, message: 'Student deleted' });
    } catch (error) {
      console.error('Error deleting student:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
