require('dotenv').config();
const express = require('express');
const cors = require('cors');
const HubSpotMCPProxy = require('./api/hubspot-proxy');
const GoHighLevelMCPProxy = require('./api/gohighlevel-proxy');
const BusinessCollectorMCPProxy = require('./api/business-collector-proxy');
const VagaroMCPProxy = require('./api/vagaro-proxy');
const { ClaudeIntegration } = require('./api/claude-integration');
const VoiceHandler = require('./voice/voice-handler');
const TTSService = require('./voice/tts-service');
const STTService = require('./voice/stt-service');
const WebhookManager = require('./webhooks/webhook-manager');
const HubSpotWebhooks = require('./webhooks/hubspot-webhooks');
const GoHighLevelWebhooks = require('./webhooks/ghl-webhooks');
const VagaroWebhooks = require('./webhooks/vagaro-webhooks');
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

// Initialize webhook handlers
// Vagaro webhooks don't need a proxy - they just handle incoming events
const vagaroWebhooks = new VagaroWebhooks(webhookManager);

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

// Business Collector - No auth required (public service)
app.post('/api/mcp/business-collector/connect', async (req, res) => {
  try {
    const proxy = new BusinessCollectorMCPProxy();
    const sessionId = `bc_${Date.now()}`;

    // Check if the service is healthy
    const health = await proxy.checkHealth();
    if (!health.success) {
      throw new Error('Business Collector service is offline');
    }

    sessions.set(sessionId, {
      type: 'business-collector',
      proxy,
      createdAt: new Date()
    });

    res.json({
      success: true,
      sessionId,
      message: 'Business Collector connected successfully',
      serviceStatus: health.status,
      version: health.version
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Business Collector - Collect businesses
app.post('/api/mcp/business-collector/collect', async (req, res) => {
  const { sessionId, category, geography, maxResults, synonyms, sourceHints } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'business-collector') {
    return res.status(401).json({ error: 'Invalid session' });
  }

  try {
    const result = await session.proxy.collectBusinesses({
      category,
      geography,
      maxResults: maxResults || 100,
      synonyms,
      sourceHints
    });

    res.json({
      success: result.success,
      meta: result.meta,
      summary: result.summary,
      businesses: result.businesses,
      displayText: result.success ?
        session.proxy.formatForDisplay(result.businesses, 10) :
        null,
      error: result.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Business Collector - Quick collect
app.get('/api/mcp/business-collector/quick', async (req, res) => {
  const { category, geography, max } = req.query;

  try {
    const proxy = new BusinessCollectorMCPProxy();
    const result = await proxy.quickCollect(category, geography, parseInt(max) || 50);

    res.json({
      success: result.success,
      summary: result.summary,
      businesses: result.businesses,
      displayText: result.success ?
        proxy.formatForDisplay(result.businesses, 10) :
        null,
      error: result.error
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ===========================================
// VAGARO INTEGRATION ENDPOINTS
// ===========================================

// Vagaro connection
app.post('/api/mcp/vagaro/connect', async (req, res) => {
  const { clientId, clientSecretKey, merchantId, region } = req.body;

  try {
    const proxy = new VagaroMCPProxy({
      clientId,
      clientSecretKey,
      merchantId,
      region: region || 'us01'
    });

    const sessionId = `vag_${Date.now()}`;

    sessions.set(sessionId, {
      type: 'vagaro',
      proxy,
      createdAt: new Date()
    });

    res.json({
      success: true,
      sessionId,
      message: 'Vagaro connected successfully'
    });
  } catch (error) {
    const statusCode = error.code === 'VAGARO_CREDENTIALS_MISSING' ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code || 'VAGARO_CONNECTION_ERROR'
    });
  }
});

// Vagaro check availability
app.post('/api/mcp/vagaro/check-availability', async (req, res) => {
  const { sessionId, serviceId, date, employeeId, locationId } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'vagaro') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Vagaro session',
      code: 'INVALID_SESSION'
    });
  }

  try {
    const slots = await session.proxy.getAvailability({
      serviceId,
      date,
      employeeId,
      locationId
    });

    const response = {
      success: true,
      slots: slots || []
    };

    if (!slots || slots.length === 0) {
      response.code = 'NO_AVAILABILITY';
    }

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'AVAILABILITY_CHECK_ERROR'
    });
  }
});

// Vagaro book appointment
app.post('/api/mcp/vagaro/book-appointment', async (req, res) => {
  const { sessionId, customer, appointment } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'vagaro') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Vagaro session',
      code: 'INVALID_SESSION'
    });
  }

  try {
    // Normalize phone before lookup
    const customerInfo = { ...customer };
    if (customerInfo.phone) {
      customerInfo.phone = customerInfo.phone.replace(/\D/g, '');
    }

    // Find or create customer
    const { customer: foundCustomer, isNew } = await session.proxy.findOrCreateCustomer(customerInfo);

    // Create appointment
    const created = await session.proxy.createAppointment({
      customerId: foundCustomer.customerId || foundCustomer.id,
      serviceId: appointment.serviceId,
      startTime: appointment.startTime,
      employeeId: appointment.employeeId,
      locationId: appointment.locationId,
      notes: appointment.notes
    });

    res.json({
      success: true,
      booked: true,
      appointment: created,
      customer: foundCustomer,
      isNewCustomer: isNew
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      booked: false,
      error: error.message,
      code: error.code || 'BOOKING_ERROR'
    });
  }
});

// Vagaro cancel appointment
app.post('/api/mcp/vagaro/cancel-appointment', async (req, res) => {
  const { sessionId, appointmentId } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'vagaro') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Vagaro session',
      code: 'INVALID_SESSION'
    });
  }

  try {
    await session.proxy.cancelAppointment(appointmentId);

    res.json({
      success: true,
      cancelled: true,
      appointmentId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      cancelled: false,
      error: error.message,
      code: error.code || 'CANCELLATION_ERROR'
    });
  }
});

