// spark-ai/src/routes/schools.js
// CRUD routes for martial arts schools

const express = require('express');
const router = express.Router();

module.exports = (models) => {
  const { SparkSchool, SparkStudent, SparkLead, SparkHealthScore } = models;

  // GET /api/v1/schools - List all schools for tenant
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      if (!tenant_id) {
        return res.status(400).json({ error: 'tenant_id required' });
      }

      const schools = await SparkSchool.findAll({
        where: { tenant_id },
        order: [['name', 'ASC']]
      });

      res.json({ success: true, data: schools });
    } catch (error) {
      console.error('Error fetching schools:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/schools/:id - Get single school with stats
  router.get('/:id', async (req, res) => {
    try {
      const school = await SparkSchool.findByPk(req.params.id, {
        include: [
          { model: SparkStudent, as: 'students', attributes: ['id', 'status'] },
          { model: SparkLead, as: 'leads', attributes: ['id', 'status', 'temperature'] }
        ]
      });

      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      // Calculate quick stats
      const stats = {
        total_students: school.students?.length || 0,
        active_students: school.students?.filter(s => s.status === 'active').length || 0,
        total_leads: school.leads?.length || 0,
        hot_leads: school.leads?.filter(l => l.temperature === 'hot').length || 0
      };

      res.json({
        success: true,
        data: {
          ...school.toJSON(),
          stats
        }
      });
    } catch (error) {
      console.error('Error fetching school:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/schools - Create new school
  router.post('/', async (req, res) => {
    try {
      const { tenant_id, name, ...data } = req.body;

      if (!tenant_id || !name) {
        return res.status(400).json({ error: 'tenant_id and name required' });
      }

      const school = await SparkSchool.create({
        tenant_id,
        name,
        ...data,
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 day trial
      });

      res.status(201).json({ success: true, data: school });
    } catch (error) {
      console.error('Error creating school:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/schools/:id - Update school
  router.put('/:id', async (req, res) => {
    try {
      const school = await SparkSchool.findByPk(req.params.id);

      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      await school.update({
        ...req.body,
        updated_at: new Date()
      });

      res.json({ success: true, data: school });
    } catch (error) {
      console.error('Error updating school:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/schools/:id - Delete school
  router.delete('/:id', async (req, res) => {
    try {
      const school = await SparkSchool.findByPk(req.params.id);

      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      await school.destroy();
      res.json({ success: true, message: 'School deleted' });
    } catch (error) {
      console.error('Error deleting school:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
