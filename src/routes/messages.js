const express = require('express');
const router = express.Router();
const twilio = require('twilio');

// Initialize Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

// Send SMS message
router.post('/sms', async (req, res) => {
  try {
    const { to, message } = req.body;
    
    if (!to || !message) {
      return res.status(400).json({ error: 'Phone number and message are required' });
    }

    const result = await client.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: to
    });

    res.json({
      success: true,
      messageSid: result.sid,
      status: result.status,
      to: result.to,
      from: result.from
    });
  } catch (error) {
    console.error('SMS sending error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get message history
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

// Test Twilio connection
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