// ===========================================
// AI COPILOT
// ===========================================

// AI Copilot chat
app.post('/api/mcp/copilot/chat', async (req, res) => {
  const { sessionId, message } = req.body;

  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  try {
    // Simple intent parsing
    let response = "I'm here to help! Try asking me to search contacts, create a contact, or collect business leads.";
    let data = null;
    let suggestions = ['Search contacts', 'Create contact', 'View deals', 'Collect business leads'];

    // Business Collector intents
    if (session.type === 'business-collector') {
      if (message.toLowerCase().includes('collect') || message.toLowerCase().includes('find businesses') || message.toLowerCase().includes('get leads')) {
        // Extract category and geography from message
        const categoryMatch = message.match(/(?:collect|find|get)\s+(?:leads\s+for\s+)?([^in]+?)\s+in\s+([^,]+)/i);

        if (categoryMatch) {
          const category = categoryMatch[1].trim();
          const geography = categoryMatch[2].trim();

          data = await session.proxy.collectBusinesses({
            category,
            geography,
            maxResults: 50
          });

          if (data.success) {
            response = `Found ${data.summary.total} ${category} in ${geography}!\n\n${session.proxy.formatForDisplay(data.businesses, 5)}\n\n...and ${data.summary.total - 5} more.`;
          } else {
            response = `Sorry, I couldn't collect businesses: ${data.error}`;
          }
        } else {
          response = "To collect business leads, say something like: 'Collect Real Estate Agents in Florida' or 'Find Plumbers in Tampa, FL'";
        }

        suggestions = ['Collect Real Estate Agents in Florida', 'Find Dentists in Miami', 'Get Plumbers in Tampa'];
      } else {
        response = "I can help you collect business leads! Try asking: 'Collect [Category] in [Location]'. For example: 'Collect Real Estate Agents in Florida'";
      }
    }
    // CRM intents (HubSpot, GoHighLevel)
    else if (message.toLowerCase().includes('search') || message.toLowerCase().includes('find')) {
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
      suggestions
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
