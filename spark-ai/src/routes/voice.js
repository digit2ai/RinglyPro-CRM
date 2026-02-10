// spark-ai/src/routes/voice.js
// Voice AI webhook routes for Sensei/Maestro agents

const express = require('express');
const router = express.Router();

module.exports = (models) => {
  const { SparkSchool, SparkLead, SparkStudent, SparkAiCall } = models;

  // POST /api/v1/voice/webhook - Receive call events from voice AI
  router.post('/webhook', async (req, res) => {
    try {
      const {
        school_id,
        agent,
        call_type,
        direction,
        phone_number,
        lead_id,
        student_id,
        duration_seconds,
        status,
        outcome,
        sentiment,
        transcript,
        summary,
        action_items,
        recording_url,
        external_call_id,
        metadata
      } = req.body;

      if (!school_id || !agent || !call_type || !direction || !status) {
        return res.status(400).json({
          error: 'school_id, agent, call_type, direction, and status required'
        });
      }

      // Log the AI call
      const aiCall = await SparkAiCall.create({
        school_id,
        agent,
        call_type,
        direction,
        phone_number,
        lead_id,
        student_id,
        duration_seconds: duration_seconds || 0,
        status,
        outcome,
        sentiment: sentiment || 'neutral',
        transcript,
        summary,
        action_items: action_items || [],
        recording_url,
        external_call_id,
        metadata: metadata || {}
      });

      // Update lead/student based on outcome
      if (lead_id && outcome) {
        const lead = await SparkLead.findByPk(lead_id);
        if (lead) {
          const updates = {
            last_contact_date: new Date(),
            contact_attempts: lead.contact_attempts + 1,
            ai_notes: summary || transcript?.substring(0, 500),
            updated_at: new Date()
          };

          // Update status based on outcome
          if (outcome === 'trial_booked') {
            updates.status = 'trial_scheduled';
            updates.temperature = 'hot';
          } else if (outcome === 'callback_scheduled') {
            updates.status = 'follow_up';
          } else if (outcome === 'not_interested') {
            updates.temperature = 'cold';
          } else if (outcome === 'voicemail') {
            // Keep status, just log contact attempt
          }

          await lead.update(updates);
        }
      }

      if (student_id && outcome) {
        const student = await SparkStudent.findByPk(student_id);
        if (student) {
          const updates = {
            notes: `${student.notes || ''}\n[AI Call ${new Date().toLocaleDateString()}]: ${summary || outcome}`,
            updated_at: new Date()
          };

          // Update churn risk if retention call was successful
          if (call_type === 'retention' && sentiment === 'positive') {
            updates.churn_risk = 'low';
            updates.churn_risk_score = Math.max(0, student.churn_risk_score - 20);
          }

          await student.update(updates);
        }
      }

      res.json({ success: true, data: aiCall });
    } catch (error) {
      console.error('Error processing voice webhook:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/voice/calls - Get AI call history
  router.get('/calls', async (req, res) => {
    try {
      const { school_id, agent, call_type, status, limit = 50, offset = 0 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const where = { school_id };
      if (agent) where.agent = agent;
      if (call_type) where.call_type = call_type;
      if (status) where.status = status;

      const calls = await SparkAiCall.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        include: [
          { model: SparkLead, as: 'lead', attributes: ['id', 'first_name', 'last_name'] },
          { model: SparkStudent, as: 'student', attributes: ['id', 'first_name', 'last_name'] }
        ]
      });

      res.json({
        success: true,
        data: calls.rows,
        total: calls.count,
        limit: parseInt(limit),
        offset: parseInt(offset)
      });
    } catch (error) {
      console.error('Error fetching AI calls:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/v1/voice/stats - Get AI call statistics
  router.get('/stats', async (req, res) => {
    try {
      const { school_id, days = 30 } = req.query;

      if (!school_id) {
        return res.status(400).json({ error: 'school_id required' });
      }

      const { Op } = require('sequelize');
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const [
        totalCalls,
        completedCalls,
        senseiCalls,
        maestroCalls,
        avgDuration,
        byOutcome,
        bySentiment
      ] = await Promise.all([
        SparkAiCall.count({ where: { school_id, created_at: { [Op.gte]: startDate } } }),
        SparkAiCall.count({ where: { school_id, status: 'completed', created_at: { [Op.gte]: startDate } } }),
        SparkAiCall.count({ where: { school_id, agent: 'sensei', created_at: { [Op.gte]: startDate } } }),
        SparkAiCall.count({ where: { school_id, agent: 'maestro', created_at: { [Op.gte]: startDate } } }),
        SparkAiCall.aggregate('duration_seconds', 'avg', {
          where: { school_id, status: 'completed', created_at: { [Op.gte]: startDate } }
        }),
        SparkAiCall.findAll({
          where: { school_id, created_at: { [Op.gte]: startDate } },
          attributes: [
            'outcome',
            [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
          ],
          group: ['outcome']
        }),
        SparkAiCall.findAll({
          where: { school_id, created_at: { [Op.gte]: startDate } },
          attributes: [
            'sentiment',
            [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
          ],
          group: ['sentiment']
        })
      ]);

      res.json({
        success: true,
        data: {
          total_calls: totalCalls,
          completed_calls: completedCalls,
          completion_rate: totalCalls > 0 ? ((completedCalls / totalCalls) * 100).toFixed(1) : 0,
          by_agent: { sensei: senseiCalls, maestro: maestroCalls },
          avg_duration_seconds: Math.round(avgDuration || 0),
          by_outcome: byOutcome.reduce((acc, row) => {
            acc[row.outcome || 'unknown'] = parseInt(row.dataValues.count);
            return acc;
          }, {}),
          by_sentiment: bySentiment.reduce((acc, row) => {
            acc[row.sentiment] = parseInt(row.dataValues.count);
            return acc;
          }, {})
        }
      });
    } catch (error) {
      console.error('Error fetching voice stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // POST /api/v1/voice/trigger - Trigger an outbound AI call
  router.post('/trigger', async (req, res) => {
    try {
      const { school_id, agent, call_type, lead_id, student_id, phone_number } = req.body;

      if (!school_id || !agent || !call_type) {
        return res.status(400).json({ error: 'school_id, agent, and call_type required' });
      }

      if (!lead_id && !student_id && !phone_number) {
        return res.status(400).json({ error: 'lead_id, student_id, or phone_number required' });
      }

      // Get school for configuration
      const school = await SparkSchool.findByPk(school_id);
      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      // Get phone number from lead/student if not provided
      let targetPhone = phone_number;
      let targetName = 'Unknown';

      if (lead_id && !targetPhone) {
        const lead = await SparkLead.findByPk(lead_id);
        if (lead) {
          targetPhone = lead.phone;
          targetName = `${lead.first_name} ${lead.last_name || ''}`.trim();
        }
      }

      if (student_id && !targetPhone) {
        const student = await SparkStudent.findByPk(student_id);
        if (student) {
          targetPhone = student.phone;
          targetName = `${student.first_name} ${student.last_name}`.trim();
        }
      }

      if (!targetPhone) {
        return res.status(400).json({ error: 'No phone number available for this target' });
      }

      // TODO: Integrate with ElevenLabs/Twilio to initiate call
      // For now, log the trigger request
      console.log(`Triggering ${agent} call to ${targetPhone} for ${call_type}`);

      res.json({
        success: true,
        message: 'Call trigger queued',
        data: {
          school_id,
          agent,
          call_type,
          phone_number: targetPhone,
          target_name: targetName,
          lead_id,
          student_id
        }
      });
    } catch (error) {
      console.error('Error triggering voice call:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
};
