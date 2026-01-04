/**
 * GHL Conversation Sync Service
 * Handles two-way sync between RinglyPro messages and GoHighLevel conversations
 */

const axios = require('axios');
const { sequelize } = require('../models');
const { QueryTypes, Op } = require('sequelize');
const logger = require('../utils/logger');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

class GHLConversationSyncService {
  /**
   * Get GHL credentials for a client
   */
  async getClientCredentials(clientId) {
    try {
      // Check clients table for GHL settings
      const clientResult = await sequelize.query(
        `SELECT ghl_api_key, ghl_location_id,
                settings->'integration'->'ghl' as ghl_settings
         FROM clients WHERE id = :clientId`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (clientResult.length === 0) {
        return null;
      }

      const client = clientResult[0];

      // First try direct API key
      if (client.ghl_api_key && client.ghl_location_id) {
        return {
          apiKey: client.ghl_api_key,
          locationId: client.ghl_location_id,
          source: 'direct'
        };
      }

      // Try settings JSONB
      if (client.ghl_settings?.enabled && client.ghl_settings?.apiKey) {
        return {
          apiKey: client.ghl_settings.apiKey,
          locationId: client.ghl_settings.locationId,
          source: 'settings'
        };
      }

      // Check ghl_integrations table for OAuth
      const oauthResult = await sequelize.query(
        `SELECT access_token, ghl_location_id, expires_at
         FROM ghl_integrations
         WHERE client_id = :clientId AND is_active = true
         ORDER BY created_at DESC LIMIT 1`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (oauthResult.length > 0 && oauthResult[0].access_token) {
        const token = oauthResult[0];
        if (!token.expires_at || new Date(token.expires_at) > new Date()) {
          return {
            apiKey: token.access_token,
            locationId: token.ghl_location_id,
            source: 'oauth'
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('[GHL Sync] Error getting credentials:', error);
      return null;
    }
  }

  /**
   * Make GHL API call
   */
  async callGHL(credentials, method, endpoint, data = null) {
    try {
      let fullUrl = `${GHL_BASE_URL}${endpoint}`;

      if (method === 'GET') {
        const separator = endpoint.includes('?') ? '&' : '?';
        fullUrl = `${fullUrl}${separator}locationId=${credentials.locationId}`;
      }

      let requestData = undefined;
      if (method !== 'GET' && data) {
        if (method === 'POST') {
          requestData = { ...data, locationId: credentials.locationId };
        } else {
          requestData = { ...data };
          delete requestData.locationId;
        }
      }

      const response = await axios({
        method,
        url: fullUrl,
        headers: {
          'Authorization': `Bearer ${credentials.apiKey}`,
          'Version': GHL_API_VERSION,
          'Content-Type': 'application/json'
        },
        data: requestData
      });

      return { success: true, data: response.data };
    } catch (error) {
      logger.error('[GHL Sync] API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Fetch conversations from GHL for a contact
   * @param {number} clientId - RinglyPro client ID
   * @param {string} ghlContactId - GHL contact ID
   * @returns {Promise<object>} Conversation messages
   */
  async fetchGHLConversations(clientId, ghlContactId) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured' };
    }

    const result = await this.callGHL(
      credentials,
      'GET',
      `/conversations/messages?contactId=${ghlContactId}&limit=50`
    );

    if (result.success) {
      return {
        success: true,
        messages: result.data.messages || [],
        conversationId: result.data.conversationId
      };
    }

    return result;
  }

  /**
   * Get GHL contact ID from local contact
   * @param {number} contactId - Local contact ID
   * @returns {Promise<string|null>} GHL contact ID
   */
  async getGHLContactId(contactId) {
    try {
      const result = await sequelize.query(
        `SELECT ghl_contact_id FROM contacts WHERE id = :contactId`,
        {
          replacements: { contactId },
          type: QueryTypes.SELECT
        }
      );
      return result[0]?.ghl_contact_id || null;
    } catch (error) {
      logger.error('[GHL Sync] Error getting GHL contact ID:', error);
      return null;
    }
  }

  /**
   * Get or create GHL contact from phone number
   * @param {number} clientId - Client ID
   * @param {string} phone - Phone number
   * @param {object} contactInfo - Optional contact info
   * @returns {Promise<object>} GHL contact
   */
  async findOrCreateGHLContact(clientId, phone, contactInfo = {}) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured' };
    }

    // Search for existing contact by phone
    const searchResult = await this.callGHL(
      credentials,
      'GET',
      `/contacts/search/duplicate?phone=${encodeURIComponent(phone)}`
    );

    if (searchResult.success && searchResult.data.contact) {
      return {
        success: true,
        contact: searchResult.data.contact,
        isNew: false
      };
    }

    // Create new contact if not found
    const createResult = await this.callGHL(credentials, 'POST', '/contacts/', {
      firstName: contactInfo.firstName || 'Unknown',
      lastName: contactInfo.lastName || '',
      phone: phone,
      email: contactInfo.email || '',
      source: 'RinglyPro Sync',
      tags: ['RinglyPro', 'Auto-Created']
    });

    if (createResult.success) {
      return {
        success: true,
        contact: createResult.data.contact,
        isNew: true
      };
    }

    return createResult;
  }

  /**
   * Sync a message to GHL
   * @param {number} clientId - Client ID
   * @param {object} message - Message object from RinglyPro
   * @returns {Promise<object>} Sync result
   */
  async syncMessageToGHL(clientId, message) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured' };
    }

    // Get GHL contact ID
    let ghlContactId = message.ghlContactId;

    if (!ghlContactId && message.contactId) {
      ghlContactId = await this.getGHLContactId(message.contactId);
    }

    if (!ghlContactId) {
      // Try to find or create contact by phone
      const phone = message.direction === 'incoming' ? message.fromNumber : message.toNumber;
      const contactResult = await this.findOrCreateGHLContact(clientId, phone);

      if (!contactResult.success) {
        return { success: false, error: 'Could not find or create GHL contact' };
      }
      ghlContactId = contactResult.contact.id;

      // Update local contact with GHL ID if we have a local contact
      if (message.contactId) {
        await sequelize.query(
          `UPDATE contacts SET ghl_contact_id = :ghlContactId WHERE id = :contactId`,
          {
            replacements: { ghlContactId, contactId: message.contactId },
            type: QueryTypes.UPDATE
          }
        );
      }
    }

    // Determine message type
    const messageType = this.mapToGHLMessageType(message.messageType);

    // Send message to GHL
    const sendResult = await this.callGHL(credentials, 'POST', '/conversations/messages', {
      type: messageType,
      contactId: ghlContactId,
      message: message.body,
      direction: message.direction === 'outgoing' ? 'outbound' : 'inbound'
    });

    if (sendResult.success) {
      // Update message with GHL sync info
      await sequelize.query(
        `UPDATE messages SET
          ghl_message_id = :ghlMessageId,
          ghl_contact_id = :ghlContactId,
          ghl_conversation_id = :ghlConversationId,
          synced_to_ghl = true,
          ghl_synced_at = NOW()
         WHERE id = :messageId`,
        {
          replacements: {
            ghlMessageId: sendResult.data.messageId || sendResult.data.id,
            ghlContactId,
            ghlConversationId: sendResult.data.conversationId,
            messageId: message.id
          },
          type: QueryTypes.UPDATE
        }
      );

      logger.info(`[GHL Sync] Message ${message.id} synced to GHL`);
      return {
        success: true,
        ghlMessageId: sendResult.data.messageId || sendResult.data.id,
        ghlConversationId: sendResult.data.conversationId
      };
    }

    return sendResult;
  }

  /**
   * Sync messages from GHL to RinglyPro
   * @param {number} clientId - Client ID
   * @param {string} ghlContactId - GHL contact ID
   * @param {number} localContactId - Local contact ID
   * @returns {Promise<object>} Sync result
   */
  async syncMessagesFromGHL(clientId, ghlContactId, localContactId) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured' };
    }

    // Fetch messages from GHL
    const result = await this.callGHL(
      credentials,
      'GET',
      `/conversations/messages?contactId=${ghlContactId}&limit=100`
    );

    if (!result.success) {
      return result;
    }

    const ghlMessages = result.data.messages || [];
    let syncedCount = 0;
    let skippedCount = 0;

    for (const ghlMsg of ghlMessages) {
      // Check if message already exists in RinglyPro
      const existing = await sequelize.query(
        `SELECT id FROM messages WHERE ghl_message_id = :ghlMessageId`,
        {
          replacements: { ghlMessageId: ghlMsg.id },
          type: QueryTypes.SELECT
        }
      );

      if (existing.length > 0) {
        skippedCount++;
        continue;
      }

      // Insert new message
      try {
        await sequelize.query(
          `INSERT INTO messages (
            client_id, contact_id, direction, from_number, to_number, body, status,
            message_type, message_source, ghl_message_id, ghl_conversation_id, ghl_contact_id,
            synced_from_ghl, ghl_synced_at, created_at, updated_at
          ) VALUES (
            :clientId, :contactId, :direction, :fromNumber, :toNumber, :body, :status,
            :messageType, 'ghl', :ghlMessageId, :ghlConversationId, :ghlContactId,
            true, NOW(), :createdAt, NOW()
          )`,
          {
            replacements: {
              clientId,
              contactId: localContactId,
              direction: ghlMsg.direction === 'outbound' ? 'outgoing' : 'incoming',
              fromNumber: ghlMsg.direction === 'outbound' ? '' : (ghlMsg.phone || ''),
              toNumber: ghlMsg.direction === 'outbound' ? (ghlMsg.phone || '') : '',
              body: ghlMsg.body || ghlMsg.message || '',
              status: 'received',
              messageType: this.mapFromGHLMessageType(ghlMsg.type),
              ghlMessageId: ghlMsg.id,
              ghlConversationId: ghlMsg.conversationId,
              ghlContactId,
              createdAt: new Date(ghlMsg.dateAdded || ghlMsg.createdAt || Date.now())
            },
            type: QueryTypes.INSERT
          }
        );
        syncedCount++;
      } catch (error) {
        logger.error(`[GHL Sync] Failed to insert message ${ghlMsg.id}:`, error.message);
      }
    }

    logger.info(`[GHL Sync] Synced ${syncedCount} messages from GHL, skipped ${skippedCount}`);
    return {
      success: true,
      syncedCount,
      skippedCount,
      totalGHLMessages: ghlMessages.length
    };
  }

