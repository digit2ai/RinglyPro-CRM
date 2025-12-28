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

      // Fall back to direct API key from clients table (also get settings JSON for calendarId)
      const clientResult = await sequelize.query(
        `SELECT ghl_api_key, ghl_location_id, settings->'integration'->'ghl' as ghl_settings FROM clients WHERE id = :clientId`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (clientResult.length > 0 && clientResult[0].ghl_api_key) {
        const ghlSettings = clientResult[0].ghl_settings || {};
        return {
          apiKey: clientResult[0].ghl_api_key,
          locationId: clientResult[0].ghl_location_id,
          calendarId: ghlSettings.calendarId, // Get calendarId from settings JSON
          source: 'direct'
        };
      }

      // Check settings JSONB for GHL config (if no direct API key in column)
      if (clientResult.length > 0 && clientResult[0].ghl_settings) {
        const ghlSettings = clientResult[0].ghl_settings;
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

    // Format date for GHL API - must be Unix timestamp in milliseconds
    // Important: Parse date explicitly to avoid timezone issues
    // date format: "YYYY-MM-DD"
    const [year, month, day] = date.split('-').map(Number);

    // GHL API expects timestamps in milliseconds
    // We want to search the full day in the calendar's timezone (typically ET)
    // DST check: March 9 - Nov 2 for 2025
    const isDST = (month > 3 && month < 11) || (month === 3 && day >= 9) || (month === 11 && day < 2);
    const etOffsetHours = isDST ? 4 : 5;  // EDT = UTC-4, EST = UTC-5

    // Create timestamps for the full day in ET, converted to UTC milliseconds
    // Start: midnight ET -> add offset to get UTC
    // End: 11:59:59 PM ET -> add offset to get UTC
    const startTime = new Date(Date.UTC(year, month - 1, day, etOffsetHours, 0, 0, 0));
    const endTime = new Date(Date.UTC(year, month - 1, day + 1, etOffsetHours - 1, 59, 59, 999));

    logger.info(`[GHL] Fetching slots: calendar=${calendarId}, date=${date}, isDST=${isDST}`);
    logger.info(`[GHL] Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);

    // GHL free-slots endpoint requires timestamps, not locationId
    const result = await this.callGHLWithoutLocation(credentials, 'GET', `/calendars/${calendarId}/free-slots`, {
      startDate: startTime.getTime(),  // Unix timestamp in ms
      endDate: endTime.getTime()       // Unix timestamp in ms
    });

    if (result.success) {
      // GHL returns format: {"2025-12-18": {"slots": ["2025-12-18T08:00:00-05:00", ...]}}
      // Extract slots from the date-keyed response
      const data = result.data;
      let allSlots = [];

      logger.info(`[GHL] Raw API response keys: ${Object.keys(data).join(', ')}`);

      // Iterate through date keys (excluding traceId)
      for (const key of Object.keys(data)) {
        if (key !== 'traceId' && data[key]?.slots) {
          logger.info(`[GHL] Found ${data[key].slots.length} slots under key "${key}"`);
          allSlots = allSlots.concat(data[key].slots);
        }
      }

      logger.info(`[GHL] Total available slots for ${date}: ${allSlots.length}`);
      return {
        success: true,
        slots: allSlots
      };
    }

    logger.warn(`[GHL] API returned error: ${result.error}`);
    return result;
  }

  /**
   * Make GHL API call without locationId (for endpoints that don't need it)
   */
  async callGHLWithoutLocation(credentials, method, endpoint, data = null) {
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
        config.data = data;
      }

      if (method === 'GET' && data) {
        config.params = data;
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

    // Calculate end time if not provided (default 30 minutes based on GHL screenshot)
    // If startTime is already an ISO string with timezone, use it directly
    const isISOWithTZ = typeof startTime === 'string' && /[+-]\d{2}:\d{2}$/.test(startTime);
    let startStr, endStr;

    if (isISOWithTZ) {
      // Already has timezone offset - use directly
      startStr = startTime;
      // Extract timezone offset from start time
      const tzOffset = startTime.slice(-6);  // e.g., "-05:00"

      // Parse the LOCAL time components (not UTC!) and add 30 minutes
      // Format: "2025-12-17T19:00:00-05:00"
      const timePart = startTime.slice(11, 19);  // "19:00:00"
      const datePart = startTime.slice(0, 10);   // "2025-12-17"
      const [hours, minutes, seconds] = timePart.split(':').map(Number);

      // Add 30 minutes to local time
      let endMinutes = minutes + 30;
      let endHours = hours;
      if (endMinutes >= 60) {
        endMinutes -= 60;
        endHours += 1;
      }
      // Handle hour overflow (for edge cases near midnight)
      if (endHours >= 24) {
        endHours -= 24;
        // Note: date would change but for 30 min appointments this shouldn't happen
      }

      const endTimeStr = `${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00`;
      endStr = endTime || `${datePart}T${endTimeStr}${tzOffset}`;

      logger.info(`[GHL] Time calculation: start=${timePart}, end=${endTimeStr}, offset=${tzOffset}`);
    } else {
      const start = new Date(startTime);
      const end = endTime ? new Date(endTime) : new Date(start.getTime() + 30 * 60 * 1000);
      startStr = start.toISOString();
      endStr = end.toISOString();
    }

    logger.info(`[GHL] Booking appointment: startTime=${startStr}, endTime=${endStr}`);

    const result = await this.callGHL(credentials, 'POST', '/calendars/events/appointments', {
      calendarId: effectiveCalendarId,
      contactId: contactId,
      startTime: startStr,
      endTime: endStr,
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
      // GHL expects startTime in ISO format with timezone offset
      // The time parameter is in 24h format like "17:00" and represents local business time (ET)
      // December 16 is in EST (UTC-5), not EDT

      // Check if date is in DST for ET timezone
      // DST 2025: Mar 9 - Nov 2 (second Sunday March to first Sunday November)
      const month = parseInt(date.split('-')[1]);
      const day = parseInt(date.split('-')[2]);
      const isDST = (month > 3 && month < 11) || (month === 3 && day >= 9) || (month === 11 && day < 2);
      const etOffset = isDST ? '-04:00' : '-05:00';

      // Build ISO string with ET timezone offset - send this directly to GHL
      // GHL API accepts ISO 8601 format: "2025-12-22T17:00:00-05:00"
      const startTimeISO = `${date}T${time}:00${etOffset}`;

      logger.info(`[GHL] Booking time: ${startTimeISO} (isDST=${isDST})`);

      const appointmentResult = await this.bookAppointment(clientId, {
        contactId: contactResult.contact.id,
        calendarId: calendarId,
        startTime: startTimeISO,  // Send ISO with timezone, not UTC
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
   * Get appointments from GHL for a date range
   * Used for syncing CRM appointments to dashboard
   * @param {number} clientId - Client ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<object>} Appointments list
   */
  async getAppointments(clientId, startDate, endDate) {
    const credentials = await this.getClientCredentials(clientId);
    if (!credentials) {
      return { success: false, error: 'GHL not configured for this client', appointments: [] };
    }

    try {
      // Convert dates to timestamps for GHL API
      const startTime = new Date(startDate);
      startTime.setHours(0, 0, 0, 0);
      const endTime = new Date(endDate);
      endTime.setHours(23, 59, 59, 999);

      // Build query params - GHL API requires calendarId, userId, or groupId
      const queryParams = {
        startTime: startTime.getTime(),
        endTime: endTime.getTime()
      };

      // Add calendarId if available (required by GHL API)
      if (credentials.calendarId) {
        queryParams.calendarId = credentials.calendarId;
        logger.info(`[GHL] Fetching appointments with calendarId: ${credentials.calendarId}`);
      } else {
        logger.warn(`[GHL] No calendarId configured for client ${clientId} - GHL API may reject request`);
      }

      // GHL uses /calendars/events endpoint to fetch appointments
      const result = await this.callGHL(credentials, 'GET', '/calendars/events', queryParams);

      if (!result.success) {
        logger.warn(`[GHL] Failed to fetch appointments: ${result.error}`);
        return { success: false, error: result.error, appointments: [] };
      }

      const events = result.data?.events || [];

      // Map GHL events to standardized format
      const appointments = events.map(event => ({
        id: event.id,
        ghlAppointmentId: event.id,
        ghlContactId: event.contactId,
        ghlCalendarId: event.calendarId,
        customerName: event.contact?.name || event.title || 'Unknown',
        customerPhone: event.contact?.phone || '',
        customerEmail: event.contact?.email || '',
        appointmentDate: event.startTime ? new Date(event.startTime).toISOString().split('T')[0] : null,
        appointmentTime: event.startTime ? new Date(event.startTime).toISOString().split('T')[1].substring(0, 8) : null,
        duration: event.duration || 30,
        purpose: event.title || 'GHL Appointment',
        status: this.mapGHLStatus(event.appointmentStatus || event.status),
        source: 'ghl_sync',
        notes: event.notes || ''
      }));

      logger.info(`[GHL] Fetched ${appointments.length} appointments for client ${clientId}`);
      return { success: true, appointments };

    } catch (error) {
      logger.error(`[GHL] Error fetching appointments: ${error.message}`);
      return { success: false, error: error.message, appointments: [] };
    }
  }

  /**
   * Map GHL appointment status to RinglyPro status
   */
  mapGHLStatus(ghlStatus) {
    const statusMap = {
      'confirmed': 'confirmed',
      'showed': 'completed',
      'noshow': 'no-show',
      'no_show': 'no-show',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
      'new': 'pending',
      'pending': 'pending'
    };
    return statusMap[ghlStatus?.toLowerCase()] || 'confirmed';
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
