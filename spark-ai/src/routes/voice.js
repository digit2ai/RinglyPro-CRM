// spark-ai/src/routes/voice.js
// Voice AI webhook routes for Spark AI Voice Agent (ElevenLabs Integration)

const express = require('express');
const router = express.Router();

module.exports = (models) => {
  const { SparkSchool, SparkLead, SparkStudent, SparkAiCall, SparkClass } = models;

  // =====================================================
  // ELEVENLABS TOOLS - Webhook endpoints for agent tools
  // These are called by the ElevenLabs agent during conversations
  // =====================================================

  // Tool: lookup_member - Get member/student information by phone
  router.post('/tools/lookup_member', async (req, res) => {
    try {
      const { phone_number, school_id } = req.body;

      if (!phone_number) {
        return res.json({
          success: false,
          message: "I couldn't find that phone number. Could you please verify it?"
        });
      }

      // Normalize phone number (remove non-digits)
      const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);

      const where = {};
      if (school_id) where.school_id = school_id;

      // Search by phone (last 10 digits match)
      const students = await SparkStudent.findAll({
        where,
        limit: 10
      });

      // Find matching student
      const student = students.find(s =>
        s.phone && s.phone.replace(/\D/g, '').slice(-10) === normalizedPhone
      );

      if (!student) {
        return res.json({
          success: false,
          member_found: false,
          message: "I don't see this number in our member records. This might be a new lead."
        });
      }

      // Get school name
      const school = await SparkSchool.findByPk(student.school_id);

      res.json({
        success: true,
        member_found: true,
        member: {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          email: student.email,
          phone: student.phone,
          belt_rank: student.belt_rank,
          membership_type: student.membership_type,
          monthly_rate: student.monthly_rate,
          status: student.status,
          churn_risk: student.churn_risk,
          churn_risk_score: student.churn_risk_score,
          last_attendance: student.last_attendance,
          attendance_streak: student.attendance_streak,
          total_classes: student.total_classes,
          enrollment_date: student.enrollment_date,
          payment_status: student.payment_status
        },
        school_name: school?.name || 'Unknown School'
      });
    } catch (error) {
      console.error('lookup_member error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Tool: lookup_lead - Get lead information by phone
  router.post('/tools/lookup_lead', async (req, res) => {
    try {
      const { phone_number, school_id } = req.body;

      if (!phone_number) {
        return res.json({ success: false, message: "Phone number required" });
      }

      const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);

      const where = {};
      if (school_id) where.school_id = school_id;

      const leads = await SparkLead.findAll({ where, limit: 50 });
      const lead = leads.find(l =>
        l.phone && l.phone.replace(/\D/g, '').slice(-10) === normalizedPhone
      );

      if (!lead) {
        return res.json({
          success: false,
          lead_found: false,
          message: "I don't have a record for this phone number. This could be a new inquiry."
        });
      }

      const school = await SparkSchool.findByPk(lead.school_id);

      res.json({
        success: true,
        lead_found: true,
        lead: {
          id: lead.id,
          first_name: lead.first_name,
          last_name: lead.last_name,
          email: lead.email,
          phone: lead.phone,
          source: lead.source,
          interest: lead.interest,
          status: lead.status,
          lead_score: lead.lead_score,
          temperature: lead.temperature,
          trial_date: lead.trial_date,
          trial_completed: lead.trial_completed,
          contact_attempts: lead.contact_attempts,
          last_contact_date: lead.last_contact_date,
          notes: lead.notes
        },
        school_name: school?.name || 'Unknown School'
      });
    } catch (error) {
      console.error('lookup_lead error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Tool: schedule_trial - Book a trial class for a lead
  router.post('/tools/schedule_trial', async (req, res) => {
    try {
      const { lead_id, phone_number, school_id, trial_date, trial_time, program } = req.body;

      let lead;

      if (lead_id) {
        lead = await SparkLead.findByPk(lead_id);
      } else if (phone_number && school_id) {
        const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);
        const leads = await SparkLead.findAll({ where: { school_id }, limit: 50 });
        lead = leads.find(l => l.phone && l.phone.replace(/\D/g, '').slice(-10) === normalizedPhone);
      }

      if (!lead) {
        return res.json({
          success: false,
          message: "I couldn't find this lead in our system. Let me collect their information first."
        });
      }

      // Parse and validate trial date/time
      let trialDateTime;
      try {
        if (trial_date && trial_time) {
          trialDateTime = new Date(`${trial_date} ${trial_time}`);
        } else if (trial_date) {
          trialDateTime = new Date(trial_date);
        } else {
          // Default to tomorrow at 6pm if no date specified
          trialDateTime = new Date();
          trialDateTime.setDate(trialDateTime.getDate() + 1);
          trialDateTime.setHours(18, 0, 0, 0);
        }
      } catch (e) {
        trialDateTime = new Date();
        trialDateTime.setDate(trialDateTime.getDate() + 1);
        trialDateTime.setHours(18, 0, 0, 0);
      }

      // Update lead with trial info
      await lead.update({
        status: 'trial_scheduled',
        temperature: 'hot',
        trial_date: trialDateTime,
        interest: program || lead.interest,
        last_contact_date: new Date(),
        updated_at: new Date()
      });

      const school = await SparkSchool.findByPk(lead.school_id);

      res.json({
        success: true,
        message: `Trial scheduled successfully for ${lead.first_name}`,
        trial_details: {
          lead_id: lead.id,
          lead_name: `${lead.first_name} ${lead.last_name || ''}`.trim(),
          trial_date: trialDateTime.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
          trial_time: trialDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          program: program || lead.interest || 'General Trial',
          school_name: school?.name || 'the academy',
          confirmation: `Your trial class is confirmed for ${trialDateTime.toLocaleDateString('en-US', { weekday: 'long' })} at ${trialDateTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}. Please arrive 10 minutes early wearing comfortable workout clothes.`
        }
      });
    } catch (error) {
      console.error('schedule_trial error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Tool: update_member_status - Update a member's information or status
  router.post('/tools/update_member', async (req, res) => {
    try {
      const { member_id, phone_number, school_id, updates } = req.body;

      let student;

      if (member_id) {
        student = await SparkStudent.findByPk(member_id);
      } else if (phone_number && school_id) {
        const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);
        const students = await SparkStudent.findAll({ where: { school_id }, limit: 50 });
        student = students.find(s => s.phone && s.phone.replace(/\D/g, '').slice(-10) === normalizedPhone);
      }

      if (!student) {
        return res.json({ success: false, message: "Member not found" });
      }

      const allowedUpdates = {};

      // Only allow certain fields to be updated
      if (updates.notes) {
        allowedUpdates.notes = `${student.notes || ''}\n[Spark AI ${new Date().toLocaleDateString()}]: ${updates.notes}`;
      }
      if (updates.churn_risk) allowedUpdates.churn_risk = updates.churn_risk;
      if (updates.membership_type) allowedUpdates.membership_type = updates.membership_type;
      if (updates.status) allowedUpdates.status = updates.status;

      allowedUpdates.updated_at = new Date();

      await student.update(allowedUpdates);

      res.json({
        success: true,
        message: `Updated ${student.first_name}'s record`,
        member: {
          id: student.id,
          first_name: student.first_name,
          last_name: student.last_name,
          status: student.status,
          churn_risk: student.churn_risk
        }
      });
    } catch (error) {
      console.error('update_member error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Tool: create_lead - Create a new lead from cold call or inquiry
  router.post('/tools/create_lead', async (req, res) => {
    try {
      const { school_id, first_name, last_name, phone_number, email, interest, source, notes } = req.body;

      if (!school_id || !first_name || !phone_number) {
        return res.json({
          success: false,
          message: "I need at least the first name and phone number to create a lead."
        });
      }

      // Check if lead already exists
      const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);
      const existingLeads = await SparkLead.findAll({ where: { school_id }, limit: 100 });
      const existingLead = existingLeads.find(l =>
        l.phone && l.phone.replace(/\D/g, '').slice(-10) === normalizedPhone
      );

      if (existingLead) {
        return res.json({
          success: true,
          message: `${first_name} is already in our system`,
          lead_exists: true,
          lead: {
            id: existingLead.id,
            first_name: existingLead.first_name,
            last_name: existingLead.last_name,
            status: existingLead.status
          }
        });
      }

      // Create new lead
      const lead = await SparkLead.create({
        school_id,
        first_name,
        last_name: last_name || '',
        phone: phone_number,
        email: email || null,
        interest: interest || 'General Inquiry',
        source: source || 'Phone Call - Spark AI',
        status: 'new',
        temperature: 'warm',
        lead_score: 60,
        contact_attempts: 1,
        last_contact_date: new Date(),
        notes: notes || 'Lead created via Spark AI voice call',
        created_at: new Date(),
        updated_at: new Date()
      });

      res.json({
        success: true,
        message: `Great! I've added ${first_name} to our system`,
        lead_created: true,
        lead: {
          id: lead.id,
          first_name: lead.first_name,
          last_name: lead.last_name,
          phone: lead.phone,
          status: lead.status
        }
      });
    } catch (error) {
      console.error('create_lead error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Tool: get_class_schedule - Get available class times
  router.post('/tools/get_classes', async (req, res) => {
    try {
      const { school_id, program_type, day_of_week } = req.body;

      if (!school_id) {
        return res.json({ success: false, message: "School ID required" });
      }

      const where = { school_id, is_active: true };
      if (program_type) where.program_type = program_type;

      const classes = await SparkClass.findAll({
        where,
        order: [['name', 'ASC']],
        limit: 20
      });

      if (classes.length === 0) {
        // Return default schedule if no classes defined
        return res.json({
          success: true,
          classes: [],
          default_schedule: {
            weekdays: "Monday through Friday at 6:00 AM, 12:00 PM, 5:30 PM, and 7:00 PM",
            saturday: "Saturday at 9:00 AM and 11:00 AM",
            sunday: "Sunday at 10:00 AM",
            recommendation: "Our evening classes at 5:30 PM and 7:00 PM are most popular for working adults"
          }
        });
      }

      res.json({
        success: true,
        classes: classes.map(c => ({
          id: c.id,
          name: c.name,
          program_type: c.program_type,
          level: c.level,
          instructor: c.instructor,
          schedule: c.schedule,
          duration_minutes: c.duration_minutes,
          capacity: c.capacity
        }))
      });
    } catch (error) {
      console.error('get_classes error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Tool: log_call_outcome - Log the outcome of the current call
  router.post('/tools/log_call', async (req, res) => {
    try {
      const {
        school_id,
        call_type,
        phone_number,
        lead_id,
        member_id,
        outcome,
        sentiment,
        summary,
        action_items,
        next_steps
      } = req.body;

      if (!school_id || !call_type) {
        return res.json({ success: false, message: "School ID and call type required" });
      }

      // Create AI call log
      const aiCall = await SparkAiCall.create({
        school_id,
        agent: 'sensei', // or determine from context
        call_type,
        direction: 'outbound',
        phone_number,
        lead_id: lead_id || null,
        student_id: member_id || null,
        status: 'completed',
        outcome: outcome || 'completed',
        sentiment: sentiment || 'neutral',
        summary: summary || 'Call completed via Spark AI',
        action_items: action_items || [],
        metadata: { next_steps },
        created_at: new Date()
      });

      // Update lead if applicable
      if (lead_id) {
        const lead = await SparkLead.findByPk(lead_id);
        if (lead) {
          const updates = {
            last_contact_date: new Date(),
            contact_attempts: lead.contact_attempts + 1,
            ai_notes: summary,
            updated_at: new Date()
          };

          if (outcome === 'trial_booked') {
            updates.status = 'trial_scheduled';
            updates.temperature = 'hot';
          } else if (outcome === 'callback_requested') {
            updates.status = 'follow_up';
          } else if (outcome === 'not_interested') {
            updates.temperature = 'cold';
            updates.status = 'lost';
            updates.lost_reason = summary;
          }

          await lead.update(updates);
        }
      }

      // Update member if applicable
      if (member_id) {
        const student = await SparkStudent.findByPk(member_id);
        if (student && call_type === 'retention') {
          const updates = {
            notes: `${student.notes || ''}\n[Spark AI ${new Date().toLocaleDateString()}]: ${summary}`,
            updated_at: new Date()
          };

          if (sentiment === 'positive' && ['issue_resolved', 'staying', 'reactivated'].includes(outcome)) {
            updates.churn_risk = 'low';
            updates.churn_risk_score = Math.max(0, student.churn_risk_score - 25);
          }

          await student.update(updates);
        }
      }

      res.json({
        success: true,
        message: "Call logged successfully",
        call_id: aiCall.id
      });
    } catch (error) {
      console.error('log_call error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Tool: get_school_info - Get school details for context
  router.post('/tools/get_school', async (req, res) => {
    try {
      const { school_id } = req.body;

      if (!school_id) {
        return res.json({ success: false, message: "School ID required" });
      }

      const school = await SparkSchool.findByPk(school_id);

      if (!school) {
        return res.json({ success: false, message: "School not found" });
      }

      res.json({
        success: true,
        school: {
          id: school.id,
          name: school.name,
          owner_name: school.owner_name,
          martial_art_type: school.martial_art_type,
          address: school.address,
          city: school.city,
          state: school.state,
          phone: school.owner_phone,
          website: school.website,
          timezone: school.timezone
        }
      });
    } catch (error) {
      console.error('get_school error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // Tool: check_payment_status - Check member payment status
  router.post('/tools/check_payment', async (req, res) => {
    try {
      const { member_id, phone_number, school_id } = req.body;

      let student;

      if (member_id) {
        student = await SparkStudent.findByPk(member_id);
      } else if (phone_number && school_id) {
        const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);
        const students = await SparkStudent.findAll({ where: { school_id }, limit: 50 });
        student = students.find(s => s.phone && s.phone.replace(/\D/g, '').slice(-10) === normalizedPhone);
      }

      if (!student) {
        return res.json({ success: false, message: "Member not found" });
      }

      res.json({
        success: true,
        payment_info: {
          member_id: student.id,
          member_name: `${student.first_name} ${student.last_name}`,
          payment_status: student.payment_status,
          monthly_rate: student.monthly_rate,
          last_payment_date: student.last_payment_date,
          membership_type: student.membership_type,
          status: student.status,
          is_past_due: student.payment_status === 'past_due' || student.payment_status === 'failed'
        }
      });
    } catch (error) {
      console.error('check_payment error:', error);
      res.json({ success: false, error: error.message });
    }
  });

  // =====================================================
  // END ELEVENLABS TOOLS
  // =====================================================

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

  // =====================================================
  // WEBRTC TOKEN ENDPOINT - For browser-based voice chat
  // =====================================================

  // Spark Agent Configuration
  const SPARK_AGENT_ID = 'agent_5601kh453hqqfz59nfemkwk02vax';
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

  // POST /api/v1/voice/webrtc-token - Get WebRTC token for Spark voice chat
  router.post('/webrtc-token', async (req, res) => {
    try {
      const { school_id, language } = req.body;

      if (!ELEVENLABS_API_KEY) {
        console.error('[Spark Voice] ELEVENLABS_API_KEY not configured');
        return res.status(500).json({
          success: false,
          error: 'Voice service not configured'
        });
      }

      // Get school info for context
      let schoolName = 'your martial arts school';
      let schoolData = {};
      if (school_id) {
        const school = await SparkSchool.findByPk(school_id);
        if (school) {
          schoolName = school.name;
          schoolData = {
            school_id: school.id,
            school_name: school.name,
            owner_name: school.owner_name,
            martial_art_type: school.martial_art_type,
            city: school.city,
            state: school.state
          };
        }
      }

      console.log(`[Spark Voice] Requesting WebRTC token for school: ${schoolName}`);

      // Request signed URL from ElevenLabs
      const response = await fetch(
        `${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(SPARK_AGENT_ID)}`,
        {
          method: 'GET',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Spark Voice] Failed to get signed URL: ${response.status} - ${errorText}`);
        return res.status(response.status).json({
          success: false,
          error: 'Failed to initialize voice connection'
        });
      }

      const data = await response.json();

      console.log(`[Spark Voice] Successfully generated signed URL for: ${schoolName}`);

      return res.json({
        success: true,
        signed_url: data.signed_url,
        agent_id: SPARK_AGENT_ID,
        school_name: schoolName,
        dynamic_variables: {
          school_id: parseInt(school_id, 10) || 0,  // Must be NUMBER for ElevenLabs tools
          school_name: schoolName,
          language: language || 'en',
          ...schoolData
        }
      });

    } catch (error) {
      console.error('[Spark Voice] Token generation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  return router;
};