  /**
   * Get unified conversation thread (RinglyPro + GHL)
   * @param {number} clientId - Client ID
   * @param {number} contactId - Local contact ID
   * @param {object} options - Query options
   * @returns {Promise<object>} Unified conversation
   */
  async getUnifiedConversation(clientId, contactId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      // Get local messages
      const messages = await sequelize.query(
        `SELECT m.*,
                c.first_name as contact_first_name,
                c.last_name as contact_last_name,
                c.phone as contact_phone,
                c.ghl_contact_id
         FROM messages m
         LEFT JOIN contacts c ON m.contact_id = c.id
         WHERE m.client_id = :clientId AND m.contact_id = :contactId
         ORDER BY m.created_at DESC
         LIMIT :limit OFFSET :offset`,
        {
          replacements: { clientId, contactId, limit, offset },
          type: QueryTypes.SELECT
        }
      );

      // Get GHL contact ID
      const ghlContactId = messages[0]?.ghl_contact_id || await this.getGHLContactId(contactId);

      return {
        success: true,
        messages: messages.map(m => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          status: m.status,
          messageType: m.message_type || 'sms',
          messageSource: m.message_source || 'twilio',
          createdAt: m.created_at,
          read: m.read,
          ghlMessageId: m.ghl_message_id,
          ghlSynced: m.synced_to_ghl || m.synced_from_ghl,
          contact: {
            id: contactId,
            firstName: m.contact_first_name,
            lastName: m.contact_last_name,
            phone: m.contact_phone,
            ghlContactId: m.ghl_contact_id
          }
        })),
        ghlContactId,
        pagination: {
          limit,
          offset,
          total: messages.length
        }
      };
    } catch (error) {
      logger.error('[GHL Sync] Error getting unified conversation:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Full sync for a contact - sync both directions
   * @param {number} clientId - Client ID
   * @param {number} contactId - Local contact ID
   * @returns {Promise<object>} Sync result
   */
  async fullSyncForContact(clientId, contactId) {
    const ghlContactId = await this.getGHLContactId(contactId);

    if (!ghlContactId) {
      return { success: false, error: 'Contact not linked to GHL' };
    }

    // Sync FROM GHL to RinglyPro (get new messages from GHL)
    const fromGHLResult = await this.syncMessagesFromGHL(clientId, ghlContactId, contactId);

    // Sync TO GHL (send unsynced local messages)
    const unsyncedMessages = await sequelize.query(
      `SELECT * FROM messages
       WHERE client_id = :clientId AND contact_id = :contactId
       AND synced_to_ghl = false AND message_source != 'ghl'
       ORDER BY created_at ASC`,
      {
        replacements: { clientId, contactId },
        type: QueryTypes.SELECT
      }
    );

    let syncedToGHL = 0;
    for (const msg of unsyncedMessages) {
      const result = await this.syncMessageToGHL(clientId, msg);
      if (result.success) syncedToGHL++;
    }

    return {
      success: true,
      fromGHL: fromGHLResult,
      toGHL: {
        syncedCount: syncedToGHL,
        totalUnsynced: unsyncedMessages.length
      }
    };
  }

  /**
   * Process incoming GHL webhook for new message
   * @param {object} webhookData - GHL webhook payload
   * @returns {Promise<object>} Processing result
   */
  async processGHLMessageWebhook(webhookData) {
    try {
      const { locationId, contactId, message, conversationId, type, direction } = webhookData;

      // Find client by location ID
      const clientResult = await sequelize.query(
        `SELECT id FROM clients WHERE ghl_location_id = :locationId`,
        {
          replacements: { locationId },
          type: QueryTypes.SELECT
        }
      );

      if (clientResult.length === 0) {
        logger.warn(`[GHL Webhook] No client found for location ${locationId}`);
        return { success: false, error: 'Client not found' };
      }

      const clientId = clientResult[0].id;

      // Find local contact by GHL contact ID
      const contactResult = await sequelize.query(
        `SELECT id FROM contacts WHERE ghl_contact_id = :ghlContactId AND client_id = :clientId`,
        {
          replacements: { ghlContactId: contactId, clientId },
          type: QueryTypes.SELECT
        }
      );

      const localContactId = contactResult[0]?.id || null;

      // Check if message already exists
      const existing = await sequelize.query(
        `SELECT id FROM messages WHERE ghl_message_id = :ghlMessageId`,
        {
          replacements: { ghlMessageId: webhookData.messageId },
          type: QueryTypes.SELECT
        }
      );

      if (existing.length > 0) {
        return { success: true, action: 'skipped', reason: 'Message already exists' };
      }

      // Insert new message
      await sequelize.query(
        `INSERT INTO messages (
          client_id, contact_id, direction, from_number, to_number, body, status,
          message_type, message_source, ghl_message_id, ghl_conversation_id, ghl_contact_id,
          synced_from_ghl, ghl_synced_at, created_at, updated_at
        ) VALUES (
          :clientId, :contactId, :direction, :fromNumber, :toNumber, :body, 'received',
          :messageType, 'ghl', :ghlMessageId, :conversationId, :ghlContactId,
          true, NOW(), NOW(), NOW()
        )`,
        {
          replacements: {
            clientId,
            contactId: localContactId,
            direction: direction === 'outbound' ? 'outgoing' : 'incoming',
            fromNumber: webhookData.phone || '',
            toNumber: '',
            body: message || '',
            messageType: this.mapFromGHLMessageType(type),
            ghlMessageId: webhookData.messageId,
            conversationId,
            ghlContactId: contactId
          },
          type: QueryTypes.INSERT
        }
      );

      logger.info(`[GHL Webhook] New message synced from GHL: ${webhookData.messageId}`);
      return { success: true, action: 'created' };

    } catch (error) {
      logger.error('[GHL Webhook] Error processing message:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Map RinglyPro message type to GHL type
   */
  mapToGHLMessageType(type) {
    const typeMap = {
      'sms': 'SMS',
      'email': 'Email',
      'whatsapp': 'WhatsApp',
      'call': 'Call',
      'voicemail': 'Voicemail',
      'note': 'Notes'
    };
    return typeMap[type] || 'SMS';
  }

  /**
   * Map GHL message type to RinglyPro type
   */
  mapFromGHLMessageType(type) {
    const typeMap = {
      'SMS': 'sms',
      'Email': 'email',
      'WhatsApp': 'whatsapp',
      'Call': 'call',
      'Voicemail': 'voicemail',
      'Notes': 'note',
      'FB': 'sms',
      'GMB': 'sms',
      'IG': 'sms'
    };
    return typeMap[type] || 'sms';
  }

  /**
   * Get sync status for a contact
   * @param {number} clientId - Client ID
   * @param {number} contactId - Contact ID
   * @returns {Promise<object>} Sync status
   */
  async getSyncStatus(clientId, contactId) {
    try {
      const stats = await sequelize.query(
        `SELECT
          COUNT(*) as total_messages,
          COUNT(CASE WHEN synced_to_ghl = true THEN 1 END) as synced_to_ghl,
          COUNT(CASE WHEN synced_from_ghl = true THEN 1 END) as synced_from_ghl,
          COUNT(CASE WHEN synced_to_ghl = false AND message_source != 'ghl' THEN 1 END) as pending_sync,
          MAX(ghl_synced_at) as last_sync
         FROM messages
         WHERE client_id = :clientId AND contact_id = :contactId`,
        {
          replacements: { clientId, contactId },
          type: QueryTypes.SELECT
        }
      );

      const ghlContactId = await this.getGHLContactId(contactId);

      return {
        success: true,
        status: {
          totalMessages: parseInt(stats[0].total_messages) || 0,
          syncedToGHL: parseInt(stats[0].synced_to_ghl) || 0,
          syncedFromGHL: parseInt(stats[0].synced_from_ghl) || 0,
          pendingSync: parseInt(stats[0].pending_sync) || 0,
          lastSync: stats[0].last_sync,
          ghlLinked: !!ghlContactId,
          ghlContactId
        }
      };
    } catch (error) {
      logger.error('[GHL Sync] Error getting sync status:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new GHLConversationSyncService();
