// src/routes/messages.js
const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Import Message model from models
const { Message, sequelize } = require('../models');

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

// GET /api/messages/client/:clientId - Get messages for a specific client
router.get('/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!Message) {
      console.log('⚠️ Message model not available');
      return res.status(503).json({ error: 'Message service not available' });
    }

    console.log(`📱 Fetching messages for client ${clientId}...`);

    const messages = await Message.findByClient(clientId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: 'DESC'
    });

    console.log(`✅ Found ${messages.length} messages for client ${clientId}`);
    res.json(messages);
  } catch (error) {
    console.error(`❌ Error fetching messages for client:`, error);
    res.status(500).json({
      error: 'Failed to fetch client messages',
      details: error.message
    });
  }
});

// POST /api/messages/sms - Send SMS and store in database (MULTI-TENANT)
router.post('/sms', async (req, res) => {
  try {
    const { to, message, clientId } = req.body;
    
    // Validate input
    if (!to || !message || !clientId) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: to, message, clientId' 
      });
    }

    console.log(`📤 Client ${clientId} sending SMS to ${to}: ${message}`);

    // Get client's dedicated Twilio number
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

    // Send via Twilio using client's dedicated number
    const twilioMessage = await client.messages.create({
      body: message,
      from: clientData.ringlypro_number, // Use client's Rachel number
      to: to
    });

    console.log(`✅ SMS sent successfully! SID: ${twilioMessage.sid}`);

    // Store in database WITH client_id
    let savedMessage = null;
    if (Message) {
      try {
        savedMessage = await Message.create({
          clientId: clientId,  // CRITICAL: Multi-tenant isolation
          twilioSid: twilioMessage.sid,
          direction: 'outbound',
          fromNumber: clientData.ringlypro_number,
          toNumber: to,
          body: message,
          status: twilioMessage.status || 'sent',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`💾 Message stored in database with ID: ${savedMessage.id} for client ${clientId}`);
      } catch (dbError) {
        console.error('⚠️ Failed to store message in database:', dbError.message);
        // Continue without failing the SMS send
      }
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
      success: false,
      error: 'Failed to send SMS',
      details: error.message 
    });
  }
});

// POST /api/messages/appointment-confirmation - Send appointment confirmation SMS
router.post('/appointment-confirmation', async (req, res) => {
  try {
    const { appointmentId, customerPhone, customerName, appointmentDate, appointmentTime, duration, confirmationCode, clientId } = req.body;
    
    // Validate required fields
    if (!customerPhone || !customerName || !appointmentDate || !appointmentTime || !clientId) {
      return res.status(400).json({ 
        error: 'Missing required appointment details',
        required: ['customerPhone', 'customerName', 'appointmentDate', 'appointmentTime', 'clientId']
      });
    }

    // Get client's dedicated Twilio number
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
        error: 'Client not found or inactive' 
      });
    }

    // Format appointment details into SMS message
    const appointmentMessage = formatAppointmentConfirmationSMS({
      customerName,
      appointmentDate,
      appointmentTime,
      duration: duration || 30,
      confirmationCode
    });

    console.log(`📅 Sending appointment confirmation to ${customerPhone} for ${customerName}`);

    // Send SMS via Twilio
    const twilioMessage = await client.messages.create({
      body: appointmentMessage,
      from: clientData.ringlypro_number,
      to: customerPhone
    });

    console.log(`✅ Appointment confirmation sent! SID: ${twilioMessage.sid}`);

    // Store in database
    let savedMessage = null;
    if (Message) {
      try {
        savedMessage = await Message.create({
          clientId: clientId,
          twilioSid: twilioMessage.sid,
          direction: 'outbound',
          fromNumber: clientData.ringlypro_number,
          toNumber: customerPhone,
          body: appointmentMessage,
          status: twilioMessage.status || 'sent',
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        console.log(`💾 Appointment confirmation stored in database with ID: ${savedMessage.id}`);
      } catch (dbError) {
        console.error('⚠️ Failed to store message in database:', dbError.message);
      }
    }

    res.json({
      success: true,
      message: 'Appointment confirmation sent successfully',
      twilioSid: twilioMessage.sid,
      status: twilioMessage.status,
      messageId: savedMessage ? savedMessage.id : null,
      appointmentId,
      confirmationCode,
      sentTo: customerPhone,
      customerName
    });

  } catch (error) {
    console.error('❌ Error sending appointment confirmation:', error);
    res.status(500).json({ 
      error: 'Failed to send appointment confirmation',
      details: error.message 
    });
  }
});

