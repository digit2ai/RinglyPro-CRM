/**
 * McLeod TMS Bridge Routes
 * Inbound webhook receiver + TMS management endpoints
 */
const express = require('express');
const router = express.Router();
const tms = require('../services/tms.cw');
const auth = require('../middleware/auth.cw');

// POST /webhook - Inbound TMS webhook (NO AUTH - McLeod calls this)
router.post('/webhook', async (req, res) => {
  try {
    // Validate webhook secret if configured
    const config = await tms.getTmsConfig();
    if (config.webhookSecret) {
      const provided = req.headers['x-webhook-secret'] || req.headers['x-api-key'] || req.query.api_key;
      if (provided !== config.webhookSecret) {
        return res.status(403).json({ error: 'Invalid webhook secret' });
      }
    }

    const event = req.body;
    if (!event || !event.event_type) {
      return res.status(400).json({ error: 'event_type required' });
    }

    const result = await tms.processWebhookEvent(event);
    res.json(result);
  } catch (err) {
    console.error('CW TMS webhook error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- Authenticated endpoints below ---
router.use(auth);

// GET /config - Get TMS configuration
router.get('/config', async (req, res) => {
  try {
    const config = await tms.getTmsConfig();
    // Mask API key for display
    if (config.apiKey) config.apiKey = config.apiKey.substring(0, 8) + '***';
    if (config.webhookSecret) config.webhookSecret = config.webhookSecret.substring(0, 8) + '***';
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /events - Get TMS event log
router.get('/events', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const events = await tms.getEventLog(parseInt(limit));
    res.json({ success: true, data: events });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /pull - Pull loads from TMS API
router.post('/pull', async (req, res) => {
  try {
    const result = await tms.pullLoadsFromTms();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /status-map - Show TMS status mapping
router.get('/status-map', async (req, res) => {
  res.json({ success: true, data: tms.STATUS_MAP });
});

// POST /simulate - Simulate a TMS event for testing
router.post('/simulate', async (req, res) => {
  try {
    const event = req.body;
    if (!event || !event.event_type) {
      return res.status(400).json({ error: 'event_type required' });
    }
    const result = await tms.processWebhookEvent(event);
    res.json({ success: true, simulated: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
