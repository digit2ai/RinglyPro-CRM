/**
 * GHL Booking Service
 * Handles GoHighLevel calendar integration for WhatsApp bookings
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

class GHLBookingService {
  /**
   * Get GHL credentials for a client
   * Checks both OAuth tokens and direct API keys
   */
  async getClientCredentials(clientId) {
    try {
      // First check for OAuth token in ghl_integrations table
      const oauthResult = await sequelize.query(
        `SELECT access_token, ghl_location_id, expires_at, refresh_token
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
        // Check if token is expired
        if (token.expires_at && new Date(token.expires_at) < new Date()) {
          // Token expired - try to refresh
          if (token.refresh_token) {
            const refreshed = await this.refreshToken(clientId, token.refresh_token);
            if (refreshed) {
              return {
                apiKey: refreshed.access_token,
                locationId: token.ghl_location_id,
                source: 'oauth_refreshed'
              };
            }
          }
          logger.warn(`[GHL] OAuth token expired for client ${clientId}`);
        } else {
          return {
            apiKey: token.access_token,
            locationId: token.ghl_location_id,
            source: 'oauth'
          };
        }
      }

      // Fall back to direct API key from clients table
      const clientResult = await sequelize.query(
        `SELECT ghl_api_key, ghl_location_id FROM clients WHERE id = :clientId`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (clientResult.length > 0 && clientResult[0].ghl_api_key) {
        return {
          apiKey: clientResult[0].ghl_api_key,
          locationId: clientResult[0].ghl_location_id,
          source: 'direct'
        };
      }

      // Check settings JSONB for GHL config
      const settingsResult = await sequelize.query(
        `SELECT settings->'integration'->'ghl' as ghl_settings FROM clients WHERE id = :clientId`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (settingsResult.length > 0 && settingsResult[0].ghl_settings) {
        const ghlSettings = settingsResult[0].ghl_settings;
        if (ghlSettings.enabled && ghlSettings.apiKey) {
          return {
            apiKey: ghlSettings.apiKey,
            locationId: ghlSettings.locationId,
            calendarId: ghlSettings.calendarId,
            source: 'settings'
          };
        }
      }

      return null;
    } catch (error) {
      logger.error('[GHL] Error getting credentials:', error);
      return null;
    }
  }

  /**
   * Refresh OAuth token
   */
  async refreshToken(clientId, refreshToken) {
    try {
      const response = await axios.post('https://services.leadconnectorhq.com/oauth/token', {
        client_id: process.env.GHL_CLIENT_ID,
        client_secret: process.env.GHL_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      if (response.data.access_token) {
        // Update token in database
        await sequelize.query(
          `UPDATE ghl_integrations
           SET access_token = :accessToken,
               refresh_token = :refreshToken,
               expires_at = :expiresAt,
               last_synced_at = NOW()
           WHERE client_id = :clientId AND is_active = true`,
          {
            replacements: {
              clientId,
              accessToken: response.data.access_token,
              refreshToken: response.data.refresh_token || refreshToken,
              expiresAt: new Date(Date.now() + (response.data.expires_in * 1000))
            },
            type: QueryTypes.UPDATE
          }
        );

        return response.data;
      }
    } catch (error) {
      logger.error('[GHL] Token refresh failed:', error.message);
    }
    return null;
  }

  /**
   * Make GHL API call
   */
  async callGHL(credentials, method, endpoint, data = null) {
    try {
      const config = {
        method,
        url: `${GHL_BASE_URL}${endpoint}`,
        headers: {
          'Authorization': `Bearer ${credentials.apiKey}`,
          'Version': GHL_API_VERSION,
          'Content-Type': 'application/json'
        }
      };

      if (data && method !== 'GET') {
        config.data = { ...data, locationId: credentials.locationId };
      }

      if (method === 'GET' && data) {
        config.params = { locationId: credentials.locationId, ...data };
      } else if (method === 'GET') {
        config.params = { locationId: credentials.locationId };
      }

      const response = await axios(config);
      return { success: true, data: response.data };
    } catch (error) {
      logger.error('[GHL] API Error:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.message || error.message,
        status: error.response?.status
      };
    }
  }

  /**
   * Get available calendars for a client
   */
  async getCalendars(clientId) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured for this client' };
    }

    const result = await this.callGHL(credentials, 'GET', '/calendars/');
    if (result.success) {
      return {
        success: true,
        calendars: result.data.calendars || []
      };
    }
    return result;
  }

  /**
   * Get available time slots for a calendar
   */
  async getAvailableSlots(clientId, calendarId, date) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured' };
    }

    // Format date for GHL API
    const startTime = new Date(date);
    startTime.setHours(0, 0, 0, 0);
    const endTime = new Date(date);
    endTime.setHours(23, 59, 59, 999);

    const result = await this.callGHL(credentials, 'GET', `/calendars/${calendarId}/free-slots`, {
      startDate: startTime.toISOString(),
      endDate: endTime.toISOString()
    });

    if (result.success) {
      return {
        success: true,
        slots: result.data.slots || result.data || []
      };
    }
    return result;
  }

  /**
   * Create or find contact in GHL
   */
  async findOrCreateContact(clientId, contactInfo) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured' };
    }

    const { name, phone, email } = contactInfo;

    // First try to find existing contact by phone
    const searchResult = await this.callGHL(credentials, 'GET', '/contacts/', {
      query: phone
    });

    if (searchResult.success && searchResult.data.contacts?.length > 0) {
      return {
        success: true,
        contact: searchResult.data.contacts[0],
        isNew: false
      };
    }

    // Create new contact
    const nameParts = (name || 'WhatsApp Lead').split(' ');
    const createResult = await this.callGHL(credentials, 'POST', '/contacts/', {
      firstName: nameParts[0] || 'WhatsApp',
      lastName: nameParts.slice(1).join(' ') || 'Lead',
      phone: phone,
      email: email || `${phone.replace(/\D/g, '')}@whatsapp.ringlypro.com`,
      source: 'WhatsApp - RinglyPro',
      tags: ['WhatsApp Lead', 'RinglyPro']
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
   * Book appointment in GHL calendar
   */
  async bookAppointment(clientId, appointmentData) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured for this client' };
    }

    const {
      contactId,
      calendarId,
      startTime,
      endTime,
      title,
      notes,
      service
    } = appointmentData;

    // Use calendar from credentials if not provided
    const effectiveCalendarId = calendarId || credentials.calendarId;

    if (!effectiveCalendarId) {
      return { success: false, error: 'No calendar configured. Please set up GHL Calendar ID in settings.' };
    }

    if (!contactId) {
      return { success: false, error: 'Contact ID is required' };
    }

    // Calculate end time if not provided (default 1 hour)
    const start = new Date(startTime);
    const end = endTime ? new Date(endTime) : new Date(start.getTime() + 60 * 60 * 1000);

    const result = await this.callGHL(credentials, 'POST', '/calendars/events/appointments', {
      calendarId: effectiveCalendarId,
      contactId: contactId,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      title: title || service || 'WhatsApp Booking',
      appointmentStatus: 'confirmed',
      notes: notes || 'Booked via WhatsApp - RinglyPro'
    });

    if (result.success) {
      logger.info(`[GHL] Appointment booked: ${result.data.id || result.data.event?.id}`);
      return {
        success: true,
        appointment: result.data.event || result.data,
        message: 'Appointment booked successfully in GoHighLevel'
      };
    }

    return result;
  }

  /**
   * Full booking flow: Create contact + Book appointment
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
        calendarId,
        notes
      } = bookingData;

      logger.info(`[GHL] WhatsApp booking for client ${clientId}:`, { customerName, date, time, service });

      // Step 1: Find or create contact
      const contactResult = await this.findOrCreateContact(clientId, {
        name: customerName,
        phone: customerPhone,
        email: customerEmail
      });

      if (!contactResult.success) {
        return {
          success: false,
          error: `Failed to create contact: ${contactResult.error}`
        };
      }

      // Step 2: Book appointment
      const startTime = new Date(`${date}T${time}`);

      const appointmentResult = await this.bookAppointment(clientId, {
        contactId: contactResult.contact.id,
        calendarId: calendarId,
        startTime: startTime.toISOString(),
        title: service || 'WhatsApp Appointment',
        service: service,
        notes: notes || `Booked via WhatsApp\nCustomer: ${customerName}\nPhone: ${customerPhone}`
      });

      if (!appointmentResult.success) {
        return {
          success: false,
          error: `Contact created but appointment failed: ${appointmentResult.error}`,
          contact: contactResult.contact
        };
      }

      // Step 3: Save appointment locally to RinglyPro database for dashboard display
      let localAppointment = null;
      try {
        const confirmationCode = `GHL${Date.now().toString().slice(-6).toUpperCase()}`;
        const result = await sequelize.query(
          `INSERT INTO appointments (
            client_id, customer_name, customer_phone, customer_email,
            appointment_date, appointment_time, duration, purpose,
            status, source, confirmation_code, reminder_sent, confirmation_sent,
            notes, ghl_appointment_id, ghl_contact_id,
            created_at, updated_at
          ) VALUES (
            :clientId, :customerName, :customerPhone, :customerEmail,
            :appointmentDate, :appointmentTime, :duration, :purpose,
            :status, :source, :confirmationCode, :reminderSent, :confirmationSent,
            :notes, :ghlAppointmentId, :ghlContactId,
            NOW(), NOW()
          ) RETURNING *`,
          {
            replacements: {
              clientId: clientId,
              customerName: customerName,
              customerPhone: customerPhone,
              customerEmail: customerEmail || `${customerPhone.replace(/\D/g, '')}@whatsapp.ringlypro.com`,
              appointmentDate: date,
              appointmentTime: time,
              duration: 60,
              purpose: service || 'WhatsApp Appointment',
              status: 'confirmed',
              source: 'whatsapp_ghl',
              confirmationCode: confirmationCode,
              reminderSent: false,
              confirmationSent: false,
              notes: notes || `Booked via WhatsApp - GHL\nCustomer: ${customerName}\nPhone: ${customerPhone}`,
              ghlAppointmentId: appointmentResult.appointment?.id || null,
              ghlContactId: contactResult.contact?.id || null
            },
            type: QueryTypes.INSERT
          }
        );
        localAppointment = result[0]?.[0];
        logger.info(`[GHL] Local appointment saved: ${localAppointment?.id}`);
      } catch (localError) {
        // Log but don't fail - GHL booking succeeded
        logger.warn('[GHL] Failed to save local appointment:', localError.message);
      }

      return {
        success: true,
        contact: contactResult.contact,
        contactIsNew: contactResult.isNew,
        appointment: appointmentResult.appointment,
        localAppointment: localAppointment,
        message: 'Appointment booked successfully!'
      };

    } catch (error) {
      logger.error('[GHL] WhatsApp booking error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Test GHL connection for a client
   */
  async testConnection(clientId) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return {
        success: false,
        error: 'GHL credentials not found',
        configured: false
      };
    }

    // Try to fetch location info
    const result = await this.callGHL(credentials, 'GET', `/locations/${credentials.locationId}`);

    if (result.success) {
      return {
        success: true,
        configured: true,
        source: credentials.source,
        location: result.data.location || result.data
      };
    }

    return {
      success: false,
      error: result.error,
      configured: true,
      source: credentials.source
    };
  }
}

module.exports = new GHLBookingService();
