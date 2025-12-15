// =====================================================
// WhatsApp Business Service
// File: src/services/whatsappService.js
// Purpose: Twilio WhatsApp Business API integration for RinglyPro
// Features: Send/receive WhatsApp messages, media, templates
// Documentation: https://www.twilio.com/docs/whatsapp
// =====================================================

const twilio = require('twilio');
const logger = require('../utils/logger');

// Twilio client (lazy initialization)
let twilioClient = null;

/**
 * Get or create Twilio client
 * @returns {object} Twilio client instance
 */
function getTwilioClient() {
  if (!twilioClient) {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    twilioClient = twilio(accountSid, authToken);
  }
  return twilioClient;
}

/**
 * Format phone number for WhatsApp
 * Adds whatsapp: prefix and ensures E.164 format
 * @param {string} phoneNumber - Phone number to format
 * @returns {string} Formatted WhatsApp number (whatsapp:+1234567890)
 */
function formatWhatsAppNumber(phoneNumber) {
  // Remove any existing whatsapp: prefix
  let cleaned = phoneNumber.replace(/^whatsapp:/i, '');

  // Remove all non-numeric characters except +
  cleaned = cleaned.replace(/[^\d+]/g, '');

  // Ensure it starts with +
  if (!cleaned.startsWith('+')) {
    // Assume US/Colombia based on length
    if (cleaned.length === 10) {
      cleaned = '+1' + cleaned; // US
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      cleaned = '+' + cleaned; // US with country code
    } else if (cleaned.length === 10 && cleaned.startsWith('3')) {
      cleaned = '+57' + cleaned; // Colombia mobile
    } else {
      cleaned = '+' + cleaned;
    }
  }

  return `whatsapp:${cleaned}`;
}

/**
 * Check if WhatsApp is configured for a client
 * @param {object} clientSettings - Client settings from database
 * @returns {object} Configuration status
 */
function isConfigured(clientSettings = {}) {
  const whatsappNumber = clientSettings?.whatsapp_business_number ||
                         process.env.TWILIO_WHATSAPP_NUMBER;

  return {
    configured: !!whatsappNumber,
    sandboxMode: process.env.WHATSAPP_SANDBOX_MODE === 'true',
    whatsappNumber: whatsappNumber || null
  };
}

/**
 * Send a WhatsApp text message
 * @param {object} params - Message parameters
 * @param {string} params.to - Recipient phone number
 * @param {string} params.body - Message text
 * @param {string} params.from - WhatsApp Business number (optional)
 * @param {number} params.clientId - RinglyPro client ID
 * @returns {Promise<object>} Twilio message response
 */
async function sendMessage({ to, body, from, clientId }) {
  const client = getTwilioClient();

  // Use provided from number or default to env variable
  const fromNumber = from || process.env.TWILIO_WHATSAPP_NUMBER;

  if (!fromNumber) {
    throw new Error('WhatsApp Business number not configured');
  }

  try {
    logger.info(`[WHATSAPP] Sending message to ${to} from client ${clientId}`);

    const message = await client.messages.create({
      body: body,
      from: formatWhatsAppNumber(fromNumber),
      to: formatWhatsAppNumber(to)
    });

    logger.info(`[WHATSAPP] Message sent successfully: ${message.sid}`);

    return {
      success: true,
      sid: message.sid,
      status: message.status,
      to: message.to,
      from: message.from,
      body: message.body,
      dateCreated: message.dateCreated
    };

  } catch (error) {
    logger.error(`[WHATSAPP] Send message error:`, error.message);
    throw error;
  }
}

/**
 * Send a WhatsApp template message (for business-initiated conversations)
 * Templates must be pre-approved by Meta
 * @param {object} params - Template parameters
 * @param {string} params.to - Recipient phone number
 * @param {string} params.contentSid - Twilio Content Template SID
 * @param {object} params.contentVariables - Template variable values
 * @param {string} params.from - WhatsApp Business number (optional)
 * @param {number} params.clientId - RinglyPro client ID
 * @returns {Promise<object>} Twilio message response
 */
async function sendTemplateMessage({ to, contentSid, contentVariables, from, clientId }) {
  const client = getTwilioClient();

  const fromNumber = from || process.env.TWILIO_WHATSAPP_NUMBER;

  if (!fromNumber) {
    throw new Error('WhatsApp Business number not configured');
  }

  try {
    logger.info(`[WHATSAPP] Sending template ${contentSid} to ${to} from client ${clientId}`);

    const message = await client.messages.create({
      contentSid: contentSid,
      contentVariables: JSON.stringify(contentVariables),
      from: formatWhatsAppNumber(fromNumber),
      to: formatWhatsAppNumber(to)
    });

    logger.info(`[WHATSAPP] Template message sent: ${message.sid}`);

    return {
      success: true,
      sid: message.sid,
      status: message.status,
      templateSid: contentSid
    };

  } catch (error) {
    logger.error(`[WHATSAPP] Send template error:`, error.message);
    throw error;
  }
}

