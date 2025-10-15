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
const { parseNaturalDate, parseDuration, formatFriendlyDate } = require('../utils/date-parser');

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

  // DEBUG: Log what we received
  console.log('🔍 DEBUG - API Key received:', apiKey ? `${apiKey.substring(0, 20)}...${apiKey.substring(apiKey.length - 10)}` : 'MISSING');
  console.log('🔍 DEBUG - Location ID received:', locationId || 'MISSING');
  console.log('🔍 DEBUG - API Key starts with pit-?', apiKey?.startsWith('pit-') ? 'YES (PIT)' : 'NO (JWT or other)');

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
    console.log('✅ Proxy initialized with token type:', apiKey.startsWith('pit-') ? 'PIT' : 'JWT');

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

    // Typo correction helper
    function levenshtein(a, b) {
      const matrix = [];
      for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
      }
      for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
      }
      for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
          if (b.charAt(i - 1) === a.charAt(j - 1)) {
            matrix[i][j] = matrix[i - 1][j - 1];
          } else {
            matrix[i][j] = Math.min(
              matrix[i - 1][j - 1] + 1,
              matrix[i][j - 1] + 1,
              matrix[i - 1][j] + 1
            );
          }
        }
      }
      return matrix[b.length][a.length];
    }

    // Auto-correct common command typos
    const commands = ['location', 'calendar', 'contact', 'opportunity', 'pipeline', 'dashboard', 'email', 'search', 'create', 'update', 'appointment', 'sms'];
    let correctedMessage = lowerMessage;
    const words = lowerMessage.split(/\s+/);

    words.forEach((word, idx) => {
      if (word.length > 4) { // Only check words longer than 4 chars
        commands.forEach(cmd => {
          const distance = levenshtein(word, cmd);
          if (distance === 1 && word !== cmd) { // 1 character difference
            console.log(`🔧 Auto-correcting "${word}" → "${cmd}"`);
            correctedMessage = correctedMessage.replace(word, cmd);
          }
        });
      }
    });

    // Use corrected message if different
    if (correctedMessage !== lowerMessage) {
      console.log(`🔧 Original: "${lowerMessage}"`);
      console.log(`✨ Corrected: "${correctedMessage}"`);
    }
    const processMessage = correctedMessage;

    // Helper function to format contacts as a clean bullet list
    function formatContactsList(contacts, maxDisplay = 20) {
      if (!contacts || contacts.length === 0) return '';

      const displayContacts = contacts.slice(0, maxDisplay);
      let output = '';

      displayContacts.forEach((c, idx) => {
        // Get name
        let name = c.contactName || c.name || c.fullName || c.fullNameLowerCase;
        if (!name || name.trim() === '') {
          const first = c.firstName || c.first_name || '';
          const last = c.lastName || c.last_name || '';
          name = `${first} ${last}`.trim();
        }
        if (!name || name === '') name = 'Unnamed Contact';

        const phone = c.phone ? `\n   📱 ${c.phone}` : '';
        const email = c.email ? `\n   📧 ${c.email}` : '';

        output += `${idx + 1}. ${name}${phone}${email}\n\n`;
      });

      if (contacts.length > maxDisplay) {
        output += `... and ${contacts.length - maxDisplay} more contacts (showing ${maxDisplay} of ${contacts.length})\n`;
      }

      return output;
    }

    // IMPORTANT: Check SPECIFIC commands FIRST before generic keywords
    // This prevents "book appointment" from matching generic "appointment" handler

    // CREATE NEW CONTACT - Enhanced with schema patterns
    // Patterns: "Create a new contact named {name}", "Create contact {name}"
    if ((processMessage.includes('create') && processMessage.includes('contact')) ||
        processMessage.match(/create\s+(?:a\s+)?(?:new\s+)?contact\s+named/i)) {
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
        const contactData = {}; // Move outside try block for error handler access

        try {
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
          console.error('❌ Create contact stack:', createError.stack);

          // Provide more helpful error messages
          let errorMsg = createError.message;
          if (errorMsg.includes('400')) {
            errorMsg = `Contact may already exist or validation failed. Try:\n• Searching for the contact first: "find ${contactData.email || contactData.phone || contactData.firstName}"\n• Using different contact details`;
          } else if (errorMsg.includes('duplicate') || errorMsg.includes('already exists')) {
            errorMsg = `A contact with this ${contactData.email ? 'email' : 'phone number'} already exists. Try searching: "find ${contactData.email || contactData.phone}"`;
          }

          response = `Sorry, I couldn't create the contact.\n\n${errorMsg}`;
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
      if (lowerMessage.includes('search') || lowerMessage.includes('show') || lowerMessage.includes('view') || lowerMessage.includes('list') || lowerMessage.includes('get')) {
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
    // LOCATION INFO (with typo tolerance for "loaction")
    else if ((lowerMessage.includes('location') || lowerMessage.includes('loaction')) && (lowerMessage.includes('show') || lowerMessage.includes('info') || lowerMessage.includes('view'))) {
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
    // SEND EMAIL (check BEFORE tags to avoid "email contact" matching "tag")
    else if (lowerMessage.includes('email') && !lowerMessage.includes('add tag') && !lowerMessage.includes('remove tag')) {
      // Parse multiple formats:
      // 1. "send email to john@example.com subject Welcome body Hi John!"
      // 2. "send email to john@example.com subject Welcome" (use subject as body if no body)
      // 3. "email contact Manuel Stagg with this is a test"
      // 4. "email john@example.com: This is a message"

      let identifier = null;
      let subject = 'Message from AI Copilot';
      let body = null;

      // Format 1: Full format with "to", "subject", and optional "body"
      const fullEmailMatch = message.match(/to\s+([\w.-]+@[\w.-]+\.\w+)/i);
      const fullSubjectMatch = message.match(/subject\s+(.+?)(?:\s+body\s+|$)/i);
      const fullBodyMatch = message.match(/body\s+(.+)/i);

      if (fullEmailMatch && fullSubjectMatch) {
        identifier = fullEmailMatch[1];
        subject = fullSubjectMatch[1].trim();
        // If body exists, use it; otherwise use subject as body
        body = fullBodyMatch ? fullBodyMatch[1].trim() : subject;
      }
      // Format 2: "email contact NAME subject TEXT" or "email NAME subject TEXT"
      else if (lowerMessage.includes('subject')) {
        const nameSubjectMatch = message.match(/email\s+(?:contact\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+subject\s+(.+)/i);
        const emailSubjectMatch = message.match(/email\s+([\w.-]+@[\w.-]+\.\w+)\s+subject\s+(.+)/i);
        const phoneSubjectMatch = message.match(/email\s+(\d{10})\s+subject\s+(.+)/i);

        if (nameSubjectMatch) {
          identifier = nameSubjectMatch[1];
          subject = nameSubjectMatch[2].trim();
          body = subject;
        } else if (emailSubjectMatch) {
          identifier = emailSubjectMatch[1];
          subject = emailSubjectMatch[2].trim();
          body = subject;
        } else if (phoneSubjectMatch) {
          identifier = phoneSubjectMatch[1];
          subject = phoneSubjectMatch[2].trim();
          body = subject;
        }
      }
      // Format 3: "email contact NAME with/saying MESSAGE"
      else {
        const contactNameMatch = message.match(/email\s+(?:contact\s+)?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:with|saying)\s+(.+)/i);
        const emailAddrMatch = message.match(/email\s+([\w.-]+@[\w.-]+\.\w+)\s*(?:with|saying|:)?\s*(.+)/i);
        const phoneEmailMatch = message.match(/email\s+(\d{10})\s+(?:with|saying)\s+(.+)/i);

        if (contactNameMatch) {
          identifier = contactNameMatch[1];
          body = contactNameMatch[2];
        } else if (emailAddrMatch) {
          identifier = emailAddrMatch[1];
          body = emailAddrMatch[2];
        } else if (phoneEmailMatch) {
          identifier = phoneEmailMatch[1];
          body = phoneEmailMatch[2];
        }
      }

      if (identifier && body) {
        console.log('📧 Sending email to:', identifier);
        try {
          // Find contact
          const contacts = await session.proxy.searchContacts(identifier, 100);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            const match = contacts.find(c =>
              c.email === identifier ||
              c.phone?.replace(/\D/g, '').includes(identifier.replace(/\D/g, '')) ||
              c.firstName === identifier.split(' ')[0] ||
              c.name?.toLowerCase() === identifier.toLowerCase()
            );
            contactId = match?.id || contacts[0]?.id;
          }

          if (contactId) {
            await session.proxy.sendEmail(contactId, subject, body);
            response = `✅ Email sent successfully!\n\nTo: ${identifier}\nSubject: ${subject}`;
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          response = `Sorry, I couldn't send the email. Error: ${error.message}`;
        }
      } else {
        response = "To send an email, I need:\n\n• Contact email, phone, or name\n• Message\n\nExamples:\n• 'Send email to john@example.com subject Welcome body Hi John!'\n• 'Email contact John Smith with This is a test'\n• 'Email john@test.com: Quick message here'";
      }
    }
    // TAGS (but NOT if it's an email/sms command that happens to contain "tag")
    else if ((lowerMessage.includes('add tag') || lowerMessage.includes('remove tag') || lowerMessage.includes('untag')) && !lowerMessage.includes('email') && !lowerMessage.includes('sms')) {
      const isRemove = lowerMessage.includes('remove') || lowerMessage.includes('untag');

      // Extract tags and contact identifier
      // Support both "tag X to/from email" and "tag X to/from name"
      const tagMatch = message.match(/tags?\s+([^to\s]+(?:\s*,\s*[^to\s]+)*)/i);
      const emailMatch = message.match(/(?:to|from)\s+([\w.-]+@[\w.-]+\.\w+)/i);
      const phoneMatch = message.match(/(?:to|from)\s+(\d{10})/i);
      const contactMatch = message.match(/(?:to|from)\s+contact\s+([a-zA-Z0-9]+)/i) || message.match(/(?:to|from)\s+([A-Z][a-z]+)/i);

      if (tagMatch && (emailMatch || phoneMatch || contactMatch)) {
        const tags = tagMatch[1].split(',').map(t => t.trim());
        const identifier = emailMatch?.[1] || phoneMatch?.[1] || contactMatch?.[1];

        console.log(`🏷️ ${isRemove ? 'Removing' : 'Adding'} tags ${tags} ${isRemove ? 'from' : 'to'} ${identifier}`);

        try {
          // Find contact first
          const contacts = await session.proxy.searchContacts(identifier, 100);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            // Try to find exact match
            const match = contacts.find(c =>
              c.email === identifier ||
              c.phone?.replace(/\D/g, '').includes(identifier.replace(/\D/g, '')) ||
              c.name === identifier ||
              c.firstName === identifier
            );
            contactId = match?.id || contacts[0]?.id;
          }

          if (contactId) {
            if (isRemove) {
              await session.proxy.removeTags(contactId, tags);
              response = `✅ Removed ${tags.length} tag(s) from contact`;
            } else {
              await session.proxy.addTags(contactId, tags);
              response = `✅ Added ${tags.length} tag(s) to contact`;
            }
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          response = `Error ${isRemove ? 'removing' : 'adding'} tags: ${error.message}`;
        }
      } else {
        if (isRemove) {
          response = "To remove tags:\n• 'remove tag cold-lead from john@example.com'\n• 'untag john@example.com from inactive'";
        } else {
          response = "To add tags:\n• 'add tag VIP to john@example.com'\n• 'add tags hot-lead, interested to 8136414177'";
        }
      }
    }
    // LIST ALL CONTACTS - Enhanced natural language support
    else if (
      lowerMessage.includes('list all contacts') ||
      lowerMessage.includes('show all contacts') ||
      lowerMessage.includes('get all contacts') ||
      lowerMessage.includes('view all contacts') ||
      lowerMessage.includes('display all contacts') ||
      lowerMessage.match(/\b(list|show|get|view|display)\s+(my\s+)?contacts?\b/) ||
      lowerMessage.match(/\b(all|entire)\s+contact\s+list\b/) ||
      lowerMessage === 'contacts' ||
      lowerMessage === 'all contacts'
    ) {
      console.log('📋 Listing all contacts');
      try {
        // Get all contacts without search filter (increased limit to 50)
        const allContacts = await session.proxy.searchContacts('', 50);
        const totalCount = allContacts?.length || 0;

        if (allContacts && allContacts.length > 0) {
          response = `📋 Found ${totalCount} contacts in your CRM:\n\n`;
          response += formatContactsList(allContacts, 20);
          response += `💡 Tip: Search for specific contacts with "search John" or "find john@example.com"`;
        } else {
          response = `No contacts found in your CRM.\n\n💡 Create your first contact with:\n"create contact John Doe email john@example.com phone 5551234567"`;
        }

        data = allContacts;
      } catch (error) {
        console.error('❌ List contacts error:', error);
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

          if (data && data.length > 0) {
            response = `🔍 Found ${data.length} contact${data.length > 1 ? 's' : ''} matching "${query}":\n\n`;
            response += formatContactsList(data, 10);
          } else {
            response = `No contacts found matching "${query}".\n\n💡 Try:\n• Using a different search term\n• Searching by email or phone number\n• Using "list contacts" to see all contacts`;
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
    else if (lowerMessage.includes('update contact') || lowerMessage.includes('update') && lowerMessage.includes('contact')) {
      // Parse: "update contact john@example.com with phone 5551234567" or "update contact john@example.com set email to new@email.com"
      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const phoneIdentMatch = message.match(/contact\s+(\d{10})/i);

      // Improved name matching - stop BEFORE field keywords (phone, email, firstname, lastname)
      // This prevents capturing "leonardo phone" as the name
      const nameMatch = message.match(/contact\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)(?=\s+(?:phone|mobile|email|firstname|lastname|first\s*name|last\s*name)\s*:?\s*|$)/i);

      const identifier = emailMatch?.[1] || phoneIdentMatch?.[1] || nameMatch?.[1];

      if (identifier) {
        console.log('🔄 Updating contact:', identifier);
        try {
          // Find the contact first
          const contacts = await session.proxy.searchContacts(identifier, 100);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            // Improved matching - case-insensitive name matching
            const match = contacts.find(c =>
              c.email === identifier ||
              c.phone?.replace(/\D/g, '').includes(identifier.replace(/\D/g, '')) ||
              c.firstName?.toLowerCase() === identifier.toLowerCase() ||
              c.lastName?.toLowerCase() === identifier.toLowerCase() ||
              c.name?.toLowerCase() === identifier.toLowerCase() ||
              // Also try matching full name if identifier contains space
              (identifier.includes(' ') && c.name?.toLowerCase() === identifier.toLowerCase())
            );
            contactId = match?.id || contacts[0]?.id;
          }

          if (contactId) {
            // Extract update fields
            const updates = {};

            // Check for phone update - handle various formats: "phone 5551234567", "phone: 813-465-9575", "phone 8134456789"
            const phoneMatch = message.match(/(?:phone|mobile)\s*:?\s*([\d-]+)/i);
            if (phoneMatch) {
              const cleanPhone = phoneMatch[1].replace(/\D/g, ''); // Remove all non-digits
              if (cleanPhone.length === 10) {
                updates.phone = `+1${cleanPhone}`;
              } else if (cleanPhone.length === 11 && cleanPhone.startsWith('1')) {
                updates.phone = `+${cleanPhone}`;
              } else {
                updates.phone = `+1${cleanPhone}`; // Try anyway
              }
            }

            // Check for email update
            const newEmailMatch = message.match(/email\s+(?:to\s+)?([\w.-]+@[\w.-]+\.\w+)/i);
            if (newEmailMatch && newEmailMatch[1] !== identifier) {
              updates.email = newEmailMatch[1];
            }

            // Check for name update
            const firstNameMatch = message.match(/(?:first\s*name|firstname)\s+(?:to\s+)?([A-Z][a-z]+)/i);
            if (firstNameMatch) {
              updates.firstName = firstNameMatch[1];
            }

            const lastNameMatch = message.match(/(?:last\s*name|lastname)\s+(?:to\s+)?([A-Z][a-z]+)/i);
            if (lastNameMatch) {
              updates.lastName = lastNameMatch[1];
            }

            if (Object.keys(updates).length > 0) {
              await session.proxy.updateContact(contactId, updates);
              response = `✅ Contact updated successfully!\n\n${Object.entries(updates).map(([k,v]) => `${k}: ${v}`).join('\n')}`;
            } else {
              response = "❌ No valid update fields found. Try:\n• 'update contact john@test.com phone 5551234567'\n• 'update contact john@test.com email new@email.com'";
            }
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          response = `Error updating contact: ${error.message}`;
        }
      } else {
        response = "To update a contact, please provide:\n\n• Contact email, phone, or name\n• Field to update\n• New value\n\nExample: 'Update contact john@example.com phone 5551234567'";
      }
    }
    // DELETE CONTACT - Schema pattern: "Delete contact {contact_name}"
    else if (lowerMessage.includes('delete') && lowerMessage.includes('contact')) {
      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const phoneMatch = message.match(/(\d{10})/);
      const nameMatch = message.match(/contact\s+([A-Za-z\s]+)/i);

      const identifier = emailMatch?.[1] || phoneMatch?.[1] || nameMatch?.[1]?.trim();

      if (identifier) {
        console.log('🗑️ Deleting contact:', identifier);
        try {
          const contacts = await session.proxy.searchContacts(identifier, 5);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            const match = contacts.find(c =>
              c.email?.toLowerCase() === identifier.toLowerCase() ||
              c.phone?.includes(identifier) ||
              c.firstName?.toLowerCase().includes(identifier.toLowerCase()) ||
              c.lastName?.toLowerCase().includes(identifier.toLowerCase())
            );
            if (match) {
              contactId = match.id;
              const contactName = match.firstName || match.email || identifier;

              // Delete the contact
              await session.proxy.deleteContact(contactId);
              response = `✅ Contact "${contactName}" has been deleted successfully.`;
            } else {
              response = `❌ Could not find contact: ${identifier}`;
            }
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          console.error('❌ Delete contact error:', error);
          response = `Error deleting contact: ${error.message}`;
        }
      } else {
        response = "To delete a contact, provide their email, phone, or name.\n\nExample: 'Delete contact john@example.com'";
      }
    }
    // SHOW CONTACTS ADDED IN TIME PERIOD - Schema pattern: "Show all contacts added in {time_period}"
    else if (lowerMessage.match(/(show|list|get).*(contacts?|leads?).*(added|created).*(in|during|from)/i) ||
             lowerMessage.match(/(show|list|get).*(contacts?|leads?).*(today|yesterday|this week|last week|this month)/i)) {
      console.log('📅 Showing contacts added in time period');
      try {
        // Extract time period
        let timePeriod = 'today';
        if (lowerMessage.includes('yesterday')) timePeriod = 'yesterday';
        else if (lowerMessage.includes('this week')) timePeriod = 'this week';
        else if (lowerMessage.includes('last week')) timePeriod = 'last week';
        else if (lowerMessage.includes('this month')) timePeriod = 'this month';
        else if (lowerMessage.includes('last month')) timePeriod = 'last month';

        // Get all contacts and filter by date
        const allContacts = await session.proxy.searchContacts('', 50);

        // Calculate date range
        const now = new Date();
        let startDate = new Date();

        if (timePeriod === 'today') {
          startDate.setHours(0, 0, 0, 0);
        } else if (timePeriod === 'yesterday') {
          startDate.setDate(now.getDate() - 1);
          startDate.setHours(0, 0, 0, 0);
        } else if (timePeriod === 'this week') {
          const dayOfWeek = now.getDay();
          startDate.setDate(now.getDate() - dayOfWeek);
          startDate.setHours(0, 0, 0, 0);
        } else if (timePeriod === 'last week') {
          const dayOfWeek = now.getDay();
          startDate.setDate(now.getDate() - dayOfWeek - 7);
          startDate.setHours(0, 0, 0, 0);
        } else if (timePeriod === 'this month') {
          startDate.setDate(1);
          startDate.setHours(0, 0, 0, 0);
        } else if (timePeriod === 'last month') {
          startDate.setMonth(now.getMonth() - 1);
          startDate.setDate(1);
          startDate.setHours(0, 0, 0, 0);
        }

        // Filter contacts by date
        const filteredContacts = allContacts?.filter(c => {
          if (!c.dateAdded && !c.createdAt) return false;
          const contactDate = new Date(c.dateAdded || c.createdAt);
          return contactDate >= startDate;
        }) || [];

        if (filteredContacts.length > 0) {
          response = `📅 Contacts added in ${timePeriod}: ${filteredContacts.length}\n\n`;
          response += formatContactsList(filteredContacts, 20);
        } else {
          response = `📅 No contacts were added in ${timePeriod}.`;
        }

        data = filteredContacts;
      } catch (error) {
        console.error('❌ Show contacts by date error:', error);
        response = `Error fetching contacts: ${error.message}`;
      }
    }
    // FIND CONTACTS MISSING FIELD - Schema pattern: "Find all contacts missing {field_name}"
    else if (lowerMessage.match(/(find|show|list).*(contacts?|leads?).*(missing|without|no)/i)) {
      console.log('🔍 Finding contacts missing field');
      try {
        // Extract field name
        let field = null;
        if (lowerMessage.includes('email')) field = 'email';
        else if (lowerMessage.includes('phone')) field = 'phone';
        else if (lowerMessage.includes('name')) field = 'name';
        else if (lowerMessage.includes('tag')) field = 'tags';

        if (!field) {
          response = "Please specify which field to check.\n\nExample: 'Find all contacts missing email'";
        } else {
          const allContacts = await session.proxy.searchContacts('', 50);
          const missingField = allContacts?.filter(c => {
            if (field === 'email') return !c.email;
            if (field === 'phone') return !c.phone;
            if (field === 'name') return !c.firstName && !c.name;
            if (field === 'tags') return !c.tags || c.tags.length === 0;
            return false;
          }) || [];

          if (missingField.length > 0) {
            response = `🔍 Found ${missingField.length} contacts missing ${field}:\n\n`;
            response += formatContactsList(missingField, 20);
          } else {
            response = `✅ All contacts have a ${field}.`;
          }

          data = missingField;
        }
      } catch (error) {
        console.error('❌ Find missing field error:', error);
        response = `Error finding contacts: ${error.message}`;
      }
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
                console.log('🎯 Looking for phone digits:', targetDigits);
                console.log('🔍 Checking all contacts...');

                // Log first 10 contacts with their phone numbers
                allContacts.slice(0, 10).forEach((c, i) => {
                  const digits = c.phone ? c.phone.replace(/\D/g, '') : 'no phone';
                  console.log(`  [${i}] ${c.firstName || 'Unknown'} - Phone: ${c.phone} - Digits: ${digits}`);
                });

                const match = allContacts.find(c => {
                  if (!c.phone) return false;
                  const contactDigits = c.phone.replace(/\D/g, '');
                  const matches = contactDigits === targetDigits || contactDigits === targetDigits.substring(1);
                  if (matches) {
                    console.log(`🎯 MATCH FOUND: ${c.firstName || c.email} - ${c.phone} matches ${normalizedPhone}`);
                  }
                  return matches;
                });

                if (match) {
                  contactId = match.id;
                  console.log('✅ Found contact by phone match:', contactId, 'name:', match.firstName || match.email);
                } else {
                  console.log('❌ No contact found with phone matching:', normalizedPhone);
                  console.log('❌ Target digits:', targetDigits);
                  console.log('📋 Total contacts checked:', allContacts.length);
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
    // (SEND EMAIL handler moved to line 333 - before tags)

    // ═══════════════════════════════════════════════════════════════
    // TASKS - Create, update, list tasks for contacts
    // ═══════════════════════════════════════════════════════════════
    else if (lowerMessage.includes('create task') || lowerMessage.includes('add task') || lowerMessage.includes('new task')) {
      // Parse: "create task for john@example.com: Follow up on proposal"
      // Parse: "add task to John Doe reminder Call back tomorrow"

      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:for|to)\s+([A-Za-z\s]+?)(?:\s*:|\s+reminder)/i);

      // Extract task text - everything after the colon OR after "reminder"
      let taskBody = null;
      if (message.includes(':')) {
        // "create task for sarah@test.com: Follow up" -> get text after colon
        const colonMatch = message.match(/:\s*(.+)/i);
        taskBody = colonMatch?.[1];
      } else if (lowerMessage.includes('reminder')) {
        // "add task to John reminder Call back" -> get text after "reminder"
        const reminderMatch = message.match(/reminder\s+(.+)/i);
        taskBody = reminderMatch?.[1];
      }

      const identifier = emailMatch?.[1] || nameMatch?.[1];

      if (identifier && taskBody) {
        try {
          // Find contact first
          const contacts = await session.proxy.searchContacts(identifier, 5);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            const match = contacts.find(c =>
              c.email?.toLowerCase() === identifier.toLowerCase() ||
              c.name?.toLowerCase() === identifier.toLowerCase()
            );
            contactId = match?.id || contacts[0]?.id;
          }

          if (contactId) {
            const taskData = {
              title: taskBody.substring(0, 50), // First 50 chars as title
              body: taskBody,
              dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
              completed: false
            };

            await session.proxy.createTask(contactId, taskData);
            response = `✅ Task created for ${identifier}!\n\n"${taskBody}"\n\nDue: Tomorrow`;
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          response = `Sorry, I couldn't create the task. Error: ${error.message}`;
        }
      } else {
        response = "To create a task, I need:\n\n• Contact email or name\n• Task description\n\nExamples:\n• 'Create task for john@example.com: Follow up on proposal'\n• 'Add task to John Doe reminder Call back tomorrow'";
      }
    }
    // LIST TASKS
    else if (lowerMessage.includes('list tasks') || lowerMessage.includes('show tasks') || lowerMessage.includes('get tasks')) {
      // Parse: "list tasks for john@example.com"

      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:for|from)\s+([A-Za-z\s]+)/i);

      const identifier = emailMatch?.[1] || nameMatch?.[1];

      if (identifier) {
        try {
          // Find contact first
          const contacts = await session.proxy.searchContacts(identifier, 5);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            const match = contacts.find(c =>
              c.email?.toLowerCase() === identifier.toLowerCase() ||
              c.name?.toLowerCase() === identifier.toLowerCase()
            );
            contactId = match?.id || contacts[0]?.id;
          }

          if (contactId) {
            const result = await session.proxy.getTasks(contactId);
            const tasks = result?.tasks || result || [];

            if (tasks.length > 0) {
              response = `✅ Found ${tasks.length} task(s) for ${identifier}:\n\n`;
              tasks.forEach((task, idx) => {
                const status = task.completed ? '✓' : '○';
                response += `${status} ${task.title || task.body}\n`;
              });
              data = tasks;
            } else {
              response = `No tasks found for ${identifier}`;
            }
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          response = `Sorry, I couldn't get the tasks. Error: ${error.message}`;
        }
      } else {
        response = "To list tasks, I need a contact email or name.\n\nExample: 'List tasks for john@example.com'";
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // NOTES - Add notes to contacts
    // ═══════════════════════════════════════════════════════════════
    else if (lowerMessage.includes('add note') || lowerMessage.includes('create note') || (lowerMessage.includes('note') && lowerMessage.includes('to'))) {
      // Parse: "add note to john@example.com: Customer interested in premium plan"

      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:to|for)\s+([A-Za-z\s]+?)(?:\s*:)/i);

      // Extract note text - everything after the colon
      const colonMatch = message.match(/:\s*(.+)/i);
      const noteBody = colonMatch?.[1];

      const identifier = emailMatch?.[1] || nameMatch?.[1];

      if (identifier && noteBody) {
        try {
          // Find contact first
          const contacts = await session.proxy.searchContacts(identifier, 5);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            const match = contacts.find(c =>
              c.email?.toLowerCase() === identifier.toLowerCase() ||
              c.name?.toLowerCase() === identifier.toLowerCase()
            );
            contactId = match?.id || contacts[0]?.id;
          }

          if (contactId) {
            await session.proxy.addNote(contactId, noteBody);
            response = `✅ Note added to ${identifier}!\n\n"${noteBody}"`;
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          response = `Sorry, I couldn't add the note. Error: ${error.message}`;
        }
      } else {
        response = "To add a note, I need:\n\n• Contact email or name\n• Note text\n\nExamples:\n• 'Add note to john@example.com: Customer interested in premium plan'\n• 'Create note for John Doe: Follow up next week'";
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // WORKFLOWS - Add/remove contacts from workflows
    // ═══════════════════════════════════════════════════════════════
    else if (lowerMessage.includes('workflow') && (lowerMessage.includes('add') || lowerMessage.includes('enroll') || lowerMessage.includes('start'))) {
      // Parse: "add john@example.com to workflow abc123"
      // Parse: "enroll John in workflow xyz789"

      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:add|enroll|start)\s+([A-Za-z\s]+?)\s+(?:to|in)/i);
      const workflowMatch = message.match(/workflow\s+([a-zA-Z0-9_-]+)/i);

      const identifier = emailMatch?.[1] || nameMatch?.[1];
      const workflowId = workflowMatch?.[1];

      if (identifier && workflowId) {
        try {
          // Find contact first
          const contacts = await session.proxy.searchContacts(identifier, 5);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            const match = contacts.find(c =>
              c.email?.toLowerCase() === identifier.toLowerCase() ||
              c.name?.toLowerCase() === identifier.toLowerCase()
            );
            contactId = match?.id || contacts[0]?.id;
          }

          if (contactId) {
            await session.proxy.addToWorkflow(contactId, workflowId);
            response = `✅ Added ${identifier} to workflow ${workflowId}`;
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          response = `Sorry, I couldn't add to workflow. Error: ${error.message}`;
        }
      } else {
        response = "To add to a workflow, I need:\n\n• Contact email or name\n• Workflow ID\n\nExample: 'Add john@example.com to workflow abc123'";
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // CAMPAIGNS - Add contacts to campaigns
    // ═══════════════════════════════════════════════════════════════
    else if (lowerMessage.includes('campaign') && (lowerMessage.includes('add') || lowerMessage.includes('enroll'))) {
      // Parse: "add john@example.com to campaign xyz789"
      // Parse: "enroll contact in campaign nurture"

      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:add|enroll)\s+([A-Za-z\s]+?)\s+(?:to|in)/i);
      const campaignMatch = message.match(/campaign\s+([a-zA-Z0-9_-]+)/i);

      const identifier = emailMatch?.[1] || nameMatch?.[1];
      const campaignId = campaignMatch?.[1];

      if (identifier && campaignId) {
        try {
          // Find contact first
          const contacts = await session.proxy.searchContacts(identifier, 5);
          let contactId = null;

          if (contacts && contacts.length > 0) {
            const match = contacts.find(c =>
              c.email?.toLowerCase() === identifier.toLowerCase() ||
              c.name?.toLowerCase() === identifier.toLowerCase()
            );
            contactId = match?.id || contacts[0]?.id;
          }

          if (contactId) {
            await session.proxy.addToCampaign(contactId, campaignId);
            response = `✅ Added ${identifier} to campaign ${campaignId}`;
          } else {
            response = `❌ Could not find contact: ${identifier}`;
          }
        } catch (error) {
          response = `Sorry, I couldn't add to campaign. Error: ${error.message}`;
        }
      } else {
        response = "To add to a campaign, I need:\n\n• Contact email or name\n• Campaign ID\n\nExample: 'Add john@example.com to campaign xyz789'";
      }
    }

    // LIST WORKFLOWS
    else if (lowerMessage.includes('list workflows') || lowerMessage.includes('show workflows') || (lowerMessage.includes('get') && lowerMessage.includes('workflow'))) {
      try {
        const workflows = await session.proxy.getWorkflows();
        if (workflows && workflows.length > 0) {
          response = `📋 Available Workflows (${workflows.length}):\n\n`;
          workflows.forEach(wf => {
            response += `• ${wf.name} (ID: ${wf.id})\n`;
          });
          response += `\n💡 To add a contact: "add john@test.com to workflow ${workflows[0].id}"`;
          data = workflows;
        } else {
          response = "No workflows found for this location.";
        }
      } catch (error) {
        response = `Error listing workflows: ${error.message}`;
      }
    }

    // LIST CAMPAIGNS
    else if (lowerMessage.includes('list campaigns') || lowerMessage.includes('show campaigns') || (lowerMessage.includes('get') && lowerMessage.includes('campaign'))) {
      try {
        const campaigns = await session.proxy.getCampaigns();
        if (campaigns && campaigns.length > 0) {
          response = `📢 Available Campaigns (${campaigns.length}):\n\n`;
          campaigns.forEach(camp => {
            response += `• ${camp.name} (ID: ${camp.id})\n`;
          });
          response += `\n💡 To add a contact: "add john@test.com to campaign ${campaigns[0].id}"`;
          data = campaigns;
        } else {
          response = "No campaigns found for this location.";
        }
      } catch (error) {
        response = `Error listing campaigns: ${error.message}`;
      }
    }

    // LIST PIPELINES
    else if (lowerMessage.includes('list pipelines') || lowerMessage.includes('show pipelines') || (lowerMessage.includes('get') && lowerMessage.includes('pipeline'))) {
      try {
        const pipelinesData = await session.proxy.getPipelines();
        const pipelines = pipelinesData?.pipelines || [];

        if (pipelines.length > 0) {
          response = `📊 Available Pipelines (${pipelines.length}):\n\n`;
          pipelines.forEach(pipeline => {
            response += `**${pipeline.name}** (ID: ${pipeline.id})\n`;
            if (pipeline.stages && pipeline.stages.length > 0) {
              response += `  Stages: ${pipeline.stages.map(s => s.name).join(' → ')}\n`;
            }
            response += `\n`;
          });
          response += `💡 To move an opportunity: "move opportunity opp_123 to Won stage"`;
          data = pipelines;
        } else {
          response = "No pipelines found for this location.";
        }
      } catch (error) {
        response = `Error listing pipelines: ${error.message}`;
      }
    }

    // BOOK APPOINTMENT (with date/time parsing)
    else if (lowerMessage.includes('book appointment') || lowerMessage.includes('schedule appointment') || lowerMessage.includes('create appointment')) {
      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:for|with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      const identifier = emailMatch?.[1] || nameMatch?.[1];

      if (identifier) {
        try {
          // Parse date/time from message
          let appointmentDate = new Date();
          const dateTimeText = message.toLowerCase();

          if (dateTimeText.match(/(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(?:am|pm))/)) {
            appointmentDate = parseNaturalDate(dateTimeText);
          }

          const duration = parseDuration(dateTimeText);

          // Search for contact
          const contacts = await session.proxy.searchContacts(identifier, 1);
          if (contacts && contacts.length > 0) {
            const contactId = contacts[0].id;

            // Get available calendars
            const calendarsData = await session.proxy.getCalendars();
            const calendars = calendarsData?.calendars || [];

            if (calendars.length > 0) {
              const calendar = calendars[0]; // Use first available calendar

              // Create appointment
              const appointmentData = {
                calendarId: calendar.id,
                contactId: contactId,
                startTime: appointmentDate.toISOString(),
                endTime: new Date(appointmentDate.getTime() + duration * 60000).toISOString(),
                title: `Appointment with ${contacts[0].contactName || identifier}`,
                appointmentStatus: 'confirmed'
              };

              await session.proxy.createAppointment(appointmentData);
              response = `✅ Appointment booked successfully!\n\n📅 ${formatFriendlyDate(appointmentDate)}\n⏱️ Duration: ${duration} minutes\n👤 Contact: ${contacts[0].contactName}\n📍 Calendar: ${calendar.name}`;
              data = { appointment: appointmentData };
            } else {
              response = "❌ No calendars available. Please set up a calendar in GoHighLevel first.";
            }
          } else {
            response = `❌ Contact not found: ${identifier}`;
          }
        } catch (error) {
          response = `Error booking appointment: ${error.message}`;
        }
      } else {
        response = "To book an appointment, please provide:\n\n• Contact email or name\n• Date/time (optional, defaults to now)\n\nExamples:\n• 'book appointment for john@test.com tomorrow at 2pm'\n• 'schedule appointment with John Smith next Friday at 3:30pm'";
      }
    }

    // CREATE TASK/REMINDER WITH DUE DATE
    else if ((lowerMessage.includes('create reminder') || lowerMessage.includes('set reminder') || lowerMessage.includes('remind me')) && !lowerMessage.includes('create task')) {
      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:for|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*?)(?:\s*:|\s+(?:to|on|that))/i);
      const identifier = emailMatch?.[1] || nameMatch?.[1];

      let taskBody = null;
      if (message.includes(':')) {
        const colonMatch = message.match(/:\s*(.+?)(?:\s+(?:on|due|by))/i);
        taskBody = colonMatch?.[1];
      } else if (lowerMessage.includes('to ')) {
        const reminderMatch = message.match(/(?:remind me|reminder)\s+to\s+(.+?)(?:\s+for|\s+on|\s+due|$)/i);
        taskBody = reminderMatch?.[1];
      }

      if (identifier && taskBody) {
        try {
          // Parse due date
          let dueDate = new Date();
          const dateTimeText = message.toLowerCase();
          if (dateTimeText.match(/(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|in \d+)/)) {
            dueDate = parseNaturalDate(dateTimeText);
          }

          const contacts = await session.proxy.searchContacts(identifier, 1);
          if (contacts && contacts.length > 0) {
            const contactId = contacts[0].id;
            await session.proxy.createTask(contactId, {
              title: taskBody.substring(0, 100),
              body: taskBody,
              dueDate: dueDate.toISOString(),
              completed: false
            });
            response = `✅ Reminder set!\n\n📝 ${taskBody}\n👤 For: ${contacts[0].contactName || identifier}\n📅 Due: ${formatFriendlyDate(dueDate)}`;
          } else {
            response = `❌ Contact not found: ${identifier}`;
          }
        } catch (error) {
          response = `Error creating reminder: ${error.message}`;
        }
      } else {
        response = "To set a reminder:\n\n• Contact email or name\n• What to remind\n• When (optional)\n\nExamples:\n• 'remind me to follow up with john@test.com on Friday'\n• 'create reminder for John: send proposal tomorrow'";
      }
    }

    // MOVE OPPORTUNITY TO STAGE
    else if (lowerMessage.includes('move opportunity') || lowerMessage.includes('update opportunity stage') || lowerMessage.includes('change opportunity')) {
      const oppMatch = message.match(/opportunity\s+([a-zA-Z0-9_-]+)/i);
      const stageMatch = message.match(/(?:to|stage)\s+([a-zA-Z\s]+?)(?:\s+stage|$)/i);

      const opportunityId = oppMatch?.[1];
      const stageName = stageMatch?.[1]?.trim();

      if (opportunityId && stageName) {
        try {
          // Get pipelines to find stage ID
          const pipelinesData = await session.proxy.getPipelines();
          const pipelines = pipelinesData?.pipelines || [];

          let stageId = null;
          for (const pipeline of pipelines) {
            const stage = pipeline.stages?.find(s =>
              s.name.toLowerCase().includes(stageName.toLowerCase()) ||
              stageName.toLowerCase().includes(s.name.toLowerCase())
            );
            if (stage) {
              stageId = stage.id;
              break;
            }
          }

          if (stageId) {
            await session.proxy.updateOpportunity(opportunityId, { stageId });
            response = `✅ Opportunity ${opportunityId} moved to "${stageName}" stage!`;
          } else {
            response = `❌ Stage "${stageName}" not found. Available stages:\n\n${pipelines.map(p => p.stages.map(s => `• ${s.name}`).join('\n')).join('\n')}`;
          }
        } catch (error) {
          response = `Error updating opportunity: ${error.message}`;
        }
      } else {
        response = "To move an opportunity:\n\n• Opportunity ID\n• Target stage name\n\nExample: 'move opportunity abc123 to Won stage'";
      }
    }

    // SEND REVIEW REQUEST
    else if (lowerMessage.includes('review request') || lowerMessage.includes('send review') || lowerMessage.includes('request review')) {
      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:to|from)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/i);
      const identifier = emailMatch?.[1] || nameMatch?.[1];

      if (identifier) {
        try {
          const contacts = await session.proxy.searchContacts(identifier, 1);
          if (contacts && contacts.length > 0) {
            const contactId = contacts[0].id;
            const contactName = contacts[0].contactName || contacts[0].firstName || identifier;

            // Send review request via SMS or Email
            const reviewMessage = `Hi ${contactName}! We'd love to hear about your experience. Please take a moment to leave us a review: [Review Link]`;

            if (contacts[0].phone) {
              await session.proxy.sendSMS(contactId, reviewMessage);
              response = `✅ Review request sent via SMS to ${contactName}!\n\n📱 ${contacts[0].phone}`;
            } else if (contacts[0].email) {
              await session.proxy.sendEmail(contactId, 'We\'d love your feedback!', reviewMessage);
              response = `✅ Review request sent via email to ${contactName}!\n\n📧 ${contacts[0].email}`;
            } else {
              response = `❌ Contact ${contactName} has no phone or email on file.`;
            }
          } else {
            response = `❌ Contact not found: ${identifier}`;
          }
        } catch (error) {
          response = `Error sending review request: ${error.message}`;
        }
      } else {
        response = "To send a review request:\n\n• Contact email or name\n\nExample: 'send review request to john@test.com'";
      }
    }

    // SCHEDULE SOCIAL MEDIA POST
    else if (lowerMessage.includes('social post') || lowerMessage.includes('schedule social') || lowerMessage.includes('post to facebook') || lowerMessage.includes('post to instagram')) {
      try {
        // Extract post content
        let postContent = null;
        if (message.includes(':')) {
          const colonMatch = message.match(/:\s*(.+?)$/i);
          postContent = colonMatch?.[1];
        }

        if (!postContent) {
          response = "To schedule a social media post:\n\n• Post content after ':'\n• Optional date/time (e.g., 'tomorrow', 'Friday at 2pm')\n\nExample: 'schedule social post for tomorrow: Check out our new product launch!'";
        } else {
          // Parse date/time if provided
          let postDate = new Date();
          const dateTimeText = message.toLowerCase();
          if (dateTimeText.match(/(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next|in \d+)/)) {
            postDate = parseNaturalDate(dateTimeText);
          } else {
            // Default to immediate post
            postDate = new Date();
          }

          // Determine platform
          let platforms = ['facebook', 'instagram']; // Default to both
          if (lowerMessage.includes('facebook')) {
            platforms = ['facebook'];
          } else if (lowerMessage.includes('instagram')) {
            platforms = ['instagram'];
          }

          // Get social media accounts
          const fbAccounts = await session.proxy.getSocialAccounts('facebook').catch(() => ({ accounts: [] }));
          const igAccounts = await session.proxy.getSocialAccounts('instagram').catch(() => ({ accounts: [] }));

          if (!fbAccounts?.accounts?.length && !igAccounts?.accounts?.length) {
            response = "⚠️ No social media accounts connected. Please connect your Facebook or Instagram accounts in GoHighLevel first.";
          } else {
            // Create social media post
            const postData = {
              message: postContent,
              scheduleTime: postDate.toISOString(),
              platforms: platforms,
              accounts: []
            };

            // Add available accounts
            if (platforms.includes('facebook') && fbAccounts?.accounts?.length > 0) {
              postData.accounts.push(...fbAccounts.accounts.map(acc => acc.id));
            }
            if (platforms.includes('instagram') && igAccounts?.accounts?.length > 0) {
              postData.accounts.push(...igAccounts.accounts.map(acc => acc.id));
            }

            const result = await session.proxy.createSocialPost(postData);

            response = `✅ Social media post scheduled!\n\n`;
            response += `📱 Platforms: ${platforms.join(', ')}\n`;
            response += `📅 Scheduled for: ${formatFriendlyDate(postDate)}\n`;
            response += `📝 Content: ${postContent.substring(0, 100)}${postContent.length > 100 ? '...' : ''}`;
            data = result;
          }
        }
      } catch (error) {
        console.error('❌ Social post error:', error);
        response = `Error scheduling social post: ${error.message}`;
      }
    }

    // LIST SOCIAL POSTS
    else if (lowerMessage.includes('list social posts') || lowerMessage.includes('show social posts') || lowerMessage.includes('get social posts')) {
      try {
        const posts = await session.proxy.listSocialPosts({ limit: 20 });

        if (posts && posts.posts && posts.posts.length > 0) {
          response = `📱 Recent Social Media Posts (${posts.posts.length}):\n\n`;
          posts.posts.forEach((post, idx) => {
            response += `${idx + 1}. ${post.message ? post.message.substring(0, 50) + '...' : 'No content'}\n`;
            response += `   Status: ${post.status || 'unknown'}\n`;
            if (post.scheduleTime) {
              response += `   Scheduled: ${formatFriendlyDate(new Date(post.scheduleTime))}\n`;
            }
            response += `\n`;
          });
          data = posts;
        } else {
          response = "No social media posts found.";
        }
      } catch (error) {
        console.error('❌ List social posts error:', error);
        response = `Error listing social posts: ${error.message}`;
      }
    }

    // LOG PHONE CALL
    else if (lowerMessage.includes('log phone call') || lowerMessage.includes('log call')) {
      response = "To log a phone call:\n\n• Contact name or email\n• Call duration\n• Notes (optional)\n\nExample: 'Log phone call with john@example.com duration 15 minutes notes Discussed pricing options'";
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
