// kancho-ai/src/routes/leads.js
// Leads CRUD routes for Kancho AI

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { KanchoLead, KanchoSchool } = models;

  // GET /api/v1/leads - List leads
  router.get('/', async (req, res) => {
    try {
      const { school_id, status, temperature, limit = 100, offset = 0 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const where = { school_id };
      if (status) where.status = status;
      if (temperature) where.temperature = temperature;

      const leads = await KanchoLead.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['lead_score', 'DESC'], ['created_at', 'DESC']]
      });

      res.json({
        success: true,
        data: leads.rows,
        total: leads.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('Error fetching leads:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/leads/hot - Get hot leads
  router.get('/hot', async (req, res) => {
    try {
      const { school_id, limit = 20 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const leads = await KanchoLead.findAll({
        where: {
          school_id,
          temperature: 'hot',
          status: { [Op.notIn]: ['converted', 'lost'] }
        },
        order: [['lead_score', 'DESC']],
        limit: parseInt(limit)
      });

      res.json({ success: true, data: leads });
    } catch (error) {
      console.error('Error fetching hot leads:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/leads/follow-up - Get leads needing follow-up
  router.get('/follow-up', async (req, res) => {
    try {
      const { school_id, limit = 20 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const leads = await KanchoLead.findAll({
        where: {
          school_id,
          follow_up_date: { [Op.lte]: today },
          status: { [Op.notIn]: ['converted', 'lost'] }
        },
        order: [['follow_up_date', 'ASC']],
        limit: parseInt(limit)
      });

      res.json({ success: true, data: leads });
    } catch (error) {
      console.error('Error fetching follow-up leads:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/leads/:id - Get single lead
  router.get('/:id', async (req, res) => {
    try {
      const lead = await KanchoLead.findByPk(req.params.id, {
        include: [{ model: KanchoSchool, as: 'school', attributes: ['id', 'name'] }]
      });

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      res.json({ success: true, data: lead });
    } catch (error) {
      console.error('Error fetching lead:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/leads - Create lead
  router.post('/', async (req, res) => {
    try {
      const { school_id, first_name } = req.body;

      if (!school_id || !first_name) {
        return res.status(400).json({ error: 'school_id and first_name required' });
      }

      const lead = await KanchoLead.create({
        ...req.body,
        status: req.body.status || 'new',
        temperature: req.body.temperature || 'warm',
        lead_score: req.body.lead_score || 50
      });

      res.status(201).json({ success: true, data: lead });
    } catch (error) {
      console.error('Error creating lead:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // PUT /api/v1/leads/:id - Update lead
  router.put('/:id', async (req, res) => {
    try {
      const lead = await KanchoLead.findByPk(req.params.id);

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      await lead.update({
        ...req.body,
        updated_at: new Date()
      });

      res.json({ success: true, data: lead });
    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/leads/:id/convert - Convert lead to student
  router.post('/:id/convert', async (req, res) => {
    try {
      const { KanchoStudent } = models;
      const lead = await KanchoLead.findByPk(req.params.id);

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Create student from lead
      const student = await KanchoStudent.create({
        school_id: lead.school_id,
        first_name: lead.first_name,
        last_name: lead.last_name || '',
        email: lead.email,
        phone: lead.phone,
        status: 'active',
        enrollment_date: new Date(),
        membership_type: req.body.membership_type || 'Unlimited',
        monthly_rate: req.body.monthly_rate || 0,
        notes: `Converted from lead. Source: ${lead.source || 'Unknown'}`
      });

      // Update lead as converted
      await lead.update({
        status: 'converted',
        converted_to_student_id: student.id,
        conversion_date: new Date(),
        updated_at: new Date()
      });

      // Update school active_students count
      await KanchoSchool.increment('active_students', { where: { id: lead.school_id } });

      res.json({
        success: true,
        message: 'Lead converted to student',
        data: { lead, student }
      });
    } catch (error) {
      console.error('Error converting lead:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/leads/:id - Delete lead
  router.delete('/:id', async (req, res) => {
    try {
      const lead = await KanchoLead.findByPk(req.params.id);

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      await lead.destroy();

      res.json({ success: true, message: 'Lead deleted' });
    } catch (error) {
      console.error('Error deleting lead:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
