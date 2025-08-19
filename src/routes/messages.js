// src/routes/messages.js
const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Import Message model from models
const { Message } = require('../models');

// Twilio client setup
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

// GET /api/messages/today - Get today's messages from database
router.get('/today', async (req, res) => {
  try {
    if (!Message) {
      console.log('⚠️ Message model not available, returning mock data');
      return res.json([]);
    }

    console.log('📱 Fetching today\'s messages from database...');
    const messages = await Message.getTodaysMessages();
    
    console.log(`✅ Found ${messages.length} messages for today`);
    res.json(messages);
  } catch (error) {
    console.error('❌ Error fetching today\'s messages:', error);
    res.status(500).json({ 
      error: 'Failed to fetch messages',
      details: error.message 
    });
  }
});

// POST /api/messages/sms - Send SMS and store in database
router.post('/sms', async (req, res) => {
  try {
    const { to, message, contactId } = req.body;
    
    // Validate input
    if (!to || !message) {
      return res.status(400).json({ 
        error: 'Missing required fields: to, message' 
      });
    }

    console.log(`📤 Sending SMS to ${to}: ${message}`);

    // Send via Twilio
    const twilioMessage = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    console.log(`✅ SMS sent successfully! SID: ${twilioMessage.sid}`);

    // Store in database if Message model is available
    let savedMessage = null;
    if (Message) {
      try {
        savedMessage = await Message.create({
          contactId: contactId || null,
          twilioSid: twilioMessage.sid,
          direction: 'outgoing',
          fromNumber: process.env.TWILIO_PHONE_NUMBER,
          toNumber: to,
          body: message,
          status: twilioMessage.status || 'sent',
          cost: twilioMessage.price || null,
          sentAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`💾 Message stored in database with ID: ${savedMessage.id}`);
      } catch (dbError) {
        console.error('⚠️ Failed to store message in database:', dbError.message);
        // Continue without failing the SMS send
      }
    } else {
      console.log('⚠️ Message model not available - SMS sent but not stored');
    }

    // Return success response
    res.json({
      success: true,
      message: 'SMS sent successfully',
      twilioSid: twilioMessage.sid,
      status: twilioMessage.status,
      messageId: savedMessage ? savedMessage.id : null,
      storedInDb: !!savedMessage
    });

  } catch (error) {
    console.error('❌ Error sending SMS:', error);
    res.status(500).json({ 
      error: 'Failed to send SMS',
      details: error.message 
    });
  }
});

// POST /api/messages/webhook - Twilio webhook for incoming messages
router.post('/webhook', async (req, res) => {
  try {
    const { MessageSid, From, To, Body, SmsStatus } = req.body;
    
    console.log(`📥 Incoming SMS webhook received:`);
    console.log(`   SID: ${MessageSid}`);
    console.log(`   From: ${From}`);
    console.log(`   To: ${To}`);
    console.log(`   Body: ${Body}`);
    console.log(`   Status: ${SmsStatus}`);

    // Store incoming message if Message model is available
    if (Message) {
      try {
        const savedMessage = await Message.create({
          contactId: null, // You can add logic to find contactId by phone number
          twilioSid: MessageSid,
          direction: 'incoming',
          fromNumber: From,
          toNumber: To,
          body: Body,
          status: 'received',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`💾 Incoming message stored in database with ID: ${savedMessage.id}`);
      } catch (dbError) {
        console.error('⚠️ Failed to store incoming message:', dbError.message);
      }
    } else {
      console.log('⚠️ Message model not available - incoming message not stored');
    }

    // Send auto-reply (optional)
    res.type('text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>Thank you for your message! We received: "${Body}". We'll get back to you soon!</Message>
</Response>`);

  } catch (error) {
    console.error('❌ Error processing incoming webhook:', error);
    res.status(500).send('Error processing webhook');
  }
});

// GET /api/messages/webhook - Handle GET requests to webhook (for testing)
router.get('/webhook', (req, res) => {
  res.json({ 
    message: 'Webhook endpoint is working! Use POST for actual webhooks.',
    endpoint: '/api/messages/webhook',
    method: 'POST'
  });
});

module.exports = router;
