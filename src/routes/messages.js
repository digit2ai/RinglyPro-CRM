// src/routes/messages.js
// REPLACE your existing messages.js file with this enhanced version

const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Import the new Message model
const Message = require('../models/Message');
const Contact = require('../models/Contact');

// Initialize Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Helper function to find contact by phone number
async function findContactByPhone(phoneNumber) {
  try {
    const contact = await Contact.findByPhone(phoneNumber);
    return contact;
  } catch (error) {
    console.error('Error finding contact by phone:', error);
    return null;
  }
}

// Enhanced SMS endpoint with database storage
router.post('/sms', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    console.log('📤 Sending SMS:', { to, messagePreview: message.substring(0, 50) + '...' });

    // Find contact by phone number
    const contact = await findContactByPhone(to);
    console.log('👤 Contact found:', contact ? `${contact.firstName} ${contact.lastName}` : 'Unknown contact');

    // Send SMS via Twilio
    const twilioMessage = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    console.log('✅ Twilio SMS sent:', twilioMessage.sid);

    // Store message in database
    const messageRecord = await Message.create({
      contactId: contact ? contact.id : null,
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

    // Update contact's last contacted timestamp if contact exists
    if (contact) {
      await contact.updateLastContacted();
      console.log('📅 Updated last contacted for:', `${contact.firstName} ${contact.lastName}`);
    }

    res.json({
      success: true,
      messageSid: twilioMessage.sid,
      messageId: messageRecord.id,
      status: twilioMessage.status,
      to: twilioMessage.to,
      from: twilioMessage.from,
      contact: contact ? {
        id: contact.id,
        name: `${contact.firstName} ${contact.lastName}`
      } : null
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
    console.log('📱 Loading today\'s messages from database...');
    
    const messages = await Message.getTodaysMessages();
    
    // Format messages for dashboard
    const formattedMessages = await Promise.all(messages.map(async (msg) => {
      let contactName = 'Unknown Contact';
      
      if (msg.contactId) {
        const contact = await Contact.findByPk(msg.contactId);
        if (contact) {
          contactName = `${contact.firstName} ${contact.lastName}`;
        }
      }
      
      return {
        id: msg.id,
        contact: contactName,
        phone: msg.direction === 'incoming' ? msg.fromNumber : msg.toNumber,
        message: msg.body,
        time: new Date(msg.createdAt).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit' 
        }),
        direction: msg.direction,
        status: msg.status,
        twilioSid: msg.twilioSid
      };
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

// Get message history for a specific contact
router.get('/history/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const contact = await Contact.findByPk(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    const messages = await Message.findByContact(contactId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: 'DESC'
    });

    res.json({
      success: true,
      data: {
        contact: {
          id: contact.id,
          name: `${contact.firstName} ${contact.lastName}`,
          phone: contact.phone
        },
        messages: messages.map(msg => ({
          id: msg.id,
          body: msg.body,
          direction: msg.direction,
          status: msg.status,
          createdAt: msg.createdAt,
          formattedDate: msg.getFormattedDate()
        })),
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: messages.length
        }
      }
    });
  } catch (error) {
    console.error('Error fetching message history:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get message history (keep existing endpoints that might be used)
router.get('/history/:contactId', async (req, res) => {
  try {
    const { contactId } = req.params;
    
    res.json({
      message: 'Message history endpoint - now with database integration!',
      contactId,
      messages: []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all messages
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
