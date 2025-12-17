/**
 * HubSpot Booking Service
 * Handles HubSpot calendar/meeting integration for WhatsApp bookings
 *
 * IMPORTANT: This service is ISOLATED from GHL booking.
 * It follows the same patterns as ghlBookingService.js but uses HubSpot APIs.
 *
 * DO NOT modify ghlBookingService.js or leadResponseService.js GHL logic.
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const HUBSPOT_BASE_URL = 'https://api.hubapi.com';

// AI-friendly error codes
const HUBSPOT_ERRORS = {
  AUTH_FAILED: 'HUBSPOT_AUTH_FAILED',
  SCOPE_MISSING: 'HUBSPOT_SCOPE_MISSING',
  RATE_LIMITED: 'RATE_LIMITED',
  NO_MEETING_LINK: 'NO_MEETING_LINK_CONFIGURED',
  NO_AVAILABILITY: 'NO_AVAILABILITY',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  API_ERROR: 'HUBSPOT_API_ERROR',
  NOT_CONFIGURED: 'HUBSPOT_NOT_CONFIGURED'
};

class HubSpotBookingService {
  /**
   * Get HubSpot credentials for a client
   * Checks clients table and settings JSONB
   * @param {number} clientId - Client ID
   * @returns {Promise<object|null>} Credentials or null
   */
  async getClientCredentials(clientId) {
    try {
      // Check direct API key from clients table
      const clientResult = await sequelize.query(
        `SELECT hubspot_api_key, hubspot_meeting_slug, hubspot_timezone, timezone
         FROM clients WHERE id = :clientId`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (clientResult.length > 0 && clientResult[0].hubspot_api_key) {
        return {
          accessToken: clientResult[0].hubspot_api_key,
          meetingSlug: clientResult[0].hubspot_meeting_slug,
          timezone: clientResult[0].hubspot_timezone || clientResult[0].timezone || 'America/New_York',
          source: 'direct'
        };
      }

      // Check settings JSONB for HubSpot config
      const settingsResult = await sequelize.query(
        `SELECT settings->'integration'->'hubspot' as hubspot_settings,
                timezone
         FROM clients WHERE id = :clientId`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (settingsResult.length > 0 && settingsResult[0].hubspot_settings) {
        const hsSettings = settingsResult[0].hubspot_settings;
        if (hsSettings.enabled && hsSettings.accessToken) {
          return {
            accessToken: hsSettings.accessToken,
            meetingSlug: hsSettings.meetingSlug || hsSettings.defaultMeetingSlug,
            timezone: hsSettings.timezone || settingsResult[0].timezone || 'America/New_York',
            source: 'settings'
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('[HubSpot] Error getting credentials:', error.message);
      return null;
    }
  }

  /**
   * Make HubSpot API call
   * @param {object} credentials - { accessToken }
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request body
   * @param {object} params - Query parameters
   * @returns {Promise<object>} API response
   */
  async callHubSpot(credentials, method, endpoint, data = null, params = null) {
    try {
      const config = {
        method,
        url: `${HUBSPOT_BASE_URL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (data && method !== 'GET') {
        config.data = data;
      }

      if (params) {
        config.params = params;
      }

      const response = await axios(config);
      return { success: true, data: response.data };
    } catch (error) {
      const status = error.response?.status;
      const errorData = error.response?.data;

      let errorCode = HUBSPOT_ERRORS.API_ERROR;
      if (status === 401) errorCode = HUBSPOT_ERRORS.AUTH_FAILED;
      else if (status === 403) errorCode = HUBSPOT_ERRORS.SCOPE_MISSING;
      else if (status === 429) errorCode = HUBSPOT_ERRORS.RATE_LIMITED;
      else if (status === 400) errorCode = HUBSPOT_ERRORS.VALIDATION_ERROR;

      // Log without exposing token
      logger.error(`[HubSpot] API Error (${errorCode}):`, {
        endpoint,
        status,
        message: errorData?.message || error.message
      });

      return {
        success: false,
        error: errorData?.message || error.message,
        code: errorCode,
        status
      };
    }
  }

  /**
   * Search for contact by email
   * @param {number} clientId - Client ID
   * @param {string} email - Email to search
   * @returns {Promise<object>} Search result
   */
  async searchContactByEmail(clientId, email) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'HubSpot not configured', code: HUBSPOT_ERRORS.NOT_CONFIGURED };
    }

    const result = await this.callHubSpot(credentials, 'POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [{
        filters: [{
          propertyName: 'email',
          operator: 'EQ',
          value: email
        }]
      }],
      properties: ['email', 'firstname', 'lastname', 'phone']
    });

    if (result.success) {
      return {
        success: true,
        contacts: result.data.results || []
      };
    }
    return result;
  }

  /**
   * Create or find contact in HubSpot
   * @param {number} clientId - Client ID
   * @param {object} contactInfo - { name, phone, email }
   * @returns {Promise<object>} Contact result
   */
  async findOrCreateContact(clientId, contactInfo) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'HubSpot not configured', code: HUBSPOT_ERRORS.NOT_CONFIGURED };
    }

    const { name, phone, email } = contactInfo;

    if (!email) {
      return { success: false, error: 'Email is required for HubSpot contacts', code: HUBSPOT_ERRORS.VALIDATION_ERROR };
    }

    // Search by email first
    const searchResult = await this.searchContactByEmail(clientId, email);
    if (searchResult.success && searchResult.contacts?.length > 0) {
      const existingContact = searchResult.contacts[0];

      // Update with new info if provided
      if (name || phone) {
        const nameParts = (name || '').split(' ');
        const updates = {};
        if (nameParts[0]) updates.firstname = nameParts[0];
        if (nameParts.slice(1).join(' ')) updates.lastname = nameParts.slice(1).join(' ');
        if (phone) updates.phone = phone;

        if (Object.keys(updates).length > 0) {
          await this.callHubSpot(credentials, 'PATCH', `/crm/v3/objects/contacts/${existingContact.id}`, {
            properties: updates
          });
        }
      }

      return {
        success: true,
        contact: existingContact,
        isNew: false
      };
    }

    // Create new contact
    const nameParts = (name || 'WhatsApp Lead').split(' ');
    const createResult = await this.callHubSpot(credentials, 'POST', '/crm/v3/objects/contacts', {
      properties: {
        email: email,
        firstname: nameParts[0] || 'WhatsApp',
        lastname: nameParts.slice(1).join(' ') || 'Lead',
        phone: phone || '',
        lifecyclestage: 'lead',
        hs_lead_status: 'NEW'
      }
    });

    if (createResult.success) {
      return {
        success: true,
        contact: createResult.data,
        isNew: true
      };
    }

    return createResult;
  }

  /**
   * Get available time slots
   * Since HubSpot Scheduler API may not be available, generate slots based on business hours
   * @param {number} clientId - Client ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<object>} Available slots
   */
  async getAvailableSlots(clientId, date) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'HubSpot not configured', code: HUBSPOT_ERRORS.NOT_CONFIGURED };
    }

    const timezone = credentials.timezone || 'America/New_York';

    // Try HubSpot Scheduler API first (if meeting slug configured)
    if (credentials.meetingSlug) {
      try {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        const result = await this.callHubSpot(
          credentials,
          'GET',
          `/scheduler/v3/meetings/${credentials.meetingSlug}/availability`,
          null,
          {
            startDatetime: startDate.toISOString(),
            endDatetime: endDate.toISOString(),
            timezone
          }
        );

        if (result.success && (result.data.availableTimes || result.data.times)) {
          const slots = (result.data.availableTimes || result.data.times).map(slot => ({
            startTime: slot.startTime || slot.start,
            endTime: slot.endTime || slot.end,
            timezone,
            isoString: slot.startTime || slot.start
          }));

          logger.info(`[HubSpot] Found ${slots.length} available slots for ${date}`);
          return { success: true, slots };
        }
      } catch (err) {
        logger.warn('[HubSpot] Scheduler API unavailable, using fallback slots');
      }
    }

    // Fallback: Generate standard business hour slots
    // Similar to GHL fallback behavior
    const businessHours = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
    ];

    // Check DST for timezone offset
    const dateObj = new Date(date);
    const month = dateObj.getMonth() + 1;
    const day = dateObj.getDate();
    // DST 2025: Mar 9 - Nov 2 for US
    const isDST = (month > 3 && month < 11) || (month === 3 && day >= 9) || (month === 11 && day < 2);
    const tzOffset = timezone === 'America/New_York' ? (isDST ? '-04:00' : '-05:00') : '-05:00';

    const slots = businessHours.map(time => ({
      startTime: `${date}T${time}:00${tzOffset}`,
      endTime: null, // Will be calculated at booking time
      timezone,
      time24: time,
      isoString: `${date}T${time}:00${tzOffset}`
    }));

    logger.info(`[HubSpot] Generated ${slots.length} fallback slots for ${date}`);
    return { success: true, slots, isFallback: true };
  }

  /**
   * Book appointment in HubSpot
   * Creates a meeting engagement associated with the contact
   * @param {number} clientId - Client ID
   * @param {object} appointmentData - Booking data
   * @returns {Promise<object>} Booking result
   */
  async bookAppointment(clientId, appointmentData) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'HubSpot not configured', code: HUBSPOT_ERRORS.NOT_CONFIGURED };
    }

    const {
      contactId,
      startTime,
      endTime,
      title,
      notes,
      attendeeName,
      attendeeEmail
    } = appointmentData;

    if (!contactId) {
      return { success: false, error: 'Contact ID is required', code: HUBSPOT_ERRORS.VALIDATION_ERROR };
    }

    // Calculate end time if not provided (default 30 minutes)
    const startMs = new Date(startTime).getTime();
    const endMs = endTime ? new Date(endTime).getTime() : startMs + 30 * 60 * 1000;

    // Try HubSpot Scheduler booking API first
    if (credentials.meetingSlug) {
      try {
        const bookResult = await this.callHubSpot(
          credentials,
          'POST',
          `/scheduler/v3/meetings/${credentials.meetingSlug}/book`,
          {
            startTime: new Date(startTime).toISOString(),
            endTime: new Date(endMs).toISOString(),
            timezone: credentials.timezone,
            formFields: {
              email: attendeeEmail,
              firstName: attendeeName?.split(' ')[0] || '',
              lastName: attendeeName?.split(' ').slice(1).join(' ') || ''
            }
          }
        );

        if (bookResult.success) {
          logger.info(`[HubSpot] Meeting booked via Scheduler: ${bookResult.data.id}`);
          return {
            success: true,
            meeting: bookResult.data,
            meetingId: bookResult.data.id,
            meetingLink: bookResult.data.meetingUrl || bookResult.data.link,
            source: 'scheduler_api'
          };
        }
      } catch (err) {
        logger.warn('[HubSpot] Scheduler booking failed, falling back to CRM engagement');
      }
    }

    // Fallback: Create meeting engagement in CRM
    const meetingProperties = {
      hs_meeting_title: title || `Appointment - ${attendeeName}`,
      hs_meeting_body: notes || `WhatsApp Booking\nContact: ${attendeeName}\nEmail: ${attendeeEmail}`,
      hs_meeting_start_time: startMs,
      hs_meeting_end_time: endMs,
      hs_meeting_outcome: 'SCHEDULED',
      hs_meeting_location: 'To be confirmed',
      hs_timestamp: startMs
    };

    const result = await this.callHubSpot(credentials, 'POST', '/crm/v3/objects/meetings', {
      properties: meetingProperties,
      associations: [{
        to: { id: contactId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 200 }]
      }]
    });

    if (result.success) {
      logger.info(`[HubSpot] Meeting engagement created: ${result.data.id}`);
      return {
        success: true,
        meeting: result.data,
        meetingId: result.data.id,
        meetingLink: null,
        source: 'crm_engagement'
      };
    }

    return result;
  }

  /**
   * Full booking flow: Create contact + Book appointment
   * Mirrors ghlBookingService.bookFromWhatsApp() structure
   * @param {number} clientId - Client ID
   * @param {object} bookingData - Full booking data
   * @returns {Promise<object>} Complete booking result
   */
  async bookFromWhatsApp(clientId, bookingData) {
    try {
      const {
        customerName,
        customerPhone,
        customerEmail,
        date,
        time,
        service,
        notes
      } = bookingData;

      logger.info(`[HubSpot] WhatsApp booking for client ${clientId}:`, {
        customerName,
        date,
        time,
        service
      });

      // Validate required fields
      if (!customerEmail) {
        return {
          success: false,
          error: 'Email is required for HubSpot bookings',
          code: HUBSPOT_ERRORS.VALIDATION_ERROR
        };
      }

      // Step 1: Find or create contact
      const contactResult = await this.findOrCreateContact(clientId, {
        name: customerName,
        phone: customerPhone,
        email: customerEmail
      });

      if (!contactResult.success) {
        return {
          success: false,
          error: `Failed to create contact: ${contactResult.error}`,
          code: contactResult.code
        };
      }

      // Step 2: Build ISO timestamp with timezone
      const credentials = await this.getClientCredentials(clientId);
      const timezone = credentials?.timezone || 'America/New_York';

      // Check DST
      const month = parseInt(date.split('-')[1]);
      const day = parseInt(date.split('-')[2]);
      const isDST = (month > 3 && month < 11) || (month === 3 && day >= 9) || (month === 11 && day < 2);
      const tzOffset = timezone === 'America/New_York' ? (isDST ? '-04:00' : '-05:00') : '-05:00';

      const startTimeISO = `${date}T${time}:00${tzOffset}`;

      logger.info(`[HubSpot] Booking time: ${startTimeISO} (isDST=${isDST})`);

      // Step 3: Book appointment
      const appointmentResult = await this.bookAppointment(clientId, {
        contactId: contactResult.contact.id,
        startTime: startTimeISO,
        title: service || 'WhatsApp Appointment',
        notes: notes || `Booked via WhatsApp\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}`,
        attendeeName: customerName,
        attendeeEmail: customerEmail
      });

      if (!appointmentResult.success) {
        return {
          success: false,
          error: `Contact created but appointment failed: ${appointmentResult.error}`,
          code: appointmentResult.code,
          contact: contactResult.contact
        };
      }

      // Step 4: Save appointment locally to RinglyPro database
      let localAppointment = null;
      try {
        const confirmationCode = `HS${Date.now().toString().slice(-6).toUpperCase()}`;

        // First, add HubSpot columns if they don't exist (idempotent migration)
        try {
          await sequelize.query(`
            ALTER TABLE appointments
            ADD COLUMN IF NOT EXISTS hubspot_meeting_id VARCHAR(255),
            ADD COLUMN IF NOT EXISTS hubspot_contact_id VARCHAR(255)
          `);
        } catch (alterError) {
          // Ignore if columns already exist
          logger.debug('[HubSpot] Columns may already exist:', alterError.message);
        }

        // Add whatsapp_hubspot to source enum if it doesn't exist
        try {
          await sequelize.query(`
            ALTER TYPE enum_appointments_source ADD VALUE IF NOT EXISTS 'whatsapp_hubspot'
          `);
        } catch (enumError) {
          // Ignore if value already exists
          logger.debug('[HubSpot] Enum value may already exist:', enumError.message);
        }

        const result = await sequelize.query(
          `INSERT INTO appointments (
            client_id, customer_name, customer_phone, customer_email,
            appointment_date, appointment_time, duration, purpose,
            status, source, confirmation_code,
            notes, hubspot_meeting_id, hubspot_contact_id,
            created_at, updated_at
          ) VALUES (
            :clientId, :customerName, :customerPhone, :customerEmail,
            :appointmentDate, :appointmentTime, :duration, :purpose,
            :status, :source, :confirmationCode,
            :notes, :hubspotMeetingId, :hubspotContactId,
            NOW(), NOW()
          ) RETURNING *`,
          {
            replacements: {
              clientId: clientId,
              customerName: customerName,
              customerPhone: customerPhone || '',
              customerEmail: customerEmail,
              appointmentDate: date,
              appointmentTime: time,
              duration: 30,
              purpose: service || 'WhatsApp Appointment',
              status: 'confirmed',
              source: 'whatsapp_hubspot',
              confirmationCode: confirmationCode,
              notes: notes || `Booked via WhatsApp - HubSpot\nCustomer: ${customerName}\nEmail: ${customerEmail}`,
              hubspotMeetingId: appointmentResult.meetingId || null,
              hubspotContactId: contactResult.contact?.id || null
            },
            type: QueryTypes.INSERT
          }
        );
        localAppointment = result[0]?.[0];
        logger.info(`[HubSpot] Local appointment saved: ${localAppointment?.id}`);
      } catch (localError) {
        // Log but don't fail - HubSpot booking succeeded
        logger.error('[HubSpot] Failed to save local appointment:', localError.message);
        logger.error('[HubSpot] Error details:', localError);
      }

      return {
        success: true,
        contact: contactResult.contact,
        contactIsNew: contactResult.isNew,
        meeting: appointmentResult.meeting,
        meetingId: appointmentResult.meetingId,
        meetingLink: appointmentResult.meetingLink,
        localAppointment: localAppointment,
        confirmationCode: localAppointment?.confirmation_code || localAppointment?.confirmationCode,
        message: 'Appointment booked successfully in HubSpot!'
      };

    } catch (error) {
      logger.error('[HubSpot] WhatsApp booking error:', error);
      return {
        success: false,
        error: error.message,
        code: HUBSPOT_ERRORS.API_ERROR
      };
    }
  }

  /**
   * Test HubSpot connection for a client
   * @param {number} clientId - Client ID
   * @returns {Promise<object>} Connection status
   */
  async testConnection(clientId) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return {
        success: false,
        error: 'HubSpot credentials not found',
        code: HUBSPOT_ERRORS.NOT_CONFIGURED,
        configured: false
      };
    }

    // Try to search contacts to verify token works
    const result = await this.callHubSpot(credentials, 'POST', '/crm/v3/objects/contacts/search', {
      filterGroups: [],
      limit: 1
    });

    if (result.success) {
      return {
        success: true,
        configured: true,
        source: credentials.source,
        hasMeetingSlug: !!credentials.meetingSlug,
        timezone: credentials.timezone
      };
    }

    return {
      success: false,
      error: result.error,
      code: result.code,
      configured: true,
      source: credentials.source
    };
  }

  /**
   * Get meeting links configured for a client
   * @param {number} clientId - Client ID
   * @returns {Promise<object>} Meeting links
   */
  async getMeetingLinks(clientId) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'HubSpot not configured', code: HUBSPOT_ERRORS.NOT_CONFIGURED };
    }

    try {
      const result = await this.callHubSpot(credentials, 'GET', '/scheduler/v3/meetings/meeting-links');
      if (result.success) {
        return {
          success: true,
          meetingLinks: result.data.results || [],
          defaultSlug: credentials.meetingSlug
        };
      }
      return result;
    } catch (error) {
      logger.warn('[HubSpot] Meeting links API unavailable');
      return {
        success: false,
        error: 'Meeting links API unavailable - using CRM engagements',
        code: HUBSPOT_ERRORS.SCOPE_MISSING,
        meetingLinks: [],
        defaultSlug: credentials.meetingSlug
      };
    }
  }
}

// Export singleton instance (matches ghlBookingService pattern)
module.exports = new HubSpotBookingService();

// Also export class for testing
module.exports.HubSpotBookingService = HubSpotBookingService;
module.exports.HUBSPOT_ERRORS = HUBSPOT_ERRORS;
