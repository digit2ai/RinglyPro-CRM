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

// Vagaro register webhook token (for multi-tenant webhook verification)
app.post('/api/mcp/vagaro/register-webhook', async (req, res) => {
  const { businessId, webhookToken, apiKey } = req.body;

  // Basic validation
  if (!businessId || !webhookToken) {
    return res.status(400).json({
      success: false,
      error: 'businessId and webhookToken are required',
      code: 'MISSING_PARAMS'
    });
  }

  // Optional: Verify API key for security (prevent unauthorized registrations)
  const adminApiKey = process.env.RINGLYPRO_ADMIN_API_KEY;
  if (adminApiKey && apiKey !== adminApiKey) {
    return res.status(401).json({
      success: false,
      error: 'Invalid API key',
      code: 'UNAUTHORIZED'
    });
  }

  registerTenantWebhookToken(businessId, webhookToken);

  res.json({
    success: true,
    message: `Webhook token registered for business ${businessId}`
  });
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
// ZOHO CRM INTEGRATION
// ===========================================

const ZohoMCPProxy = require('./api/zoho-proxy');
const ZohoWebhooks = require('./webhooks/zoho-webhooks');

// Initialize Zoho webhook handlers
const zohoWebhooks = new ZohoWebhooks(webhookManager);

// Zoho CRM connection
app.post('/api/mcp/zoho/connect', async (req, res) => {
  const { clientId, clientSecret, refreshToken, accessToken, region } = req.body;

  try {
    const proxy = new ZohoMCPProxy({
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
      region: region || 'com'
    });

    // Test the connection
    const testResult = await proxy.testConnection();
    if (!testResult.success) {
      return res.status(400).json({
        success: false,
        error: testResult.error || 'Failed to connect to Zoho CRM',
        code: testResult.code || 'ZOHO_CONNECTION_ERROR'
      });
    }

    const sessionId = `zoho_${Date.now()}`;

    sessions.set(sessionId, {
      type: 'zoho',
      proxy,
      createdAt: new Date(),
      user: testResult.user
    });

    res.json({
      success: true,
      sessionId,
      message: 'Zoho CRM connected successfully',
      user: testResult.user
    });
  } catch (error) {
    const statusCode = error.code === 'ZOHO_CREDENTIALS_MISSING' ? 400 : 500;
    res.status(statusCode).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_CONNECTION_ERROR'
    });
  }
});

// Zoho find or create contact (primary tool for ElevenLabs)
app.post('/api/mcp/zoho/find-or-create-contact', async (req, res) => {
  const { sessionId, firstName, lastName, phone, email } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  try {
    const result = await session.proxy.findOrCreateContact({
      firstName,
      lastName,
      phone,
      email
    });

    res.json({
      success: result.success,
      contact: result.contact,
      isNewContact: result.isNew,
      matchedOn: result.matchedOn,
      error: result.error,
      code: result.code
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
    });
  }
});

// Zoho search contacts
app.post('/api/mcp/zoho/search-contacts', async (req, res) => {
  const { sessionId, query, limit } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  try {
    const result = await session.proxy.searchContacts(query, limit || 10);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
    });
  }
});

// Zoho update contact
app.post('/api/mcp/zoho/update-contact', async (req, res) => {
  const { sessionId, contactId, updates } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  if (!contactId) {
    return res.status(400).json({
      success: false,
      error: 'contactId is required',
      code: 'MISSING_PARAMS'
    });
  }

  try {
    const result = await session.proxy.updateContact(contactId, updates);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
    });
  }
});

// Zoho log call (for call disposition/summary)
app.post('/api/mcp/zoho/log-call', async (req, res) => {
  const { sessionId, whoId, direction, durationSeconds, summary, callTime, subject } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  if (!whoId) {
    return res.status(400).json({
      success: false,
      error: 'whoId (contact ID) is required',
      code: 'MISSING_PARAMS'
    });
  }

  try {
    const result = await session.proxy.logCall({
      whoId,
      direction: direction || 'Inbound',
      durationSeconds: durationSeconds || 0,
      summary: summary || '',
      callTime: callTime || new Date().toISOString(),
      subject
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
    });
  }
});

// Zoho create task (for follow-ups)
app.post('/api/mcp/zoho/create-task', async (req, res) => {
  const { sessionId, whoId, subject, dueDate, notes, priority } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  if (!subject) {
    return res.status(400).json({
      success: false,
      error: 'subject is required',
      code: 'MISSING_PARAMS'
    });
  }

  try {
    const result = await session.proxy.createTask({
      subject,
      dueDate: dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Default: tomorrow
      whoId,
      notes: notes || '',
      priority: priority || 'Normal'
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
    });
  }
});

// Zoho add note
app.post('/api/mcp/zoho/add-note', async (req, res) => {
  const { sessionId, parentId, noteTitle, noteContent } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  if (!parentId || !noteContent) {
    return res.status(400).json({
      success: false,
      error: 'parentId and noteContent are required',
      code: 'MISSING_PARAMS'
    });
  }

  try {
    const result = await session.proxy.addNote({
      parentId,
      noteTitle: noteTitle || 'Note',
      noteContent
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
    });
  }
});

