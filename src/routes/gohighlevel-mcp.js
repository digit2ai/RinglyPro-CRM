// src/routes/gohighlevel-mcp.js - GoHighLevel MCP Integration Routes
const express = require('express');
const router = express.Router();
const axios = require('axios');

// GoHighLevel API Configuration
const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Middleware to add GHL authentication
const ghlAuth = (req, res, next) => {
  const apiKey = req.body.apiKey || req.headers['x-ghl-api-key'] || process.env.GHL_PRIVATE_API_KEY;
  const locationId = req.body.locationId || req.headers['x-ghl-location-id'] || process.env.GHL_LOCATION_ID;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'GoHighLevel API key is required'
    });
  }

  if (!locationId) {
    return res.status(401).json({
      success: false,
      error: 'GoHighLevel Location ID is required'
    });
  }

  req.ghlConfig = {
    apiKey,
    locationId,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Version': GHL_API_VERSION,
      'Content-Type': 'application/json'
    }
  };

  next();
};

// Helper function to make GHL API calls
async function callGHL(config, method, endpoint, data = null) {
  try {
    const response = await axios({
      method,
      url: `${GHL_BASE_URL}${endpoint}`,
      headers: config.headers,
      data: data ? { ...data, locationId: config.locationId } : null,
      params: method === 'GET' ? { locationId: config.locationId, ...data } : null
    });

    return {
      success: true,
      data: response.data
    };
  } catch (error) {
    console.error('GHL API Error:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data?.message || error.message,
      details: error.response?.data
    };
  }
}

// ============================================
// HEALTH CHECK
// ============================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'GoHighLevel MCP Integration',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// CONTACTS MANAGEMENT
// ============================================

// Create a new contact
router.post('/contacts/create', ghlAuth, async (req, res) => {
  console.log('📝 Creating GHL contact...');
  const { firstName, lastName, email, phone, tags, customFields, source } = req.body;

  const contactData = {
    firstName,
    lastName,
    email,
    phone,
    tags: tags || [],
    customField: customFields || {},
    source: source || 'MCP Integration'
  };

  const result = await callGHL(req.ghlConfig, 'POST', '/contacts/', contactData);

  if (result.success) {
    console.log('✅ Contact created:', result.data.contact?.id);
  }

  res.json(result);
});

// Get contact by ID
router.get('/contacts/:contactId', ghlAuth, async (req, res) => {
  console.log('🔍 Fetching GHL contact:', req.params.contactId);

  const result = await callGHL(req.ghlConfig, 'GET', `/contacts/${req.params.contactId}`);
  res.json(result);
});

// Update contact
router.put('/contacts/:contactId', ghlAuth, async (req, res) => {
  console.log('✏️ Updating GHL contact:', req.params.contactId);
  const { firstName, lastName, email, phone, tags, customFields } = req.body;

  const updateData = {
    firstName,
    lastName,
    email,
    phone,
    tags,
    customField: customFields
  };

  const result = await callGHL(req.ghlConfig, 'PUT', `/contacts/${req.params.contactId}`, updateData);
  res.json(result);
});

