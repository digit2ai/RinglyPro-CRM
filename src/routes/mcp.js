// src/routes/mcp.js - MCP AI Copilot Integration Routes
const express = require('express');
const router = express.Router();
const path = require('path');
const axios = require('axios');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

// Import MCP services - using absolute path from project root
const projectRoot = path.join(__dirname, '../..');
const HubSpotMCPProxy = require(path.join(projectRoot, 'mcp-integrations/api/hubspot-proxy'));
const GoHighLevelMCPProxy = require(path.join(projectRoot, 'mcp-integrations/api/gohighlevel-proxy'));
const BusinessCollectorMCPProxy = require(path.join(projectRoot, 'mcp-integrations/api/business-collector-proxy'));
const WebhookManager = require(path.join(projectRoot, 'mcp-integrations/webhooks/webhook-manager'));
const WorkflowEngine = require(path.join(projectRoot, 'mcp-integrations/workflows/workflow-engine'));
const { parseNaturalDate, parseDuration, formatFriendlyDate } = require('../utils/date-parser');

// Initialize services
const sessions = new Map();
const conversationStates = new Map(); // sessionId -> conversation state
const webhookManager = new WebhookManager();
const workflowEngine = new WorkflowEngine();

// Conversation State Structure
// {
//   intent: null,              // 'create_contact', 'update_contact', 'send_sms', 'send_email', 'add_tag', 'remove_tag', 'search_contacts'
//   contactIdentifier: null,   // Email/phone/name user provided
//   candidates: [],            // Multiple matching contacts when search returns multiple
//   selectedContact: null,     // Contact object after user selects from candidates
//   pendingFields: {},         // Fields to update/create { firstName: 'John', phone: '555-1234' }
//   step: 'intent',            // 'intent' → 'identify_contact' → 'gather_info' → 'confirm' → 'execute'
//   messageBody: null,         // For SMS/Email commands
//   tags: []                   // For tag operations
// }

/**
 * Normalize phone number to E.164 format (+1XXXXXXXXXX)
 * This ensures consistent phone storage across all database operations
 * @param {string} phone - Phone number in any format
 * @returns {string|null} - E.164 formatted phone (+1XXXXXXXXXX) or null if invalid
 */
function normalizePhoneE164(phone) {
  if (!phone) return null;

  // Remove all non-digit characters
  const digits = phone.replace(/\D/g, '');

  // Must be 10 or 11 digits
  if (digits.length !== 10 && digits.length !== 11) {
    console.warn(`⚠️ Invalid phone number length: ${phone} (${digits.length} digits)`);
    return null; // Invalid phone
  }

  // Normalize to 11 digits (add country code 1 if needed)
  const normalized = digits.length === 10 ? '1' + digits : digits;

  // Return E.164 format with + prefix
  return '+' + normalized;
}

// Helper functions for conversation state management
function getConversationState(sessionId) {
  if (!conversationStates.has(sessionId)) {
    conversationStates.set(sessionId, {
      intent: null,
      contactIdentifier: null,
      candidates: [],
      selectedContact: null,
      pendingFields: {},
      step: 'intent',
      messageBody: null,
      tags: []
    });
  }
  return conversationStates.get(sessionId);
}

function updateConversationState(sessionId, updates) {
  const state = getConversationState(sessionId);
  Object.assign(state, updates);
  conversationStates.set(sessionId, state);
  console.log('💬 Conversation state updated:', { sessionId, step: state.step, intent: state.intent });
  return state;
}

function clearConversationState(sessionId) {
  conversationStates.delete(sessionId);
  console.log('🧹 Conversation state cleared:', sessionId);
}

function isInConversation(sessionId) {
  const state = conversationStates.get(sessionId);
  return state && state.step !== 'intent';
}

// Intent detection - simplified to core actions only
function detectIntent(message) {
  const lower = message.toLowerCase().trim();

  // Check for cancel/exit commands
  if (/^(cancel|exit|quit|stop|nevermind|never mind)$/i.test(lower)) {
    return { intent: 'cancel', confidence: 'high' };
  }

  // Create contact - must have explicit "create" keyword
  if (/(create|add|new)\s+(a\s+)?contact/i.test(lower)) {
    return { intent: 'create_contact', confidence: 'high' };
  }

  // Update contact - must have "update" keyword + field indication
  if (/update/i.test(lower) && /(contact|phone|email|name|address)/i.test(lower)) {
    return { intent: 'update_contact', confidence: 'high' };
  }

  // Send SMS - must have "send" + "sms|text|message"
  if (/send/i.test(lower) && /(sms|text|message)/i.test(lower)) {
    return { intent: 'send_sms', confidence: 'high' };
  }

  // Send Email - must have "send" + "email"
  if (/send/i.test(lower) && /email/i.test(lower)) {
    return { intent: 'send_email', confidence: 'high' };
  }

  // Add tag - must have "add" + "tag"
  if (/add/i.test(lower) && /tag/i.test(lower)) {
    return { intent: 'add_tag', confidence: 'high' };
  }

  // Remove tag - must have "remove" + "tag"
  if (/remove/i.test(lower) && /tag/i.test(lower)) {
    return { intent: 'remove_tag', confidence: 'high' };
  }

  // Search contacts - "search" or "find" + contact-related words
  if (/(search|find)/i.test(lower) && /(contact|person|client|customer)/i.test(lower)) {
    return { intent: 'search_contacts', confidence: 'high' };
  }

  // Schedule social media post
  if (/(social post|schedule social|post to facebook|post to instagram)/i.test(lower)) {
    return { intent: 'schedule_social_post', confidence: 'high' };
  }

  // List social posts
  if (/(list social posts|show social posts|get social posts|view social posts)/i.test(lower)) {
    return { intent: 'list_social_posts', confidence: 'high' };
  }

  return { intent: null, confidence: 'none' };
}

