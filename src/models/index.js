// src/routes/calls.js - ENHANCED VERSION WITH ANALYTICS
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { Op } = require('sequelize');

// Import models
const { Call, Contact, Appointment } = require('../models');

// Twilio client setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// GET /api/calls/today - Enhanced with contact linking
router.get('/today', async (req, res) => {
  try {
    if (!Call) {
      return res.json([]);
    }

    console.log('📞 Fetching today\'s calls with contact information...');
    
    const calls = await Call.findAll({
      where: {
        createdAt: {
          [Op.between]: [
            new Date(new Date().setHours(0, 0, 0, 0)),
            new Date(new Date().setHours(23, 59, 59, 999))
          ]
        }
      },
      include: [{
        model: Contact,
        as: 'contact',
        required: false,
        attributes: ['id', 'firstName', 'lastName', 'phone', 'email']
      }],
      order: [['createdAt', 'DESC']]
    });
    
    // Enhance calls with contact names and call analytics
    const enhancedCalls = calls.map(call => {
      const contactName = call.contact 
        ? `${call.contact.firstName} ${call.contact.lastName}`
        : formatPhoneForDisplay(call.fromNumber);
        
      return {
        id: call.id,
        contactId: call.contactId,
        contact: contactName,
        phone: call.direction === 'incoming' ? call.fromNumber : call.toNumber,
        time: call.createdAt.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        }),
        duration: call.getFormattedDuration(),
        direction: call.direction,
        status: call.callStatus || call.status,
        twilioSid: call.twilioCallSid,
        notes: call.notes,
        recordingUrl: call.recordingUrl,
        cost: call.cost,
        originalData: call
      };
    });
    
    console.log(`✅ Found ${enhancedCalls.length} calls for today`);
    res.json(enhancedCalls);
    
  } catch (error) {
    console.error('❌ Error fetching today\'s calls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch calls',
      details: error.message 
    });
  }
});

