// src/routes/messages.js
const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Import Message model only
let Message;
try {
  Message = require('../models/Message');
  console.log('✅ Message model loaded in routes');
} catch (error) {
  console.log('⚠️ Message model not available in routes');
}

// Initialize Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Enhanced SMS endpoint with database storage
router.post('/sms', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    console.log('📤 Sending SMS:', { to, messagePreview: message.substring(0, 50) + '...' });

    // Send SMS via Twilio
    const twilioMessage = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    console.log('✅ Twilio SMS sent:', twilioMessage.sid);

    // Store message in database (if Message model is available)
    if (Message) {
      try {
        const messageRecord = await Message.create({
          contactId: null, // For now, don't link to contacts (avoid schema conflicts)
          twilioSid: twilioMessage.sid,
          direction: 'outgoing',
          fromNumber: process.env.TWILIO_PHONE_NUMBER,
          toNumber: to,
          body: message,
          status: twilioMessage.status,
          cost: twilioMessage.price ? parseFloat(twilioMessage.price) : null,
          sentAt: new Date()
        });

        console.log('💾 Message saved to database:', messageRecord.id);
      } catch (dbError) {
        console.error('⚠️ Failed to save message to database:', dbError.message);
        // Continue anyway - SMS was sent successfully
      }
    }

    res.json({
      success: true,
      messageSid: twilioMessage.sid,
      status: twilioMessage.status,
      to: twilioMessage.to,
      from: twilioMessage.from
    });
  } catch (error) {
    console.error('❌ SMS sending error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get today's messages from database
router.get('/today', async (req, res) => {
  try {
    if (!Message) {
      return res.json({
        success: true,
        data: {
          messages: [],
          summary: { total: 0, incoming: 0, outgoing: 0 }
        }
      });
    }

    console.log('📱 Loading today\'s messages from database...');
    
    const messages = await Message.getTodaysMessages();
    
    // Format messages for dashboard
    const formattedMessages = messages.map((msg) => ({
      id: msg.id,
      contact: 'SMS Contact', // Generic name since we're not linking to contacts yet
      phone: msg.direction === 'incoming' ? msg.fromNumber : msg.toNumber,
      message: msg.body,
      time: new Date(msg.createdAt).toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      direction: msg.direction,
      status: msg.status,
      twilioSid: msg.twilioSid
    }));

    console.log(`✅ Loaded ${formattedMessages.length} messages from database`);

    res.json({
      success: true,
      data: {
        messages: formattedMessages,
        summary: {
          total: formattedMessages.length,
          incoming: formattedMessages.filter(m => m.direction === 'incoming').length,
          outgoing: formattedMessages.filter(m => m.direction === 'outgoing').length
        }
      }
    });
  } catch (error) {
    console.error('❌ Error loading today\'s messages:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get message history (placeholder)
router.get('/history/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    
    res.json({
      message: 'Message history endpoint - implementation coming soon',
      contactId,
      messages: []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all messages (placeholder)
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    res.json({
      message: 'Messages list endpoint - implementation coming soon',
      limit: parseInt(limit),
      offset: parseInt(offset),
      messages: []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Test Twilio connection (keep existing)
router.get('/test', async (req, res) => {
  try {
    const account = await client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    
    res.json({
      success: true,
      account: {
        sid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status
      },
      phone: process.env.TWILIO_PHONE_NUMBER
    });
  } catch (error) {
    console.error('Twilio test error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