// Extract common identifiers from message (email, phone, name)
function extractIdentifiers(message) {
  const identifiers = {};

  // Email - highest priority (most reliable)
  const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
  if (emailMatch) {
    identifiers.email = emailMatch[1];
    identifiers.type = 'email';
  }

  // Phone number - second priority
  const phoneMatch = message.match(/(\+?1?\s*\(?[\d]{3}\)?[\s.-]?[\d]{3}[\s.-]?[\d]{4})/);
  if (phoneMatch) {
    identifiers.phone = phoneMatch[1].replace(/\D/g, ''); // Clean to digits only
    if (!identifiers.type) identifiers.type = 'phone';
  }

  // Name - lowest priority (least reliable)
  // Look for capitalized words after "contact" or "for"
  const nameMatch = message.match(/(?:contact|for|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (nameMatch && !identifiers.type) {
    identifiers.name = nameMatch[1];
    identifiers.type = 'name';
  }

  return identifiers;
}

// Conversational Question Templates
const QUESTIONS = {
  // Contact identification - give users options
  identify_contact: "What's the contact's email address or name?\n\n💡 Tip: Email is most reliable, but you can also use phone number or name.",
  identify_contact_email: "What's the contact's email address?",
  identify_contact_phone: "What's the contact's phone number?",
  identify_contact_name: "What's the contact's name?",

  // Create contact fields
  create_contact_name: "What's the contact's full name or business name?",
  create_contact_phone: "What's their phone number?",
  create_contact_email: "What's their email address?",

  // Update contact fields
  update_field_name: "What field do you want to update? (phone, email, firstName, lastName, address, etc.)",
  update_field_value: (field) => `What should the new ${field} be?`,

  // SMS/Email
  message_body: "What message would you like to send?",
  email_subject: "What should the email subject be?",

  // Tags
  tag_name: "What tag would you like to add/remove?",

  // Contact selection
  select_contact: (contacts) => {
    let msg = "I found multiple contacts. Which one?\n\n";
    contacts.forEach((c, idx) => {
      const name = c.contactName || c.name || `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Unnamed';
      const phone = c.phone ? ` | ${c.phone}` : '';
      const email = c.email ? ` | ${c.email}` : '';
      msg += `${idx + 1}. ${name}${phone}${email}\n`;
    });
    msg += "\nReply with the number (1, 2, 3, etc.) or 'cancel' to stop.";
    return msg;
  },

  // Confirmation
  confirm_create: (fields) => {
    let msg = "Create this contact?\n\n";
    Object.keys(fields).forEach(key => {
      msg += `• ${key}: ${fields[key]}\n`;
    });
    msg += "\nReply 'yes' to confirm or 'cancel' to abort.";
    return msg;
  },

  confirm_update: (contact, field, value) => {
    const name = contact.contactName || contact.name || 'this contact';
    return `Update ${name}'s ${field} to "${value}"?\n\nReply 'yes' to confirm or 'cancel' to abort.`;
  },

  confirm_send_sms: (contact, message) => {
    const name = contact.contactName || contact.name || 'this contact';
    const phone = contact.phone || 'their number';
    return `Send SMS to ${name} (${phone})?\n\nMessage: "${message}"\n\nReply 'yes' to confirm or 'cancel' to abort.`;
  },

  confirm_tag: (action, contact, tag) => {
    const name = contact.contactName || contact.name || 'this contact';
    return `${action === 'add' ? 'Add' : 'Remove'} tag "${tag}" ${action === 'add' ? 'to' : 'from'} ${name}?\n\nReply 'yes' to confirm or 'cancel' to abort.`;
  }
};

// Conversation flow handler - routes to appropriate handler based on state
async function handleConversation(sessionId, message, session) {
  const state = getConversationState(sessionId);

  console.log('💬 Handling conversation:', {
    sessionId,
    step: state.step,
    intent: state.intent,
    message: message.substring(0, 50)
  });

  // Check for cancel at any step
  if (/^(cancel|exit|quit|stop|nevermind|never mind)$/i.test(message.trim())) {
    clearConversationState(sessionId);
    return {
      success: true,
      response: "❌ Cancelled. What else can I help you with?"
    };
  }

  // Route based on current step
  switch (state.step) {
    case 'intent':
      return await handleIntentDetection(sessionId, message, session);

    case 'identify_contact':
      return await handleContactIdentification(sessionId, message, session);

    case 'select_contact':
      return await handleContactSelection(sessionId, message, session);

    case 'gather_info':
      return await handleInfoGathering(sessionId, message, session);

    case 'confirm':
      return await handleConfirmation(sessionId, message, session);

    default:
      clearConversationState(sessionId);
      return {
        success: true,
        response: "Something went wrong. Let's start over. What would you like to do?"
      };
  }
}

// Step 1: Intent Detection
async function handleIntentDetection(sessionId, message, session) {
  const detected = detectIntent(message);

  if (detected.intent === null) {
    // No clear intent detected
    return {
      success: true,
      response: "I'm not sure what you want to do. Try:\n• Create contact\n• Update contact\n• Search contacts\n• Send SMS\n• Add tag to contact\n• Remove tag from contact"
    };
  }

  // Intent detected - initialize conversation
  const identifiers = extractIdentifiers(message);

  updateConversationState(sessionId, {
    intent: detected.intent,
    contactIdentifier: identifiers.email || identifiers.phone || identifiers.name || null
  });

  // For create_contact, go straight to gathering info
  if (detected.intent === 'create_contact') {
    updateConversationState(sessionId, { step: 'gather_info' });

    // If we have some info already, store it
    if (identifiers.email) {
      const state = getConversationState(sessionId);
      state.pendingFields.email = identifiers.email;
    }
    if (identifiers.phone) {
      const state = getConversationState(sessionId);
      state.pendingFields.phone = identifiers.phone;
    }

    return {
      success: true,
      response: QUESTIONS.create_contact_name
    };
  }

  // For other intents, need to identify contact first
  if (!identifiers.email && !identifiers.phone && !identifiers.name) {
    updateConversationState(sessionId, { step: 'identify_contact' });
    return {
      success: true,
      response: QUESTIONS.identify_contact
    };
  }

  // We have an identifier, try to find the contact
  return await handleContactIdentification(sessionId, identifiers.email || identifiers.phone || identifiers.name, session);
}

// Step 2: Contact Identification
async function handleContactIdentification(sessionId, message, session) {
  const state = getConversationState(sessionId);

  // Extract identifier from message if not already provided
  const identifiers = typeof message === 'string' ? extractIdentifiers(message) : { email: message, type: 'email' };
  const query = identifiers.email || identifiers.phone || identifiers.name || message.trim();

  if (!query) {
    return {
      success: true,
      response: "I need an email, phone number, or name to find the contact. What is it?"
    };
  }

  // Search for contact (limit to 20 to avoid pagination issues)
  try {
    const contacts = await session.proxy.searchContacts(query, 20);

    if (!contacts || contacts.length === 0) {
      return {
        success: true,
        response: `No contact found with "${query}". Would you like to create a new contact instead?\n\nReply 'yes' to create or 'cancel' to stop.`
      };
    }

    if (contacts.length === 1) {
      // Exactly one match - use it
      updateConversationState(sessionId, {
        selectedContact: contacts[0],
        step: 'gather_info'
      });

      // Route to appropriate next question based on intent
      return await handleInfoGathering(sessionId, '', session);
    }

    // Multiple matches - ask user to select
    updateConversationState(sessionId, {
      candidates: contacts.slice(0, 20), // Max 20 to display
      step: 'select_contact'
    });

    return {
      success: true,
      response: QUESTIONS.select_contact(contacts.slice(0, 20))
    };

  } catch (error) {
    console.error('❌ Contact search error:', error);
    clearConversationState(sessionId);
    return {
      success: false,
      response: `Error searching for contact: ${error.message}\n\nPlease try again.`
    };
  }
}

// Step 3: Contact Selection (from multiple candidates)
async function handleContactSelection(sessionId, message, session) {
  const state = getConversationState(sessionId);
  const selection = parseInt(message.trim());

  if (isNaN(selection) || selection < 1 || selection > state.candidates.length) {
    return {
      success: true,
      response: `Please reply with a number between 1 and ${state.candidates.length}, or 'cancel' to stop.`
    };
  }

  const selectedContact = state.candidates[selection - 1];
  updateConversationState(sessionId, {
    selectedContact,
    step: 'gather_info'
  });

  // Route to appropriate next question
  return await handleInfoGathering(sessionId, '', session);
}

// Step 4: Info Gathering (collect required fields)
async function handleInfoGathering(sessionId, message, session) {
  const state = getConversationState(sessionId);

  // Route based on intent
  switch (state.intent) {
    case 'create_contact':
      return await gatherCreateContactInfo(sessionId, message, session);

    case 'update_contact':
      return await gatherUpdateContactInfo(sessionId, message, session);

    case 'send_sms':
      return await gatherSMSInfo(sessionId, message, session);

    case 'send_email':
      return await gatherEmailInfo(sessionId, message, session);

    case 'add_tag':
    case 'remove_tag':
      return await gatherTagInfo(sessionId, message, session);

    default:
      clearConversationState(sessionId);
      return {
        success: true,
        response: "I'm not sure what to do. Please start over."
      };
  }
}

// Info gathering helpers for each intent type
async function gatherCreateContactInfo(sessionId, message, session) {
  const state = getConversationState(sessionId);
  const msg = message.trim();

  // Step 1: Get name
  if (!state.pendingFields.firstName && !state.pendingFields.fullName) {
    if (msg) {
      // Store the name
      state.pendingFields.firstName = msg;
      // Ask for phone next
      return {
        success: true,
        response: QUESTIONS.create_contact_phone
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.create_contact_name
      };
    }
  }

  // Step 2: Get phone
  if (!state.pendingFields.phone) {
    if (msg && /\d{10}/.test(msg.replace(/\D/g, ''))) {
      // Normalize phone to E.164 format (+1XXXXXXXXXX) for GoHighLevel API
      let phone = msg.replace(/\D/g, '');
      if (phone.length === 10) {
        phone = `+1${phone}`; // Add US country code
      } else if (phone.length === 11 && phone.startsWith('1')) {
        phone = `+${phone}`;
      }
      state.pendingFields.phone = phone;
      // Ask for email next
      return {
        success: true,
        response: QUESTIONS.create_contact_email + "\n\nOr reply 'skip' to create without email."
      };
    } else if (msg) {
      return {
        success: true,
        response: "That doesn't look like a valid phone number. " + QUESTIONS.create_contact_phone
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.create_contact_phone
      };
    }
  }

  // Step 3: Get email (or skip)
  if (!state.pendingFields.email) {
    if (msg && msg.toLowerCase() === 'skip') {
      // User wants to skip email
      // Move to confirmation
      updateConversationState(sessionId, { step: 'confirm' });
      return {
        success: true,
        response: QUESTIONS.confirm_create(state.pendingFields)
      };
    } else if (msg && /@/.test(msg)) {
      state.pendingFields.email = msg;
      // Move to confirmation
      updateConversationState(sessionId, { step: 'confirm' });
      return {
        success: true,
        response: QUESTIONS.confirm_create(state.pendingFields)
      };
    } else if (msg) {
      return {
        success: true,
        response: "That doesn't look like a valid email. " + QUESTIONS.create_contact_email + "\n\nOr reply 'skip' to create without email."
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.create_contact_email + "\n\nOr reply 'skip' to create without email."
      };
    }
  }

  // All required fields collected - move to confirmation
  updateConversationState(sessionId, { step: 'confirm' });
  return {
    success: true,
    response: QUESTIONS.confirm_create(state.pendingFields)
  };
}

async function gatherUpdateContactInfo(sessionId, message, session) {
  const state = getConversationState(sessionId);
  const msg = message.trim();

  // Need to know what field to update
  if (!state.pendingFields.fieldName) {
    if (msg) {
      state.pendingFields.fieldName = msg;
      return {
        success: true,
        response: QUESTIONS.update_field_value(msg)
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.update_field_name
      };
    }
  }

  // Need the new value
  if (!state.pendingFields.fieldValue) {
    if (msg) {
      state.pendingFields.fieldValue = msg;
      // Move to confirmation
      updateConversationState(sessionId, { step: 'confirm' });
      return {
        success: true,
        response: QUESTIONS.confirm_update(state.selectedContact, state.pendingFields.fieldName, state.pendingFields.fieldValue)
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.update_field_value(state.pendingFields.fieldName)
      };
    }
  }

  // Shouldn't reach here
  updateConversationState(sessionId, { step: 'confirm' });
  return {
    success: true,
    response: QUESTIONS.confirm_update(state.selectedContact, state.pendingFields.fieldName, state.pendingFields.fieldValue)
  };
}

async function gatherSMSInfo(sessionId, message, session) {
  const state = getConversationState(sessionId);
  const msg = message.trim();

  if (!state.messageBody) {
    if (msg) {
      state.messageBody = msg;
      updateConversationState(sessionId, { step: 'confirm' });
      return {
        success: true,
        response: QUESTIONS.confirm_send_sms(state.selectedContact, state.messageBody)
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.message_body
      };
    }
  }

  // Shouldn't reach here
  updateConversationState(sessionId, { step: 'confirm' });
  return {
    success: true,
    response: QUESTIONS.confirm_send_sms(state.selectedContact, state.messageBody)
  };
}

async function gatherEmailInfo(sessionId, message, session) {
  const state = getConversationState(sessionId);
  const msg = message.trim();

  // Need subject first
  if (!state.pendingFields.subject) {
    if (msg) {
      state.pendingFields.subject = msg;
      return {
        success: true,
        response: QUESTIONS.message_body
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.email_subject
      };
    }
  }

  // Then need body
  if (!state.messageBody) {
    if (msg) {
      state.messageBody = msg;
      updateConversationState(sessionId, { step: 'confirm' });
      return {
        success: true,
        response: `Send email to ${state.selectedContact.contactName || state.selectedContact.email}?\n\nSubject: "${state.pendingFields.subject}"\nBody: "${state.messageBody}"\n\nReply 'yes' to confirm or 'cancel' to abort.`
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.message_body
      };
    }
  }

  // Shouldn't reach here
  updateConversationState(sessionId, { step: 'confirm' });
  return {
    success: true,
    response: `Send email?\n\nSubject: "${state.pendingFields.subject}"\nBody: "${state.messageBody}"\n\nReply 'yes' to send.`
  };
}

async function gatherTagInfo(sessionId, message, session) {
  const state = getConversationState(sessionId);
  const msg = message.trim();

  if (state.tags.length === 0) {
    if (msg) {
      state.tags.push(msg);
      updateConversationState(sessionId, { step: 'confirm' });
      const action = state.intent === 'add_tag' ? 'add' : 'remove';
      return {
        success: true,
        response: QUESTIONS.confirm_tag(action, state.selectedContact, msg)
      };
    } else {
      return {
        success: true,
        response: QUESTIONS.tag_name
      };
    }
  }

  // Shouldn't reach here
  const action = state.intent === 'add_tag' ? 'add' : 'remove';
  updateConversationState(sessionId, { step: 'confirm' });
  return {
    success: true,
    response: QUESTIONS.confirm_tag(action, state.selectedContact, state.tags[0])
  };
}

// Step 5: Confirmation and Execution
async function handleConfirmation(sessionId, message, session) {
  const state = getConversationState(sessionId);
  const msg = message.trim().toLowerCase();

  if (msg !== 'yes' && msg !== 'y' && msg !== 'confirm') {
    return {
      success: true,
      response: "Please reply 'yes' to confirm or 'cancel' to abort."
    };
  }

  // User confirmed - execute the action
  try {
    let result;

    switch (state.intent) {
      case 'create_contact':
        result = await executeCreateContact(session, state);
        break;

      case 'update_contact':
        result = await executeUpdateContact(session, state);
        break;

      case 'send_sms':
        result = await executeSendSMS(session, state);
        break;

      case 'send_email':
        result = await executeSendEmail(session, state);
        break;

      case 'add_tag':
        result = await executeAddTag(session, state);
        break;

      case 'remove_tag':
        result = await executeRemoveTag(session, state);
        break;

      default:
        throw new Error('Unknown intent: ' + state.intent);
    }

    // Clear conversation state on success
    clearConversationState(sessionId);

    return {
      success: true,
      response: result.response
    };

  } catch (error) {
    console.error('❌ Execution error:', error);
    clearConversationState(sessionId);
    return {
      success: false,
      response: `Error: ${error.message}\n\nPlease try again.`
    };
  }
}

// Execution functions for each intent
async function executeCreateContact(session, state) {
  try {
    // Don't include locationId - the proxy handles it based on token type
    // JWT tokens: locationId embedded in token (shouldn't be in body)
    // PIT tokens: proxy adds locationId to body
    const contactData = {
      ...state.pendingFields
    };

    console.log('📝 Creating contact with data:', JSON.stringify(contactData));

    const result = await session.proxy.createContact(contactData);

    console.log('✅ Contact created:', result?.contact?.id || 'unknown ID');

    return {
      response: `✅ Contact created successfully!\n\nName: ${state.pendingFields.firstName || state.pendingFields.fullName}\nPhone: ${state.pendingFields.phone || 'N/A'}\nEmail: ${state.pendingFields.email || 'N/A'}`
    };
  } catch (error) {
    console.error('❌ Create contact error:', error.response?.data || error.message);
    console.error('❌ Full error object:', JSON.stringify(error.response?.data || error, null, 2));

    // Extract detailed error message
    let errorMsg = error.response?.data?.message || error.message || 'Unknown error';

    // If there's additional error details, include them
    if (error.response?.data?.errors) {
      errorMsg += '\nDetails: ' + JSON.stringify(error.response.data.errors);
    }

    return {
      response: `❌ Failed to create contact: ${errorMsg}\n\nPlease check the contact information and try again.`
    };
  }
}

async function executeUpdateContact(session, state) {
  const contactId = state.selectedContact.id;
  const fieldName = state.pendingFields.fieldName;
  const fieldValue = state.pendingFields.fieldValue;

  const updateData = {
    [fieldName]: fieldValue
  };

  await session.proxy.updateContact(contactId, updateData);

  return {
    response: `✅ Contact updated successfully!\n\nUpdated ${fieldName} to: ${fieldValue}`
  };
}

async function executeSendSMS(session, state) {
  try {
    const contactId = state.selectedContact.id;
    const message = state.messageBody;

    // Call GHL SMS API
    await session.proxy.sendSMS(contactId, message);

    return {
      response: `✅ SMS sent to ${state.selectedContact.contactName || state.selectedContact.phone}!\n\nMessage: "${message}"`
    };
  } catch (error) {
    console.error('❌ Send SMS error:', error.response?.data || error.message);
    console.error('❌ Full error object:', JSON.stringify(error.response?.data || error, null, 2));

    // Extract detailed error message
    let errorMsg = error.response?.data?.message || error.message || 'Unknown error';

    // If there's additional error details, include them
    if (error.response?.data?.errors) {
      errorMsg += '\nDetails: ' + JSON.stringify(error.response.data.errors);
    }

    return {
      response: `❌ Failed to send SMS: ${errorMsg}\n\nPlease check that the contact has a valid phone number.`
    };
  }
}

async function executeSendEmail(session, state) {
  try {
    const contactId = state.selectedContact.id;
    const subject = state.pendingFields.subject;
    const body = state.messageBody;

    // Call GHL Email API
    await session.proxy.sendEmail(contactId, subject, body);

    return {
      response: `✅ Email sent to ${state.selectedContact.contactName || state.selectedContact.email}!\n\nSubject: "${subject}"`
    };
  } catch (error) {
    console.error('❌ Send email error:', error.response?.data || error.message);
    console.error('❌ Full error object:', JSON.stringify(error.response?.data || error, null, 2));

    // Extract detailed error message
    let errorMsg = error.response?.data?.message || error.message || 'Unknown error';

    // If there's additional error details, include them
    if (error.response?.data?.errors) {
      errorMsg += '\nDetails: ' + JSON.stringify(error.response.data.errors);
    }

    return {
      response: `❌ Failed to send email: ${errorMsg}\n\nPlease check that the contact has a valid email address.`
    };
  }
}

async function executeAddTag(session, state) {
  try {
    const contactId = state.selectedContact.id;
    const tag = state.tags[0];

    await session.proxy.addTagToContact(contactId, tag);

    return {
      response: `✅ Tag "${tag}" added to ${state.selectedContact.contactName || 'contact'}!`
    };
  } catch (error) {
    console.error('❌ Add tag error:', error.response?.data || error.message);
    let errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    return {
      response: `❌ Failed to add tag: ${errorMsg}`
    };
  }
}

async function executeRemoveTag(session, state) {
  try {
    const contactId = state.selectedContact.id;
    const tag = state.tags[0];

    await session.proxy.removeTagFromContact(contactId, tag);

    return {
      response: `✅ Tag "${tag}" removed from ${state.selectedContact.contactName || 'contact'}!`
    };
  } catch (error) {
    console.error('❌ Remove tag error:', error.response?.data || error.message);
    let errorMsg = error.response?.data?.message || error.message || 'Unknown error';
    return {
      response: `❌ Failed to remove tag: ${errorMsg}`
    };
  }
}

// Health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'MCP Integration',
    activeSessions: sessions.size,
    timestamp: new Date().toISOString()
  });
});

