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

    // IMPORTANT: Check SPECIFIC commands FIRST before generic keywords
    // This prevents "book appointment" from matching generic "appointment" handler

    // CREATE NEW CONTACT (check before generic "contact" search)
    if (processMessage.includes('create') && processMessage.includes('contact')) {
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
      const tagMatch = message.match(/tags?\s+([^to\s]+(?:\s*,\s*[^to\s]+)*)/i);
      const emailMatch = message.match(/to\s+([\w.-]+@[\w.-]+\.\w+)/i);
      const phoneMatch = message.match(/to\s+(\d{10})/i);
      const contactMatch = message.match(/to\s+contact\s+([a-zA-Z0-9]+)/i) || message.match(/to\s+([A-Z][a-z]+)/i);

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
        response = "To add tags: 'add tag VIP to john@example.com' or 'add tags hot-lead, interested to 8136414177'";
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
      const nameMatch = message.match(/(?:for|to)\s+([A-Za-z\s]+?)(?:\s*:|\s+reminder|\s+task)/i);
      const taskMatch = message.match(/(?::|task|reminder)\s+(.+)/i);

      const identifier = emailMatch?.[1] || nameMatch?.[1];
      const taskBody = taskMatch?.[1];

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
      const nameMatch = message.match(/(?:to|for)\s+([A-Za-z\s]+?)(?:\s*:|$)/i);
      const noteMatch = message.match(/(?::|note)\s+(.+)/i);

      const identifier = emailMatch?.[1] || nameMatch?.[1];
      const noteBody = noteMatch?.[1];

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
    else if (lowerMessage.includes('add to workflow') || lowerMessage.includes('enroll in workflow') || lowerMessage.includes('start workflow')) {
      // Parse: "add john@example.com to workflow abc123"

      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const nameMatch = message.match(/(?:add|enroll)\s+([A-Za-z\s]+?)\s+(?:to|in)/i);
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
    else if (lowerMessage.includes('add to campaign') || lowerMessage.includes('enroll in campaign')) {
      // Parse: "add john@example.com to campaign xyz789"

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
