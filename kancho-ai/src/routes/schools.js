// kancho-ai/src/routes/schools.js
// Schools CRUD routes for Kancho AI

const express = require('express');
const router = express.Router();

module.exports = (models) => {
  const { KanchoSchool } = models;

  // GET /api/v1/schools - List all schools
  router.get('/', async (req, res) => {
    try {
      const { tenant_id } = req.query;

      const where = {};
      if (tenant_id) where.tenant_id = tenant_id;

      const schools = await KanchoSchool.findAll({
        where,
        order: [['name', 'ASC']]
      });

      res.json({ success: true, data: schools });
    } catch (error) {
      console.error('Error fetching schools:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/schools/:id - Get single school
  router.get('/:id', async (req, res) => {
    try {
      const school = await KanchoSchool.findByPk(req.params.id);

      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      res.json({ success: true, data: school });
    } catch (error) {
      console.error('Error fetching school:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/schools - Create school
  router.post('/', async (req, res) => {
    try {
      const {
        tenant_id,
        name,
        owner_name,
        owner_email,
        owner_phone,
        address,
        city,
        state,
        zip,
        martial_art_type,
        monthly_revenue_target,
        student_capacity,
        plan_type,
        voice_agent
      } = req.body;

      if (!tenant_id || !name) {
        return res.status(400).json({ error: 'tenant_id and name required' });
      }

      const school = await KanchoSchool.create({
        tenant_id,
        name,
        owner_name,
        owner_email,
        owner_phone,
        address,
        city,
        state,
        zip,
        martial_art_type,
        monthly_revenue_target: monthly_revenue_target || 0,
        student_capacity: student_capacity || 100,
        plan_type: plan_type || 'starter',
        voice_agent: voice_agent || 'kancho',
        status: 'trial',
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) // 14 days
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
      const school = await KanchoSchool.findByPk(req.params.id);

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
      const school = await KanchoSchool.findByPk(req.params.id);

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