// Generate AI-powered hashtag suggestions
router.post('/generate-hashtags', async (req, res) => {
  console.log('🏷️ Hashtag generation request received');
  const { category, clientId } = req.body;

  if (!category) {
    return res.status(400).json({
      success: false,
      error: 'Market category is required'
    });
  }

  try {
    // Define audience-specific hashtag templates for RinglyPro's B2B2C strategy
    const hashtagsByCategory = {
      // PRIMARY TARGET: Chamber of Commerce Leaders (they share to all members)
      chamberleaders: [
        '#ChamberOfCommerce', '#ChamberLeaders', '#BusinessCommunity', '#LocalBusiness', '#SupportLocalBusiness',
        '#SmallBusinessSupport', '#ChamberMember', '#NetworkingEvents', '#BusinessLeadership', '#CommunityLeaders',
        '#EconomicDevelopment', '#BusinessNetworking', '#ChamberBenefits', '#ShopLocal', '#LocalEconomy'
      ],
      // Chamber Members - All business types that chambers serve
      chambermembers: [
        '#SmallBusiness', '#SmallBusinessOwner', '#LocalBusiness', '#Entrepreneur', '#BusinessOwner',
        '#SmallBiz', '#SupportSmallBusiness', '#SmallBusinessSaturday', '#ShopSmall', '#BusinessGrowth',
        '#EntrepreneurLife', '#SmallBusinessMarketing', '#BusinessSuccess', '#SmallBusinessTips', '#GrowYourBusiness'
      ],
      // Solopreneurs - Solo business owners (key target for automation)
      solopreneur: [
        '#Solopreneur', '#SolopreneurLife', '#SoloBusiness', '#OnePerson Business', '#FreelanceLife',
        '#SelfEmployed', '#WorkFromAnywhere', '#IndependentBusiness', '#SolopreneurSuccess', '#SoloBusinessOwner',
        '#FreelancerLife', '#OneManBusiness', '#SoloEntrepreneur', '#BusinessAutomation', '#TimeManagement'
      ],
      // Home Services - Plumbers, HVAC, Electricians (miss calls = lost revenue)
      homeservices: [
        '#HomeServices', '#HomeRepair', '#Plumbing', '#HVAC', '#Electrician',
        '#HomeImprovement', '#Contractor', '#HandymanServices', '#LocalContractor', '#HomeServicePro',
        '#PlumbingServices', '#HVACServices', '#ElectricalServices', '#HomeMaintenanceServices', '#24x7Service'
      ],
      // Real Estate - Agents need to answer every lead call
      realestate: [
        '#RealEstate', '#RealEstateAgent', '#Realtor', '#RealEstateBusiness', '#RealEstateLife',
        '#RealEstateMarketing', '#RealEstateInvestor', '#PropertyManagement', '#RealtorLife', '#RealEstateSales',
        '#RealEstateLeads', '#HomeListings', '#RealEstateSuccess', '#RealEstateTips', '#RealEstateServices'
      ],
      // Law Firms - Never miss a client call
      lawfirms: [
        '#LawFirm', '#Attorney', '#Lawyer', '#LegalServices', '#LawPractice',
        '#AttorneyAtLaw', '#LegalAdvice', '#LawOffice', '#LawyerLife', '#LegalProfessional',
        '#LegalMarketing', '#LawFirmMarketing', '#AttorneyServices', '#LegalBusiness', '#LawFirmManagement'
      ],
      // Contractors & Construction
      contractors: [
        '#Contractor', '#Construction', '#GeneralContractor', '#ConstructionBusiness', '#ConstructionLife',
        '#BuildingContractor', '#ContractorLife', '#ConstructionServices', '#ContractorServices', '#HomeBuilder',
        '#ConstructionCompany', '#ContractorMarketing', '#ConstructionIndustry', '#Remodeling', '#HomeConstruction'
      ],
      // Property Management
      propertymanagement: [
        '#PropertyManagement', '#PropertyManager', '#RentalProperty', '#RealEstateManagement', '#PropertyManagementServices',
        '#RentalManagement', '#CommercialProperty', '#ResidentialProperty', '#PropertyManagementCompany', '#LandlordLife',
        '#RentalBusiness', '#PropertyServices', '#TenantManagement', '#RealEstateServices', '#PropertyCare'
      ],
      // Salons, Spas & Beauty - Appointment-based businesses
      salons: [
        '#Salon', '#BeautySalon', '#HairSalon', '#Spa', '#BeautyBusiness',
        '#SalonOwner', '#SalonLife', '#BeautyServices', '#SalonMarketing', '#SpaServices',
        '#HairStylist', '#BeautyProfessional', '#SalonAppointments', '#BeautyIndustry', '#SalonBusiness'
      ],
      // Automotive Services
      automotive: [
        '#AutoRepair', '#AutoShop', '#CarRepair', '#MechanicShop', '#AutoService',
        '#CarMaintenance', '#AutoCare', '#MechanicLife', '#AutoRepairShop', '#CarService',
        '#AutomotiveBusiness', '#AutoIndustry', '#CarCare', '#AutoTech', '#AutoRepairServices'
      ],
      // Business Consultants & Coaches
      consulting: [
        '#BusinessConsultant', '#BusinessCoach', '#Consultant', '#Coaching', '#BusinessConsulting',
        '#BusinessCoaching', '#ConsultingServices', '#BusinessAdvisor', '#ManagementConsulting', '#ConsultantLife',
        '#BusinessStrategy', '#CoachingBusiness', '#ProfessionalServices', '#BusinessMentor', '#ConsultingBusiness'
      ],
      // Accountants & Financial Services
      accountants: [
        '#Accountant', '#Accounting', '#CPA', '#Bookkeeping', '#TaxServices',
        '#AccountingFirm', '#AccountingServices', '#FinancialServices', '#Bookkeeper', '#TaxPreparation',
        '#AccountingBusiness', '#SmallBusinessAccounting', '#CPAFirm', '#FinancialAdvisor', '#AccountingLife'
      ],
      // Insurance Agencies
      insurance: [
        '#Insurance', '#InsuranceAgent', '#InsuranceAgency', '#InsuranceBusiness', '#InsuranceServices',
        '#LifeInsurance', '#HealthInsurance', '#InsuranceBroker', '#InsuranceAdvisor', '#InsuranceSales',
        '#InsuranceMarketing', '#InsuranceProfessional', '#InsuranceIndustry', '#InsuranceLife', '#InsuranceAgencyOwner'
      ],
      // Retail & Small Shops
      retail: [
        '#Retail', '#RetailBusiness', '#SmallShop', '#RetailStore', '#ShopLocal',
        '#RetailOwner', '#SmallRetail', '#RetailMarketing', '#RetailLife', '#ShopSmallBusiness',
        '#RetailServices', '#RetailIndustry', '#LocalRetail', '#RetailShopOwner', '#IndependentRetail'
      ]
    };

    // Get hashtags for the selected category
    const categoryHashtags = hashtagsByCategory[category] || [];

    if (categoryHashtags.length === 0) {
      return res.json({
        success: true,
        hashtags: ['#Business', '#Marketing', '#SmallBusiness', '#Success', '#Growth'],
        message: 'Using default hashtags'
      });
    }

    // Return a curated selection (10-12 hashtags)
    const selectedHashtags = categoryHashtags.slice(0, 12);

    console.log(`✅ Generated ${selectedHashtags.length} hashtags for category: ${category}`);

    res.json({
      success: true,
      hashtags: selectedHashtags,
      category: category
    });

  } catch (error) {
    console.error('❌ Hashtag generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate hashtags'
    });
  }
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

// Business Collector connection
router.post('/business-collector/connect', async (req, res) => {
  console.log('🔗 Business Collector connection request received');

  try {
    const proxy = new BusinessCollectorMCPProxy();
    const sessionId = `bc_${Date.now()}`;

    // Check if Business Collector service is healthy
    const health = await proxy.checkHealth();
    if (!health.success) {
      throw new Error('Business Collector service is offline');
    }

    sessions.set(sessionId, {
      type: 'business-collector',
      proxy,
      createdAt: new Date()
    });

    console.log('✅ Business Collector connected, session:', sessionId);

    res.json({
      success: true,
      sessionId,
      message: 'Business Collector connected successfully',
      serviceStatus: health.status,
      version: health.version
    });
  } catch (error) {
    console.error('❌ Business Collector connection error:', error);
    res.status(400).json({
      success: false,
      error: error.message || 'Failed to connect to Business Collector'
    });
  }
});

// Business Collector - Full collection
router.post('/business-collector/collect', async (req, res) => {
  console.log('📊 Business Collector collection request received');
  const { sessionId, category, geography, maxResults } = req.body;

  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'Session ID required' });
  }

  const session = sessions.get(sessionId);
  if (!session) {
    console.error(`❌ No session found for sessionId: ${sessionId}`);
    return res.status(401).json({ success: false, error: 'Invalid session - please reconnect to GoHighLevel' });
  }

  // Business Collector now works with any valid session (GoHighLevel, HubSpot, etc.)
  // Create Business Collector proxy on the fly if needed
  if (!session.businessCollectorProxy) {
    console.log('📊 Creating Business Collector proxy for session');
    session.businessCollectorProxy = new BusinessCollectorMCPProxy();
  }

  if (!category || !geography) {
    return res.status(400).json({
      success: false,
      error: 'Category and geography are required'
    });
  }

  try {
    const result = await session.businessCollectorProxy.collectBusinesses({
      category,
      geography,
      maxResults: maxResults || 100
    });

    // Check if the proxy returned an error
    if (!result.success) {
      console.error('❌ Business collection failed:', result.error);
      console.error('Details:', result.details);
      return res.status(500).json({
        success: false,
        error: result.error || 'Business Collector service is unavailable',
        details: result.details
      });
    }

    const displayText = session.businessCollectorProxy.formatForDisplay(result.businesses);

    res.json({
      success: true,
      summary: result.summary,
      businesses: result.businesses,
      displayText
    });
  } catch (error) {
    console.error('❌ Business collection error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to collect businesses'
    });
  }
});

