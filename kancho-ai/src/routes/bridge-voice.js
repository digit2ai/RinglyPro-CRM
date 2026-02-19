'use strict';

// Bridge Voice - Manage RinglyPro voice agent settings from KanchoAI
// Toggle Rachel/Ana, update greetings, view voice status

const express = require('express');
const router = express.Router();

let crmBridge;
try { crmBridge = require('../../config/crm-bridge'); } catch (e) { console.log('CRM Bridge not loaded:', e.message); }

// GET /status - Get voice agent status for this school
router.get('/status', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const client = await crmBridge.Client.findByPk(req.clientId);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const user = await crmBridge.User.findByPk(req.userId);

    res.json({
      success: true,
      data: {
        aiNumber: client.ringlypro_number,
        rachelEnabled: client.rachel_enabled,
        bookingEnabled: client.booking_enabled,
        smsNotifications: client.sms_notifications,
        ivrEnabled: client.ivr_enabled,
        customGreeting: client.custom_greeting,
        businessHours: {
          start: client.business_hours_start,
          end: client.business_hours_end,
          days: client.business_days
        },
        tokens: user ? {
          balance: user.tokens_balance,
          usedThisMonth: user.tokens_used_this_month,
          monthlyAllocation: user.monthly_token_allocation,
          plan: user.subscription_plan
        } : null
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /toggle - Enable/disable AI voice agent
router.post('/toggle', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const client = await crmBridge.Client.findByPk(req.clientId);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const enabled = req.body.enabled !== undefined ? req.body.enabled : !client.rachel_enabled;
    await client.update({ rachel_enabled: enabled });

    console.log(`KanchoAI Bridge: Voice agent ${enabled ? 'enabled' : 'disabled'} for client ${req.clientId}`);

    res.json({
      success: true,
      data: { rachelEnabled: enabled },
      message: `AI voice agent ${enabled ? 'activated' : 'deactivated'} for your school`
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /greeting - Update custom greeting
router.put('/greeting', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const client = await crmBridge.Client.findByPk(req.clientId);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    await client.update({ custom_greeting: req.body.greeting });

    res.json({
      success: true,
      data: { customGreeting: req.body.greeting },
      message: 'Voice greeting updated'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /hours - Update business hours
router.put('/hours', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const client = await crmBridge.Client.findByPk(req.clientId);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const updates = {};
    if (req.body.start) updates.business_hours_start = req.body.start;
    if (req.body.end) updates.business_hours_end = req.body.end;
    if (req.body.days) updates.business_days = req.body.days;
    if (req.body.calendarSettings) updates.calendar_settings = req.body.calendarSettings;

    await client.update(updates);

    res.json({
      success: true,
      data: {
        businessHoursStart: client.business_hours_start,
        businessHoursEnd: client.business_hours_end,
        businessDays: client.business_days
      },
      message: 'Business hours updated'
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /settings - Update voice/booking settings
router.put('/settings', async (req, res) => {
  if (!crmBridge?.ready || !req.clientId) return res.status(503).json({ success: false, error: 'CRM not available' });

  try {
    const client = await crmBridge.Client.findByPk(req.clientId);
    if (!client) return res.status(404).json({ success: false, error: 'Client not found' });

    const allowed = ['booking_enabled', 'sms_notifications', 'appointment_duration', 'ivr_enabled', 'ivr_options'];
    const updates = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) updates[key] = req.body[key];
    }

    await client.update(updates);
    res.json({ success: true, data: updates, message: 'Settings updated' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