// POST /api/messages/appointment-cancellation - Send appointment cancellation SMS
router.post('/appointment-cancellation', async (req, res) => {
  try {
    const {
      appointmentId,
      customerPhone,
      customerName,
      appointmentDate,
      appointmentTime,
      confirmationCode,
      clientId,
      reason = 'scheduling conflict'
    } = req.body;

    // Validate required fields
    if (!customerPhone || !customerName || !appointmentDate || !appointmentTime || !clientId) {
      return res.status(400).json({
        error: 'Missing required fields: customerPhone, customerName, appointmentDate, appointmentTime, clientId'
      });
    }

    // Get client's dedicated Twilio number
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
        error: 'Client not found or inactive' 
      });
    }

    // Format date and time for display
    const formattedDate = new Date(appointmentDate).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const formattedTime = new Date(`2000-01-01T${appointmentTime}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Create cancellation message
    const message = `APPOINTMENT CANCELLED

Hi ${customerName},

Your appointment scheduled for:
Date: ${formattedDate}
Time: ${formattedTime}

Has been cancelled due to ${reason}.

${confirmationCode ? `Reference: ${confirmationCode}` : ''}

We apologize for any inconvenience. Please call us to reschedule.

- ${clientData.business_name}`;

    // Send SMS using Twilio
    const twilioMessage = await client.messages.create({
      body: message,
      from: clientData.ringlypro_number,
      to: customerPhone
    });

    console.log(`✅ Cancellation SMS sent to ${customerPhone} (SID: ${twilioMessage.sid})`);

    // Save message to database
    const savedMessage = await Message.create({
      clientId: clientId,
      twilioSid: twilioMessage.sid,
      direction: 'outbound',
      fromNumber: clientData.ringlypro_number,
      toNumber: customerPhone,
      body: message,
      status: 'sent',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.json({
      success: true,
      message: 'Cancellation SMS sent successfully',
      messageId: savedMessage.id,
      twilioSid: twilioMessage.sid,
      customerPhone: customerPhone
    });

  } catch (error) {
    console.error('❌ Error sending cancellation SMS:', error);
    res.status(500).json({
      error: 'Failed to send cancellation SMS',
      details: error.message
    });
  }
});

// Shared handler for incoming SMS webhooks
async function handleIncomingSMS(req, res) {
  try {
    const { MessageSid, From, To, Body, SmsStatus } = req.body;

    console.log(`📥 Incoming SMS webhook received:`);
    console.log(`   SID: ${MessageSid}`);
    console.log(`   From: ${From}`);
    console.log(`   To: ${To}`);
    console.log(`   Body: ${Body}`);
    console.log(`   Status: ${SmsStatus}`);

    // Find client by ringlypro_number
    const clientQuery = `
      SELECT id, business_name
      FROM clients
      WHERE ringlypro_number = $1 AND active = TRUE
    `;

    const [clientData] = await sequelize.query(clientQuery, {
      bind: [To],
      type: sequelize.QueryTypes.SELECT
    });

    // Store incoming message if Message model is available
    if (Message && clientData) {
      try {
        const savedMessage = await Message.create({
          clientId: clientData.id,
          twilioSid: MessageSid,
          direction: 'inbound',
          fromNumber: From,
          toNumber: To,
          body: Body,
          status: 'received',
          createdAt: new Date(),
          updatedAt: new Date()
        });

        console.log(`💾 Incoming message stored in database with ID: ${savedMessage.id} for client ${clientData.id}`);
      } catch (dbError) {
        console.error('⚠️ Failed to store incoming message:', dbError.message);
      }
    } else {
      console.log('⚠️ Message model not available or client not found - incoming message not stored');
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
}

// POST /api/messages/incoming - Primary Twilio webhook for incoming messages (configured in Twilio)
router.post('/incoming', handleIncomingSMS);

// POST /api/messages/webhook - Alternate webhook endpoint (backward compatibility)
router.post('/webhook', handleIncomingSMS);

// GET /api/messages/webhook - Handle GET requests to webhook (for testing)
router.get('/webhook', (req, res) => {
  res.json({
    message: 'Webhook endpoint is working! Use POST for actual webhooks.',
    endpoint: '/api/messages/webhook or /api/messages/incoming',
    method: 'POST'
  });
});

// GET /api/messages/incoming - Handle GET requests to incoming (for testing)
router.get('/incoming', (req, res) => {
  res.json({
    message: 'Incoming SMS webhook endpoint is working! Use POST for actual webhooks.',
    endpoint: '/api/messages/incoming',
    method: 'POST'
  });
});

// Helper function to format appointment confirmation message
function formatAppointmentConfirmationSMS({ customerName, appointmentDate, appointmentTime, duration, confirmationCode }) {
  // Format date
  const date = new Date(appointmentDate).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  // Format time (assuming it's already in HH:MM format)
  const time = appointmentTime;
  
  // Confirmation code
  const code = confirmationCode || 'N/A';

  return `APPOINTMENT CONFIRMED

Hi ${customerName}!

Your appointment has been scheduled:

Date: ${date}
Time: ${time}
Duration: ${duration} minutes
Confirmation: ${code}

RinglyPro CRM
Need to reschedule? Reply to this message.

Thank you for choosing our services!`;
}

module.exports = router;