// Business Collector - Quick collection (no session required)
router.get('/business-collector/quick', async (req, res) => {
  console.log('⚡ Quick business collection request received');
  const { category, geography, max } = req.query;

  if (!category || !geography) {
    return res.status(400).json({
      success: false,
      error: 'Category and geography query parameters are required'
    });
  }

  try {
    const proxy = new BusinessCollectorMCPProxy();
    const result = await proxy.quickCollect(category, geography, parseInt(max) || 50);

    res.json({
      success: true,
      summary: result.summary,
      businesses: result.businesses,
      displayText: proxy.formatForDisplay(result.businesses)
    });
  } catch (error) {
    console.error('❌ Quick collection error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to collect businesses'
    });
  }
});

// Business Collector - Save businesses to database
router.post('/business-collector/save', async (req, res) => {
  console.log('💾 Save businesses to database request received');
  const { clientId, businesses } = req.body;

  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: 'Client ID is required'
    });
  }

  if (!businesses || !Array.isArray(businesses) || businesses.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Businesses array is required and must not be empty'
    });
  }

  try {
    console.log(`📊 Saving ${businesses.length} businesses for client ${clientId}...`);

    // Prepare bulk insert data
    const savedBusinesses = [];
    const duplicates = [];

    for (const business of businesses) {
      try {
        // Normalize phone number to E.164 format before processing
        const normalizedPhone = normalizePhoneE164(business.phone);
        if (business.phone && normalizedPhone !== business.phone) {
          console.log(`📱 Normalized phone: ${business.phone} → ${normalizedPhone}`);
        }

        // Check if business already exists (duplicate detection by phone number)
        if (normalizedPhone) {
          const existing = await sequelize.query(
            `SELECT id FROM business_directory
             WHERE client_id = :clientId AND phone_number = :phone
             LIMIT 1`,
            {
              replacements: {
                clientId: parseInt(clientId),
                phone: normalizedPhone
              },
              type: QueryTypes.SELECT
            }
          );

          if (existing && existing.length > 0) {
            console.log(`⚠️ Duplicate found: ${business.business_name} (${normalizedPhone})`);
            duplicates.push(business.business_name);
            continue;
          }
        }

        // Build location string (e.g., "Miami, FL")
        const location = business.city && business.state
          ? `${business.city}, ${business.state}`
          : (business.state || null);

        // Insert business into database with new fields
        const result = await sequelize.query(
          `INSERT INTO business_directory (
            business_name, phone_number, website, email,
            street, city, state, postal_code, country,
            category, source_url, confidence, notes, client_id,
            location, call_status, call_attempts,
            created_at, updated_at
          ) VALUES (
            :businessName, :phone, :website, :email,
            :street, :city, :state, :postalCode, :country,
            :category, :sourceUrl, :confidence, :notes, :clientId,
            :location, :callStatus, :callAttempts,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          ) RETURNING id`,
          {
            replacements: {
              businessName: business.business_name || 'Unknown',
              phone: normalizedPhone || null, // Use normalized E.164 format
              website: business.website || null,
              email: business.email || null,
              street: business.street || null,
              city: business.city || null,
              state: business.state || null,
              postalCode: business.postal_code || null,
              country: business.country || 'US',
              category: business.category || null,
              sourceUrl: business.source_url || null,
              confidence: business.confidence || null,
              notes: business.notes || null,
              clientId: parseInt(clientId),
              location: location,
              callStatus: 'TO_BE_CALLED',
              callAttempts: 0
            },
            type: QueryTypes.INSERT
          }
        );

        savedBusinesses.push({
          name: business.business_name,
          phone: business.phone,
          data: business
        });
        console.log(`✅ Saved: ${business.business_name}`);

      } catch (error) {
        console.error(`❌ Error saving business ${business.business_name}:`, error.message);
        // Continue with next business even if one fails
      }
    }

    console.log(`✅ Successfully saved ${savedBusinesses.length} businesses`);
    console.log(`⚠️ Skipped ${duplicates.length} duplicates`);

    // AUTO-EXPORT TO GHL: Attempt to export saved businesses to GoHighLevel
    let ghlExported = 0;
    let ghlFailed = 0;

    try {
      // Get GHL credentials for this client
      const credentials = await sequelize.query(
        `SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId`,
        {
          replacements: { clientId: parseInt(clientId) },
          type: QueryTypes.SELECT
        }
      );

      if (credentials && credentials.length > 0 && credentials[0].ghl_api_key && credentials[0].ghl_location_id) {
        const { ghl_api_key, ghl_location_id } = credentials[0];
        console.log(`🔑 Found GHL credentials for client ${clientId}, auto-exporting ${savedBusinesses.length} businesses...`);

        const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
        const GHL_API_VERSION = '2021-07-28';

        for (const saved of savedBusinesses) {
          try {
            const business = saved.data;

            // Skip if no phone number
            if (!business.phone) {
              console.log(`⚠️ Skipping GHL export for ${business.business_name}: No phone number`);
              continue;
            }

            // Format phone number
            let phone = business.phone.replace(/\D/g, '');
            if (phone.length === 10) {
              phone = '1' + phone;
            }
            if (!phone.startsWith('+')) {
              phone = '+' + phone;
            }

            // Build location string
            const businessLocation = business.city && business.state
              ? `${business.city}, ${business.state}`
              : (business.state || '');

            // Prepare contact data for GHL
            const contactData = {
              locationId: ghl_location_id,
              firstName: business.business_name || 'Unknown Business',
              phone: phone,
              email: business.email || undefined,
              website: business.website || undefined,
              address1: business.street || undefined,
              city: business.city || undefined,
              state: business.state || undefined,
              postalCode: business.postal_code || undefined,
              country: business.country || 'US',
              source: `Business Collector - ${businessLocation}`,
              tags: [
                'NEW LEAD',
                'TO_BE_CALLED',
                business.category || 'Uncategorized',
                businessLocation || 'Location Unknown'
              ].filter(tag => tag)
            };

            // Call GHL API to create contact
            const response = await axios({
              method: 'POST',
              url: `${GHL_BASE_URL}/contacts/`,
              headers: {
                'Authorization': `Bearer ${ghl_api_key}`,
                'Version': GHL_API_VERSION,
                'Content-Type': 'application/json'
              },
              data: contactData
            });

            if (response.data && response.data.contact) {
              console.log(`✅ Auto-exported to GHL: ${business.business_name} (Contact ID: ${response.data.contact.id})`);
              ghlExported++;
            }

          } catch (error) {
            // Silently handle duplicates in GHL
            if (error.response?.data?.message?.includes('duplicate') ||
                error.response?.data?.message?.includes('already exists')) {
              console.log(`⚠️ ${saved.name} already exists in GHL`);
            } else {
              console.error(`❌ Failed to auto-export ${saved.name} to GHL:`, error.response?.data || error.message);
              ghlFailed++;
            }
          }
        }

        console.log(`✅ GHL Auto-Export: ${ghlExported} exported, ${ghlFailed} failed`);
      } else {
        console.log(`⚠️ No GHL credentials found for client ${clientId}, skipping auto-export`);
      }
    } catch (error) {
      console.error('❌ Error during GHL auto-export:', error.message);
    }

    res.json({
      success: true,
      saved: savedBusinesses.length,
      duplicates: duplicates.length,
      duplicateNames: duplicates,
      ghlExported: ghlExported,
      ghlFailed: ghlFailed,
      message: `Saved ${savedBusinesses.length} businesses to directory${duplicates.length > 0 ? ` (${duplicates.length} duplicates skipped)` : ''}${ghlExported > 0 ? ` and auto-exported ${ghlExported} to GHL` : ''}`
    });

  } catch (error) {
    console.error('❌ Error saving businesses to database:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save businesses to database'
    });
  }
});

