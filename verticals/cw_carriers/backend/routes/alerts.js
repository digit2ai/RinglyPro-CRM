/**
 * Alert/Notification Routes
 */
const express = require('express');
const router = express.Router();
const alerts = require('../services/alerts.cw');
const auth = require('../middleware/auth.cw');

router.use(auth);

// GET /log - Get alert history
router.get('/log', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const log = await alerts.getAlertLog(parseInt(limit));
    res.json({ success: true, data: log });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /recipients - Get configured alert recipients
router.get('/recipients', async (req, res) => {
  try {
    const recipients = await alerts.getAlertRecipients();
    res.json({ success: true, data: recipients });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /test - Send a test alert
router.post('/test', async (req, res) => {
  try {
    const { alert_type = 'hot_lead', phone, email } = req.body;
    const testData = {
      company_name: 'Test Company',
      contact_name: 'Test Contact',
      details: 'This is a test alert from CW Carriers CRM',
      load_ref: 'TEST-001',
      origin: 'Dallas, TX',
      destination: 'Chicago, IL',
      carrier_name: 'Test Carrier',
      rate_usd: '3,500',
      from_number: '+1234567890',
      time: new Date().toLocaleTimeString(),
      status: 'delivered',
      reason: 'Test escalation'
    };

    const results = [];
    if (phone) {
      const template = alerts.ALERT_TEMPLATES[alert_type];
      const msg = template?.sms ? template.sms.replace(/\{(\w+)\}/g, (_, k) => testData[k] || '') : `Test ${alert_type} alert`;
      results.push(await alerts.sendSms(phone, msg));
    }
    if (email) {
      results.push(await alerts.sendEmail(email, `[TEST] CW Alert: ${alert_type}`, `<p>This is a test ${alert_type} alert.</p>`));
    }
    if (!phone && !email) {
      const result = await alerts.sendAlert(alert_type, testData);
      results.push(result);
    }

    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /types - List available alert types
router.get('/types', (req, res) => {
  res.json({
    success: true,
    data: Object.entries(alerts.ALERT_TEMPLATES).map(([id, t]) => ({
      id,
      has_sms: !!t.sms,
      has_email: !!t.subject,
      subject: t.subject || ''
    }))
  });
});

module.exports = router;
