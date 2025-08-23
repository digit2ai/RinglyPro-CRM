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
        }))
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

// POST /api/calls/webhook/voice - ENHANCED webhook
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
          await callRecord.update(callData);
          console.log(`📝 Updated call record: ${callRecord.id}`);
        } else {
          callRecord = await Call.create({
            ...callData,
            createdAt: new Date()
          });
          console.log(`📝 Created call record: ${callRecord.id}`);
        }
        
      } catch (dbError) {
        console.error('⚠️ Database error:', dbError.message);
      }
    }

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

module.exports = router;