// Business Collector - Export businesses to GHL CRM with "NEW LEAD" tag
router.post('/business-collector/export-to-ghl', async (req, res) => {
  console.log('📤 Export businesses to GHL CRM request received');
  const { clientId, businesses } = req.body;

  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: 'Client ID is required'
    });
  }

  if (!businesses || !Array.isArray(businesses) || businesses.length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Businesses array is required and must not be empty'
    });
  }

  try {
    // Get client's GHL credentials from database
    const clientData = await sequelize.query(
      'SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId LIMIT 1',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    if (!clientData || clientData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Client not found'
      });
    }

    const { ghl_api_key, ghl_location_id } = clientData[0];

    if (!ghl_api_key || !ghl_location_id) {
      return res.status(400).json({
        success: false,
        error: 'GHL API credentials not configured for this client. Please add GHL API Key and Location ID in client settings.'
      });
    }

    console.log(`🔑 Using GHL credentials for client ${clientId}`);
    console.log(`📍 Location ID: ${ghl_location_id}`);

    const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
    const GHL_API_VERSION = '2021-07-28';

    const exported = [];
    const failed = [];
    const skipped = [];

    for (const business of businesses) {
      try {
        // Skip if no phone number
        if (!business.phone) {
          console.log(`⚠️ Skipping ${business.business_name}: No phone number`);
          skipped.push({ name: business.business_name, reason: 'No phone number' });
          continue;
        }

        // Format phone number (remove non-digits, ensure it starts with country code)
        let phone = business.phone.replace(/\D/g, '');
        if (phone.length === 10) {
          phone = '1' + phone; // Add US country code
        }
        if (!phone.startsWith('+')) {
          phone = '+' + phone;
        }

        // Build location string for GHL
        const businessLocation = business.city && business.state
          ? `${business.city}, ${business.state}`
          : (business.state || '');

        // Prepare contact data for GHL
        const contactData = {
          locationId: ghl_location_id,
          firstName: business.business_name || 'Unknown Business',
          phone: phone,
          email: business.email || undefined,
          website: business.website || undefined,
          address1: business.street || undefined,
          city: business.city || undefined,
          state: business.state || undefined,
          postalCode: business.postal_code || undefined,
          country: business.country || 'US',
          source: `Business Collector - ${businessLocation}`,
          tags: [
            'NEW LEAD',
            'TO_BE_CALLED',
            business.category || 'Uncategorized',
            businessLocation || 'Location Unknown'
          ].filter(tag => tag) // Remove empty tags
        };

        console.log(`📤 Exporting to GHL: ${business.business_name}`);

        // Call GHL API to create contact
        const response = await axios({
          method: 'POST',
          url: `${GHL_BASE_URL}/contacts/`,
          headers: {
            'Authorization': `Bearer ${ghl_api_key}`,
            'Version': GHL_API_VERSION,
            'Content-Type': 'application/json'
          },
          data: contactData
        });

        if (response.data && response.data.contact) {
          console.log(`✅ Exported to GHL: ${business.business_name} (Contact ID: ${response.data.contact.id})`);
          exported.push({
            name: business.business_name,
            contactId: response.data.contact.id,
            phone: phone
          });
        } else {
          console.log(`⚠️ Unexpected GHL response for ${business.business_name}`);
          failed.push({ name: business.business_name, reason: 'Unexpected API response' });
        }

      } catch (error) {
        console.error(`❌ Failed to export ${business.business_name} to GHL:`, error.response?.data || error.message);

        // Check if it's a duplicate contact error
        if (error.response?.data?.message?.includes('duplicate') ||
            error.response?.data?.message?.includes('already exists')) {
          skipped.push({ name: business.business_name, reason: 'Already exists in GHL' });
        } else {
          failed.push({
            name: business.business_name,
            reason: error.response?.data?.message || error.message
          });
        }
      }
    }

    console.log(`✅ GHL Export Summary: ${exported.length} exported, ${skipped.length} skipped, ${failed.length} failed`);

    res.json({
      success: true,
      exported: exported.length,
      skipped: skipped.length,
      failed: failed.length,
      exportedContacts: exported,
      skippedContacts: skipped,
      failedContacts: failed,
      message: `Exported ${exported.length} contacts to GHL CRM with "NEW LEAD" tag${skipped.length > 0 ? ` (${skipped.length} skipped)` : ''}${failed.length > 0 ? ` (${failed.length} failed)` : ''}`
    });

  } catch (error) {
    console.error('❌ Error exporting businesses to GHL:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to export businesses to GHL CRM'
    });
  }
});

