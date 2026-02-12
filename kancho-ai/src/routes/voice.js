// kancho-ai/src/routes/voice.js
// Voice AI webhook routes for Kancho AI Voice Agent (ElevenLabs Integration)

const express = require('express');
const router = express.Router();
const kanchoVoiceCallService = require('../../services/kancho-voice-call-service');

module.exports = (models) => {
  const { KanchoSchool, KanchoLead, KanchoStudent, KanchoAiCall, KanchoClass } = models;

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
      const students = await KanchoStudent.findAll({
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
      const school = await KanchoSchool.findByPk(student.school_id);

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

      const leads = await KanchoLead.findAll({ where, limit: 50 });
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

      const school = await KanchoSchool.findByPk(lead.school_id);

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
        lead = await KanchoLead.findByPk(lead_id);
      } else if (phone_number && school_id) {
        const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);
        const leads = await KanchoLead.findAll({ where: { school_id }, limit: 50 });
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

      const school = await KanchoSchool.findByPk(lead.school_id);

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
        student = await KanchoStudent.findByPk(member_id);
      } else if (phone_number && school_id) {
        const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);
        const students = await KanchoStudent.findAll({ where: { school_id }, limit: 50 });
        student = students.find(s => s.phone && s.phone.replace(/\D/g, '').slice(-10) === normalizedPhone);
      }

      if (!student) {
        return res.json({ success: false, message: "Member not found" });
      }

      const allowedUpdates = {};

      // Only allow certain fields to be updated
      if (updates.notes) {
        allowedUpdates.notes = `${student.notes || ''}\n[Kancho AI ${new Date().toLocaleDateString()}]: ${updates.notes}`;
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
      const existingLeads = await KanchoLead.findAll({ where: { school_id }, limit: 100 });
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
      const lead = await KanchoLead.create({
        school_id,
        first_name,
        last_name: last_name || '',
        phone: phone_number,
        email: email || null,
        interest: interest || 'General Inquiry',
        source: source || 'Phone Call - Kancho AI',
        status: 'new',
        temperature: 'warm',
        lead_score: 60,
        contact_attempts: 1,
        last_contact_date: new Date(),
        notes: notes || 'Lead created via Kancho AI voice call',
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

      const classes = await KanchoClass.findAll({
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
      const aiCall = await KanchoAiCall.create({
        school_id,
        agent: 'kancho',
        call_type,
        direction: 'outbound',
        phone_number,
        lead_id: lead_id || null,
        student_id: member_id || null,
        status: 'completed',
        outcome: outcome || 'completed',
        sentiment: sentiment || 'neutral',
        summary: summary || 'Call completed via Kancho AI',
        action_items: action_items || [],
        metadata: { next_steps },
        created_at: new Date()
      });

      // Update lead if applicable
      if (lead_id) {
        const lead = await KanchoLead.findByPk(lead_id);
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
        const student = await KanchoStudent.findByPk(member_id);
        if (student && call_type === 'retention') {
          const updates = {
            notes: `${student.notes || ''}\n[Kancho AI ${new Date().toLocaleDateString()}]: ${summary}`,
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

      const school = await KanchoSchool.findByPk(school_id);

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
        student = await KanchoStudent.findByPk(member_id);
      } else if (phone_number && school_id) {
        const normalizedPhone = phone_number.replace(/\D/g, '').slice(-10);
        const students = await KanchoStudent.findAll({ where: { school_id }, limit: 50 });
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
      const aiCall = await KanchoAiCall.create({
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
        const lead = await KanchoLead.findByPk(lead_id);
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
          }

          await lead.update(updates);
        }
      }

      if (student_id && outcome) {
        const student = await KanchoStudent.findByPk(student_id);
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

      const calls = await KanchoAiCall.findAndCountAll({
        where,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['created_at', 'DESC']],
        include: [
          { model: KanchoLead, as: 'lead', attributes: ['id', 'first_name', 'last_name'] },
          { model: KanchoStudent, as: 'student', attributes: ['id', 'first_name', 'last_name'] }
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
        kanchoCalls,
        maestroCalls,
        avgDuration,
        byOutcome,
        bySentiment
      ] = await Promise.all([
        KanchoAiCall.count({ where: { school_id, created_at: { [Op.gte]: startDate } } }),
        KanchoAiCall.count({ where: { school_id, status: 'completed', created_at: { [Op.gte]: startDate } } }),
        KanchoAiCall.count({ where: { school_id, agent: 'kancho', created_at: { [Op.gte]: startDate } } }),
        KanchoAiCall.count({ where: { school_id, agent: 'maestro', created_at: { [Op.gte]: startDate } } }),
        KanchoAiCall.aggregate('duration_seconds', 'avg', {
          where: { school_id, status: 'completed', created_at: { [Op.gte]: startDate } }
        }),
        KanchoAiCall.findAll({
          where: { school_id, created_at: { [Op.gte]: startDate } },
          attributes: [
            'outcome',
            [models.sequelize.fn('COUNT', models.sequelize.col('id')), 'count']
          ],
          group: ['outcome']
        }),
        KanchoAiCall.findAll({
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
          by_agent: { kancho: kanchoCalls, maestro: maestroCalls },
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
      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.status(404).json({ error: 'School not found' });
      }

      // Get phone number from lead/student if not provided
      let targetPhone = phone_number;
      let targetName = 'Unknown';

      if (lead_id && !targetPhone) {
        const lead = await KanchoLead.findByPk(lead_id);
        if (lead) {
          targetPhone = lead.phone;
          targetName = `${lead.first_name} ${lead.last_name || ''}`.trim();
        }
      }

      if (student_id && !targetPhone) {
        const student = await KanchoStudent.findByPk(student_id);
        if (student) {
          targetPhone = student.phone;
          targetName = `${student.first_name} ${student.last_name}`.trim();
        }
      }

      if (!targetPhone) {
        return res.status(400).json({ error: 'No phone number available for this target' });
      }

      // Check if Twilio is configured
      if (!kanchoVoiceCallService.isReady()) {
        return res.status(503).json({
          error: 'Voice calling service not configured',
          message: 'Please configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER'
        });
      }

      // Create KanchoAiCall record before initiating call
      const aiCall = await KanchoAiCall.create({
        school_id,
        agent,
        call_type,
        direction: 'outbound',
        phone_number: targetPhone,
        lead_id: lead_id || null,
        student_id: student_id || null,
        status: 'queued',
        metadata: {
          target_name: targetName,
          triggered_at: new Date().toISOString()
        }
      });

      try {
        // Initiate outbound call via Twilio
        const callResult = await kanchoVoiceCallService.initiateOutboundCall({
          school_id,
          phone: targetPhone,
          agent,
          call_type,
          lead_id,
          student_id,
          context: req.body.context
        });

        // Update KanchoAiCall with Twilio SID
        await aiCall.update({
          external_call_id: callResult.twilio_sid,
          status: 'initiated'
        });

        console.log(`[KanchoVoice] Outbound call initiated: ${callResult.twilio_sid} to ${targetPhone} for ${call_type}`);

        res.json({
          success: true,
          message: 'Call initiated successfully',
          data: {
            call_id: aiCall.id,
            twilio_sid: callResult.twilio_sid,
            school_id,
            agent,
            call_type,
            phone_number: targetPhone,
            target_name: targetName,
            lead_id,
            student_id,
            status: 'initiated'
          }
        });
      } catch (callError) {
        // Update call record with failure
        await aiCall.update({
          status: 'failed',
          metadata: {
            ...aiCall.metadata,
            error: callError.message,
            failed_at: new Date().toISOString()
          }
        });

        throw callError;
      }
    } catch (error) {
      console.error('Error triggering voice call:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // =====================================================
  // TWILIO WEBHOOK ENDPOINTS - For outbound call handling
  // =====================================================

  // Kancho Agent Configuration - Will need to create a new agent in ElevenLabs
  const KANCHO_AGENT_ID = process.env.KANCHO_AGENT_ID || 'agent_kancho_placeholder';
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

  // POST /api/v1/voice/twiml - Return TwiML for connecting to ElevenLabs
  router.post('/twiml', async (req, res) => {
    try {
      const { school_id, agent, call_type, lead_id, student_id, context } = req.query;
      const { CallSid, To, From, CallStatus } = req.body;

      console.log(`[KanchoVoice] TwiML request: CallSid=${CallSid}, Status=${CallStatus}`);

      // Get school info for personalization
      let schoolName = 'the martial arts school';
      let targetName = '';

      if (school_id) {
        const school = await KanchoSchool.findByPk(school_id);
        if (school) {
          schoolName = school.name;
        }
      }

      // Get target name
      if (lead_id) {
        const lead = await KanchoLead.findByPk(lead_id);
        if (lead) {
          targetName = lead.first_name || '';
        }
      } else if (student_id) {
        const student = await KanchoStudent.findByPk(student_id);
        if (student) {
          targetName = student.first_name || '';
        }
      }

      // Build the initial message based on call type
      let initialMessage = '';
      const agentName = agent === 'maestro' ? 'Maestro' : 'Kancho';

      switch (call_type) {
        case 'lead_followup':
          initialMessage = `Hello${targetName ? ' ' + targetName : ''}! This is ${agentName} calling from ${schoolName}. I noticed you recently expressed interest in our martial arts programs, and I wanted to personally reach out to answer any questions you might have. Is this a good time to chat?`;
          break;
        case 'retention':
          initialMessage = `Hi${targetName ? ' ' + targetName : ''}! This is ${agentName} from ${schoolName}. I'm just calling to check in and see how your training is going. We value you as a member and want to make sure you're getting the most out of your experience. How have things been?`;
          break;
        case 'no_show':
          initialMessage = `Hi${targetName ? ' ' + targetName : ''}! This is ${agentName} from ${schoolName}. I noticed we missed you at your scheduled class, and I wanted to make sure everything is okay. Would you like to reschedule for another time?`;
          break;
        case 'payment_reminder':
          initialMessage = `Hello${targetName ? ' ' + targetName : ''}! This is ${agentName} from ${schoolName}. I'm calling about your membership account. I wanted to help you sort out any payment concerns so we can keep you training without interruption. Do you have a moment?`;
          break;
        case 'winback':
          initialMessage = `Hi${targetName ? ' ' + targetName : ''}! This is ${agentName} from ${schoolName}. It's been a while since we've seen you at the dojo, and we miss having you train with us. I'm calling because we have some exciting new programs and I thought of you. Would you be interested in hearing about what's new?`;
          break;
        case 'appointment_confirmation':
          initialMessage = `Hi${targetName ? ' ' + targetName : ''}! This is ${agentName} from ${schoolName}. I'm just calling to confirm your upcoming trial class. Are you all set and ready to join us?`;
          break;
        default:
          initialMessage = `Hello${targetName ? ' ' + targetName : ''}! This is ${agentName} from ${schoolName}. How can I help you today?`;
      }

      // Return TwiML that connects to ElevenLabs via WebSocket
      const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="wss://api.elevenlabs.io/v1/convai/conversation?agent_id=${KANCHO_AGENT_ID}">
      <Parameter name="school_id" value="${school_id || ''}"/>
      <Parameter name="agent" value="${agent || 'kancho'}"/>
      <Parameter name="call_type" value="${call_type || ''}"/>
      <Parameter name="lead_id" value="${lead_id || ''}"/>
      <Parameter name="student_id" value="${student_id || ''}"/>
      <Parameter name="initial_message" value="${initialMessage.replace(/"/g, '&quot;')}"/>
      <Parameter name="first_message" value="${initialMessage.replace(/"/g, '&quot;')}"/>
    </Stream>
  </Connect>
</Response>`;

      res.type('text/xml');
      res.send(twiml);
    } catch (error) {
      console.error('[KanchoVoice] TwiML error:', error);
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">I apologize, but we're experiencing technical difficulties. Please call us back or visit our website. Goodbye.</Say>
  <Hangup/>
</Response>`;
      res.type('text/xml');
      res.send(twiml);
    }
  });

  // POST /api/v1/voice/twilio-status - Receive call status updates from Twilio
  router.post('/twilio-status', async (req, res) => {
    try {
      const {
        CallSid,
        CallStatus,
        CallDuration,
        From,
        To,
        Direction,
        AnsweredBy,
        Timestamp
      } = req.body;

      console.log(`[KanchoVoice] Status update: CallSid=${CallSid}, Status=${CallStatus}, Duration=${CallDuration || 0}s`);

      // Find the KanchoAiCall record by external_call_id
      const aiCall = await KanchoAiCall.findOne({
        where: { external_call_id: CallSid }
      });

      if (aiCall) {
        const updates = {
          status: kanchoVoiceCallService.mapTwilioStatus(CallStatus)
        };

        if (CallDuration) {
          updates.duration_seconds = parseInt(CallDuration, 10);
        }

        if (AnsweredBy) {
          updates.metadata = {
            ...aiCall.metadata,
            answered_by: AnsweredBy,
            completed_at: new Date().toISOString()
          };
        }

        if (CallStatus === 'completed') {
          updates.outcome = 'completed';
        } else if (CallStatus === 'no-answer') {
          updates.status = 'no_answer';
          updates.outcome = 'no_answer';
        } else if (CallStatus === 'busy') {
          updates.status = 'busy';
          updates.outcome = 'busy';
        } else if (CallStatus === 'failed' || CallStatus === 'canceled') {
          updates.status = 'failed';
          updates.outcome = 'failed';
        }

        await aiCall.update(updates);
        console.log(`[KanchoVoice] Updated call record ${aiCall.id} with status: ${updates.status}`);
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('[KanchoVoice] Status callback error:', error);
      res.status(200).send('OK');
    }
  });

  // POST /api/v1/voice/recording-status - Receive recording status from Twilio
  router.post('/recording-status', async (req, res) => {
    try {
      const {
        CallSid,
        RecordingSid,
        RecordingUrl,
        RecordingStatus,
        RecordingDuration
      } = req.body;

      console.log(`[KanchoVoice] Recording status: CallSid=${CallSid}, RecordingSid=${RecordingSid}, Status=${RecordingStatus}`);

      if (RecordingStatus === 'completed' && RecordingUrl) {
        const aiCall = await KanchoAiCall.findOne({
          where: { external_call_id: CallSid }
        });

        if (aiCall) {
          await aiCall.update({
            recording_url: RecordingUrl + '.mp3',
            metadata: {
              ...aiCall.metadata,
              recording_sid: RecordingSid,
              recording_duration: RecordingDuration
            }
          });
          console.log(`[KanchoVoice] Recording URL saved for call ${aiCall.id}`);
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('[KanchoVoice] Recording callback error:', error);
      res.status(200).send('OK');
    }
  });

  // =====================================================
  // WEBRTC TOKEN ENDPOINT - For browser-based voice chat
  // =====================================================

  // POST /api/v1/voice/webrtc-token - Get WebRTC token for Kancho voice chat
  router.post('/webrtc-token', async (req, res) => {
    try {
      const { school_id, language } = req.body;

      if (!ELEVENLABS_API_KEY) {
        console.error('[Kancho Voice] ELEVENLABS_API_KEY not configured');
        return res.status(500).json({
          success: false,
          error: 'Voice service not configured'
        });
      }

      // Get school info for context
      let schoolName = 'your martial arts school';
      let schoolData = {};
      if (school_id) {
        const school = await KanchoSchool.findByPk(school_id);
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

      console.log(`[Kancho Voice] Requesting WebRTC token for school: ${schoolName}`);

      // Request signed URL from ElevenLabs
      const response = await fetch(
        `${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(KANCHO_AGENT_ID)}`,
        {
          method: 'GET',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY
          }
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Kancho Voice] Failed to get signed URL: ${response.status} - ${errorText}`);
        return res.status(response.status).json({
          success: false,
          error: 'Failed to initialize voice connection'
        });
      }

      const data = await response.json();

      console.log(`[Kancho Voice] Successfully generated signed URL for: ${schoolName}`);

      return res.json({
        success: true,
        signed_url: data.signed_url,
        agent_id: KANCHO_AGENT_ID,
        school_name: schoolName,
        dynamic_variables: {
          school_id: parseInt(school_id, 10) || 0,
          school_name: schoolName,
          language: language || 'en',
          ...schoolData
        }
      });

    } catch (error) {
      console.error('[Kancho Voice] Token generation error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  });

  // =====================================================
  // ELEVENLABS WEBHOOK TOOLS - GET endpoints for voice agent
  // =====================================================

  const { KanchoHealthScore, KanchoRevenue } = models;
  const { Op } = require('sequelize');

  // Tool: get_greeting - Get personalized greeting with key metrics
  router.get('/school/:school_id/greeting', async (req, res) => {
    try {
      const school_id = parseInt(req.params.school_id, 10);
      const language = req.query.language || 'en';

      if (!school_id) {
        return res.json({ greeting: "Hello! I'm Kancho, your AI business intelligence assistant. How can I help you today?" });
      }

      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.json({ greeting: "Hello! I'm Kancho. I couldn't find your school information, but I'm here to help. What would you like to know?" });
      }

      // Get health score
      const healthScore = await KanchoHealthScore.findOne({
        where: { school_id },
        order: [['date', 'DESC']]
      });

      // Get at-risk students
      const atRiskCount = await KanchoStudent.count({
        where: { school_id, churn_risk: ['high', 'critical'], status: 'active' }
      });

      // Get hot leads
      const hotLeads = await KanchoLead.count({
        where: { school_id, temperature: 'hot', status: { [Op.notIn]: ['converted', 'lost'] } }
      });

      // Get revenue data
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyRevenue = await KanchoRevenue.sum('amount', {
        where: { school_id, date: { [Op.gte]: startOfMonth } }
      }) || 0;

      const revenueTarget = parseFloat(school.monthly_revenue_target) || 0;
      const revenuePercent = revenueTarget > 0 ? Math.round((monthlyRevenue / revenueTarget) * 100) : 0;
      const revenueAtRisk = atRiskCount * 175;
      const growthPotential = hotLeads * 175;

      let greeting;
      if (language === 'es') {
        greeting = `¡Hola! Soy Kancho, tu asistente de inteligencia empresarial para ${school.name}. `;
        greeting += `Tu puntuación de salud del negocio es ${healthScore?.overall_score || 0} de 100, grado ${healthScore?.grade || 'N/A'}. `;
        if (atRiskCount > 0) {
          greeting += `Tienes ${atRiskCount} estudiante${atRiskCount > 1 ? 's' : ''} en riesgo de cancelar, representando $${revenueAtRisk.toLocaleString()} en riesgo. `;
        }
        if (hotLeads > 0) {
          greeting += `Hay ${hotLeads} prospecto${hotLeads > 1 ? 's' : ''} caliente${hotLeads > 1 ? 's' : ''} listos para convertir, con un potencial de $${growthPotential.toLocaleString()} en ingresos mensuales. `;
        }
        greeting += `Estás al ${revenuePercent}% de tu meta de ingresos este mes. ¿En qué puedo ayudarte hoy?`;
      } else {
        greeting = `Hello! I'm Kancho, your AI business intelligence assistant for ${school.name}. `;
        greeting += `Your business health score is ${healthScore?.overall_score || 0} out of 100, grade ${healthScore?.grade || 'N/A'}. `;
        if (atRiskCount > 0) {
          greeting += `You have ${atRiskCount} student${atRiskCount > 1 ? 's' : ''} at risk of leaving, representing $${revenueAtRisk.toLocaleString()} in revenue at risk. `;
        }
        if (hotLeads > 0) {
          greeting += `There are ${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} ready to convert, with $${growthPotential.toLocaleString()} in potential monthly revenue. `;
        }
        greeting += `You're at ${revenuePercent}% of your revenue goal this month. How can I help you today?`;
      }

      res.json({
        greeting,
        school_name: school.name,
        health_score: healthScore?.overall_score || 0,
        health_grade: healthScore?.grade || 'N/A',
        at_risk_students: atRiskCount,
        revenue_at_risk: revenueAtRisk,
        hot_leads: hotLeads,
        growth_potential: growthPotential,
        revenue_percent: revenuePercent
      });
    } catch (error) {
      console.error('get_greeting error:', error);
      res.json({ greeting: "Hello! I'm Kancho, your AI business intelligence assistant. How can I help you today?" });
    }
  });

  // Tool: get_school_overview
  router.get('/school/:school_id/overview', async (req, res) => {
    try {
      const school_id = parseInt(req.params.school_id, 10);

      if (!school_id) {
        return res.json({ error: 'School ID required' });
      }

      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.json({ error: 'School not found' });
      }

      const healthScore = await KanchoHealthScore.findOne({
        where: { school_id },
        order: [['date', 'DESC']]
      });

      const totalStudents = await KanchoStudent.count({ where: { school_id } });
      const activeStudents = await KanchoStudent.count({ where: { school_id, status: 'active' } });
      const atRiskStudents = await KanchoStudent.count({
        where: { school_id, churn_risk: ['high', 'critical'] }
      });

      const hotLeads = await KanchoLead.count({ where: { school_id, temperature: 'hot' } });
      const totalLeads = await KanchoLead.count({
        where: { school_id, status: { [Op.notIn]: ['converted', 'lost'] } }
      });

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyRevenue = await KanchoRevenue.sum('amount', {
        where: { school_id, date: { [Op.gte]: startOfMonth } }
      }) || 0;

      const revenueTarget = parseFloat(school.monthly_revenue_target) || 0;
      const revenuePercent = revenueTarget > 0 ? Math.round((monthlyRevenue / revenueTarget) * 100) : 0;

      res.json({
        school_name: school.name,
        martial_art: school.martial_art_type,
        health_score: healthScore?.overall_score || 0,
        health_grade: healthScore?.grade || 'N/A',
        health_trend: healthScore?.vs_last_week > 0 ? 'improving' : healthScore?.vs_last_week < 0 ? 'declining' : 'stable',
        students: { active: activeStudents, total: totalStudents, at_risk: atRiskStudents },
        leads: { hot: hotLeads, total: totalLeads },
        revenue: {
          this_month: `$${Math.round(monthlyRevenue).toLocaleString()}`,
          target: `$${Math.round(revenueTarget).toLocaleString()}`,
          percent_to_goal: revenuePercent
        },
        summary: `${school.name} has a health score of ${healthScore?.overall_score || 0} out of 100, grade ${healthScore?.grade || 'N/A'}. There are ${activeStudents} active students, ${atRiskStudents} at risk of leaving, and ${hotLeads} hot leads ready to convert. Revenue is at ${revenuePercent}% of the monthly target.`
      });
    } catch (error) {
      console.error('get_school_overview error:', error);
      res.json({ error: error.message });
    }
  });

  // Tool: get_at_risk_students
  router.get('/school/:school_id/at-risk-students', async (req, res) => {
    try {
      const school_id = parseInt(req.params.school_id, 10);

      if (!school_id) {
        return res.json({ error: 'School ID required' });
      }

      const atRiskStudents = await KanchoStudent.findAll({
        where: { school_id, churn_risk: ['high', 'critical'], status: 'active' },
        order: [['churn_risk_score', 'DESC']],
        limit: 10
      });

      if (atRiskStudents.length === 0) {
        return res.json({
          count: 0,
          students: [],
          summary: "Great news! No students are currently at high risk of leaving. Retention looks healthy."
        });
      }

      const criticalCount = atRiskStudents.filter(s => s.churn_risk === 'critical').length;
      const highCount = atRiskStudents.filter(s => s.churn_risk === 'high').length;

      const students = atRiskStudents.map(s => {
        const daysSinceAttendance = s.last_attendance
          ? Math.floor((new Date() - new Date(s.last_attendance)) / (1000 * 60 * 60 * 24))
          : null;

        return {
          name: `${s.first_name} ${s.last_name}`,
          belt_rank: s.belt_rank,
          churn_risk: s.churn_risk,
          risk_score: s.churn_risk_score,
          days_since_training: daysSinceAttendance,
          membership: s.membership_type,
          payment_status: s.payment_status,
          issue: daysSinceAttendance > 14 ? `Hasn't trained in ${daysSinceAttendance} days` :
                 s.payment_status !== 'current' ? 'Payment issues' : 'Low engagement detected'
        };
      });

      res.json({
        count: atRiskStudents.length,
        critical: criticalCount,
        high: highCount,
        students,
        summary: `There are ${atRiskStudents.length} students at risk of leaving: ${criticalCount} critical and ${highCount} high risk. The top concerns are ${students[0]?.name} (${students[0]?.issue}) and ${students[1]?.name || 'others'}. I recommend reaching out to them this week.`
      });
    } catch (error) {
      console.error('get_at_risk_students error:', error);
      res.json({ error: error.message });
    }
  });

  // Tool: get_hot_leads
  router.get('/school/:school_id/hot-leads', async (req, res) => {
    try {
      const school_id = parseInt(req.params.school_id, 10);

      if (!school_id) {
        return res.json({ error: 'School ID required' });
      }

      const hotLeads = await KanchoLead.findAll({
        where: { school_id, temperature: 'hot', status: { [Op.notIn]: ['converted', 'lost'] } },
        order: [['lead_score', 'DESC']],
        limit: 10
      });

      if (hotLeads.length === 0) {
        return res.json({
          count: 0,
          leads: [],
          summary: "No hot leads right now. Consider running a promotion or checking on warm leads."
        });
      }

      const leads = hotLeads.map(l => ({
        name: `${l.first_name} ${l.last_name || ''}`.trim(),
        phone: l.phone,
        email: l.email,
        interest: l.interest,
        source: l.source,
        lead_score: l.lead_score,
        status: l.status,
        trial_scheduled: l.status === 'trial_scheduled',
        trial_date: l.trial_date,
        days_since_contact: l.last_contact_date
          ? Math.floor((new Date() - new Date(l.last_contact_date)) / (1000 * 60 * 60 * 24))
          : null
      }));

      res.json({
        count: hotLeads.length,
        leads,
        estimated_value: `$${hotLeads.length * 175}`,
        summary: `You have ${hotLeads.length} hot leads. Top prospect is ${leads[0].name}, interested in ${leads[0].interest}. ${leads[0].trial_scheduled ? 'They have a trial scheduled.' : 'Recommend scheduling a trial soon.'}`
      });
    } catch (error) {
      console.error('get_hot_leads error:', error);
      res.json({ error: error.message });
    }
  });

  // Tool: get_school_alerts
  router.get('/school/:school_id/alerts', async (req, res) => {
    try {
      const school_id = parseInt(req.params.school_id, 10);

      if (!school_id) {
        return res.json({ error: 'School ID required' });
      }

      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.json({ error: 'School not found' });
      }

      const alerts = [];

      const criticalStudents = await KanchoStudent.count({
        where: { school_id, status: 'active', churn_risk: 'critical' }
      });
      if (criticalStudents > 0) {
        alerts.push({
          type: 'critical',
          category: 'retention',
          message: `${criticalStudents} student${criticalStudents > 1 ? 's' : ''} at critical risk of leaving`,
          action: 'Call them today to re-engage'
        });
      }

      const highRiskStudents = await KanchoStudent.count({
        where: { school_id, status: 'active', churn_risk: 'high' }
      });
      if (highRiskStudents > 0) {
        alerts.push({
          type: 'warning',
          category: 'retention',
          message: `${highRiskStudents} student${highRiskStudents > 1 ? 's' : ''} showing high churn risk`,
          action: 'Schedule check-in calls this week'
        });
      }

      const paymentIssues = await KanchoStudent.count({
        where: { school_id, status: 'active', payment_status: ['past_due', 'failed'] }
      });
      if (paymentIssues > 0) {
        alerts.push({
          type: 'warning',
          category: 'billing',
          message: `${paymentIssues} student${paymentIssues > 1 ? 's' : ''} with payment issues`,
          action: 'Follow up on failed payments'
        });
      }

      const hotLeads = await KanchoLead.count({
        where: { school_id, temperature: 'hot', status: { [Op.notIn]: ['converted', 'lost'] } }
      });
      if (hotLeads > 0) {
        alerts.push({
          type: 'opportunity',
          category: 'leads',
          message: `${hotLeads} hot lead${hotLeads > 1 ? 's' : ''} ready to convert`,
          action: 'Follow up within 24 hours'
        });
      }

      const criticalAlerts = alerts.filter(a => a.type === 'critical').length;
      const warningAlerts = alerts.filter(a => a.type === 'warning').length;

      res.json({
        school_name: school.name,
        total_alerts: alerts.length,
        critical: criticalAlerts,
        warnings: warningAlerts,
        opportunities: alerts.filter(a => a.type === 'opportunity').length,
        alerts,
        summary: alerts.length === 0
          ? "No active alerts. Everything looks good!"
          : `There are ${alerts.length} items needing attention: ${criticalAlerts} critical, ${warningAlerts} warnings. ${alerts[0]?.message}.`
      });
    } catch (error) {
      console.error('get_school_alerts error:', error);
      res.json({ error: error.message });
    }
  });

  return router;
};
