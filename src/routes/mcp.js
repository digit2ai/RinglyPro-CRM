// src/routes/mcp.js - MCP AI Copilot Integration Routes
const express = require('express');
const router = express.Router();
const path = require('path');

// Import MCP services - using absolute path from project root
const projectRoot = path.join(__dirname, '../..');
const HubSpotMCPProxy = require(path.join(projectRoot, 'mcp-integrations/api/hubspot-proxy'));
const GoHighLevelMCPProxy = require(path.join(projectRoot, 'mcp-integrations/api/gohighlevel-proxy'));
const WebhookManager = require(path.join(projectRoot, 'mcp-integrations/webhooks/webhook-manager'));
const WorkflowEngine = require(path.join(projectRoot, 'mcp-integrations/workflows/workflow-engine'));

// Initialize services
const sessions = new Map();
const webhookManager = new WebhookManager();
const workflowEngine = new WorkflowEngine();

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MCP Integration',
    activeSessions: sessions.size,
    timestamp: new Date().toISOString()
  });
});

// HubSpot connection
router.post('/hubspot/connect', async (req, res) => {
  console.log('🔗 HubSpot connection request received');
  const { accessToken } = req.body;

  if (!accessToken) {
    console.error('❌ Missing HubSpot access token');
    return res.status(400).json({
      success: false,
      error: 'Access token is required'
    });
  }

  try {
    const proxy = new HubSpotMCPProxy(accessToken);
    const sessionId = `hs_${Date.now()}`;

    sessions.set(sessionId, {
      type: 'hubspot',
      proxy,
      createdAt: new Date()
    });

    console.log('✅ HubSpot connected, session:', sessionId);
    res.json({
      success: true,
      sessionId,
      message: 'HubSpot connected successfully'
    });
  } catch (error) {
    console.error('❌ HubSpot connection error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to connect to HubSpot'
    });
  }
});

// GoHighLevel connection
router.post('/gohighlevel/connect', async (req, res) => {
  console.log('🔗 GoHighLevel connection request received');
  const { apiKey, locationId } = req.body;

  if (!apiKey || !locationId) {
    console.error('❌ Missing GoHighLevel credentials');
    return res.status(400).json({
      success: false,
      error: 'API Key and Location ID are required'
    });
  }

  try {
    const proxy = new GoHighLevelMCPProxy(apiKey, locationId);
    const sessionId = `ghl_${Date.now()}`;

    sessions.set(sessionId, {
      type: 'gohighlevel',
      proxy,
      createdAt: new Date()
    });

    console.log('✅ GoHighLevel connected, session:', sessionId);
    res.json({
      success: true,
      sessionId,
      message: 'GoHighLevel connected successfully'
    });
  } catch (error) {
    console.error('❌ GoHighLevel connection error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to connect to GoHighLevel'
    });
  }
});