/**
 * Send a WhatsApp media message (image, video, document)
 * @param {object} params - Media message parameters
 * @param {string} params.to - Recipient phone number
 * @param {string} params.mediaUrl - URL of the media to send
 * @param {string} params.body - Optional caption
 * @param {string} params.from - WhatsApp Business number (optional)
 * @param {number} params.clientId - RinglyPro client ID
 * @returns {Promise<object>} Twilio message response
 */
async function sendMediaMessage({ to, mediaUrl, body, from, clientId }) {
  const client = getTwilioClient();

  const fromNumber = from || process.env.TWILIO_WHATSAPP_NUMBER;

  if (!fromNumber) {
    throw new Error('WhatsApp Business number not configured');
  }

  try {
    logger.info(`[WHATSAPP] Sending media to ${to} from client ${clientId}`);

    const messageParams = {
      from: formatWhatsAppNumber(fromNumber),
      to: formatWhatsAppNumber(to),
      mediaUrl: [mediaUrl]
    };

    // Add caption if provided
    if (body) {
      messageParams.body = body;
    }

    const message = await client.messages.create(messageParams);

    logger.info(`[WHATSAPP] Media message sent: ${message.sid}`);

    return {
      success: true,
      sid: message.sid,
      status: message.status,
      mediaUrl: mediaUrl
    };

  } catch (error) {
    logger.error(`[WHATSAPP] Send media error:`, error.message);
    throw error;
  }
}

/**
 * Check if a customer is within the 24-hour free reply window
 * (Customer-initiated conversations are FREE within 24 hours)
 * @param {number} clientId - RinglyPro client ID
 * @param {string} customerPhone - Customer phone number
 * @param {object} sequelize - Sequelize instance
 * @returns {Promise<object>} Session status
 */
async function checkSessionWindow(clientId, customerPhone, sequelize) {
  const { QueryTypes } = require('sequelize');

  try {
    // Look for recent incoming messages from this customer
    const [session] = await sequelize.query(
      `SELECT id, session_start, session_expires, is_active, message_count
       FROM whatsapp_sessions
       WHERE client_id = :clientId
         AND customer_phone = :customerPhone
         AND is_active = TRUE
         AND session_expires > NOW()
       ORDER BY session_start DESC
       LIMIT 1`,
      {
        replacements: {
          clientId,
          customerPhone: formatWhatsAppNumber(customerPhone).replace('whatsapp:', '')
        },
        type: QueryTypes.SELECT
      }
    );

    if (session) {
      const expiresAt = new Date(session.session_expires);
      const minutesRemaining = Math.floor((expiresAt - new Date()) / 60000);

      return {
        inSession: true,
        sessionId: session.id,
        expiresAt: expiresAt,
        minutesRemaining: minutesRemaining,
        messageCount: session.message_count,
        isFree: true // Messages within window are FREE from Meta
      };
    }

    return {
      inSession: false,
      isFree: false,
      message: 'No active session. Use a template message to initiate conversation.'
    };

  } catch (error) {
    logger.error(`[WHATSAPP] Check session error:`, error.message);
    // Return false if table doesn't exist yet
    return {
      inSession: false,
      isFree: false,
      error: error.message
    };
  }
}

/**
 * Create or update a WhatsApp session when customer initiates conversation
 * @param {number} clientId - RinglyPro client ID
 * @param {string} customerPhone - Customer phone number
 * @param {object} sequelize - Sequelize instance
 * @returns {Promise<object>} Session info
 */
