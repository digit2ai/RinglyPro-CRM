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

    // IMPORTANT: Check SPECIFIC commands FIRST before generic keywords
    // This prevents "book appointment" from matching generic "appointment" handler

    // CREATE NEW CONTACT (check before generic "contact" search)
    if (lowerMessage.includes('create') && lowerMessage.includes('contact')) {
      // Try to parse contact info from message
      const emailMatch = message.match(/[\w.-]+@[\w.-]+\.\w+/);

      // More flexible phone matching - also match "phone 8136414177" or just "8136414177"
      let phoneMatch = message.match(/phone\s+(\d{10})/i); // Try "phone 8136414177" first
      if (!phoneMatch) {
        // Try formatted number: (813) 555-1234 or 813-555-1234
        phoneMatch = message.match(/\+?1?\s*\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})/);
      }
      if (!phoneMatch) {
        // Try any 10 consecutive digits
        phoneMatch = message.match(/(\d{10})/);
      }

      // Extract names - multiple patterns
      let nameMatch = message.match(/(?:named|called)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      if (!nameMatch) {
        // Try "create contact [Name]" pattern - match word(s) between "contact" and "phone"/"email"
        nameMatch = message.match(/contact\s+([A-Za-z0-9]+(?:\s+[A-Za-z0-9]+)*?)\s+(?:phone|email)/i);
      }
      if (!nameMatch) {
        // Try single word after contact
        nameMatch = message.match(/contact\s+([A-Za-z0-9]+)/i);
      }

      if (emailMatch || phoneMatch || nameMatch) {
        try {
          const contactData = {};

          if (nameMatch) {
            const fullName = nameMatch[1].trim();
            const names = fullName.split(/\s+/);
            contactData.firstName = names[0];
            if (names.length > 1) contactData.lastName = names.slice(1).join(' ');
          }

          if (emailMatch) contactData.email = emailMatch[0];

          if (phoneMatch) {
            // Normalize phone number to E.164 format (+1XXXXXXXXXX)
            let phone = phoneMatch[1] || phoneMatch[0];
            phone = phone.replace(/\D/g, ''); // Remove non-digits
            if (phone.length === 10) {
              phone = `+1${phone}`; // Add US country code
            } else if (phone.length === 11 && phone.startsWith('1')) {
              phone = `+${phone}`;
            }
            contactData.phone = phone;
          }

          console.log('📝 Creating contact:', contactData);
          const result = await session.proxy.createContact(contactData);
          response = `✅ Contact created successfully! ${contactData.firstName || 'New contact'} has been added to your CRM.\n\nName: ${contactData.firstName || ''} ${contactData.lastName || ''}\nEmail: ${contactData.email || 'N/A'}\nPhone: ${contactData.phone || 'N/A'}`;
          data = [result];
        } catch (createError) {
          console.error('❌ Create contact error:', createError.message);
          response = `Sorry, I couldn't create the contact. Error: ${createError.message}`;
        }
      } else {
        response = "To create a contact, please provide at least one of: name, email, or phone number.\n\nExamples:\n• 'Create contact named John Doe with email john@example.com'\n• 'Create contact John phone 8136414177'\n• 'Create contact named Jane Smith phone 813-555-1234'";
      }
    }
    // BOOK APPOINTMENT (check before generic "appointment" or "calendar" handlers)
    else if (lowerMessage.includes('book') && lowerMessage.includes('appointment')) {
      console.log('📅 Booking appointment request');
      try {
        const calendars = await session.proxy.getCalendars();
        response = `To book an appointment, please provide:\n\n• Calendar (choose from below)\n• Contact name or email\n• Date and time\n• Duration\n\nAvailable Calendars:\n`;
        if (calendars?.calendars && calendars.calendars.length > 0) {
          calendars.calendars.forEach(cal => {
            response += `• ${cal.name}\n`;
          });
        } else {
          response += "No calendars found. Please set up calendars in GoHighLevel first.";
        }
        response += `\nExample: 'Book appointment for john@example.com on Main Calendar tomorrow at 2pm for 30 minutes'`;
      } catch (error) {
        response = `Error loading calendars: ${error.message}`;
      }
    }
    // SEND APPOINTMENT REMINDER (check before generic "appointment" handler)
    else if ((lowerMessage.includes('appointment') && lowerMessage.includes('reminder')) || lowerMessage.includes('send reminder')) {
      response = "To send an appointment reminder:\n\n• Provide appointment ID or contact name\n• Reminder message (optional)\n\nExample: 'Send appointment reminder to john@example.com: Your appointment is tomorrow at 2pm'";
    }
    // ADD/MOVE OPPORTUNITY (check before generic "opportunity" handler)
    else if (lowerMessage.includes('add') && lowerMessage.includes('opportunity')) {
      console.log('💰 Add/move opportunity request');
      try {
        const pipelines = await session.proxy.getPipelines();
        response = `To add or move an opportunity:\n\n• Contact name or email\n• Pipeline and stage\n• Deal value (optional)\n\nAvailable Pipelines:\n`;
        if (pipelines?.pipelines && pipelines.pipelines.length > 0) {
          pipelines.pipelines.forEach(p => {
            response += `• ${p.name}: `;
            if (p.stages && p.stages.length > 0) {
              response += p.stages.map(s => s.name).join(', ');
            }
            response += '\n';
          });
        } else {
          response += "No pipelines found.";
        }
        response += `\nExample: 'Add opportunity for john@example.com to Sales Pipeline stage Lead with value $5000'`;
      } catch (error) {
        response = `Error loading pipelines: ${error.message}`;
      }
    }
    // OPPORTUNITIES / DEALS (generic handler)
    else if (lowerMessage.includes('opportunit') || lowerMessage.includes('deal') || lowerMessage.includes('pipeline')) {
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
    // LIST ALL CONTACTS (diagnostic)
    else if (lowerMessage.includes('list all contacts') || lowerMessage.includes('show all contacts')) {
      console.log('📋 Listing all contacts (diagnostic)');
      try {
        // Get all contacts without search filter
        const allContacts = await session.proxy.searchContacts('', 20);
        response = `Found ${allContacts?.length || 0} contacts in your CRM:\n\n`;
        if (allContacts && allContacts.length > 0) {
          allContacts.slice(0, 10).forEach(c => {
            const name = c.firstName || c.name || 'Unknown';
            const phone = c.phone || 'No phone';
            const email = c.email || 'No email';
            response += `• ${name} - Phone: ${phone} - Email: ${email}\n`;
          });
          if (allContacts.length > 10) response += `\n... and ${allContacts.length - 10} more`;
        }
        data = allContacts;
      } catch (error) {
        response = `Error listing contacts: ${error.message}`;
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
              // Try multiple name field variations
              let name = c.contactName || c.name || c.fullName || c.fullNameLowerCase;

              // If no combined name, build from first/last
              if (!name || name.trim() === '') {
                const first = c.firstName || c.first_name || '';
                const last = c.lastName || c.last_name || '';
                name = `${first} ${last}`.trim();
              }

              // Still no name? Use email or phone
              if (!name || name === '') {
                name = c.email || c.phone || 'Unnamed Contact';
              }

              const email = c.email ? ` (${c.email})` : '';
              const phone = !c.email && c.phone ? ` (${c.phone})` : '';
              return `• ${name}${email}${phone}`;
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
    }
    // UPDATE CONTACT
    else if (lowerMessage.includes('update contact')) {
      response = "To update a contact, please provide:\n\n• Contact ID or email\n• Field to update\n• New value\n\nExample: 'Update contact john@example.com set phone to 555-1234'";
    }
    // SEND SMS
    else if (lowerMessage.includes('send sms') || lowerMessage.includes('send message') || (lowerMessage.includes('text') && lowerMessage.includes('to'))) {
      // Parse: "send sms to [contact/phone/email] saying/: [message]"

      // Try to extract phone number
      const phoneMatch = message.match(/to\s+(\+?1?\s*\(?(\d{3})\)?[\s.-]?(\d{3})[\s.-]?(\d{4}))/i);

      // Try to extract email
      const emailMatch = message.match(/to\s+([\w.-]+@[\w.-]+\.\w+)/i);

      // Try to extract contact name (after "to" and before "saying"/":")
      const nameMatch = message.match(/to\s+([A-Za-z\s]+?)(?:\s+saying|\s*:)/i);

      // Try to extract message (after "saying" or ":" or just the last part)
      let messageText = null;
      if (message.match(/saying\s+(.+)/i)) {
        messageText = message.match(/saying\s+(.+)/i)[1];
      } else if (message.match(/:\s*(.+)/)) {
        messageText = message.match(/:\s*(.+)/)[1];
      }

      if ((phoneMatch || emailMatch || nameMatch) && messageText) {
        try {
          let contactId = null;
          let recipient = null;
          let normalizedPhone = null; // Declare at function scope

          // If we have an email, search for the contact
          if (emailMatch) {
            recipient = emailMatch[1];
            console.log('📧 Searching for contact by email:', recipient);
            const contacts = await session.proxy.searchContacts(recipient, 1);
            if (contacts && contacts.length > 0) {
              contactId = contacts[0].id;
              console.log('✅ Found contact:', contactId);
            }
          }
          // If we have a phone number
          else if (phoneMatch) {
            recipient = phoneMatch[1].replace(/[\s()-]/g, ''); // Clean phone number
            // Normalize to E.164 format
            normalizedPhone = recipient.replace(/\D/g, '');
            if (normalizedPhone.length === 10) {
              normalizedPhone = `+1${normalizedPhone}`;
            } else if (normalizedPhone.length === 11 && normalizedPhone.startsWith('1')) {
              normalizedPhone = `+${normalizedPhone}`;
            }

            console.log('📱 Looking for contact with phone:', normalizedPhone);

            // NEW APPROACH: Get ALL contacts and find match locally
            // This bypasses GoHighLevel's search indexing delays
            try {
              console.log('📋 Fetching all contacts to find phone match...');
              const allContacts = await session.proxy.searchContacts('', 100); // Get up to 100 contacts
              console.log(`📊 Retrieved ${allContacts?.length || 0} total contacts`);

              if (allContacts && allContacts.length > 0) {
                // Find contact with matching phone (compare digits only)
                const targetDigits = normalizedPhone.replace(/\D/g, '');
                const match = allContacts.find(c => {
                  if (!c.phone) return false;
                  const contactDigits = c.phone.replace(/\D/g, '');
                  return contactDigits === targetDigits || contactDigits === targetDigits.substring(1); // Match with or without country code
                });

                if (match) {
                  contactId = match.id;
                  console.log('✅ Found contact by phone match:', contactId, 'name:', match.firstName || match.email);
                } else {
                  console.log('❌ No contact found with phone matching:', normalizedPhone);
                  console.log('📋 Sample phones in CRM:', allContacts.slice(0, 5).map(c => c.phone).join(', '));
                }
              }
            } catch (fetchError) {
              console.error('❌ Error fetching all contacts:', fetchError.message);
            }
          }
          // If we have a name, search for it
          else if (nameMatch) {
            recipient = nameMatch[1].trim();
            console.log('👤 Searching for contact by name:', recipient);
            const contacts = await session.proxy.searchContacts(recipient, 1);
            if (contacts && contacts.length > 0) {
              contactId = contacts[0].id;
              console.log('✅ Found contact:', contactId);
            }
          }

          if (contactId) {
            console.log('💬 Sending SMS to contact:', contactId, 'Message:', messageText.substring(0, 50));
            const result = await session.proxy.sendSMS(contactId, messageText);
            response = `✅ SMS sent successfully to ${recipient}!\n\nMessage: "${messageText}"`;
            data = [result];
          } else {
            console.error('❌ Could not find contact after all search attempts');

            // WORKAROUND: Suggest using email which is more reliable
            response = `❌ Could not find contact by phone: ${recipient}\n\nPhone search has indexing delays in GoHighLevel. Please use email instead:\n\nExample: "send sms to test2@example.com saying ${messageText}"\n\nOr wait 30-60 seconds for the contact to be indexed, then try again.`;
          }
        } catch (smsError) {
          console.error('❌ SMS send error:', smsError.message);
          response = `Sorry, I couldn't send the SMS. Error: ${smsError.message}`;
        }
      } else {
        response = "To send an SMS, I need a contact ID or phone number and the message text.\n\nExamples:\n• 'Send SMS to john@example.com saying Hello!'\n• 'Send SMS to 813-555-1234: This is a test'\n• 'Send SMS to John Doe saying Your appointment is confirmed'";
      }
    }
    // SEND EMAIL
    else if (lowerMessage.includes('send email')) {
      response = "To send an email, I need:\n\n• Contact ID or email address\n• Subject line\n• Message body\n\nExample: 'Send email to john@example.com subject Welcome message Hi John, welcome to our service!'";
    }
    // LOG PHONE CALL
    else if (lowerMessage.includes('log phone call') || lowerMessage.includes('log call')) {
      response = "To log a phone call:\n\n• Contact name or email\n• Call duration\n• Notes (optional)\n\nExample: 'Log phone call with john@example.com duration 15 minutes notes Discussed pricing options'";
    }
    // SEND REVIEW REQUEST
    else if (lowerMessage.includes('review request') || lowerMessage.includes('send review')) {
      response = "To send a review request:\n\n• Contact name or email\n• Platform (Google, Yelp, Facebook, etc.)\n• Custom message (optional)\n\nExample: 'Send review request to john@example.com for Google Reviews'";
    }
    // VIEW DASHBOARD
    else if (lowerMessage.includes('view dashboard') || lowerMessage.includes('show dashboard') || lowerMessage.includes('dashboard')) {
      console.log('📊 Getting dashboard data');
      try {
        const [opps, pipelines, calendars] = await Promise.all([
          session.proxy.getOpportunities().catch(() => []),
          session.proxy.getPipelines().catch(() => ({ pipelines: [] })),
          session.proxy.getCalendars().catch(() => ({ calendars: [] }))
        ]);

        const totalOpps = opps?.length || 0;
        const totalValue = opps?.reduce((sum, o) => sum + (parseFloat(o.monetaryValue) || 0), 0) || 0;
        const totalPipelines = pipelines?.pipelines?.length || 0;
        const totalCalendars = calendars?.calendars?.length || 0;

        response = `📊 Dashboard Overview:\n\n`;
        response += `💰 Opportunities: ${totalOpps}\n`;
        response += `💵 Total Pipeline Value: $${totalValue.toFixed(2)}\n`;
        response += `📈 Active Pipelines: ${totalPipelines}\n`;
        response += `📅 Calendars: ${totalCalendars}\n`;

        data = { opportunities: totalOpps, value: totalValue, pipelines: totalPipelines, calendars: totalCalendars };
      } catch (error) {
        response = `Error loading dashboard: ${error.message}`;
      }
    }

    console.log('✅ MCP Chat response ready');
    res.json({
      success: true,
      response,
      data,
      suggestions: [
        'Search contacts',
        'Create new contact',
        'Update contact',
        'Send SMS',
        'Send email',
        'Book appointment',
        'View dashboard',
        'Show pipelines',
        'Add opportunity'
      ]
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