// Search/List contacts with pagination support
router.post('/contacts/search', ghlAuth, async (req, res) => {
  console.log('🔍 Searching GHL contacts...');
  const { query, email, phone, limit = 1000 } = req.body;

  console.log(`📊 Contact search - limit requested: ${req.body.limit || 'none (using default)'}, using: ${limit}`);

  try {
    let allContacts = [];
    let nextPageUrl = null;
    let pageCount = 0;
    const maxPages = Math.ceil(limit / 100); // GHL max is 100 per page

    // First request
    let endpoint = `/contacts/?limit=100`; // GHL max per request is 100
    if (query) endpoint += `&query=${encodeURIComponent(query)}`;
    if (email) endpoint += `&email=${encodeURIComponent(email)}`;
    if (phone) endpoint += `&phone=${encodeURIComponent(phone)}`;

    // Fetch all pages until we have enough contacts or no more pages
    do {
      pageCount++;
      console.log(`📄 Fetching page ${pageCount}...`);

      // Use nextPageUrl if available, otherwise use the initial endpoint
      let result;
      if (nextPageUrl) {
        // nextPageUrl is a full URL, call it directly
        try {
          const response = await axios({
            method: 'GET',
            url: nextPageUrl,
            headers: req.ghlConfig.headers
          });
          result = { success: true, data: response.data };
        } catch (error) {
          console.error('GHL pagination error:', error.response?.data || error.message);
          result = { success: false, error: error.message };
        }
      } else {
        // First page, use callGHL helper
        result = await callGHL(req.ghlConfig, 'GET', endpoint);
      }

      if (result.success && result.data?.contacts) {
        allContacts = allContacts.concat(result.data.contacts);
        console.log(`✅ Page ${pageCount}: ${result.data.contacts.length} contacts (total: ${allContacts.length})`);

        // Check for next page
        nextPageUrl = result.data.nextPageUrl || result.data.meta?.nextPageUrl || null;
        console.log(`🔗 Next page URL: ${nextPageUrl ? 'exists' : 'none'}`);

        // Stop if we have enough contacts or no more pages
        if (allContacts.length >= limit || !nextPageUrl || pageCount >= maxPages) {
          break;
        }
      } else {
        console.error('❌ Failed to fetch page:', result.error);
        break;
      }
    } while (nextPageUrl && allContacts.length < limit && pageCount < maxPages);

    console.log(`📊 Final result: ${allContacts.length} contacts from ${pageCount} pages`);

    res.json({
      success: true,
      data: {
        contacts: allContacts.slice(0, limit), // Trim to requested limit
        total: allContacts.length
      }
    });

  } catch (error) {
    console.error('❌ Contact search error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add tags to contact
router.post('/contacts/:contactId/tags', ghlAuth, async (req, res) => {
  console.log('🏷️ Adding tags to contact:', req.params.contactId);
  const { tags } = req.body;

  const result = await callGHL(req.ghlConfig, 'POST', `/contacts/${req.params.contactId}/tags`, { tags });
  res.json(result);
});

// Remove tags from contact
router.delete('/contacts/:contactId/tags', ghlAuth, async (req, res) => {
  console.log('🗑️ Removing tags from contact:', req.params.contactId);
  const { tags } = req.body;

  const result = await callGHL(req.ghlConfig, 'DELETE', `/contacts/${req.params.contactId}/tags`, { tags });
  res.json(result);
});

// ============================================
// CONVERSATIONS & MESSAGING
// ============================================

// Send SMS
router.post('/conversations/messages/sms', ghlAuth, async (req, res) => {
  console.log('💬 Sending SMS via GHL...');
  const { contactId, message, type = 'SMS' } = req.body;

  if (!contactId || !message) {
    return res.status(400).json({
      success: false,
      error: 'contactId and message are required'
    });
  }

  const messageData = {
    type,
    contactId,
    message
  };

  const result = await callGHL(req.ghlConfig, 'POST', '/conversations/messages', messageData);

  if (result.success) {
    console.log('✅ SMS sent to contact:', contactId);
  }

  res.json(result);
});

// Send Email
router.post('/conversations/messages/email', ghlAuth, async (req, res) => {
  console.log('📧 Sending email via GHL...');
  const { contactId, subject, body, html } = req.body;

  if (!contactId || !subject || (!body && !html)) {
    return res.status(400).json({
      success: false,
      error: 'contactId, subject, and body/html are required'
    });
  }

  const messageData = {
    type: 'Email',
    contactId,
    subject,
    body: html || body,
    emailFrom: req.body.emailFrom || undefined
  };

  const result = await callGHL(req.ghlConfig, 'POST', '/conversations/messages', messageData);

  if (result.success) {
    console.log('✅ Email sent to contact:', contactId);
  }

  res.json(result);
});

// Get conversation messages
router.get('/conversations/:contactId/messages', ghlAuth, async (req, res) => {
  console.log('📨 Fetching conversation messages for:', req.params.contactId);
  const { limit = 20, lastMessageId } = req.query;

  let endpoint = `/conversations/messages?contactId=${req.params.contactId}&limit=${limit}`;
  if (lastMessageId) endpoint += `&lastMessageId=${lastMessageId}`;

  const result = await callGHL(req.ghlConfig, 'GET', endpoint);
  res.json(result);
});

// Get all conversations
router.get('/conversations', ghlAuth, async (req, res) => {
  console.log('💬 Fetching all conversations...');
  const { limit = 20 } = req.query;

  const result = await callGHL(req.ghlConfig, 'GET', `/conversations?limit=${limit}`);
  res.json(result);
});

// ============================================
// NOTES MANAGEMENT
// ============================================

// Create note
router.post('/contacts/:contactId/notes', ghlAuth, async (req, res) => {
  console.log('📝 Creating note for contact:', req.params.contactId);
  const { body, userId } = req.body;

  if (!body) {
    return res.status(400).json({
      success: false,
      error: 'Note body is required'
    });
  }

  const noteData = {
    contactId: req.params.contactId,
    body,
    userId
  };

  const result = await callGHL(req.ghlConfig, 'POST', '/notes/', noteData);
  res.json(result);
});

// Get notes for contact
router.get('/contacts/:contactId/notes', ghlAuth, async (req, res) => {
  console.log('📋 Fetching notes for contact:', req.params.contactId);

  const result = await callGHL(req.ghlConfig, 'GET', `/notes/?contactId=${req.params.contactId}`);
  res.json(result);
});

// Update note
router.put('/notes/:noteId', ghlAuth, async (req, res) => {
  console.log('✏️ Updating note:', req.params.noteId);
  const { body } = req.body;

  const result = await callGHL(req.ghlConfig, 'PUT', `/notes/${req.params.noteId}`, { body });
  res.json(result);
});

// Delete note
router.delete('/notes/:noteId', ghlAuth, async (req, res) => {
  console.log('🗑️ Deleting note:', req.params.noteId);

  const result = await callGHL(req.ghlConfig, 'DELETE', `/notes/${req.params.noteId}`);
  res.json(result);
});

// ============================================
// TASKS MANAGEMENT
// ============================================

// Create task
router.post('/contacts/:contactId/tasks', ghlAuth, async (req, res) => {
  console.log('✅ Creating task for contact:', req.params.contactId);
  const { title, body, dueDate, assignedTo, status } = req.body;

  if (!title) {
    return res.status(400).json({
      success: false,
      error: 'Task title is required'
    });
  }

  const taskData = {
    contactId: req.params.contactId,
    title,
    body,
    dueDate,
    assignedTo,
    status: status || 'pending'
  };

  const result = await callGHL(req.ghlConfig, 'POST', '/tasks/', taskData);
  res.json(result);
});

// Get tasks for contact
router.get('/contacts/:contactId/tasks', ghlAuth, async (req, res) => {
  console.log('📋 Fetching tasks for contact:', req.params.contactId);

  const result = await callGHL(req.ghlConfig, 'GET', `/tasks/?contactId=${req.params.contactId}`);
  res.json(result);
});

// Update task
router.put('/tasks/:taskId', ghlAuth, async (req, res) => {
  console.log('✏️ Updating task:', req.params.taskId);
  const { title, body, dueDate, assignedTo, status, completed } = req.body;

  const taskData = {
    title,
    body,
    dueDate,
    assignedTo,
    status,
    completed
  };

  const result = await callGHL(req.ghlConfig, 'PUT', `/tasks/${req.params.taskId}`, taskData);
  res.json(result);
});

// Delete task
router.delete('/tasks/:taskId', ghlAuth, async (req, res) => {
  console.log('🗑️ Deleting task:', req.params.taskId);

  const result = await callGHL(req.ghlConfig, 'DELETE', `/tasks/${req.params.taskId}`);
  res.json(result);
});

// ============================================
// APPOINTMENTS/CALENDAR
// ============================================

// Get calendars
router.get('/calendars', ghlAuth, async (req, res) => {
  console.log('📅 Fetching calendars...');

  const result = await callGHL(req.ghlConfig, 'GET', '/calendars/');
  res.json(result);
});

// Create appointment
router.post('/appointments/create', ghlAuth, async (req, res) => {
  console.log('📅 Creating appointment...');
  const {
    calendarId,
    contactId,
    startTime,
    endTime,
    title,
    appointmentStatus,
    assignedUserId
  } = req.body;

  if (!calendarId || !contactId || !startTime) {
    return res.status(400).json({
      success: false,
      error: 'calendarId, contactId, and startTime are required'
    });
  }

  const appointmentData = {
    calendarId,
    contactId,
    startTime,
    endTime,
    title,
    appointmentStatus: appointmentStatus || 'confirmed',
    assignedUserId
  };

  const result = await callGHL(req.ghlConfig, 'POST', '/calendars/events/appointments', appointmentData);
  res.json(result);
});

// Get appointments
router.get('/appointments', ghlAuth, async (req, res) => {
  console.log('📅 Fetching appointments...');
  const { contactId, calendarId, startDate, endDate } = req.query;

  let endpoint = '/calendars/events/appointments?';
  if (contactId) endpoint += `contactId=${contactId}&`;
  if (calendarId) endpoint += `calendarId=${calendarId}&`;
  if (startDate) endpoint += `startDate=${startDate}&`;
  if (endDate) endpoint += `endDate=${endDate}&`;

  const result = await callGHL(req.ghlConfig, 'GET', endpoint);
  res.json(result);
});

// Update appointment
router.put('/appointments/:appointmentId', ghlAuth, async (req, res) => {
  console.log('✏️ Updating appointment:', req.params.appointmentId);
  const { startTime, endTime, title, appointmentStatus } = req.body;

  const appointmentData = {
    startTime,
    endTime,
    title,
    appointmentStatus
  };

  const result = await callGHL(req.ghlConfig, 'PUT', `/calendars/events/appointments/${req.params.appointmentId}`, appointmentData);
  res.json(result);
});

// ============================================
// OPPORTUNITIES/PIPELINE
// ============================================

// Get pipelines
router.get('/opportunities/pipelines', ghlAuth, async (req, res) => {
  console.log('🎯 Fetching pipelines...');

  const result = await callGHL(req.ghlConfig, 'GET', '/opportunities/pipelines');
  res.json(result);
});

// Create opportunity
router.post('/opportunities/create', ghlAuth, async (req, res) => {
  console.log('💰 Creating opportunity...');
  const {
    pipelineId,
    contactId,
    name,
    pipelineStageId,
    status,
    monetaryValue
  } = req.body;

  if (!pipelineId || !contactId || !name) {
    return res.status(400).json({
      success: false,
      error: 'pipelineId, contactId, and name are required'
    });
  }

  const opportunityData = {
    pipelineId,
    contactId,
    name,
    pipelineStageId,
    status: status || 'open',
    monetaryValue
  };

  const result = await callGHL(req.ghlConfig, 'POST', '/opportunities/', opportunityData);
  res.json(result);
});

// Get opportunities
router.get('/opportunities', ghlAuth, async (req, res) => {
  console.log('💰 Fetching opportunities...');
  const { contactId, pipelineId, status } = req.query;

  const searchData = {
    contactId,
    pipelineId,
    status
  };

  const result = await callGHL(req.ghlConfig, 'POST', '/opportunities/search', searchData);
  res.json(result);
});

// Update opportunity
router.put('/opportunities/:opportunityId', ghlAuth, async (req, res) => {
  console.log('✏️ Updating opportunity:', req.params.opportunityId);
  const { name, pipelineStageId, status, monetaryValue } = req.body;

  const opportunityData = {
    name,
    pipelineStageId,
    status,
    monetaryValue
  };

  const result = await callGHL(req.ghlConfig, 'PUT', `/opportunities/${req.params.opportunityId}`, opportunityData);
  res.json(result);
});

// ============================================
// WORKFLOWS
// ============================================

// Add contact to workflow
router.post('/workflows/:workflowId/add-contact', ghlAuth, async (req, res) => {
  console.log('⚙️ Adding contact to workflow:', req.params.workflowId);
  const { contactId } = req.body;

  if (!contactId) {
    return res.status(400).json({
      success: false,
      error: 'contactId is required'
    });
  }

  const result = await callGHL(req.ghlConfig, 'POST', '/workflows/add-contact', {
    workflowId: req.params.workflowId,
    contactId
  });

  res.json(result);
});

// ============================================
// COMPOSITE AI ACTIONS
// ============================================

// AI Action: Create contact and send welcome SMS
router.post('/ai/welcome-contact', ghlAuth, async (req, res) => {
  console.log('🤖 AI Action: Welcome new contact...');
  const { firstName, lastName, phone, email, welcomeMessage } = req.body;

  const results = {
    contact: null,
    sms: null,
    note: null
  };

  try {
    // Step 1: Create contact
    const contactResult = await callGHL(req.ghlConfig, 'POST', '/contacts/', {
      firstName,
      lastName,
      phone,
      email,
      source: 'AI Assistant',
      tags: ['ai-created']
    });

    if (!contactResult.success) {
      return res.json({
        success: false,
        error: 'Failed to create contact',
        details: contactResult
      });
    }

    results.contact = contactResult.data.contact;
    const contactId = results.contact.id;

    // Step 2: Send welcome SMS
    if (welcomeMessage && phone) {
      const smsResult = await callGHL(req.ghlConfig, 'POST', '/conversations/messages', {
        type: 'SMS',
        contactId,
        message: welcomeMessage
      });
      results.sms = smsResult.data;
    }

    // Step 3: Log note
    const noteResult = await callGHL(req.ghlConfig, 'POST', '/notes/', {
      contactId,
      body: `Contact created by AI Assistant. Welcome message sent: "${welcomeMessage}"`
    });
    results.note = noteResult.data;

    console.log('✅ AI Action completed successfully');
    res.json({
      success: true,
      message: 'Contact created and welcomed successfully',
      data: results
    });

  } catch (error) {
    console.error('❌ AI Action failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      partialResults: results
    });
  }
});

// AI Action: Log conversation and create follow-up task
router.post('/ai/log-conversation', ghlAuth, async (req, res) => {
  console.log('🤖 AI Action: Log conversation...');
  const { contactId, conversationSummary, followUpTask, dueDate } = req.body;

  const results = {
    note: null,
    task: null
  };

  try {
    // Log note
    const noteResult = await callGHL(req.ghlConfig, 'POST', '/notes/', {
      contactId,
      body: conversationSummary
    });
    results.note = noteResult.data;

    // Create follow-up task if provided
    if (followUpTask) {
      const taskResult = await callGHL(req.ghlConfig, 'POST', '/tasks/', {
        contactId,
        title: followUpTask,
        body: `Follow-up from conversation: ${conversationSummary.substring(0, 100)}...`,
        dueDate: dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'pending'
      });
      results.task = taskResult.data;
    }

    res.json({
      success: true,
      message: 'Conversation logged successfully',
      data: results
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      partialResults: results
    });
  }
});

module.exports = router;