// AI Copilot chat
router.post('/copilot/chat', async (req, res) => {
  console.log('📩 MCP Chat request received:', { sessionId: req.body.sessionId, message: req.body.message?.substring(0, 50) });

  const { sessionId, message } = req.body;

  if (!sessionId || !message) {
    console.error('❌ Missing sessionId or message');
    return res.status(400).json({
      success: false,
      error: 'Missing sessionId or message'
    });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    console.error('❌ Invalid session:', sessionId);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired session. Please reconnect to your CRM.'
    });
  }

  try {
    console.log('🤖 Processing message for session:', sessionId);

    // Simple intent parsing
    let response = "I'm here to help! Try asking me to search contacts, view deals, list calendars, or show location info.";
    let data = null;

    const lowerMessage = message.toLowerCase();

    // OPPORTUNITIES / DEALS
    if (lowerMessage.includes('opportunit') || lowerMessage.includes('deal') || lowerMessage.includes('pipeline')) {
      if (lowerMessage.includes('search') || lowerMessage.includes('show') || lowerMessage.includes('view') || lowerMessage.includes('list')) {
        if (lowerMessage.includes('pipeline')) {
          console.log('📊 Getting pipelines');
          try {
            const pipelines = await session.proxy.getPipelines();
            response = `Found ${pipelines?.pipelines?.length || 0} pipelines:\n\n`;
            if (pipelines?.pipelines) {
              pipelines.pipelines.forEach(p => {
                response += `• ${p.name} (${p.stages?.length || 0} stages)\n`;
              });
            }
            data = pipelines?.pipelines || [];
          } catch (error) {
            response = `Error loading pipelines: ${error.message}`;
          }
        } else {
          console.log('💰 Searching opportunities');
          try {
            const opps = await session.proxy.getOpportunities();
            response = `Found ${opps?.length || 0} opportunities:\n\n`;
            if (opps && opps.length > 0) {
              opps.slice(0, 5).forEach(o => {
                response += `• ${o.name || 'Untitled'} - $${o.monetaryValue || 0} (${o.status || 'open'})\n`;
              });
              if (opps.length > 5) response += `\n... and ${opps.length - 5} more`;
            }
            data = opps;
          } catch (error) {
            response = `Error loading opportunities: ${error.message}`;
          }
        }
      } else {
        response = "Try: 'show opportunities', 'view deals', or 'show all pipelines'";
      }
    }
    // CALENDARS
    else if (lowerMessage.includes('calendar') || lowerMessage.includes('appointment')) {
      if (lowerMessage.includes('list') || lowerMessage.includes('show')) {
        console.log('📅 Getting calendars');
        try {
          const calendars = await session.proxy.getCalendars();
          response = `Found ${calendars?.calendars?.length || 0} calendars:\n\n`;
          if (calendars?.calendars) {
            calendars.calendars.forEach(cal => {
              response += `• ${cal.name}\n`;
            });
          }
          data = calendars?.calendars || [];
        } catch (error) {
          response = `Error loading calendars: ${error.message}`;
        }
      } else {
        response = "Try: 'list calendars' or 'show calendars'";
      }
    }
    // LOCATION INFO
    else if (lowerMessage.includes('location') && (lowerMessage.includes('show') || lowerMessage.includes('info'))) {
      console.log('🏢 Getting location info');
      try {
        const location = await session.proxy.getLocation();
        response = `Location: ${location?.name || 'Unknown'}\n`;
        if (location?.address) response += `Address: ${location.address}\n`;
        if (location?.phone) response += `Phone: ${location.phone}\n`;
        data = [location];
      } catch (error) {
        response = `Error loading location: ${error.message}`;
      }
    }
    // CUSTOM FIELDS
    else if (lowerMessage.includes('custom field')) {
      console.log('📝 Getting custom fields');
      try {
        const fields = await session.proxy.getCustomFields();
        response = `Found ${fields?.customFields?.length || 0} custom fields:\n\n`;
        if (fields?.customFields) {
          fields.customFields.slice(0, 10).forEach(f => {
            response += `• ${f.name} (${f.dataType})\n`;
          });
        }
        data = fields?.customFields || [];
      } catch (error) {
        response = `Error loading custom fields: ${error.message}`;
      }
    }
    // TAGS
    else if (lowerMessage.includes('add tag') || lowerMessage.includes('tag')) {
      const contactIdMatch = message.match(/contact\s+([a-zA-Z0-9]+)/i);
      const tagMatch = message.match(/tag[s]?\s+([^to]+?)(?:\s+to|$)/i);

      if (contactIdMatch && tagMatch) {
        const contactId = contactIdMatch[1];
        const tags = tagMatch[1].split(',').map(t => t.trim());
        console.log(`🏷️ Adding tags ${tags} to contact ${contactId}`);
        try {
          await session.proxy.addTags(contactId, tags);
          response = `✅ Added ${tags.length} tag(s) to contact ${contactId}`;
        } catch (error) {
          response = `Error adding tags: ${error.message}`;
        }
      } else {
        response = "To add tags: 'add tag VIP to contact CONTACT_ID' or 'add tags VIP, Customer to contact ID123'";
      }
    }
    // CONTACT SEARCH
    else if (lowerMessage.includes('search') || lowerMessage.includes('find')) {
      // Extract search query - remove common filler words
      let query = message.split(/search|find/i)[1]?.trim() || '';

      // Remove filler words like "contact", "contacts", "for", "the"
      query = query.replace(/^(contact|contacts|for|the|a|an)\s+/i, '').trim();

      if (query) {
        console.log('🔍 Searching contacts with query:', query);
        try {
          data = await session.proxy.searchContacts(query);
          response = `I found ${data?.length || 0} contacts matching "${query}".`;

          // Show some contact details if found
          if (data && data.length > 0) {
            const contactList = data.slice(0, 5).map(c => {
              const name = c.contactName || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed';
              const email = c.email ? `(${c.email})` : '';
              const phone = !c.email && c.phone ? `(${c.phone})` : '';
              return `• ${name} ${email}${phone}`;
            }).join('\n');
            response += `\n\n${contactList}`;
            if (data.length > 5) response += `\n... and ${data.length - 5} more`;
          }
        } catch (searchError) {
          console.error('❌ Search error:', searchError.message);
          response = `Sorry, I encountered an error searching for "${query}". Please check your connection and try again.`;
        }
      } else {
        response = "Please provide a search term. Example: 'search Manuel' or 'find john@example.com'";
      }
    } else if (lowerMessage.includes('create contact') || lowerMessage.includes('add contact')) {
      // Try to parse contact info from message
      const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);
      const phoneMatch = message.match(/\+?1?\s*\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/);

      // Extract names - look for patterns like "named John Doe" but not "Add contact named"
      const nameMatch = message.match(/(?:named|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/i);

      if (emailMatch || phoneMatch || nameMatch) {
        try {
          const contactData = {};

          if (nameMatch) {
            const names = nameMatch[1].split(' ');
            contactData.firstName = names[0];
            if (names.length > 1) contactData.lastName = names.slice(1).join(' ');
          }

          if (emailMatch) contactData.email = emailMatch[0];
          if (phoneMatch) contactData.phone = phoneMatch[0];

          console.log('📝 Creating contact:', contactData);
          const result = await session.proxy.createContact(contactData);
          response = `✅ Contact created successfully! ${contactData.firstName || 'New contact'} has been added to your CRM.`;
          data = [result];
        } catch (createError) {
          console.error('❌ Create contact error:', createError.message);
          response = `Sorry, I couldn't create the contact. Error: ${createError.message}`;
        }
      } else {
        response = "To create a contact, please provide at least one of: name, email, or phone number.\n\nExample: 'Create contact named John Doe with email john@example.com and phone 813-555-1234'";
      }
    } else if (lowerMessage.includes('send sms') || lowerMessage.includes('send message') || lowerMessage.includes('text')) {
      response = "To send an SMS, I need a contact ID or phone number and the message text.\n\nExample: 'Send SMS to john@example.com: Hello, thanks for signing up!'";
    } else if (lowerMessage.includes('deal') || lowerMessage.includes('opportunity')) {
      response = "Would you like to view existing deals or create a new one?";
    }

    console.log('✅ MCP Chat response ready');
    res.json({
      success: true,
      response,
      data,
      suggestions: ['Search contacts', 'View deals', 'Show pipelines', 'List calendars', 'Show location info']
    });
  } catch (error) {
    console.error('❌ MCP Chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Internal server error'
    });
  }
});

// CRM operations
router.post('/:crm/:operation', async (req, res) => {
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
router.post('/webhooks/:source', async (req, res) => {
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
router.post('/workflows', async (req, res) => {
  try {
    const workflow = workflowEngine.createWorkflow(req.body);
    res.json({ success: true, workflow });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/workflows', (req, res) => {
  const workflows = workflowEngine.listWorkflows();
  res.json({ success: true, workflows });
});

router.post('/workflows/:id/execute', async (req, res) => {
  try {
    const execution = await workflowEngine.executeWorkflow(req.params.id, req.body);
    res.json({ success: true, execution });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
