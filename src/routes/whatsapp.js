// =====================================================
// WhatsApp Business Routes
// File: src/routes/whatsapp.js
// Purpose: API endpoints and webhooks for WhatsApp Business
// Features: Send/receive messages, media, templates, lead capture
// =====================================================

const express = require('express');
const router = express.Router();
const { Message, sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const whatsappService = require('../services/whatsappService');
const leadResponseService = require('../services/leadResponseService');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get client by WhatsApp Business number
 * @param {string} whatsappNumber - WhatsApp Business number
 * @returns {Promise<object>} Client data
 */
async function getClientByWhatsAppNumber(whatsappNumber) {
  try {
    const normalizedNumber = whatsappNumber.replace(/^whatsapp:/i, '');

    const [client] = await sequelize.query(
      `SELECT id, business_name, whatsapp_business_number, ringlypro_number,
              business_hours_start, business_hours_end, timezone, booking_url,
              rachel_enabled, booking_enabled, settings
       FROM clients
       WHERE whatsapp_business_number = :number
          OR ringlypro_number = :number
       LIMIT 1`,
      {
        replacements: { number: normalizedNumber },
        type: QueryTypes.SELECT
      }
    );

    // Parse settings from JSONB or build from individual columns
    if (client) {
      const savedSettings = client.settings || {};
      const whatsappSettings = savedSettings.integration?.whatsapp || {};

      client.settings = {
        business_type: whatsappSettings.businessType || 'service business',
        services: whatsappSettings.services || [],
        business_hours: client.business_hours_start && client.business_hours_end ? {
          start: client.business_hours_start,
          end: client.business_hours_end
        } : null,
        deposit: whatsappSettings.deposit || { type: 'none', value: null },
        booking: whatsappSettings.booking || { system: 'none', url: null },
        zelle: whatsappSettings.zelle || null,
        greetingMessage: whatsappSettings.greetingMessage || null,
        defaultLanguage: whatsappSettings.defaultLanguage || 'auto',
        integration: savedSettings.integration || {
          vagaro: { enabled: false }
        }
      };
    }

    return client || null;
  } catch (error) {
    logger.error('[WHATSAPP] Error finding client:', error);
    return null;
  }
}

/**
 * Save WhatsApp message to database
 * @param {object} messageData - Message data
 * @returns {Promise<object>} Saved message
 */
async function saveMessage(messageData) {
  try {
    // Use the Message model with extended fields
    const saved = await Message.create({
      clientId: messageData.clientId,
      contactId: messageData.contactId || null,
      twilioSid: messageData.sid,
      direction: messageData.direction,
      fromNumber: messageData.from,
      toNumber: messageData.to,
      body: messageData.body || '',
      status: messageData.status || 'received',
      messageType: 'whatsapp', // This field may need migration
      mediaUrl: messageData.mediaUrl || null,
      mediaType: messageData.mediaType || null
    });

    logger.info(`[WHATSAPP] Message saved: ${saved.id}`);
    return saved;
  } catch (error) {
    // If messageType column doesn't exist, save without it
    if (error.message?.includes('messageType') || error.message?.includes('message_type')) {
      logger.warn('[WHATSAPP] Saving without messageType field (migration needed)');

      const saved = await Message.create({
        clientId: messageData.clientId,
        contactId: messageData.contactId || null,
        twilioSid: messageData.sid,
        direction: messageData.direction,
        fromNumber: messageData.from,
        toNumber: messageData.to,
        body: messageData.body || '',
        status: messageData.status || 'received'
      });

      return saved;
    }
    throw error;
  }
}

/**
 * Find or create contact from WhatsApp number
 * @param {number} clientId - Client ID
 * @param {string} phoneNumber - WhatsApp phone number
 * @param {string} profileName - WhatsApp profile name (if available)
 * @returns {Promise<object>} Contact data
 */
async function findOrCreateContact(clientId, phoneNumber, profileName = null) {
  try {
    const normalizedPhone = phoneNumber.replace(/^whatsapp:/i, '');

    // Try to find existing contact
    const [existingContact] = await sequelize.query(
      `SELECT id, first_name, last_name, phone
       FROM contacts
       WHERE client_id = :clientId
         AND (phone = :phone OR phone LIKE :phoneLike)
       LIMIT 1`,
      {
        replacements: {
          clientId,
          phone: normalizedPhone,
          phoneLike: `%${normalizedPhone.slice(-10)}%`
        },
        type: QueryTypes.SELECT
      }
    );

    if (existingContact) {
      return existingContact;
    }

    // Create new contact if not found
    const firstName = profileName?.split(' ')[0] || 'WhatsApp';
    const lastName = profileName?.split(' ').slice(1).join(' ') || 'Lead';
    // Generate placeholder email for WhatsApp contacts (required by DB constraint)
    const placeholderEmail = `${normalizedPhone.replace(/\D/g, '')}@whatsapp.ringlypro.com`;

    const [newContact] = await sequelize.query(
      `INSERT INTO contacts (client_id, first_name, last_name, phone, email, source, created_at, updated_at)
       VALUES (:clientId, :firstName, :lastName, :phone, :email, 'whatsapp', NOW(), NOW())
       RETURNING id, first_name, last_name, phone, email`,
      {
        replacements: {
          clientId,
          firstName,
          lastName,
          phone: normalizedPhone,
          email: placeholderEmail
        },
        type: QueryTypes.INSERT
      }
    );

    logger.info(`[WHATSAPP] Created new contact from WhatsApp: ${newContact[0]?.id}`);
    return newContact[0];

  } catch (error) {
    logger.error('[WHATSAPP] Error finding/creating contact:', error);
    return null;
  }
}

/**
 * Get conversation history for a phone number
 * @param {number} clientId - Client ID
 * @param {string} phoneNumber - Phone number
 * @param {number} limit - Max messages to retrieve
 * @returns {Promise<Array>} Conversation messages
 */
async function getConversationHistory(clientId, phoneNumber, limit = 10) {
  try {
    const normalizedPhone = phoneNumber.replace(/^whatsapp:/i, '');

    const messages = await sequelize.query(
      `SELECT id, direction, from_number, to_number, body, status, created_at
       FROM messages
       WHERE client_id = :clientId
         AND (from_number LIKE :phoneLike OR to_number LIKE :phoneLike)
       ORDER BY created_at DESC
       LIMIT :limit`,
      {
        replacements: {
          clientId,
          phoneLike: `%${normalizedPhone.slice(-10)}%`,
          limit
        },
        type: QueryTypes.SELECT
      }
    );

    // Reverse to get chronological order
    return messages.reverse();

  } catch (error) {
    logger.error('[WHATSAPP] Error getting conversation history:', error);
    return [];
  }
}

// =====================================================
// WEBHOOK ENDPOINTS (No Auth Required)
// =====================================================

/**
 * POST /api/whatsapp/webhook
 * Twilio WhatsApp incoming message webhook
 * Called when a customer sends a WhatsApp message
 */
router.post('/webhook', async (req, res) => {
  try {
    const {
      MessageSid,
      From,
      To,
      Body,
      NumMedia,
      MediaContentType0,
      MediaUrl0,
      ProfileName,
      SmsStatus
    } = req.body;

    logger.info(`[WHATSAPP] Incoming message from ${From}: ${Body?.substring(0, 50)}...`);

    // Find client by the WhatsApp Business number (To)
    const client = await getClientByWhatsAppNumber(To);

    if (!client) {
      logger.warn(`[WHATSAPP] No client found for number: ${To}`);
      // Return TwiML response anyway to acknowledge receipt
      res.type('text/xml');
      return res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
    }

    // Find or create contact
    const contact = await findOrCreateContact(client.id, From, ProfileName);

    // Detect language and intent
    const language = whatsappService.detectLanguage(Body || '');
    const intentAnalysis = whatsappService.parseIntent(Body || '', language);

    logger.info(`[WHATSAPP] Language: ${language}, Intent: ${intentAnalysis.intent}`);

    // Create or update 24-hour session (for free messaging window)
    await whatsappService.createOrUpdateSession(client.id, From, sequelize);

    // Handle media if present
    let mediaUrl = null;
    let mediaType = null;
    if (parseInt(NumMedia) > 0 && MediaUrl0) {
      mediaUrl = MediaUrl0;
      mediaType = MediaContentType0;
      logger.info(`[WHATSAPP] Media received: ${mediaType}`);
    }

    // Save message to database
    const savedMessage = await saveMessage({
      clientId: client.id,
      contactId: contact?.id,
      sid: MessageSid,
      direction: 'incoming',
      from: From,
      to: To,
      body: Body || '[Media message]',
      status: 'received',
      mediaUrl,
      mediaType
    });

    // Get client configuration for AI responses
    const clientConfig = {
      businessName: client.business_name || 'our business',
      businessType: client.settings?.business_type || 'service business',
      services: client.settings?.services || [],
      hours: client.settings?.business_hours || null,
      vagaroEnabled: client.settings?.integration?.vagaro?.enabled || false,
      deposit: client.settings?.deposit || { type: 'none', value: null },
      booking: client.settings?.booking || { system: 'none', url: null },
      zelle: client.settings?.zelle || null,
      greetingMessage: client.settings?.greetingMessage || null,
      bookingUrl: client.booking_url || null
    };

    // Get recent conversation history for context
    const conversationHistory = await getConversationHistory(client.id, From, 10);

    // Use AI-powered lead response service
    let responseMessage = null;
    let aiResult = null;

    try {
      aiResult = await leadResponseService.processIncomingMessage({
        message: Body || '',
        customerPhone: From,
        clientId: client.id,
        clientConfig,
        conversationHistory
      });

      responseMessage = aiResult.response;
      logger.info(`[WHATSAPP] AI Response generated: ${aiResult.intent.intent}, requiresHuman: ${aiResult.requiresHuman}`);

    } catch (aiError) {
      logger.warn(`[WHATSAPP] AI response failed, using fallback:`, aiError.message);

      // Fallback to simple pattern-based response
      if (intentAnalysis.intent === 'greeting') {
        responseMessage = language === 'es'
          ? `¡Hola! 👋 Gracias por contactar a ${clientConfig.businessName}. ¿En qué podemos ayudarte hoy?`
          : `Hello! 👋 Thanks for reaching out to ${clientConfig.businessName}. How can we help you today?`;
      } else if (intentAnalysis.intent === 'appointment') {
        responseMessage = language === 'es'
          ? '¡Perfecto! Para agendar una cita, por favor dinos:\n1. Tu nombre completo\n2. Servicio que necesitas\n3. Fecha y hora preferida'
          : 'Perfect! To schedule an appointment, please tell us:\n1. Your full name\n2. Service you need\n3. Preferred date and time';
      }
    }

    // Send TwiML response
    const twilio = require('twilio');
    const twiml = new twilio.twiml.MessagingResponse();

    if (responseMessage) {
      const msg = twiml.message(responseMessage);

      // If there's a media URL (like Zelle QR code), add it to the message
      if (aiResult?.mediaUrl) {
        msg.media(aiResult.mediaUrl);
        logger.info(`[WHATSAPP] Including media in response: ${aiResult.mediaUrl}`);
      }

      // Save the auto-response too
      await saveMessage({
        clientId: client.id,
        contactId: contact?.id,
        sid: `auto_${MessageSid}`,
        direction: 'outgoing',
        from: To,
        to: From,
        body: responseMessage,
        status: 'sent',
        mediaUrl: aiResult?.mediaUrl || null
      });

      // Flag for human follow-up if AI indicated it's needed
      if (aiResult?.requiresHuman) {
        logger.info(`[WHATSAPP] Flagging conversation for human follow-up: ${From}`);
        // TODO: Send notification to staff about escalation
      }
    }

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('[WHATSAPP] Webhook error:', error);
    // Return empty TwiML on error to prevent Twilio retry
    res.type('text/xml');
    res.send('<?xml version="1.0" encoding="UTF-8"?><Response></Response>');
  }
});

/**
 * POST /api/whatsapp/status
 * Twilio message status callback webhook
 * Called when message status changes (sent, delivered, read, failed)
 */
router.post('/status', async (req, res) => {
  try {
    const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

    logger.info(`[WHATSAPP] Status update: ${MessageSid} -> ${MessageStatus}`);

    // Update message status in database
    if (Message && MessageSid) {
      const message = await Message.findOne({ where: { twilioSid: MessageSid } });

      if (message) {
        message.status = MessageStatus;

        if (ErrorCode) {
          message.errorCode = ErrorCode;
          message.errorMessage = ErrorMessage;
        }

        if (MessageStatus === 'delivered') {
          message.deliveredAt = new Date();
        }

        await message.save();
        logger.info(`[WHATSAPP] Updated message ${MessageSid} to status: ${MessageStatus}`);
      }
    }

    res.status(200).send('OK');

  } catch (error) {
    logger.error('[WHATSAPP] Status webhook error:', error);
    res.status(200).send('OK'); // Return 200 to prevent retries
  }
});

// =====================================================
// AUTHENTICATED API ENDPOINTS
// =====================================================

/**
 * POST /api/whatsapp/send
 * Send a WhatsApp message (authenticated)
 */
router.post('/send', authenticateToken, async (req, res) => {
  try {
    const { to, body, mediaUrl } = req.body;
    const userId = req.user.userId || req.user.id;

    // Get user's client
    const [user] = await sequelize.query(
      `SELECT client_id FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user?.client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client not found for user'
      });
    }

    const clientId = user.client_id;

    // Get client's WhatsApp number
    const [client] = await sequelize.query(
      `SELECT whatsapp_business_number, ringlypro_number, business_name
       FROM clients WHERE id = :clientId`,
      {
        replacements: { clientId },
        type: QueryTypes.SELECT
      }
    );

    const fromNumber = client?.whatsapp_business_number || process.env.TWILIO_WHATSAPP_NUMBER;

    if (!fromNumber) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp Business number not configured'
      });
    }

    // Check if we're in a free session window
    const sessionStatus = await whatsappService.checkSessionWindow(clientId, to, sequelize);

    // Determine token cost based on session status
    let tokenCost = 2; // Default: template message cost
    if (sessionStatus.inSession) {
      tokenCost = 1; // Reduced cost for session messages (FREE from Meta)
    }

    // TODO: Deduct tokens (uncomment when ready)
    // const tokenService = require('../services/tokenService');
    // await tokenService.deductTokens(userId, sessionStatus.inSession ? 'whatsapp_session_message' : 'whatsapp_template_sent');

    let result;

    if (mediaUrl) {
      // Send media message
      result = await whatsappService.sendMediaMessage({
        to,
        mediaUrl,
        body,
        from: fromNumber,
        clientId
      });
    } else {
      // Send text message
      result = await whatsappService.sendMessage({
        to,
        body,
        from: fromNumber,
        clientId
      });
    }

    // Save outgoing message
    const contact = await findOrCreateContact(clientId, to);

    await saveMessage({
      clientId,
      contactId: contact?.id,
      sid: result.sid,
      direction: 'outgoing',
      from: whatsappService.formatWhatsAppNumber(fromNumber),
      to: whatsappService.formatWhatsAppNumber(to),
      body: body || '[Media message]',
      status: result.status
    });

    res.json({
      success: true,
      message: result,
      sessionStatus,
      tokenCost
    });

  } catch (error) {
    logger.error('[WHATSAPP] Send error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/whatsapp/send-template
 * Send a WhatsApp template message (authenticated)
 */
router.post('/send-template', authenticateToken, async (req, res) => {
  try {
    const { to, contentSid, contentVariables } = req.body;
    const userId = req.user.userId || req.user.id;

    if (!contentSid) {
      return res.status(400).json({
        success: false,
        error: 'Template contentSid is required'
      });
    }

    // Get user's client
    const [user] = await sequelize.query(
      `SELECT client_id FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user?.client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client not found for user'
      });
    }

    const clientId = user.client_id;

    // Get client's WhatsApp number
    const [client] = await sequelize.query(
      `SELECT whatsapp_business_number, ringlypro_number
       FROM clients WHERE id = :clientId`,
      {
        replacements: { clientId },
        type: QueryTypes.SELECT
      }
    );

    const fromNumber = client?.whatsapp_business_number || process.env.TWILIO_WHATSAPP_NUMBER;

    if (!fromNumber) {
      return res.status(400).json({
        success: false,
        error: 'WhatsApp Business number not configured'
      });
    }

    // Send template message
    const result = await whatsappService.sendTemplateMessage({
      to,
      contentSid,
      contentVariables: contentVariables || {},
      from: fromNumber,
      clientId
    });

    res.json({
      success: true,
      message: result
    });

  } catch (error) {
    logger.error('[WHATSAPP] Send template error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/whatsapp/messages
 * Get WhatsApp messages for current client (authenticated)
 */
router.get('/messages', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { limit = 50, offset = 0 } = req.query;

    // Get user's client
    const [user] = await sequelize.query(
      `SELECT client_id FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user?.client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client not found for user'
      });
    }

    // Get messages (filter by messageType if column exists)
    const messages = await Message.findAll({
      where: { clientId: user.client_id },
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      messages,
      count: messages.length
    });

  } catch (error) {
    logger.error('[WHATSAPP] Get messages error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/whatsapp/conversation/:phone
 * Get conversation thread with a specific phone number
 */
router.get('/conversation/:phone', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    const { phone } = req.params;
    const { limit = 100 } = req.query;

    // Get user's client
    const [user] = await sequelize.query(
      `SELECT client_id FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user?.client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client not found for user'
      });
    }

    const formattedPhone = whatsappService.formatWhatsAppNumber(phone);
    const plainPhone = formattedPhone.replace('whatsapp:', '');

    // Get conversation messages
    const { Op } = require('sequelize');
    const messages = await Message.findAll({
      where: {
        clientId: user.client_id,
        [Op.or]: [
          { fromNumber: { [Op.like]: `%${plainPhone}%` } },
          { toNumber: { [Op.like]: `%${plainPhone}%` } }
        ]
      },
      order: [['createdAt', 'ASC']],
      limit: parseInt(limit)
    });

    // Check session status
    const sessionStatus = await whatsappService.checkSessionWindow(user.client_id, phone, sequelize);

    res.json({
      success: true,
      messages,
      sessionStatus,
      contact: { phone: plainPhone }
    });

  } catch (error) {
    logger.error('[WHATSAPP] Get conversation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/whatsapp/status
 * Get WhatsApp configuration status for current client
 */
router.get('/config-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    // Get user's client
    const [user] = await sequelize.query(
      `SELECT client_id FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user?.client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client not found for user'
      });
    }

    // Get client settings
    const [client] = await sequelize.query(
      `SELECT id, business_name, whatsapp_business_number
       FROM clients WHERE id = :clientId`,
      {
        replacements: { clientId: user.client_id },
        type: QueryTypes.SELECT
      }
    );

    const status = whatsappService.isConfigured({
      whatsapp_business_number: client?.whatsapp_business_number
    });

    res.json({
      success: true,
      configured: status.configured,
      sandboxMode: status.sandboxMode,
      whatsappNumber: client?.whatsapp_business_number || null,
      businessName: client?.business_name || null
    });

  } catch (error) {
    logger.error('[WHATSAPP] Config status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/whatsapp/sessions
 * Get active WhatsApp sessions (24-hour windows)
 */
router.get('/sessions', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;

    // Get user's client
    const [user] = await sequelize.query(
      `SELECT client_id FROM users WHERE id = :userId`,
      {
        replacements: { userId },
        type: QueryTypes.SELECT
      }
    );

    if (!user?.client_id) {
      return res.status(400).json({
        success: false,
        error: 'Client not found for user'
      });
    }

    // Get active sessions
    const sessions = await sequelize.query(
      `SELECT id, customer_phone, session_start, session_expires, message_count, last_message_at
       FROM whatsapp_sessions
       WHERE client_id = :clientId
         AND is_active = TRUE
         AND session_expires > NOW()
       ORDER BY last_message_at DESC`,
      {
        replacements: { clientId: user.client_id },
        type: QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      sessions,
      count: sessions.length
    });

  } catch (error) {
    // If table doesn't exist, return empty array
    if (error.message?.includes('whatsapp_sessions')) {
      return res.json({
        success: true,
        sessions: [],
        count: 0,
        note: 'WhatsApp sessions table not yet created. Run migration.'
      });
    }

    logger.error('[WHATSAPP] Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
