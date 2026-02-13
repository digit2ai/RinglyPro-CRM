// kancho-ai/src/routes/outbound.js
// Outbound calling routes for Kancho AI - At-Risk Member & Lead Follow-up Calls

const express = require('express');
const router = express.Router();

// ElevenLabs Agent Configuration
// Using the same agent for now - can be changed to a dedicated outbound agent later
const KANCHO_AGENT_ID = process.env.KANCHO_ELEVENLABS_AGENT_ID || 'agent_01jk1bzp62e1p4gs4n68p67fs8';
const KANCHO_PHONE_NUMBER_ID = process.env.KANCHO_ELEVENLABS_PHONE_NUMBER_ID;

module.exports = (models) => {
  const { KanchoSchool, KanchoStudent, KanchoLead, KanchoAiCall } = models;

  /**
   * POST /api/v1/outbound/call-member
   * Make an outbound call to an at-risk member
   */
  router.post('/call-member', async (req, res) => {
    try {
      const { student_id, school_id, phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      if (!school_id) {
        return res.status(400).json({
          success: false,
          error: 'School ID is required'
        });
      }

      // Get school info for context
      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.status(404).json({
          success: false,
          error: 'School not found'
        });
      }

      // Get student info if student_id provided
      let student = null;
      if (student_id) {
        student = await KanchoStudent.findByPk(student_id);
      }

      // Validate and format phone number
      const cleaned = phone.replace(/[^\d]/g, '');
      if (cleaned.length !== 10 && cleaned.length !== 11) {
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number format'
        });
      }
      const normalized = cleaned.length === 10 ? '+1' + cleaned : '+' + cleaned;

      // Check business hours (8am-8pm EST)
      const now = new Date();
      const estFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false
      });
      const hour = parseInt(estFormatter.formatToParts(now).find(p => p.type === 'hour')?.value || '0');

      if (hour < 8 || hour >= 20) {
        return res.status(400).json({
          success: false,
          error: 'Calls can only be made between 8AM-8PM EST (TCPA compliance)'
        });
      }

      // Get ElevenLabs config - use school's agent if configured, otherwise default
      const agentId = school.elevenlabs_agent_id || KANCHO_AGENT_ID;
      const phoneNumberId = school.elevenlabs_phone_number_id || KANCHO_PHONE_NUMBER_ID;

      if (!phoneNumberId) {
        return res.status(400).json({
          success: false,
          error: 'Outbound calling not configured. Please contact support.'
        });
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'ElevenLabs API not configured'
        });
      }

      console.log(`📞 Kancho AI: Initiating call to ${normalized} for school ${school.name}`);
      console.log(`   Agent ID: ${agentId}`);
      console.log(`   Phone Number ID: ${phoneNumberId}`);

      // Make ElevenLabs outbound call
      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: agentId,
          agent_phone_number_id: phoneNumberId,
          to_number: normalized
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('❌ ElevenLabs API error:', responseData);
        return res.status(500).json({
          success: false,
          error: responseData.detail?.message || responseData.error || 'Failed to initiate call'
        });
      }

      console.log(`✅ Kancho AI call initiated:`, responseData);

      // Log the call in the database
      try {
        await KanchoAiCall.create({
          school_id: school_id,
          student_id: student_id || null,
          lead_id: null,
          call_type: 'retention',
          call_direction: 'outbound',
          phone_number: normalized,
          status: 'initiated',
          elevenlabs_conversation_id: responseData.conversation_id || responseData.call_id,
          notes: student ? `Retention call to ${student.first_name} ${student.last_name}` : 'Retention call'
        });
      } catch (dbError) {
        console.error('Warning: Could not log call to database:', dbError.message);
      }

      res.json({
        success: true,
        message: 'Call initiated successfully',
        call_id: responseData.conversation_id || responseData.call_id,
        phone: normalized
      });

    } catch (error) {
      console.error('❌ Kancho outbound call error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  /**
   * POST /api/v1/outbound/call-lead
   * Make an outbound call to a hot lead
   */
  router.post('/call-lead', async (req, res) => {
    try {
      const { lead_id, school_id, phone } = req.body;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Phone number is required'
        });
      }

      if (!school_id) {
        return res.status(400).json({
          success: false,
          error: 'School ID is required'
        });
      }

      // Get school info
      const school = await KanchoSchool.findByPk(school_id);
      if (!school) {
        return res.status(404).json({
          success: false,
          error: 'School not found'
        });
      }

      // Get lead info if lead_id provided
      let lead = null;
      if (lead_id) {
        lead = await KanchoLead.findByPk(lead_id);
      }

      // Validate and format phone number
      const cleaned = phone.replace(/[^\d]/g, '');
      if (cleaned.length !== 10 && cleaned.length !== 11) {
        return res.status(400).json({
          success: false,
          error: 'Invalid phone number format'
        });
      }
      const normalized = cleaned.length === 10 ? '+1' + cleaned : '+' + cleaned;

      // Check business hours
      const now = new Date();
      const estFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        hour: 'numeric',
        hour12: false
      });
      const hour = parseInt(estFormatter.formatToParts(now).find(p => p.type === 'hour')?.value || '0');

      if (hour < 8 || hour >= 20) {
        return res.status(400).json({
          success: false,
          error: 'Calls can only be made between 8AM-8PM EST (TCPA compliance)'
        });
      }

      // Get ElevenLabs config
      const agentId = school.elevenlabs_agent_id || KANCHO_AGENT_ID;
      const phoneNumberId = school.elevenlabs_phone_number_id || KANCHO_PHONE_NUMBER_ID;

      if (!phoneNumberId) {
        return res.status(400).json({
          success: false,
          error: 'Outbound calling not configured. Please contact support.'
        });
      }

      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: 'ElevenLabs API not configured'
        });
      }

      console.log(`📞 Kancho AI: Initiating lead call to ${normalized} for school ${school.name}`);

      // Make ElevenLabs outbound call
      const response = await fetch('https://api.elevenlabs.io/v1/convai/twilio/outbound-call', {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          agent_id: agentId,
          agent_phone_number_id: phoneNumberId,
          to_number: normalized
        })
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('❌ ElevenLabs API error:', responseData);
        return res.status(500).json({
          success: false,
          error: responseData.detail?.message || responseData.error || 'Failed to initiate call'
        });
      }

      console.log(`✅ Kancho AI lead call initiated:`, responseData);

      // Log the call
      try {
        await KanchoAiCall.create({
          school_id: school_id,
          student_id: null,
          lead_id: lead_id || null,
          call_type: 'lead_followup',
          call_direction: 'outbound',
          phone_number: normalized,
          status: 'initiated',
          elevenlabs_conversation_id: responseData.conversation_id || responseData.call_id,
          notes: lead ? `Follow-up call to ${lead.first_name} ${lead.last_name || ''}` : 'Lead follow-up call'
        });
      } catch (dbError) {
        console.error('Warning: Could not log call to database:', dbError.message);
      }

      res.json({
        success: true,
        message: 'Call initiated successfully',
        call_id: responseData.conversation_id || responseData.call_id,
        phone: normalized
      });

    } catch (error) {
      console.error('❌ Kancho lead call error:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return router;
};