async function createOrUpdateSession(clientId, customerPhone, sequelize) {
  const { QueryTypes } = require('sequelize');

  const normalizedPhone = formatWhatsAppNumber(customerPhone).replace('whatsapp:', '');
  const sessionStart = new Date();
  const sessionExpires = new Date(sessionStart.getTime() + (24 * 60 * 60 * 1000)); // 24 hours

  try {
    // Upsert session
    const [result] = await sequelize.query(
      `INSERT INTO whatsapp_sessions (client_id, customer_phone, session_start, session_expires, is_active, message_count, created_at)
       VALUES (:clientId, :customerPhone, :sessionStart, :sessionExpires, TRUE, 1, NOW())
       ON CONFLICT (client_id, customer_phone)
       DO UPDATE SET
         session_start = :sessionStart,
         session_expires = :sessionExpires,
         is_active = TRUE,
         message_count = whatsapp_sessions.message_count + 1,
         last_message_at = NOW()
       RETURNING id, session_start, session_expires, message_count`,
      {
        replacements: {
          clientId,
          customerPhone: normalizedPhone,
          sessionStart,
          sessionExpires
        },
        type: QueryTypes.INSERT
      }
    );

    logger.info(`[WHATSAPP] Session created/updated for ${normalizedPhone}, client ${clientId}`);

    return {
      success: true,
      sessionId: result[0]?.id,
      expiresAt: sessionExpires,
      hoursRemaining: 24
    };

  } catch (error) {
    logger.error(`[WHATSAPP] Create session error:`, error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Detect language from message text
 * Simple detection based on common Spanish/English patterns
 * @param {string} text - Message text
 * @returns {string} 'es' for Spanish, 'en' for English
 */
function detectLanguage(text) {
  const spanishPatterns = [
    /\bhola\b/i,
    /\bgracias\b/i,
    /\bquiero\b/i,
    /\bcita\b/i,
    /\bpor favor\b/i,
    /\bbuenos?\s?d[íi]as?\b/i,
    /\bbuenas?\s?tardes?\b/i,
    /\bbuenas?\s?noches?\b/i,
    /\b¿\b/,
    /\b¡\b/,
    /\báño\b/i,
    /\bseñor\b/i,
    /\bseñora\b/i,
    /\bdoctor\b/i,
    /\bnecesito\b/i,
    /\bayuda\b/i,
    /\bservicio\b/i,
    /\binformación\b/i
  ];

  const spanishMatches = spanishPatterns.filter(pattern => pattern.test(text)).length;

  // If 2+ Spanish patterns match, it's likely Spanish
  if (spanishMatches >= 2) {
    return 'es';
  }

  // Check for accented characters common in Spanish
  if (/[áéíóúñü¿¡]/i.test(text)) {
    return 'es';
  }

  return 'en';
}

/**
 * Parse message intent (what the customer wants)
 * @param {string} text - Message text
 * @param {string} language - Detected language
 * @returns {object} Intent classification
 */
function parseIntent(text, language) {
  const lowerText = text.toLowerCase();

  // Appointment-related keywords
  const appointmentPatterns = {
    en: [/\bappointment\b/, /\bbook\b/, /\bschedule\b/, /\bvisit\b/, /\bavailable\b/],
    es: [/\bcita\b/, /\bagendar\b/, /\breservar\b/, /\bhorario\b/, /\bdisponible\b/, /\bturno\b/]
  };

  // Information/inquiry keywords
  const inquiryPatterns = {
    en: [/\binfo\b/, /\binformation\b/, /\bhow much\b/, /\bprice\b/, /\bcost\b/, /\bhours\b/],
    es: [/\binformación\b/, /\bcuánto\b/, /\bprecio\b/, /\bcosto\b/, /\bhorario\b/]
  };

  // Cancel/reschedule keywords
  const cancelPatterns = {
    en: [/\bcancel\b/, /\breschedule\b/, /\bchange\b/],
    es: [/\bcancelar\b/, /\breprogramar\b/, /\bcambiar\b/]
  };

  // Greeting keywords
  const greetingPatterns = {
    en: [/^hi\b/, /^hello\b/, /^hey\b/, /^good morning\b/, /^good afternoon\b/],
    es: [/^hola\b/, /^buenos d[íi]as\b/, /^buenas tardes\b/, /^buenas noches\b/]
  };

  // Check patterns
  const lang = language || detectLanguage(text);

  const isAppointment = appointmentPatterns[lang]?.some(p => p.test(lowerText)) || false;
  const isInquiry = inquiryPatterns[lang]?.some(p => p.test(lowerText)) || false;
  const isCancel = cancelPatterns[lang]?.some(p => p.test(lowerText)) || false;
  const isGreeting = greetingPatterns[lang]?.some(p => p.test(lowerText)) || false;

  // Determine primary intent
  let intent = 'general';
  let confidence = 0.5;

  if (isAppointment) {
    intent = 'appointment';
    confidence = 0.85;
  } else if (isCancel) {
    intent = 'cancel_reschedule';
    confidence = 0.8;
  } else if (isInquiry) {
    intent = 'inquiry';
    confidence = 0.75;
  } else if (isGreeting && lowerText.length < 30) {
    intent = 'greeting';
    confidence = 0.9;
  }

  return {
    intent,
    confidence,
    language: lang,
    isAppointment,
    isInquiry,
    isCancel,
    isGreeting
  };
}

/**
 * Get WhatsApp message status label
 * @param {string} status - Twilio status code
 * @returns {string} Human-readable status
 */
function getStatusLabel(status) {
  const statusMap = {
    'queued': 'Queued',
    'sent': 'Sent',
    'delivered': 'Delivered',
    'read': 'Read',
    'failed': 'Failed',
    'undelivered': 'Undelivered'
  };

  return statusMap[status] || status;
}

module.exports = {
  // Core functions
  sendMessage,
  sendTemplateMessage,
  sendMediaMessage,

  // Session management
  checkSessionWindow,
  createOrUpdateSession,

  // Utilities
  formatWhatsAppNumber,
  isConfigured,
  detectLanguage,
  parseIntent,
  getStatusLabel
};