// GET /api/calls/analytics - Call analytics and metrics
router.get('/analytics', async (req, res) => {
  try {
    if (!Call) {
      return res.status(503).json({ error: 'Call model not available' });
    }

    const { timeframe = 'today' } = req.query;
    let whereClause = {};
    
    // Set date range based on timeframe
    const now = new Date();
    switch (timeframe) {
      case 'today':
        whereClause.createdAt = {
          [Op.between]: [
            new Date(now.setHours(0, 0, 0, 0)),
            new Date(now.setHours(23, 59, 59, 999))
          ]
        };
        break;
      case 'week':
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        whereClause.createdAt = {
          [Op.gte]: weekStart
        };
        break;
      case 'month':
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        whereClause.createdAt = {
          [Op.gte]: monthStart
        };
        break;
    }

    // Get call statistics
    const totalCalls = await Call.count({ where: whereClause });
    
    const callsByDirection = await Call.findAll({
      where: whereClause,
      attributes: [
        'direction',
        [Call.sequelize.fn('COUNT', Call.sequelize.col('id')), 'count'],
        [Call.sequelize.fn('AVG', Call.sequelize.col('duration')), 'avgDuration'],
        [Call.sequelize.fn('SUM', Call.sequelize.col('duration')), 'totalDuration']
      ],
      group: ['direction']
    });

    const callsByStatus = await Call.findAll({
      where: whereClause,
      attributes: [
        'callStatus',
        [Call.sequelize.fn('COUNT', Call.sequelize.col('id')), 'count']
      ],
      group: ['callStatus']
    });

    // Answer rate calculation
    const answeredCalls = await Call.count({
      where: {
        ...whereClause,
        callStatus: 'completed'
      }
    });
    
    const answerRate = totalCalls > 0 ? ((answeredCalls / totalCalls) * 100).toFixed(1) : 0;

    // Peak hours analysis
    const callsByHour = await Call.findAll({
      where: whereClause,
      attributes: [
        [Call.sequelize.fn('EXTRACT', Call.sequelize.literal('HOUR FROM "createdAt"')), 'hour'],
        [Call.sequelize.fn('COUNT', Call.sequelize.col('id')), 'count']
      ],
      group: [Call.sequelize.fn('EXTRACT', Call.sequelize.literal('HOUR FROM "createdAt"'))],
      order: [[Call.sequelize.fn('COUNT', Call.sequelize.col('id')), 'DESC']]
    });

    // Response time metrics (time to answer)
    const avgResponseTime = await Call.findOne({
      where: {
        ...whereClause,
        callStatus: 'completed'
      },
      attributes: [
        [Call.sequelize.fn('AVG', 
          Call.sequelize.literal('EXTRACT(EPOCH FROM ("endTime" - "startTime"))')
        ), 'avgResponseSeconds']
      ]
    });

    res.json({
      success: true,
      timeframe,
      analytics: {
        totalCalls,
        answerRate: parseFloat(answerRate),
        callsByDirection: callsByDirection.map(call => ({
          direction: call.direction,
          count: parseInt(call.dataValues.count),
          avgDuration: parseFloat(call.dataValues.avgDuration || 0).toFixed(1),
          totalDuration: parseInt(call.dataValues.totalDuration || 0)
        })),
        callsByStatus: callsByStatus.map(call => ({
          status: call.callStatus,
          count: parseInt(call.dataValues.count)
        })),
        peakHours: callsByHour.slice(0, 3).map(call => ({
          hour: parseInt(call.dataValues.hour),
          count: parseInt(call.dataValues.count),
          displayHour: formatHour(parseInt(call.dataValues.hour))
        })),
        avgResponseTime: avgResponseTime ? 
          parseFloat(avgResponseTime.dataValues.avgResponseSeconds || 0).toFixed(1) : 0
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching call analytics:', error);
    res.status(500).json({ 
      error: 'Failed to fetch call analytics',
      details: error.message 
    });
  }
});

// POST /api/calls/webhook/voice - ENHANCED webhook with appointment linking
router.post('/webhook/voice', async (req, res) => {
  try {
    const { 
      CallSid, 
      From, 
      To, 
      CallStatus, 
      Direction,
      Duration,
      StartTime,
      EndTime,
      Price,
      AnsweredBy,
      CallerName
    } = req.body;
    
    console.log(`📞 Voice webhook: ${CallSid} from ${From} - Status: ${CallStatus}`);

    if (Call) {
      try {
        // Find or create call record
        let callRecord = await Call.findOne({ 
          where: { twilioCallSid: CallSid } 
        });
        
        // Try to link to existing contact
        let contactId = null;
        if (Contact) {
          const contact = await Contact.findOne({
            where: { phone: From }
          });
          if (contact) {
            contactId = contact.id;
            console.log(`🔗 Linked call to contact: ${contact.firstName} ${contact.lastName}`);
          }
        }
        
        const callData = {
          contactId,
          twilioCallSid: CallSid,
          direction: Direction === 'inbound' ? 'incoming' : 'outgoing',
          fromNumber: From,
          toNumber: To,
          status: CallStatus,
          callStatus: mapTwilioStatusToCallStatus(CallStatus),
          duration: Duration ? parseInt(Duration) : null,
          startTime: StartTime ? new Date(StartTime) : new Date(),
          endTime: EndTime ? new Date(EndTime) : null,
          cost: Price ? parseFloat(Price) : null,
          answeredBy: AnsweredBy || null,
          callerName: CallerName || null,
          updatedAt: new Date()
        };
        
        if (callRecord) {
          // Update existing call
          await callRecord.update(callData);
          console.log(`📝 Updated call record: ${callRecord.id}`);
        } else {
          // Create new call record
          callRecord = await Call.create({
            ...callData,
            createdAt: new Date()
          });
          console.log(`📝 Created call record: ${callRecord.id}`);
        }
        
        // Link to appointments if applicable
        if (contactId && Appointment && CallStatus === 'completed') {
          await linkCallToAppointments(callRecord.id, contactId);
        }
        
      } catch (dbError) {
        console.error('⚠️ Database error:', dbError.message);
      }
    }

    // Return appropriate TwiML
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Thank you for calling RinglyPro. Your call is important to us.</Say>
</Response>`);

  } catch (error) {
    console.error('❌ Voice webhook error:', error);
    res.status(500).send('Webhook processing error');
  }
});

// GET /api/calls/contact/:contactId - Get call history for a contact
router.get('/contact/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    if (!Call) {
      return res.status(503).json({ error: 'Call model not available' });
    }

    const calls = await Call.findAll({
      where: { contactId },
      include: [{
        model: Contact,
        as: 'contact',
        attributes: ['firstName', 'lastName', 'phone']
      }],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      contactId,
      calls: calls.map(call => ({
        id: call.id,
        direction: call.direction,
        status: call.callStatus,
        duration: call.getFormattedDuration(),
        startTime: call.startTime,
        endTime: call.endTime,
        cost: call.cost,
        notes: call.notes,
        recordingUrl: call.recordingUrl,
        createdAt: call.createdAt
      }))
    });
    
  } catch (error) {
    console.error('❌ Error fetching contact calls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch contact calls',
      details: error.message 
    });
  }
});

// POST /api/calls/:callId/notes - Add notes to a call
router.post('/:callId/notes', async (req, res) => {
  try {
    const { callId } = req.params;
    const { notes } = req.body;
    
    if (!Call) {
      return res.status(503).json({ error: 'Call model not available' });
    }

    const call = await Call.findByPk(callId);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    await call.update({ 
      notes: notes,
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Call notes updated successfully',
      callId: call.id,
      notes: call.notes
    });
    
  } catch (error) {
    console.error('❌ Error updating call notes:', error);
    res.status(500).json({ 
      error: 'Failed to update call notes',
      details: error.message 
    });
  }
});

// Helper Functions
function mapTwilioStatusToCallStatus(twilioStatus) {
  const statusMap = {
    'queued': 'initiated',
    'ringing': 'ringing', 
    'in-progress': 'answered',
    'completed': 'completed',
    'busy': 'busy',
    'failed': 'failed',
    'no-answer': 'missed',
    'canceled': 'missed'
  };
  return statusMap[twilioStatus] || 'initiated';
}

function formatPhoneForDisplay(phone) {
  if (!phone) return 'Unknown';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    const number = cleaned.slice(1);
    return `(${number.slice(0,3)}) ${number.slice(3,6)}-${number.slice(6)}`;
  }
  return phone;
}

function formatHour(hour) {
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:00 ${ampm}`;
}

// Link calls to related appointments
async function linkCallToAppointments(callId, contactId) {
  try {
    if (!Appointment) return;
    
    // Find appointments for this contact in the next 7 days
    const upcomingAppointments = await Appointment.findAll({
      where: {
        contactId,
        appointmentDate: {
          [Op.between]: [
            new Date(),
            new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
          ]
        },
        status: {
          [Op.in]: ['confirmed', 'pending']
        }
      }
    });
    
    if (upcomingAppointments.length > 0) {
      console.log(`🔗 Found ${upcomingAppointments.length} upcoming appointments for contact ${contactId}`);
      // You could add a field to track call-appointment relationships
      // or add notes to the call record
      const call = await Call.findByPk(callId);
      const appointmentInfo = upcomingAppointments.map(apt => 
        `${apt.appointmentDate} at ${apt.appointmentTime}`
      ).join(', ');
      
      await call.update({
        notes: `${call.notes || ''}\nRelated appointments: ${appointmentInfo}`.trim()
      });
    }
    
  } catch (error) {
    console.error('⚠️ Error linking call to appointments:', error);
  }
}

module.exports = router;