// Zoho search leads
app.post('/api/mcp/zoho/search-leads', async (req, res) => {
  const { sessionId, query, limit } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  try {
    const result = await session.proxy.searchLeads(query, limit || 10);
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
    });
  }
});

// Zoho create lead
app.post('/api/mcp/zoho/create-lead', async (req, res) => {
  const { sessionId, firstName, lastName, phone, email, company, source } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  try {
    const result = await session.proxy.createLead({
      firstName,
      lastName: lastName || 'Unknown',
      phone,
      email,
      company: company || 'Unknown',
      source: source || 'Phone'
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
    });
  }
});

// Zoho get deals
app.post('/api/mcp/zoho/get-deals', async (req, res) => {
  const { sessionId, contactId, limit } = req.body;

  const session = sessions.get(sessionId);
  if (!session || session.type !== 'zoho') {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired Zoho session',
      code: 'INVALID_SESSION'
    });
  }

  try {
    const result = await session.proxy.getDeals({ contactId, limit });
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code || 'ZOHO_API_ERROR'
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

// Vagaro webhook IP whitelist (from docs.vagaro.com/public/docs/securing-webhook-endpoint)
const VAGARO_WEBHOOK_IPS = [
  '20.220.12.83',
  '13.67.143.68',
  '13.70.105.4',
  '20.62.123.184',
  '51.140.65.108',
  '51.143.95.2'
];

/**
 * Multi-tenant webhook token storage
 * In production, this would be backed by a database (e.g., MongoDB, PostgreSQL)
 * Keyed by Vagaro businessId -> webhook verification token
 */
const tenantWebhookTokens = new Map();

/**
 * Register a tenant's Vagaro webhook token (called during onboarding)
 * @param {string} businessId - Vagaro business ID
 * @param {string} webhookToken - Verification token from Vagaro webhook setup
 */
function registerTenantWebhookToken(businessId, webhookToken) {
  tenantWebhookTokens.set(businessId, webhookToken);
  console.log(`[Vagaro] Registered webhook token for business: ${businessId}`);
}

/**
 * Verify Vagaro webhook signature for multi-tenant
 * Vagaro uses X-Vagaro-Signature header with a verification token
 * @param {string} signature - The signature from X-Vagaro-Signature header
 * @param {object} payload - The webhook payload (to extract businessId)
 * @returns {boolean} Whether signature is valid
 */
function verifyVagaroSignature(signature, payload) {
  // Extract businessId from payload (present in all Vagaro webhook events)
  const businessId = payload?.payload?.businessId || payload?.businessId;

  // Look up tenant-specific token
  const tenantToken = businessId ? tenantWebhookTokens.get(businessId) : null;

  if (tenantToken) {
    return signature === tenantToken;
  }

  // Fallback: Check global token (for single-tenant or development)
  const globalToken = process.env.VAGARO_WEBHOOK_TOKEN;
  if (globalToken) {
    return signature === globalToken;
  }

  // No token configured - skip verification (development mode)
  console.warn('[Vagaro Webhook] No webhook token configured - skipping signature verification');
  return true;
}

/**
 * Get client IP from request (handles proxies)
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         req.socket?.remoteAddress;
}

// Webhook endpoints (must be before generic :crm/:operation route)
app.post('/api/mcp/webhooks/:source', async (req, res) => {
  const { source } = req.params;
  const event = req.headers['x-webhook-event'] || req.body?.type || 'unknown';
  const signature = req.headers['x-vagaro-signature'] || req.headers['x-webhook-signature'];

  // Vagaro-specific security checks
  if (source === 'vagaro') {
    // Verify signature if configured (pass payload for multi-tenant lookup)
    if (!verifyVagaroSignature(signature, req.body)) {
      console.warn('[Vagaro Webhook] Invalid signature rejected');
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Optional: IP whitelist check (can be enabled via env var)
    if (process.env.VAGARO_ENFORCE_IP_WHITELIST === 'true') {
      const clientIp = getClientIp(req);
      if (!VAGARO_WEBHOOK_IPS.includes(clientIp)) {
        console.warn(`[Vagaro Webhook] Rejected request from non-whitelisted IP: ${clientIp}`);
        return res.status(403).json({
          success: false,
          error: 'IP not whitelisted',
          code: 'IP_NOT_WHITELISTED'
        });
      }
    }
  }

  // Best practice: Respond immediately with 2xx, process async
  // Ref: https://docs.vagaro.com/public/docs/best-practices
  res.json({ success: true, message: 'Webhook received' });

  // Process webhook asynchronously (don't block response)
  webhookManager.processWebhook(source, event, req.body, signature)
    .catch(error => {
      console.error(`[Webhook] Error processing ${source}:${event}:`, error.message);
    });
});

// CRM operations (generic catch-all - must be LAST)
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
