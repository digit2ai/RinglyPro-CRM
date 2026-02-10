// spark-ai/src/routes/leads.js
// CRUD routes for leads/prospects

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');

module.exports = (models) => {
  const { SparkLead, SparkSchool, SparkStudent } = models;

  // GET /api/v1/leads - List leads for school
  router.get('/', async (req, res) => {
    try {
      const { school_id, status, temperature, limit = 50, offset = 0 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const where = { school_id };
      if (status) where.status = status;
      if (temperature) where.temperature = temperature;

      const leads = await SparkLead.findAndCountAll({
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

  // GET /api/v1/leads/pipeline - Get leads grouped by status (for kanban view)
  router.get('/pipeline', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const pipeline = {
        new: [],
        contacted: [],
        trial_scheduled: [],
        trial_completed: [],
        follow_up: []
      };

      const leads = await SparkLead.findAll({
        where: {
          school_id,
          status: { [Op.notIn]: ['converted', 'lost', 'unresponsive'] }
        },
        order: [['lead_score', 'DESC']]
      });

      leads.forEach(lead => {
        if (pipeline[lead.status]) {
          pipeline[lead.status].push(lead);
        }
      });

      res.json({ success: true, data: pipeline });
    } catch (error) {
      console.error('Error fetching lead pipeline:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/leads/hot - Get hot leads needing follow-up
  router.get('/hot', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const hotLeads = await SparkLead.findAll({
        where: {
          school_id,
          temperature: 'hot',
          status: { [Op.notIn]: ['converted', 'lost'] }
        },
        order: [['lead_score', 'DESC']],
        limit: 20
      });

      res.json({ success: true, data: hotLeads });
    } catch (error) {
      console.error('Error fetching hot leads:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/leads/follow-up-today - Get leads needing follow-up today
  router.get('/follow-up-today', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const leads = await SparkLead.findAll({
        where: {
          school_id,
          follow_up_date: { [Op.between]: [today, tomorrow] },
          status: { [Op.notIn]: ['converted', 'lost'] }
        },
        order: [['lead_score', 'DESC']]
      });

      res.json({ success: true, data: leads });
    } catch (error) {
      console.error('Error fetching follow-up leads:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/leads/stats - Get lead statistics
  router.get('/stats', async (req, res) => {
    try {
      const { school_id } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const [
        total,
        newLeads,
        hot,
        warm,
        cold,
        converted,
        lost,
        recentLeads
      ] = await Promise.all([
        SparkLead.count({ where: { school_id } }),
        SparkLead.count({ where: { school_id, status: 'new' } }),
        SparkLead.count({ where: { school_id, temperature: 'hot' } }),
        SparkLead.count({ where: { school_id, temperature: 'warm' } }),
        SparkLead.count({ where: { school_id, temperature: 'cold' } }),
        SparkLead.count({ where: { school_id, status: 'converted' } }),
        SparkLead.count({ where: { school_id, status: 'lost' } }),
        SparkLead.count({
          where: {
            school_id,
            created_at: { [Op.gte]: thirtyDaysAgo }
          }
        })
      ]);

      const conversionRate = (total - lost) > 0 ? ((converted / (total - lost)) * 100).toFixed(1) : 0;

      res.json({
        success: true,
        data: {
          total,
          by_status: { new: newLeads, converted, lost },
          by_temperature: { hot, warm, cold },
          recent_30_days: recentLeads,
          conversion_rate: conversionRate
        }
      });
    } catch (error) {
      console.error('Error fetching lead stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/leads/:id - Get single lead
  router.get('/:id', async (req, res) => {
    try {
      const lead = await SparkLead.findByPk(req.params.id, {
        include: [
          { model: SparkSchool, as: 'school', attributes: ['id', 'name'] },
          { model: SparkStudent, as: 'convertedStudent' }
        ]
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

  // POST /api/v1/leads - Create new lead
  router.post('/', async (req, res) => {
    try {
      const { school_id, first_name, ...data } = req.body;

      if (!school_id || !first_name) {
        return res.status(400).json({ error: 'school_id and first_name required' });
      }

      // Calculate initial lead score based on available data
      let leadScore = 50;
      if (data.phone) leadScore += 15;
      if (data.email) leadScore += 10;
      if (data.interest) leadScore += 10;
      if (data.source === 'referral') leadScore += 15;

      const lead = await SparkLead.create({
        school_id,
        first_name,
        lead_score: Math.min(leadScore, 100),
        ...data
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
      const lead = await SparkLead.findByPk(req.params.id);

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      await lead.update({ ...req.body, updated_at: new Date() });
      res.json({ success: true, data: lead });
    } catch (error) {
      console.error('Error updating lead:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/leads/:id/convert - Convert lead to student
  router.post('/:id/convert', async (req, res) => {
    try {
      const lead = await SparkLead.findByPk(req.params.id);

      if (!lead) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      // Create student from lead
      const student = await SparkStudent.create({
        school_id: lead.school_id,
        first_name: lead.first_name,
        last_name: lead.last_name || '',
        email: lead.email,
        phone: lead.phone,
        enrollment_date: new Date(),
        status: 'active',
        notes: `Converted from lead. Original source: ${lead.source || 'unknown'}`,
        ...req.body
      });

      // Update lead as converted
      await lead.update({
        status: 'converted',
        converted_to_student_id: student.id,
        conversion_date: new Date(),
        updated_at: new Date()
      });

      // Update school counts
      await SparkSchool.increment('active_students', { where: { id: lead.school_id } });

      res.json({ success: true, data: { lead, student } });
    } catch (error) {
      console.error('Error converting lead:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // DELETE /api/v1/leads/:id - Delete lead
  router.delete('/:id', async (req, res) => {
    try {
      const lead = await SparkLead.findByPk(req.params.id);

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
