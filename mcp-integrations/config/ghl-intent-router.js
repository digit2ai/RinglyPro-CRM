// GHL API v2 Intent Router Configuration
// Based on official GoHighLevel API v2 documentation
// https://services.leadconnectorhq.com

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';

/**
 * Canonical intent mapping for NLP → GHL API v2
 * Each intent maps to specific GHL endpoint with method, path, and required scopes
 */
const INTENT_ROUTING_TABLE = {
  // ═══════════════════════════════════════════════════════════════
  // CONTACTS
  // ═══════════════════════════════════════════════════════════════
  contacts: {
    create_contact: {
      method: 'POST',
      path: '/contacts/',
      scopes: ['contacts.write'],
      slots: ['firstName', 'lastName', 'phone', 'email', 'tags', 'source', 'customFields'],
      description: 'Create a new contact in GHL CRM'
    },
    update_contact: {
      method: 'PUT',
      path: '/contacts/{contactId}',
      scopes: ['contacts.write'],
      slots: ['contactId', 'firstName', 'lastName', 'phone', 'email', 'tags'],
      description: 'Update an existing contact'
    },
    search_contacts: {
      method: 'GET',
      path: '/contacts/',
      scopes: ['contacts.read'],
      slots: ['query', 'phone', 'email', 'tag', 'limit'],
      description: 'Search contacts (preferred over legacy Get Contacts)'
    },
    get_contact: {
      method: 'GET',
      path: '/contacts/{contactId}',
      scopes: ['contacts.read'],
      slots: ['contactId'],
      description: 'Get a specific contact by ID'
    },
    delete_contact: {
      method: 'DELETE',
      path: '/contacts/{contactId}',
      scopes: ['contacts.write'],
      slots: ['contactId'],
      description: 'Delete a contact'
    },
    add_tag: {
      method: 'POST',
      path: '/contacts/{contactId}/tags',
      scopes: ['contacts.write'],
      slots: ['contactId', 'tags'],
      description: 'Add tags to a contact'
    },
    remove_tag: {
      method: 'DELETE',
      path: '/contacts/{contactId}/tags',
      scopes: ['contacts.write'],
      slots: ['contactId', 'tags'],
      description: 'Remove tags from a contact'
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // CONVERSATIONS & MESSAGES
  // ═══════════════════════════════════════════════════════════════
  conversations: {
    create_conversation: {
      method: 'POST',
      path: '/conversations/',
      scopes: ['conversations.write'],
      slots: ['contactId', 'locationId', 'channel'],
      description: 'Create a new conversation'
    },
    send_message: {
      method: 'POST',
      path: '/conversations/messages',
      scopes: ['conversations.write'],
      slots: ['conversationId', 'contactId', 'type', 'message', 'subject'],
      description: 'Send SMS or Email message (use type: "SMS" or "Email")'
    },
    get_conversation_messages: {
      method: 'GET',
      path: '/conversations/{conversationId}/messages',
      scopes: ['conversations.read'],
      slots: ['conversationId', 'limit'],
      description: 'Get messages from a conversation'
    },
    search_conversations: {
      method: 'GET',
      path: '/conversations/search',
      scopes: ['conversations.read'],
      slots: ['locationId', 'contactId', 'assignedTo'],
      description: 'Search conversations by filters'
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // APPOINTMENTS (CALENDARS)
  // ═══════════════════════════════════════════════════════════════
  appointments: {
    create_appointment: {
      method: 'POST',
      path: '/calendars/events/appointments',
      scopes: ['appointments.write'],
      slots: ['contactId', 'calendarId', 'startTime', 'endTime', 'locationId', 'notes', 'title'],
      description: 'Create a calendar appointment'
    },
    update_appointment: {
      method: 'PUT',
      path: '/calendars/events/appointments/{appointmentId}',
      scopes: ['appointments.write'],
      slots: ['appointmentId', 'startTime', 'endTime', 'notes', 'status'],
      description: 'Update an existing appointment'
    },
    get_appointment: {
      method: 'GET',
      path: '/calendars/events/appointments/{appointmentId}',
      scopes: ['appointments.read'],
      slots: ['appointmentId'],
      description: 'Get appointment details'
    },
    list_calendars: {
      method: 'GET',
      path: '/calendars/',
      scopes: ['calendars.readonly'],
      slots: ['locationId'],
      description: 'List all calendars for a location'
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // OPPORTUNITIES (PIPELINES/DEALS)
  // ═══════════════════════════════════════════════════════════════
  opportunities: {
    create_opportunity: {
      method: 'POST',
      path: '/opportunities/',
      scopes: ['opportunities.write'],
      slots: ['contactId', 'pipelineId', 'stageId', 'name', 'monetaryValue', 'assignedTo', 'locationId'],
      description: 'Create a new opportunity/deal'
    },
    update_opportunity: {
      method: 'PUT',
      path: '/opportunities/{opportunityId}',
      scopes: ['opportunities.write'],
      slots: ['opportunityId', 'stageId', 'monetaryValue', 'status', 'assignedTo'],
      description: 'Update opportunity (including stage changes)'
    },
    update_opportunity_stage: {
      method: 'PUT',
      path: '/opportunities/{opportunityId}',
      scopes: ['opportunities.write'],
      slots: ['opportunityId', 'stageId'],
      description: 'Move opportunity to different pipeline stage'
    },
    list_opportunities: {
      method: 'GET',
      path: '/opportunities/search',
      scopes: ['opportunities.read'],
      slots: ['locationId', 'pipelineId', 'stageId', 'contactId', 'status'],
      description: 'Search/list opportunities with filters'
    },
    get_opportunity: {
      method: 'GET',
      path: '/opportunities/{opportunityId}',
      scopes: ['opportunities.read'],
      slots: ['opportunityId'],
      description: 'Get a specific opportunity'
    },
    get_pipelines: {
      method: 'GET',
      path: '/opportunities/pipelines',
      scopes: ['opportunities.read'],
      slots: ['locationId'],
      description: 'List all pipelines for a location'
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // TASKS & NOTES
  // ═══════════════════════════════════════════════════════════════
  tasks_notes: {
    create_task: {
      method: 'POST',
      path: '/contacts/{contactId}/tasks',
      scopes: ['contacts.write'],
      slots: ['contactId', 'title', 'body', 'dueDate', 'assignedTo', 'completed'],
      description: 'Create a task for a contact'
    },
    update_task: {
      method: 'PUT',
      path: '/contacts/{contactId}/tasks/{taskId}',
      scopes: ['contacts.write'],
      slots: ['contactId', 'taskId', 'title', 'body', 'completed'],
      description: 'Update a task'
    },
    get_tasks: {
      method: 'GET',
      path: '/contacts/{contactId}/tasks',
      scopes: ['contacts.read'],
      slots: ['contactId'],
      description: 'Get all tasks for a contact'
    },
    add_note: {
      method: 'POST',
      path: '/contacts/{contactId}/notes',
      scopes: ['contacts.write'],
      slots: ['contactId', 'body'],
      description: 'Add a note to a contact'
    },
    get_notes: {
      method: 'GET',
      path: '/contacts/{contactId}/notes',
      scopes: ['contacts.read'],
      slots: ['contactId'],
      description: 'Get all notes for a contact'
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // CAMPAIGNS & WORKFLOWS (AUTOMATION)
  // ═══════════════════════════════════════════════════════════════
  automation: {
    add_to_campaign: {
      method: 'POST',
      path: '/contacts/{contactId}/campaigns/{campaignId}',
      scopes: ['campaigns.write'],
      slots: ['contactId', 'campaignId'],
      description: 'Add contact to a campaign'
    },
    remove_from_campaign: {
      method: 'DELETE',
      path: '/contacts/{contactId}/campaigns/{campaignId}',
      scopes: ['campaigns.write'],
      slots: ['contactId', 'campaignId'],
      description: 'Remove contact from a campaign'
    },
    add_to_workflow: {
      method: 'POST',
      path: '/contacts/{contactId}/workflow/{workflowId}',
      scopes: ['workflows.write'],
      slots: ['contactId', 'workflowId', 'eventStartTime'],
      description: 'Add contact to a workflow'
    },
    remove_from_workflow: {
      method: 'DELETE',
      path: '/contacts/{contactId}/workflow/{workflowId}',
      scopes: ['workflows.write'],
      slots: ['contactId', 'workflowId'],
      description: 'Remove contact from a workflow'
    },
    trigger_inbound_webhook: {
      method: 'POST',
      path: '{webhookUrl}', // Custom webhook URL from workflow trigger
      scopes: [],
      slots: ['webhookUrl', 'payload'],
      description: 'Trigger workflow via inbound webhook'
    }
  },

  // ═══════════════════════════════════════════════════════════════
  // CUSTOM FIELDS & LOCATION
  // ═══════════════════════════════════════════════════════════════
  location: {
    get_location: {
      method: 'GET',
      path: '/locations/{locationId}',
      scopes: ['locations.readonly'],
      slots: ['locationId'],
      description: 'Get location details'
    },
    get_custom_fields: {
      method: 'GET',
      path: '/locations/{locationId}/customFields',
      scopes: ['locations.readonly'],
      slots: ['locationId'],
      description: 'Get custom fields for a location'
    },
    get_custom_values: {
      method: 'GET',
      path: '/locations/{locationId}/customValues',
      scopes: ['locations.readonly'],
      slots: ['locationId'],
      description: 'Get custom field values'
    }
  }
};

/**
 * NLP Intent Keywords
 * Maps natural language patterns to canonical intents
 */
const NLP_INTENT_PATTERNS = {
  // CONTACTS
  'create contact': 'create_contact',
  'add contact': 'create_contact',
  'new contact': 'create_contact',

  'update contact': 'update_contact',
  'edit contact': 'update_contact',
  'change contact': 'update_contact',

  'search contact': 'search_contacts',
  'find contact': 'search_contacts',
  'lookup contact': 'search_contacts',
  'search': 'search_contacts',
  'find': 'search_contacts',

  'add tag': 'add_tag',
  'tag contact': 'add_tag',

  'remove tag': 'remove_tag',
  'untag': 'remove_tag',

  // MESSAGES
  'send sms': 'send_message',
  'send message': 'send_message',
  'text': 'send_message',
  'sms': 'send_message',

  'send email': 'send_message',
  'email contact': 'send_message',
  'email': 'send_message',

  // APPOINTMENTS
  'book appointment': 'create_appointment',
  'schedule appointment': 'create_appointment',
  'create appointment': 'create_appointment',
  'new appointment': 'create_appointment',

  'update appointment': 'update_appointment',
  'reschedule': 'update_appointment',

  'list calendars': 'list_calendars',
  'show calendars': 'list_calendars',
  'get calendars': 'list_calendars',

  // OPPORTUNITIES
  'create opportunity': 'create_opportunity',
  'new opportunity': 'create_opportunity',
  'add opportunity': 'create_opportunity',
  'create deal': 'create_opportunity',

  'update opportunity': 'update_opportunity',
  'move opportunity': 'update_opportunity_stage',
  'change stage': 'update_opportunity_stage',

  'list opportunities': 'list_opportunities',
  'show opportunities': 'list_opportunities',
  'get opportunities': 'list_opportunities',

  'list pipelines': 'get_pipelines',
  'show pipelines': 'get_pipelines',
  'get pipelines': 'get_pipelines',

  // TASKS & NOTES
  'create task': 'create_task',
  'add task': 'create_task',
  'new task': 'create_task',

  'add note': 'add_note',
  'create note': 'add_note',
  'note': 'add_note',

  'get tasks': 'get_tasks',
  'list tasks': 'get_tasks',
  'show tasks': 'get_tasks',

  // WORKFLOWS & CAMPAIGNS
  'add to workflow': 'add_to_workflow',
  'start workflow': 'add_to_workflow',
  'enroll in workflow': 'add_to_workflow',

  'add to campaign': 'add_to_campaign',
  'enroll in campaign': 'add_to_campaign',

  // LOCATION
  'get location': 'get_location',
  'show location': 'get_location',
  'location info': 'get_location',
  'location': 'get_location'
};

/**
 * Resolve intent from natural language message
 * @param {string} message - Natural language input
 * @returns {object|null} - { category, intent, config } or null
 */
function resolveIntent(message) {
  const lowerMessage = message.toLowerCase();

  // Find matching pattern
  for (const [pattern, intentName] of Object.entries(NLP_INTENT_PATTERNS)) {
    if (lowerMessage.includes(pattern)) {
      // Find the intent in routing table
      for (const [category, intents] of Object.entries(INTENT_ROUTING_TABLE)) {
        if (intents[intentName]) {
          return {
            category,
            intent: intentName,
            config: intents[intentName],
            pattern
          };
        }
      }
    }
  }

  return null;
}

/**
 * Build API request configuration
 * @param {object} intentConfig - Intent configuration from routing table
 * @param {object} slots - Extracted slot values
 * @returns {object} - { method, url, data, headers }
 */
function buildAPIRequest(intentConfig, slots, apiKey, locationId) {
  let url = `${GHL_BASE_URL}${intentConfig.path}`;

  // Replace path parameters
  Object.keys(slots).forEach(key => {
    url = url.replace(`{${key}}`, slots[key]);
  });

  const config = {
    method: intentConfig.method,
    url,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Version': '2021-07-28'
    }
  };

  // Add request body for POST/PUT
  if (['POST', 'PUT'].includes(intentConfig.method)) {
    config.data = {
      locationId,
      ...slots
    };
  }

  // Add query params for GET
  if (intentConfig.method === 'GET') {
    config.params = {
      locationId,
      ...slots
    };
  }

  return config;
}

module.exports = {
  GHL_BASE_URL,
  INTENT_ROUTING_TABLE,
  NLP_INTENT_PATTERNS,
  resolveIntent,
  buildAPIRequest
};
