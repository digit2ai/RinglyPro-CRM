// src/routes/calls.js
const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Import Call model from models
const { Call } = require('../models');

// Twilio client setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// GET /api/calls/today - Get today's calls from database
router.get('/today', async (req, res) => {
  try {
    if (!Call) {
      console.log('⚠️ Call model not available, returning mock data');
      return res.json([
        {
          id: 1,
          direction: "incoming",
          fromNumber: "+1234567890",
          toNumber: "+1987654321",
          status: "completed",
          duration: 323,
          createdAt: new Date().toISOString()
        }
      ]);
    }

    console.log('📞 Fetching today\'s calls from database...');
    const calls = await Call.getTodaysCalls();
    
    console.log(`✅ Found ${calls.length} calls for today`);
    res.json(calls);
  } catch (error) {
    console.error('❌ Error fetching today\'s calls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch calls',
      details: error.message 
    });
  }
});

// POST /api/calls - Create a new call record manually
router.post('/', async (req, res) => {
  try {
    const { 
      contactId, 
      direction, 
      fromNumber, 
      toNumber, 
      status = 'completed',
      duration = 0,
      notes 
    } = req.body;
    
    // Validate input
    if (!direction || !fromNumber || !toNumber) {
      return res.status(400).json({ 
        error: 'Missing required fields: direction, fromNumber, toNumber' 
      });
    }

    console.log(`📞 Creating call record: ${direction} call from ${fromNumber} to ${toNumber}`);

    // Store in database if Call model is available
    if (Call) {
      const callRecord = await Call.create({
        contactId: contactId || null,
        direction: direction,
        fromNumber: fromNumber,
        toNumber: toNumber,
        status: status,
        callStatus: duration > 0 ? 'completed' : 'missed',
        duration: parseInt(duration) || 0,
        startTime: new Date(),
        endTime: duration > 0 ? new Date(Date.now() + (duration * 1000)) : null,
        notes: notes || null,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      console.log(`💾 Call record stored in database with ID: ${callRecord.id}`);
      
      res.json({
        success: true,
        message: 'Call record created successfully',
        callId: callRecord.id,
        call: callRecord
      });
    } else {
      res.status(503).json({ 
        error: 'Call model not available' 
      });
    }

  } catch (error) {
    console.error('❌ Error creating call record:', error);
    res.status(500).json({ 
      error: 'Failed to create call record',
      details: error.message 
    });
  }
});

// POST /api/calls/webhook/voice - Twilio voice webhook handler
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
      AnsweredBy
    } = req.body;
    
    console.log(`📞 Voice webhook received:`);
    console.log(`   Call SID: ${CallSid}`);
    console.log(`   From: ${From}`);
    console.log(`   To: ${To}`);
    console.log(`   Status: ${CallStatus}`);
    console.log(`   Direction: ${Direction}`);
    console.log(`   Duration: ${Duration}`);

    // Store call record if Call model is available
    if (Call) {
      try {
        // Check if call record already exists
        let callRecord = await Call.findByTwilioSid(CallSid);
        
        if (callRecord) {
          // Update existing call record
          await callRecord.update({
            status: CallStatus,
            callStatus: mapTwilioStatusToCallStatus(CallStatus),
            duration: Duration ? parseInt(Duration) : null,
            startTime: StartTime ? new Date(StartTime) : null,
            endTime: EndTime ? new Date(EndTime) : null,
            cost: Price ? parseFloat(Price) : null,
            answeredBy: AnsweredBy || null,
            updatedAt: new Date()
          });
          
          console.log(`🔄 Updated existing call record ID: ${callRecord.id}`);
        } else {
          // Create new call record
          callRecord = await Call.create({
            contactId: null, // You can add logic to find contactId by phone number
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
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          console.log(`💾 New call record stored with ID: ${callRecord.id}`);
        }
      } catch (dbError) {
        console.error('⚠️ Failed to store/update call record:', dbError.message);
      }
    } else {
      console.log('⚠️ Call model not available - call not stored');
    }

    // Respond to Twilio with TwiML (optional - for call control)
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling. Your call has been recorded.</Say>
</Response>`);

  } catch (error) {
    console.error('❌ Error processing voice webhook:', error);
    res.status(500).send('Error processing voice webhook');
  }
});

// GET /api/calls/contact/:contactId - Get calls for a specific contact
router.get('/contact/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    
    if (!Call) {
      return res.status(503).json({ error: 'Call model not available' });
    }

    const calls = await Call.findByContact(contactId, {
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    });

    res.json(calls);
  } catch (error) {
    console.error('❌ Error fetching contact calls:', error);
    res.status(500).json({ 
      error: 'Failed to fetch contact calls',
      details: error.message 
    });
  }
});

// GET /api/calls/stats - Get call statistics
router.get('/stats', async (req, res) => {
  try {
    if (!Call) {
      return res.status(503).json({ error: 'Call model not available' });
    }

    const dateRange = req.query.range || 'today';
    const stats = await Call.getCallStats(dateRange);

    res.json({
      success: true,
      dateRange: dateRange,
      stats: stats
    });
  } catch (error) {
    console.error('❌ Error fetching call stats:', error);
    res.status(500).json({
      error: 'Failed to fetch call stats',
      details: error.message
    });
  }
});

// POST /api/calls/callback - Initiate callback to voicemail caller (MULTI-TENANT)
router.post('/callback', async (req, res) => {
  try {
    const { to, from, voicemail_id, clientId } = req.body;

    // Validate input
    if (!to || !clientId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: to, clientId'
      });
    }

    console.log(`📞 Client ${clientId} initiating callback to ${to}`);

    // Get client's dedicated Twilio number and verify ownership
    const { sequelize } = require('../models');
    const clientQuery = `
      SELECT ringlypro_number, business_name
      FROM clients
      WHERE id = $1 AND active = TRUE
    `;

    const [clientData] = await sequelize.query(clientQuery, {
      bind: [clientId],
      type: sequelize.QueryTypes.SELECT
    });

    if (!clientData) {
      return res.status(404).json({
        success: false,
        error: 'Client not found or inactive'
      });
    }

    // Use the provided 'from' number or default to client's RinglyPro number
    const fromNumber = from || clientData.ringlypro_number;

    // Initiate outbound call via Twilio
    const call = await client.calls.create({
      to: to,
      from: fromNumber,
      url: 'http://demo.twilio.com/docs/voice.xml', // Default TwiML - can be customized for AI receptionist
      statusCallback: `${process.env.BASE_URL || 'https://aiagent.ringlypro.com'}/api/calls/webhook/voice`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });

    console.log(`✅ Callback call initiated! Call SID: ${call.sid}`);

    // Store call record in database WITH client_id
    let callRecord = null;
    if (Call) {
      try {
        callRecord = await Call.create({
          clientId: clientId,  // CRITICAL: Multi-tenant isolation
          twilioCallSid: call.sid,
          direction: 'outgoing',
          fromNumber: fromNumber,
          toNumber: to,
          status: 'queued',
          callStatus: 'initiated',
          notes: voicemail_id ? `Callback for voicemail ID: ${voicemail_id}` : 'Manual callback',
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log(`💾 Callback call stored in database with ID: ${callRecord.id} for client ${clientId}`);
      } catch (dbError) {
        console.error('⚠️ Failed to store call record:', dbError.message);
        // Continue without failing the call initiation
      }
    }

    // Return success response
    res.json({
      success: true,
      message: 'Callback initiated successfully',
      twilioCallSid: call.sid,
      status: call.status,
      callId: callRecord ? callRecord.id : null,
      storedInDb: !!callRecord,
      to: to,
      from: fromNumber
    });

  } catch (error) {
    console.error('❌ Error initiating callback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to initiate callback',
      details: error.message
    });
  }
});

// GET /api/calls/webhook/voice - Handle GET requests to webhook (for testing)
router.get('/webhook/voice', (req, res) => {
  res.json({ 
    message: 'Voice webhook endpoint is working! Use POST for actual webhooks.',
    endpoint: '/api/calls/webhook/voice',
    method: 'POST',
    note: 'Configure this URL in your Twilio phone number settings'
  });
});

// Helper function to map Twilio call status to our call status
function mapTwilioStatusToCallStatus(twilioStatus) {
  const statusMap = {
    'queued': 'initiated',
    'ringing': 'ringing',
    'in-progress': 'answered',
    'completed': 'completed',
    'busy': 'busy',
    'failed': 'failed',
    'no-answer': 'no-answer',
    'canceled': 'missed'
  };
  
  return statusMap[twilioStatus] || 'initiated';
}

module.exports = router;