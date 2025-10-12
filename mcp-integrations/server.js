require('dotenv').config();
const express = require('express');
const cors = require('cors');
const HubSpotMCPProxy = require('./api/hubspot-proxy');
const GoHighLevelMCPProxy = require('./api/gohighlevel-proxy');
const { ClaudeIntegration } = require('./api/claude-integration');
const VoiceHandler = require('./voice/voice-handler');
const TTSService = require('./voice/tts-service');
const STTService = require('./voice/stt-service');
const WebhookManager = require('./webhooks/webhook-manager');
const HubSpotWebhooks = require('./webhooks/hubspot-webhooks');
const GoHighLevelWebhooks = require('./webhooks/ghl-webhooks');
const WorkflowEngine = require('./workflows/workflow-engine');

const app = express();
const PORT = process.env.PORT || process.env.MCP_PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files from public directory
const path = require('path');
app.use(express.static(path.join(__dirname, '..', 'public')));

const sessions = new Map();
const webhookManager = new WebhookManager();
const workflowEngine = new WorkflowEngine();

// Health check
app.get('/api/mcp/health', (req, res) => {
  res.json({
    status: 'ok',
    activeSessions: sessions.size,
    timestamp: new Date().toISOString()
  });
});

// HubSpot connection
app.post('/api/mcp/hubspot/connect', async (req, res) => {
  const { accessToken } = req.body;

  try {
    const proxy = new HubSpotMCPProxy(accessToken);
    const sessionId = `hs_${Date.now()}`;

    sessions.set(sessionId, {
      type: 'hubspot',
      proxy,
      createdAt: new Date()
    });

    res.json({
      success: true,
      sessionId,
      message: 'HubSpot connected successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// GoHighLevel connection
app.post('/api/mcp/gohighlevel/connect', async (req, res) => {
  const { apiKey, locationId } = req.body;

  try {
    const proxy = new GoHighLevelMCPProxy(apiKey, locationId);
    const sessionId = `ghl_${Date.now()}`;

    sessions.set(sessionId, {
      type: 'gohighlevel',
      proxy,
      createdAt: new Date()
    });

    res.json({
      success: true,
      sessionId,
      message: 'GoHighLevel connected successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// AI Copilot chat
app.post('/api/mcp/copilot/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  try {
    // Simple intent parsing
    let response = "I'm here to help! Try asking me to search contacts or create a new contact.";
    let data = null;

    if (message.toLowerCase().includes('search') || message.toLowerCase().includes('find')) {
      const query = message.split(/search|find/i)[1].trim();
      data = await session.proxy.searchContacts(query);
      response = `I found ${data.length} contacts matching "${query}".`;
    } else if (message.toLowerCase().includes('create contact')) {
      response = "To create a contact, please provide: email, first name, and last name.";
    }

    res.json({
      success: true,
      response,
      data,
      suggestions: ['Search contacts', 'Create contact', 'View deals']
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// CRM operations
app.post('/api/mcp/:crm/:operation', async (req, res) => {
  const { sessionId } = req.body;
  const { crm, operation } = req.params;

  const session = sessions.get(sessionId);
  if (!session || session.type !== crm) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  try {
    let result;
    switch (operation) {
      case 'search-contacts':
        result = await session.proxy.searchContacts(req.body.query, req.body.limit);
        break;
      case 'create-contact':
        result = await session.proxy.createContact(req.body);
        break;
      case 'get-deals':
        result = await session.proxy.getDeals ? await session.proxy.getDeals(req.body.filters) :
                 await session.proxy.getOpportunities(req.body.filters);
        break;
      default:
        return res.status(400).json({ error: 'Unknown operation' });
    }

    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Webhook endpoints
app.post('/api/mcp/webhooks/:source', async (req, res) => {
  const { source } = req.params;
  const event = req.headers['x-webhook-event'] || 'unknown';
  const signature = req.headers['x-webhook-signature'];

  try {
    await webhookManager.processWebhook(source, event, req.body, signature);
    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Workflow endpoints
app.post('/api/mcp/workflows', async (req, res) => {
  try {
    const workflow = workflowEngine.createWorkflow(req.body);
    res.json({ success: true, workflow });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/mcp/workflows', (req, res) => {
  const workflows = workflowEngine.listWorkflows();
  res.json({ success: true, workflows });
});

app.post('/api/mcp/workflows/:id/execute', async (req, res) => {
  try {
    const execution = await workflowEngine.executeWorkflow(req.params.id, req.body);
    res.json({ success: true, execution });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 RinglyPro MCP Integration Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/mcp/health`);
  console.log(`🎨 UI: http://localhost:${PORT}/mcp-copilot/`);
});

module.exports = app;
