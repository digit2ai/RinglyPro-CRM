/**
 * RinglyPro CRM NLP Agent API
 */
const express = require('express');
const router = express.Router();
const { sequelize } = require('../models');
const CrmNlpAgent = require('../services/crmNlpAgent');

const agent = new CrmNlpAgent(sequelize);

// Auth: JWT or API key
function requireAuth(req, res, next) {
  const apiKey = req.query.apiKey || req.headers['x-api-key'] || req.body?.apiKey;
  if (apiKey === (process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024')) return next();
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const jwt = require('jsonwebtoken');
      req.user = jwt.verify(token, process.env.JWT_SECRET || 'ringlypro-jwt-secret');
      return next();
    } catch (e) { /* fall through */ }
  }
  return res.status(401).json({ success: false, error: 'Authentication required' });
}

router.use(requireAuth);

// POST /api/crm-agent/chat — Main chat endpoint
router.post('/chat', async (req, res) => {
  try {
    const clientId = parseInt(req.body.client_id || req.user?.clientId);
    const { message, context } = req.body;

    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });
    if (!message) return res.status(400).json({ success: false, error: 'message required' });

    const result = await agent.processMessage(clientId, message, context || {});
    res.json(result);
  } catch (error) {
    console.error('[CRM Agent] Chat error:', error.message);
    res.status(500).json({ success: false, reply: 'Internal error: ' + error.message, actions_taken: [] });
  }
});

// GET /api/crm-agent/capabilities — What CRMs are connected
router.get('/capabilities', async (req, res) => {
  try {
    const clientId = parseInt(req.query.client_id || req.user?.clientId);
    if (!clientId) return res.status(400).json({ success: false, error: 'client_id required' });
    const result = await agent.getCapabilities(clientId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
