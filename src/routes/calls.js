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

// Test if routes are loading at all
router.get('/', (req, res) => {
  res.json({ 
    message: 'Call routes are working',
    availableEndpoints: ['/today', '/initiate', '/test'],
    timestamp: new Date()
  });
});

// GET /api/calls/today - Get today's calls from database
router.get('/today', async (req, res) => {
  try {
    if (!Call) {
      console.log('⚠️ Call model not available, returning mock data');
      return res.json([]);
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

// POST /api/calls/initiate - Make outbound call (exactly like SMS pattern)
router.post('/initiate', async (req, res) => {
  try {
    const { to, message, contactId } = req.body;
    
    // Validate input (same as SMS)
    if (!to) {
      return res.status(400).json({ 
        error: 'Missing required field: to' 
      });
    }

    console.log(`📞 Making call to ${to}`);

    // Make call via Twilio (similar to SMS)
    const twilioCall = await client.calls.create({
      to: to,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: '<Response><Say voice="alice">Hello! This is a call from RinglyPro CRM.</Say></Response>'
    });

    console.log(`✅ Call initiated successfully! SID: ${twilioCall.sid}`);

    // Store in database if Call model is available (same pattern as SMS)
    let savedCall = null;
    if (Call) {
      try {
        savedCall = await Call.create({
          contactId: contactId || null,
          twilioSid: twilioCall.sid,
          direction: 'outgoing',
          fromNumber: process.env.TWILIO_PHONE_NUMBER,
          toNumber: to,
          status: twilioCall.status || 'queued',
          startTime: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`💾 Call stored in database with ID: ${savedCall.id}`);
      } catch (dbError) {
        console.error('⚠️ Failed to store call in database:', dbError.message);
        // Continue without failing the call initiation
      }
    } else {
      console.log('⚠️ Call model not available - call initiated but not stored');
    }

    // Return success response (same pattern as SMS)
    res.json({
      success: true,
      message: 'Call initiated successfully',
      twilioSid: twilioCall.sid,
      status: twilioCall.status,
      callId: savedCall ? savedCall.id : null,
      storedInDb: !!savedCall
    });

  } catch (error) {
    console.error('❌ Error initiating call:', error);
    res.status(500).json({ 
      error: 'Failed to initiate call',
      details: error.message 
    });
  }
});

// POST /api/calls/test - Test outbound call (simple version)
router.post('/test', async (req, res) => {
  try {
    const testNumber = process.env.FORWARD_TO_NUMBER || '+16566001400';
    
    console.log(`📞 Testing outbound call to: ${testNumber}`);

    // Simple test call
    const twilioCall = await client.calls.create({
      to: testNumber,
      from: process.env.TWILIO_PHONE_NUMBER,
      twiml: '<Response><Say voice="alice">Hello! This is a test call from RinglyPro CRM. The outgoing call system is working correctly.</Say></Response>'
    });

    console.log(`✅ Test call initiated: ${twilioCall.sid}`);

    // Store in database
    let savedCall = null;
    if (Call) {
      try {
        savedCall = await Call.create({
          contactId: null,
          twilioSid: twilioCall.sid,
          direction: 'outgoing',
          fromNumber: process.env.TWILIO_PHONE_NUMBER,
          toNumber: testNumber,
          status: 'queued',
          startTime: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`💾 Test call stored in database with ID: ${savedCall.id}`);
      } catch (dbError) {
        console.error('⚠️ Failed to store test call in database:', dbError.message);
      }
    }

    res.json({
      success: true,
      message: `Test call initiated to ${testNumber}`,
      twilioSid: twilioCall.sid,
      status: twilioCall.status,
      callId: savedCall ? savedCall.id : null
    });

  } catch (error) {
    console.error('❌ Test call error:', error);
    res.status(500).json({
      success: false,
      error: 'Test call failed: ' + error.message
    });
  }
});

// POST /api/calls/webhook/voice - Twilio voice webhook handler (simplified)
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
      EndTime
    } = req.body;
    
    console.log(`📞 Voice webhook received:`);
    console.log(`   Call SID: ${CallSid}`);
    console.log(`   From: ${From}`);
    console.log(`   To: ${To}`);
    console.log(`   Status: ${CallStatus}`);
    console.log(`   Direction: ${Direction}`);
    console.log(`   Duration: ${Duration}`);

    // Store call record if Call model is available (simplified)
    if (Call) {
      try {
        // Try to find existing call first
        let existingCall = null;
        try {
          existingCall = await Call.findOne({ where: { twilioSid: CallSid } });
        } catch (findError) {
          console.log('Could not find existing call:', findError.message);
        }

        if (existingCall) {
          // Update existing call record
          await existingCall.update({
            status: CallStatus,
            duration: Duration ? parseInt(Duration) : null,
            startTime: StartTime ? new Date(StartTime) : null,
            endTime: EndTime ? new Date(EndTime) : null,
            updatedAt: new Date()
          });
          
          console.log(`🔄 Updated existing call record ID: ${existingCall.id}`);
        } else {
          // Create new call record
          const callRecord = await Call.create({
            contactId: null,
            twilioSid: CallSid,
            direction: Direction === 'inbound' ? 'incoming' : 'outgoing',
            fromNumber: From,
            toNumber: To,
            status: CallStatus,
            duration: Duration ? parseInt(Duration) : null,
            startTime: StartTime ? new Date(StartTime) : new Date(),
            endTime: EndTime ? new Date(EndTime) : null,
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

    // Simple TwiML response
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>Thank you for calling RinglyPro CRM.</Say>
</Response>`);

  } catch (error) {
    console.error('❌ Error processing voice webhook:', error);
    res.status(500).send('Error processing voice webhook');
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

module.exports = router;