// Business Collector - Get collected businesses from database
router.get('/business-collector/directory/:clientId', async (req, res) => {
  console.log('📂 Get business directory request received');
  const { clientId } = req.params;
  const { limit = 100, offset = 0, category, state } = req.query;

  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: 'Client ID is required'
    });
  }

  try {
    console.log(`📊 Fetching business directory for client ${clientId}...`);

    // Build WHERE clause with filters
    let whereClause = 'WHERE client_id = :clientId';
    const replacements = { clientId: parseInt(clientId), limit: parseInt(limit), offset: parseInt(offset) };

    if (category) {
      whereClause += ' AND category ILIKE :category';
      replacements.category = `%${category}%`;
    }

    if (state) {
      whereClause += ' AND state = :state';
      replacements.state = state;
    }

    // Get businesses
    const businesses = await sequelize.query(
      `SELECT
        id, business_name, phone_number, website, email,
        street, city, state, postal_code, country,
        category, source_url, confidence, notes,
        created_at, updated_at
      FROM business_directory
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    // Get total count
    const countResult = await sequelize.query(
      `SELECT COUNT(*) as total FROM business_directory ${whereClause}`,
      {
        replacements: { clientId: parseInt(clientId), category: replacements.category, state: replacements.state },
        type: QueryTypes.SELECT
      }
    );

    const total = parseInt(countResult[0].total);

    console.log(`✅ Found ${businesses.length} businesses (total: ${total})`);

    res.json({
      success: true,
      businesses,
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
      hasMore: (parseInt(offset) + businesses.length) < total
    });

  } catch (error) {
    console.error('❌ Error fetching business directory:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch business directory'
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

    // Check if Claude AI is enabled
    const useClaudeAI = process.env.ENABLE_CLAUDE_AI === 'true';
    const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

    console.log('🔍 Claude AI Check:', {
      ENABLE_CLAUDE_AI: process.env.ENABLE_CLAUDE_AI,
      useClaudeAI,
      hasAnthropicKey,
      apiKeyPreview: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 20) + '...' : 'NOT SET'
    });

    if (useClaudeAI && hasAnthropicKey) {
      console.log('🧠 Using Claude AI for intelligent conversation');
      try {
        const claudeConversation = require('../services/claude-conversation');

        // Get pending action from conversation state if exists
        const conversationState = conversationStates.get(sessionId);
        const context = conversationState ? { pendingAction: conversationState } : {};

        // Process message with Claude AI
        const claudeResponse = await claudeConversation.processMessage(sessionId, message, context);

        console.log('🎯 Claude AI response:', claudeResponse);

        // Route to appropriate handler based on Claude's action
        if (claudeResponse.action === 'create_contact' && claudeResponse.needsConfirmation) {
          // Store pending action and ask for confirmation
          updateConversationState(sessionId, {
            intent: 'create_contact',
            step: 'confirm',
            pendingFields: claudeResponse.data
          });

          return res.json({
            success: true,
            response: claudeResponse.message
          });
        } else if (claudeResponse.action === 'create_contact' && !claudeResponse.needsConfirmation) {
          // Execute immediately (user confirmed)
          const result = await executeCreateContact(session, { pendingFields: claudeResponse.data });
          clearConversationState(sessionId);

          return res.json({
            success: true,
            response: result.response
          });
        } else if (claudeResponse.action === 'search_contact') {
          // Execute search
          const contacts = await session.proxy.searchContacts(claudeResponse.data.query, 20);

          if (!contacts || contacts.length === 0) {
            return res.json({
              success: true,
              response: `No contacts found matching "${claudeResponse.data.query}".`
            });
          }

          // Format contacts for display
          let response = `Found ${contacts.length} contact(s):\n\n`;
          contacts.slice(0, 10).forEach((c, idx) => {
            const name = c.contactName || c.firstName || 'Unknown';
            const phone = c.phone ? ` | ${c.phone}` : '';
            const email = c.email ? ` | ${c.email}` : '';
            response += `${idx + 1}. ${name}${phone}${email}\n`;
          });

          return res.json({
            success: true,
            response
          });
        } else if (claudeResponse.action === 'update_contact') {
          // Update contact
          const contacts = await session.proxy.searchContacts(claudeResponse.data.contactQuery, 5);

          if (!contacts || contacts.length === 0) {
            return res.json({
              success: true,
              response: `❌ No contact found matching "${claudeResponse.data.contactQuery}".`
            });
          }

          const contact = contacts[0];

          if (claudeResponse.needsConfirmation) {
            // Store pending action
            updateConversationState(sessionId, {
              intent: 'update_contact',
              step: 'confirm',
              selectedContact: contact,
              pendingFields: {
                field: claudeResponse.data.field,
                value: claudeResponse.data.value
              }
            });

            return res.json({
              success: true,
              response: claudeResponse.message
            });
          } else {
            // Execute immediately (user confirmed)
            const result = await executeUpdateContact(session, {
              selectedContact: contact,
              pendingFields: {
                fieldName: claudeResponse.data.field,
                fieldValue: claudeResponse.data.value
              }
            });
            clearConversationState(sessionId);

            return res.json({
              success: true,
              response: result.response
            });
          }

        } else if (claudeResponse.action === 'delete_contact') {
          // Delete contact
          const contacts = await session.proxy.searchContacts(claudeResponse.data.contactQuery, 5);

          if (!contacts || contacts.length === 0) {
            return res.json({
              success: true,
              response: `❌ No contact found matching "${claudeResponse.data.contactQuery}".`
            });
          }

          const contact = contacts[0];

          if (claudeResponse.needsConfirmation) {
            // Ask for confirmation
            updateConversationState(sessionId, {
              intent: 'delete_contact',
              step: 'confirm',
              selectedContact: contact
            });

            return res.json({
              success: true,
              response: `⚠️ Are you sure you want to delete ${contact.contactName || contact.firstName || 'this contact'}? Reply 'yes' to confirm or 'cancel' to abort.`
            });
          } else {
            // Execute delete
            await session.proxy.deleteContact(contact.id);
            clearConversationState(sessionId);

            return res.json({
              success: true,
              response: `✅ Deleted ${contact.contactName || contact.firstName || 'contact'} successfully.`
            });
          }

        } else if (claudeResponse.action === 'send_sms') {
          // Send SMS
          const contacts = await session.proxy.searchContacts(claudeResponse.data.contactQuery, 5);

          if (!contacts || contacts.length === 0) {
            return res.json({
              success: true,
              response: `❌ No contact found matching "${claudeResponse.data.contactQuery}".`
            });
          }

          const contact = contacts[0];

          if (claudeResponse.needsConfirmation) {
            // Store pending action
            updateConversationState(sessionId, {
              intent: 'send_sms',
              step: 'confirm',
              selectedContact: contact,
              messageBody: claudeResponse.data.message
            });

            return res.json({
              success: true,
              response: claudeResponse.message
            });
          } else {
            // Execute send
            const result = await executeSendSMS(session, {
              selectedContact: contact,
              messageBody: claudeResponse.data.message
            });
            clearConversationState(sessionId);

            return res.json({
              success: true,
              response: result.response
            });
          }

        } else if (claudeResponse.action === 'send_email') {
          // Send Email
          const contacts = await session.proxy.searchContacts(claudeResponse.data.contactQuery, 5);

          if (!contacts || contacts.length === 0) {
            return res.json({
              success: true,
              response: `❌ No contact found matching "${claudeResponse.data.contactQuery}".`
            });
          }

          const contact = contacts[0];

          if (claudeResponse.needsConfirmation) {
            // Store pending action
            updateConversationState(sessionId, {
              intent: 'send_email',
              step: 'confirm',
              selectedContact: contact,
              pendingFields: { subject: claudeResponse.data.subject },
              messageBody: claudeResponse.data.body
            });

            return res.json({
              success: true,
              response: claudeResponse.message
            });
          } else {
            // Execute send
            const result = await executeSendEmail(session, {
              selectedContact: contact,
              pendingFields: { subject: claudeResponse.data.subject },
              messageBody: claudeResponse.data.body
            });
            clearConversationState(sessionId);

            return res.json({
              success: true,
              response: result.response
            });
          }

        } else if (claudeResponse.action === 'add_tag') {
          // Add tag
          const contacts = await session.proxy.searchContacts(claudeResponse.data.contactQuery, 5);

          if (!contacts || contacts.length === 0) {
            return res.json({
              success: true,
              response: `❌ No contact found matching "${claudeResponse.data.contactQuery}".`
            });
          }

          const contact = contacts[0];

          if (claudeResponse.needsConfirmation) {
            // Store pending action
            updateConversationState(sessionId, {
              intent: 'add_tag',
              step: 'confirm',
              selectedContact: contact,
              tags: claudeResponse.data.tags
            });

            return res.json({
              success: true,
              response: claudeResponse.message
            });
          } else {
            // Execute add tag
            const result = await executeAddTag(session, {
              selectedContact: contact,
              tags: claudeResponse.data.tags
            });
            clearConversationState(sessionId);

            return res.json({
              success: true,
              response: result.response
            });
          }

        } else if (claudeResponse.action === 'remove_tag') {
          // Remove tag
          const contacts = await session.proxy.searchContacts(claudeResponse.data.contactQuery, 5);

          if (!contacts || contacts.length === 0) {
            return res.json({
              success: true,
              response: `❌ No contact found matching "${claudeResponse.data.contactQuery}".`
            });
          }

          const contact = contacts[0];

          if (claudeResponse.needsConfirmation) {
            // Store pending action
            updateConversationState(sessionId, {
              intent: 'remove_tag',
              step: 'confirm',
              selectedContact: contact,
              tags: claudeResponse.data.tags
            });

            return res.json({
              success: true,
              response: claudeResponse.message
            });
          } else {
            // Execute remove tag
            const result = await executeRemoveTag(session, {
              selectedContact: contact,
              tags: claudeResponse.data.tags
            });
            clearConversationState(sessionId);

            return res.json({
              success: true,
              response: result.response
            });
          }

        } else if (claudeResponse.action === 'get_pipelines') {
          // Get pipelines
          const pipelines = await session.proxy.getPipelines();

          if (!pipelines || !pipelines.pipelines || pipelines.pipelines.length === 0) {
            return res.json({
              success: true,
              response: '❌ No pipelines found.'
            });
          }

          let response = `Found ${pipelines.pipelines.length} pipeline(s):\n\n`;
          pipelines.pipelines.forEach((p, idx) => {
            response += `${idx + 1}. **${p.name}**\n`;
            if (p.stages && p.stages.length > 0) {
              response += `   Stages: ${p.stages.map(s => s.name).join(' → ')}\n`;
            }
            response += '\n';
          });

          return res.json({
            success: true,
            response
          });

        } else if (claudeResponse.action === 'create_opportunity') {
          // Create opportunity - need to get pipeline ID first
          const pipelines = await session.proxy.getPipelines();

          // Find pipeline by name (case-insensitive)
          const pipelineName = (claudeResponse.data.pipelineName || '').toLowerCase();
          const pipeline = pipelines?.pipelines?.find(p =>
            p.name.toLowerCase().includes(pipelineName)
          );

          if (!pipeline) {
            return res.json({
              success: true,
              response: `❌ Pipeline "${claudeResponse.data.pipelineName}" not found. Available pipelines:\n${pipelines?.pipelines?.map(p => `• ${p.name}`).join('\n')}`
            });
          }

          // Find contact
          const contacts = await session.proxy.searchContacts(claudeResponse.data.contactQuery, 5);

          if (!contacts || contacts.length === 0) {
            return res.json({
              success: true,
              response: `❌ No contact found matching "${claudeResponse.data.contactQuery}".`
            });
          }

          const contact = contacts[0];

          if (claudeResponse.needsConfirmation) {
            // Store pending action
            updateConversationState(sessionId, {
              intent: 'create_opportunity',
              step: 'confirm',
              selectedContact: contact,
              pendingFields: {
                pipelineId: pipeline.id,
                pipelineName: pipeline.name,
                stageId: pipeline.stages[0]?.id, // First stage
                name: claudeResponse.data.name || `${contact.firstName || 'Contact'} Opportunity`,
                monetaryValue: claudeResponse.data.monetaryValue || 0
              }
            });

            return res.json({
              success: true,
              response: claudeResponse.message
            });
          } else {
            // Execute create
            const oppData = {
              pipelineId: pipeline.id,
              pipelineStageId: pipeline.stages[0]?.id,
              name: claudeResponse.data.name || `${contact.firstName || 'Contact'} Opportunity`,
              status: 'open',
              monetaryValue: claudeResponse.data.monetaryValue || 0,
              contactId: contact.id
            };

            const result = await session.proxy.createOpportunity(oppData);
            clearConversationState(sessionId);

            return res.json({
              success: true,
              response: `✅ Created opportunity "${oppData.name}" for $${oppData.monetaryValue} in ${pipeline.name} pipeline!`
            });
          }

        } else if (claudeResponse.action === 'get_opportunities') {
          // Get opportunities
          const opportunities = await session.proxy.getOpportunities();

          if (!opportunities || opportunities.length === 0) {
            return res.json({
              success: true,
              response: '❌ No opportunities found.'
            });
          }

          let response = `Found ${opportunities.length} opportunit${opportunities.length === 1 ? 'y' : 'ies'}:\n\n`;
          opportunities.slice(0, 10).forEach((o, idx) => {
            response += `${idx + 1}. ${o.name || 'Untitled'} - $${o.monetaryValue || 0} (${o.status || 'open'})\n`;
          });

          return res.json({
            success: true,
            response
          });

        } else if (claudeResponse.action === 'get_calendars') {
          // Get calendars
          const calendars = await session.proxy.getCalendars();

          if (!calendars || !calendars.calendars || calendars.calendars.length === 0) {
            return res.json({
              success: true,
              response: '❌ No calendars found.'
            });
          }

          let response = `Found ${calendars.calendars.length} calendar(s):\n\n`;
          calendars.calendars.forEach((cal, idx) => {
            response += `${idx + 1}. ${cal.name}\n`;
          });

          return res.json({
            success: true,
            response
          });

        } else if (claudeResponse.action === 'get_location') {
          // Get location info
          const location = await session.proxy.getLocation();

          let response = `**Location Information:**\n\n`;
          response += `Name: ${location.name || 'Unknown'}\n`;
          if (location.address) response += `Address: ${location.address}\n`;
          if (location.phone) response += `Phone: ${location.phone}\n`;
          if (location.email) response += `Email: ${location.email}\n`;

          return res.json({
            success: true,
            response
          });

        } else if (claudeResponse.action === 'get_custom_fields') {
          // Get custom fields
          const fields = await session.proxy.getCustomFields();

          if (!fields || !fields.customFields || fields.customFields.length === 0) {
            return res.json({
              success: true,
              response: '❌ No custom fields found.'
            });
          }

          let response = `Found ${fields.customFields.length} custom field(s):\n\n`;
          fields.customFields.slice(0, 10).forEach((f, idx) => {
            response += `${idx + 1}. ${f.name} (${f.dataType})\n`;
          });

          return res.json({
            success: true,
            response
          });

        } else if (claudeResponse.action === 'schedule_social_post') {
          // Schedule social media post
          const { platforms, message: postMessage, scheduleTime } = claudeResponse.data;

          try {
            // Get social media accounts
            console.log('🔍 Fetching social media accounts...');
            const fbAccounts = await session.proxy.getSocialAccounts('facebook').catch(err => {
              console.error('❌ Error fetching Facebook accounts:', err.message);
              return { accounts: [] };
            });
            const igAccounts = await session.proxy.getSocialAccounts('instagram').catch(err => {
              console.error('❌ Error fetching Instagram accounts:', err.message);
              return { accounts: [] };
            });

            console.log('📱 Facebook accounts found:', fbAccounts?.accounts?.length || 0);
            console.log('📱 Instagram accounts found:', igAccounts?.accounts?.length || 0);
            console.log('📋 FB Account details:', JSON.stringify(fbAccounts, null, 2));
            console.log('📋 IG Account details:', JSON.stringify(igAccounts, null, 2));

            if (!fbAccounts?.accounts?.length && !igAccounts?.accounts?.length) {
              return res.json({
                success: false,
                response: "⚠️ No social media accounts connected. Please connect your Facebook or Instagram accounts in GoHighLevel first."
              });
            }

            // Get account IDs from connected accounts
            const accountIds = [];
            if (platforms.includes('facebook') && fbAccounts?.accounts?.length > 0) {
              accountIds.push(...fbAccounts.accounts.map(acc => acc.id));
            }
            if (platforms.includes('instagram') && igAccounts?.accounts?.length > 0) {
              accountIds.push(...igAccounts.accounts.map(acc => acc.id));
            }

            if (accountIds.length === 0) {
              return res.json({
                success: false,
                response: `⚠️ No ${platforms.join('/')} accounts found. Please connect your accounts in GoHighLevel first.`
              });
            }

            // GoHighLevel Social Media API format (correct field names based on API spec)
            // https://highlevel.stoplight.io/docs/integrations/9e6c88f07a4e3-create-social-media-posting
            const postData = {
              accountIds: accountIds,                    // Array of account IDs
              message: postMessage,                       // Post text content
              type: 'post',                              // Required: post, story, or reel
              media: [],                                 // Required: array of media objects (empty for text-only)
              state: scheduleTime ? 'scheduled' : 'published',  // scheduled or published
              userId: session.clientId || '15'           // User ID from session
            };

            // Add schedule date if specified
            if (scheduleTime) {
              postData.postDate = new Date(scheduleTime).toISOString();
            }

            console.log('📱 Creating social post with data:', JSON.stringify(postData, null, 2));
            const result = await session.proxy.createSocialPost(postData);
            console.log('✅ Social post created successfully:', JSON.stringify(result, null, 2));

            let response = `✅ Social media post scheduled!\n\n`;
            response += `📱 Platforms: ${platforms.join(', ')}\n`;
            response += `📝 Content: ${postMessage.substring(0, 100)}${postMessage.length > 100 ? '...' : ''}\n`;
            response += `\nPost ID: ${result?.id || 'N/A'}\n`;
            response += `Status: ${result?.status || 'Scheduled'}\n`;
            response += `\n✅ Check your GoHighLevel Social Planner to confirm!`;

            return res.json({
              success: true,
              response,
              data: result
            });

          } catch (error) {
            console.error('❌ Social post error:', error);
            console.error('❌ Error details:', {
              message: error.message,
              response: error.response?.data,
              status: error.response?.status
            });
            return res.json({
              success: false,
              error: error.message,
              response: `❌ Error scheduling social post: ${error.message}\n\nPlease check:\n1. Facebook/Instagram accounts are connected in GoHighLevel\n2. Your GoHighLevel API key has social media permissions\n3. Your account has active social media features enabled`,
              details: error.response?.data
            });
          }

        } else if (claudeResponse.action === 'list_social_posts') {
          // List social media posts
          try {
            console.log('📋 Fetching social posts list...');
            // GoHighLevel API format for listing posts
            const posts = await session.proxy.listSocialPosts({
              limit: 20,
              skip: 0
            });
            console.log('📋 Posts response:', JSON.stringify(posts, null, 2));

            if (posts && posts.posts && posts.posts.length > 0) {
              let response = `📱 Recent Social Media Posts (${posts.posts.length}):\n\n`;
              posts.posts.forEach((post, idx) => {
                response += `${idx + 1}. ${post.message ? post.message.substring(0, 50) + '...' : 'No content'}\n`;
                response += `   Status: ${post.status || 'unknown'}\n`;
                if (post.scheduleTime) {
                  response += `   Scheduled: ${new Date(post.scheduleTime).toLocaleString()}\n`;
                }
                response += `\n`;
              });

              return res.json({
                success: true,
                response,
                data: posts
              });
            } else {
              console.log('⚠️ No posts found in response:', posts);
              return res.json({
                success: true,
                response: "No social media posts found.\n\nThis could mean:\n1. No posts have been created yet\n2. Social media feature not enabled in GoHighLevel\n3. Check GoHighLevel Social Planner directly"
              });
            }
          } catch (error) {
            console.error('❌ List social posts error:', error);
            return res.json({
              success: false,
              response: `Error listing social posts: ${error.message}`
            });
          }

        } else {
          // Default: just show Claude's message
          return res.json({
            success: true,
            response: claudeResponse.message
          });
        }

      } catch (claudeError) {
        console.error('❌ Claude AI error:', claudeError);
        console.error('Error details:', {
          message: claudeError.message,
          stack: claudeError.stack,
          name: claudeError.name
        });

        // Return error message to user instead of falling back to regex
        return res.json({
          success: false,
          response: `Sorry, I encountered an error processing your request. Please try again.\n\nError: ${claudeError.message}`
        });
      }
    } else {
      // Claude AI is disabled - show message
      console.log('⚠️  Claude AI is disabled. Set ENABLE_CLAUDE_AI=true and ANTHROPIC_API_KEY in environment.');
      return res.json({
        success: true,
        response: "Claude AI is not enabled. Please enable it in your environment settings to use intelligent conversation features."
      });
    }

    // Original regex-based logic continues below...
    // Helper function to convert businesses to CSV for outbound caller app
    // Format: Name,phone,Website (3 columns)
    function convertToCSV(businesses) {
      if (!businesses || businesses.length === 0) return '';

      // CSV headers matching outbound caller app format
      const headers = ['Name', 'phone', 'Website'];

      // Build CSV rows
      const rows = [headers.join(',')];

      for (const b of businesses) {
        // Format phone number: normalize to include US country code
        let phone = b.phone || b.phone_e164 || '';
        phone = phone.replace(/[^\d]/g, ''); // Remove all non-digit characters

        // Add US country code (1) if missing and phone is 10 digits
        if (phone.length === 10) {
          phone = '1' + phone;  // Convert 8134893222 → 18134893222
        }
        // If already has country code, keep as is

        // Get website URL
        const website = b.website || b.domain || '';

        const row = [
          escapeCSV(b.business_name || ''),
          phone,  // Phone number with country code (11 digits: 1 + 10)
          escapeCSV(website)  // Website URL
        ];
        rows.push(row.join(','));
      }

      return rows.join('\n');
    }

    function escapeCSV(value) {
      if (!value) return '';
      const str = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

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

    // CONVERSATIONAL AGENT - For GoHighLevel contact operations
    // This new conversational system asks clarifying questions instead of trying to parse complex natural language
    if (session.type === 'gohighlevel') {
      // Check if we're already in a conversation OR if this message matches a contact-related intent
      const inConversation = isInConversation(sessionId);
      const detected = detectIntent(message);
      const isContactIntent = detected.intent && [
        'create_contact',
        'update_contact',
        'send_sms',
        'send_email',
        'add_tag',
        'remove_tag',
        'search_contacts'
      ].includes(detected.intent);

      // IMPORTANT: Social media intents bypass conversational routing
      const isSocialIntent = detected.intent && [
        'schedule_social_post',
        'list_social_posts'
      ].includes(detected.intent);

      if ((inConversation || isContactIntent) && !isSocialIntent) {
        console.log('🎯 Routing to conversational agent:', { inConversation, intent: detected.intent });
        const result = await handleConversation(sessionId, message, session);

        return res.json({
          success: result.success !== false,
          response: result.response,
          data: result.data || null
        });
      }

      // If not a contact intent, fall through to legacy handlers for other GHL features
      // (appointments, calendars, locations, social media, etc.)
    }

    // BUSINESS COLLECTOR - Handle business collection intents
    if (session.type === 'business-collector') {
      // Check for outbound caller request
      if (/outbound.*caller|start.*calling|call.*leads|auto.*call/i.test(processMessage)) {
        if (!session.lastCollectionResults || !session.lastCollectionResults.businesses) {
          response = 'No leads to call. Please collect some businesses first!';
          return res.json({
            success: true,
            response,
            suggestions: [
              'Collect Real Estate Agents in Florida',
              'Find Dentists in Miami',
              'Get Plumbers in Tampa'
            ]
          });
        }

        const businesses = session.lastCollectionResults.businesses;
        const leadsWithPhones = businesses.filter(b => b.phone || b.phone_e164);

        if (leadsWithPhones.length === 0) {
          response = '❌ No phone numbers found in collected leads. Please collect businesses with phone numbers first.';
          return res.json({
            success: true,
            response,
            suggestions: [
              'Collect Real Estate Agents in Florida',
              'Find Dentists in Miami'
            ]
          });
        }

        // Store leads in session for outbound calling
        session.outboundLeads = leadsWithPhones;

        response = `📞 Outbound Caller Ready!\n\n✅ ${leadsWithPhones.length} leads with phone numbers loaded\n🎯 Auto-calling with 2-minute intervals\n🤖 Machine detection included\n\n⚠️ Important:\n• Human answers → Directly connected to GHL Voice Bot\n• Voicemail detected → Rachel AI leaves professional message\n• Each call from +12396103810\n\nReady to start calling?`;

        return res.json({
          success: true,
          response,
          outboundCallerReady: true,
          totalLeads: leadsWithPhones.length,
          suggestions: [
            'Start calling now',
            'View call settings',
            'Export to CSV instead'
          ]
        });
      }

      // Check for start calling confirmation
      if (/start.*calling|begin.*calls|call.*now/i.test(processMessage) && session.outboundLeads) {
        const outboundCallerService = require('../services/outbound-caller');

        try {
          const result = await outboundCallerService.startAutoCalling(
            session.outboundLeads,
            2 // 2 minutes interval
          );

          response = `🚀 Auto-Calling Started!\n\n📊 Status:\n• Total leads: ${result.totalLeads}\n• Interval: ${result.intervalMinutes} minutes\n• Currently calling lead #1\n\n🎯 Calls will continue automatically every ${result.intervalMinutes} minutes.\n\nYou can stop calling at any time.`;

          return res.json({
            success: true,
            response,
            callingStarted: true,
            suggestions: [
              'Stop calling',
              'Check status',
              'View call logs'
            ]
          });
        } catch (error) {
          console.error('Error starting outbound calling:', error);
          response = `❌ Failed to start calling: ${error.message}\n\n⚠️ Please check:\n• Twilio credentials configured\n• TWILIO_ACCOUNT_SID set\n• TWILIO_AUTH_TOKEN set\n• TWILIO_PHONE_NUMBER set`;

          return res.json({
            success: false,
            response,
            suggestions: [
              'Export to CSV instead',
              'Collect different leads'
            ]
          });
        }
      }

      // Check for stop calling request
      if (/stop.*calling|stop.*calls|pause.*calling/i.test(processMessage)) {
        const outboundCallerService = require('../services/outbound-caller');

        try {
          const result = outboundCallerService.stopAutoCalling();

          if (result.wasCalling) {
            response = `⏸️ Auto-Calling Stopped!\n\n📊 Summary:\n• Calls made: ${result.callsMade}\n• Total leads: ${result.totalLeads}\n• Remaining: ${result.totalLeads - result.callsMade}\n\nYou can restart calling anytime.`;
          } else {
            response = `ℹ️ Auto-calling is not currently active.`;
          }

          return res.json({
            success: true,
            response,
            suggestions: [
              'Start calling now',
              'View call logs',
              'Export to CSV'
            ]
          });
        } catch (error) {
          console.error('Error stopping calling:', error);
          response = `❌ Failed to stop calling: ${error.message}`;

          return res.json({
            success: false,
            response
          });
        }
      }

      // Check for call status request
      if (/status|check.*calling|call.*progress/i.test(processMessage)) {
        const outboundCallerService = require('../services/outbound-caller');

        try {
          const status = outboundCallerService.getStatus();

          if (status.isRunning) {
            response = `📊 Calling Status:\n\n✅ Auto-calling is ACTIVE\n• Current: Lead #${status.currentIndex} of ${status.totalLeads}\n• Completed: ${status.callsMade} calls\n• Remaining: ${status.remaining} leads\n• Interval: ${status.intervalMinutes} minutes\n\n🎯 Next call in ~${status.intervalMinutes} minutes`;
          } else {
            response = `📊 Calling Status:\n\n⏸️ Auto-calling is PAUSED\n• Total calls made: ${status.callsMade}\n• Total leads: ${status.totalLeads}`;
          }

          return res.json({
            success: true,
            response,
            data: status,
            suggestions: status.isRunning ? ['Stop calling', 'View call logs'] : ['Start calling now', 'View call logs']
          });
        } catch (error) {
          console.error('Error getting status:', error);
          response = `❌ Failed to get status: ${error.message}`;

          return res.json({
            success: false,
            response
          });
        }
      }

      // Check for CSV export request
      if (/export|download|csv/i.test(processMessage)) {
        if (!session.lastCollectionResults || !session.lastCollectionResults.businesses) {
          response = 'No results to export. Please collect some businesses first!';
          return res.json({
            success: true,
            response,
            suggestions: [
              'Collect Real Estate Agents in Florida',
              'Find Dentists in Miami',
              'Get Plumbers in Tampa'
            ]
          });
        }

        // Generate CSV data
        const businesses = session.lastCollectionResults.businesses;
        const csvData = convertToCSV(businesses);

        // Create descriptive filename from category and geography
        const meta = session.lastCollectionResults.meta || {};
        const category = (meta.category || 'businesses').toLowerCase().replace(/\s+/g, '-');
        const geography = (meta.geography || 'unknown').toLowerCase().replace(/\s+/g, '-');
        const filename = `${category}-${geography}-${businesses.length}-leads.csv`;

        response = `📥 Outbound Calling List Ready!\n\n✅ ${businesses.length} businesses with phone numbers\n📋 Format: Name, phone, Website\n🎯 Ready to upload to your outbound caller app`;

        return res.json({
          success: true,
          response,
          csvData,
          csvFilename: filename,
          suggestions: [
            'Outbound Caller'
          ]
        });
      }

      // Pattern: "Collect [Category] in [Location]", "Find [Category] in [Location]", "Get [Category] in [Location]"
      const categoryMatch = message.match(/(?:collect|find|get|search)\s+(?:leads\s+for\s+)?([^in]+?)\s+in\s+([^,]+)/i);

      if (categoryMatch) {
        const category = categoryMatch[1].trim();
        const geography = categoryMatch[2].trim();

        try {
          console.log(`🔍 Collecting ${category} in ${geography}`);
          const result = await session.proxy.collectBusinesses({
            category,
            geography,
            maxResults: 100
          });

          const displayText = session.proxy.formatForDisplay(result.businesses);

          response = `Found ${result.summary.total} ${category} in ${geography}!\n\n${displayText}`;
          data = result;

          // Store last results in session for CSV export
          session.lastCollectionResults = result;

          return res.json({
            success: true,
            response,
            data,
            suggestions: [
              'Export results to CSV',
              'Outbound Caller'
            ]
          });
        } catch (error) {
          console.error('❌ Business collection error:', error);
          response = `Failed to collect businesses: ${error.message}`;
          return res.json({
            success: false,
            response,
            suggestions: [
              'Try a broader location (e.g., "Florida" instead of "Small Town")',
              'Check category spelling',
              'Try: "Collect Real Estate Agents in Florida"'
            ]
          });
        }
      } else {
        // No valid pattern found, provide guidance
        response = `I can help you collect business leads! Try:\n\n` +
          `• "Collect Real Estate Agents in Florida"\n` +
          `• "Find Dentists in Miami"\n` +
          `• "Get Plumbers in Tampa, FL"\n` +
          `• "Collect leads for Lawyers in California"`;

        return res.json({
          success: true,
          response,
          suggestions: [
            'Collect Real Estate Agents in Florida',
            'Find Dentists in Miami',
            'Get Plumbers in Tampa'
          ]
        });
      }
    }

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
        // Get all contacts without search filter (increased limit to 1000)
        const allContacts = await session.proxy.searchContacts('', 1000);
        const totalCount = allContacts?.length || 0;

        if (allContacts && allContacts.length > 0) {
          response = `📋 Found ${totalCount} contacts in your CRM:\n\n`;
          response += formatContactsList(allContacts, 1000); // Show all contacts
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
        console.log('🔍 Session ID:', req.body.sessionId);
        try {
          data = await session.proxy.searchContacts(query);

          console.log(`📊 Search returned ${data?.length || 0} contacts`);

          if (data && data.length > 0) {
            response = `🔍 Found ${data.length} contact${data.length > 1 ? 's' : ''} matching "${query}":\n\n`;
            response += formatContactsList(data, 1000); // Show all matching contacts
          } else {
            response = `No contacts found matching "${query}".\n\n💡 Try:\n• Using a different search term\n• Searching by email or phone number\n• Using "list contacts" to see all contacts`;
          }
        } catch (searchError) {
          console.error('❌ Search error for query "' + query + '":', searchError.message);
          console.error('❌ Full error stack:', searchError.stack);
          console.error('❌ Error details:', JSON.stringify({
            name: searchError.name,
            message: searchError.message,
            query: query,
            sessionId: req.body.sessionId
          }));
          response = `Sorry, I encountered an error searching for "${query}". Error: ${searchError.message}\n\nPlease try again or contact support if this persists.`;
        }
      } else {
        response = "Please provide a search term. Example: 'search Manuel' or 'find john@example.com'";
      }
    }
    // UPDATE CONTACT
    else if (lowerMessage.includes('update contact') || lowerMessage.includes('update') && lowerMessage.includes('contact')) {
      // Parse multiple formats:
      // 1. "update contact john@example.com with phone 5551234567"
      // 2. "update phone of contact Ray to 8131111111"
      const emailMatch = message.match(/([\w.-]+@[\w.-]+\.\w+)/i);
      const phoneIdentMatch = message.match(/contact\s+(\d{10})/i);

      // Improved name matching - handles both formats:
      // Format 1: "contact NAME field" - stop BEFORE field keywords
      // Format 2: "field of contact NAME to VALUE" - capture NAME, stop before "to"
      const nameMatch1 = message.match(/contact\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)(?=\s+(?:phone|mobile|email|firstname|lastname|first\s*name|last\s*name)\s*:?\s*|$)/i);
      const nameMatch2 = message.match(/of\s+contact\s+([A-Za-z]+)(?:\s+to\s+|\s+$)/i);

      let identifier = emailMatch?.[1] || phoneIdentMatch?.[1] || nameMatch1?.[1] || nameMatch2?.[1];

      // Clean up identifier - remove trailing "to" or other filler words
      if (identifier) {
        identifier = identifier.replace(/\s+(to|with|and|the)$/i, '').trim();
      }

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

        // Get all contacts and filter by date (increased limit to 1000)
        const allContacts = await session.proxy.searchContacts('', 1000);

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
          response += formatContactsList(filteredContacts, 1000); // Show all contacts, not just 20
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
          const allContacts = await session.proxy.searchContacts('', 1000); // Increased limit to 1000
          const missingField = allContacts?.filter(c => {
            if (field === 'email') return !c.email;
            if (field === 'phone') return !c.phone;
            if (field === 'name') return !c.firstName && !c.name;
            if (field === 'tags') return !c.tags || c.tags.length === 0;
            return false;
          }) || [];

          if (missingField.length > 0) {
            response = `🔍 Found ${missingField.length} contacts missing ${field}:\n\n`;
            response += formatContactsList(missingField, 1000); // Show all contacts
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
      const nameMatch = message.match(/(?:to|for)\s+(?:contact\s+)?([A-Za-z\s]+?)(?:\s*:)/i);

      // Extract note text - everything after the colon
      const colonMatch = message.match(/:\s*(.+)/i);
      const noteBody = colonMatch?.[1];

      let identifier = emailMatch?.[1] || nameMatch?.[1];

      // Clean up identifier - remove common filler words
      if (identifier) {
        identifier = identifier.replace(/^(contact|contacts|for|the|a|an)\s+/i, '').trim();
      }

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

            console.log('📱 Creating social post with data:', JSON.stringify(postData, null, 2));
            const result = await session.proxy.createSocialPost(postData);
            console.log('✅ Social post created successfully:', JSON.stringify(result, null, 2));

            response = `✅ Social media post scheduled!\n\n`;
            response += `📱 Platforms: ${platforms.join(', ')}\n`;
            response += `📅 Scheduled for: ${formatFriendlyDate(postDate)}\n`;
            response += `📝 Content: ${postContent.substring(0, 100)}${postContent.length > 100 ? '...' : ''}\n\n`;
            response += `Post ID: ${result?.id || 'N/A'}\n`;
            response += `Status: ${result?.status || 'Scheduled'}\n`;
            response += `\n✅ Check your GoHighLevel Social Planner to confirm!`;
            data = result;
          }
        }
      } catch (error) {
        console.error('❌ Social post error:', error);
        console.error('❌ Error details:', error.response?.data || error.stack);
        response = `❌ Error scheduling social post: ${error.message}\n\nPlease check:\n1. Facebook/Instagram accounts are connected in GoHighLevel\n2. Your GoHighLevel API key has social media permissions\n3. Your account has active social media features enabled`;
      }
    }

    // LIST SOCIAL POSTS
    else if (lowerMessage.includes('list social posts') || lowerMessage.includes('show social posts') || lowerMessage.includes('get social posts')) {
      try {
        console.log('📋 Fetching social posts list...');
        const posts = await session.proxy.listSocialPosts({ limit: 20 });
        console.log('📋 Posts response:', JSON.stringify(posts, null, 2));

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
          console.log('⚠️ No posts found in response:', posts);
          response = "No social media posts found.\n\nThis could mean:\n1. No posts have been created yet\n2. Social media feature not enabled in GoHighLevel\n3. Check GoHighLevel Social Planner directly";
        }
      } catch (error) {
        console.error('❌ List social posts error:', error);
        console.error('❌ Error details:', error.response?.data || error.stack);
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
