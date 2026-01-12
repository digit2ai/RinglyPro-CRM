/**
 * Zoho Calendar Service
 *
 * Handles Zoho CRM calendar integration for RinglyPro.
 * - Fetches Zoho Events for availability checking
 * - Creates events in Zoho when appointments are booked
 * - Blocks time slots that conflict with Zoho events
 *
 * @module zohoCalendarService
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');

// Zoho API regions
const ZOHO_API_DOMAINS = {
  'com': 'https://www.zohoapis.com',
  'eu': 'https://www.zohoapis.eu',
  'in': 'https://www.zohoapis.in',
  'com.au': 'https://www.zohoapis.com.au',
  'jp': 'https://www.zohoapis.jp',
  'com.cn': 'https://www.zohoapis.com.cn'
};

const ZOHO_AUTH_DOMAINS = {
  'com': 'https://accounts.zoho.com',
  'eu': 'https://accounts.zoho.eu',
  'in': 'https://accounts.zoho.in',
  'com.au': 'https://accounts.zoho.com.au',
  'jp': 'https://accounts.zoho.jp',
  'com.cn': 'https://accounts.zoho.com.cn'
};

// Token cache to avoid refreshing too often
const tokenCache = new Map();
const TOKEN_BUFFER_MS = 5 * 60 * 1000; // 5 minutes before expiry

class ZohoCalendarService {
  /**
   * Get Zoho settings for a client
   * @param {number} clientId - Client ID
   * @returns {Promise<object|null>} Zoho settings or null
   */
  async getZohoSettings(clientId) {
    try {
      const [client] = await sequelize.query(
        'SELECT settings FROM clients WHERE id = :clientId',
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      const zohoSettings = client?.settings?.integration?.zoho;

      if (!zohoSettings?.clientId || !zohoSettings?.clientSecret || !zohoSettings?.refreshToken) {
        return null;
      }

      const result = {
        clientId: zohoSettings.clientId,
        clientSecret: zohoSettings.clientSecret,
        refreshToken: zohoSettings.refreshToken,
        region: zohoSettings.region || 'com',
        enabled: zohoSettings.enabled !== false,
        // syncCalendar defaults to true when Zoho is enabled - pull Zoho events into availability checking
        syncCalendar: zohoSettings.enabled !== false,
        // createEvents controls whether bookings sync TO Zoho (defaults to true)
        createEvents: zohoSettings.createEvents !== false
      };
      logger.info(`[ZohoCalendar] Settings for client ${clientId}: enabled=${result.enabled}, syncCalendar=${result.syncCalendar}, createEvents=${result.createEvents} (raw createEvents: ${zohoSettings.createEvents})`);
      return result;
    } catch (error) {
      logger.error(`[ZohoCalendar] Error getting settings for client ${clientId}:`, error);
      return null;
    }
  }

  /**
   * Check if Zoho calendar sync is enabled for a client
   * @param {number} clientId - Client ID
   * @returns {Promise<object>} { enabled, settings }
   */
  async isZohoCalendarEnabled(clientId) {
    const settings = await this.getZohoSettings(clientId);

    if (!settings || !settings.enabled) {
      return { enabled: false, settings: null };
    }

    return {
      enabled: true,
      settings,
      syncCalendar: settings.syncCalendar,
      createEvents: settings.createEvents
    };
  }

  /**
   * Get or refresh access token for a client
   * @param {number} clientId - Client ID
   * @param {object} settings - Zoho settings
   * @returns {Promise<string>} Access token
   */
  async getAccessToken(clientId, settings) {
    const cacheKey = `zoho_${clientId}`;
    const cached = tokenCache.get(cacheKey);

    // Return cached token if still valid
    if (cached && Date.now() < cached.expiresAt - TOKEN_BUFFER_MS) {
      return cached.accessToken;
    }

    // Refresh the token
    const authDomain = ZOHO_AUTH_DOMAINS[settings.region] || ZOHO_AUTH_DOMAINS['com'];

    try {
      const params = new URLSearchParams({
        refresh_token: settings.refreshToken,
        client_id: settings.clientId,
        client_secret: settings.clientSecret,
        grant_type: 'refresh_token'
      });

      const response = await axios.post(
        `${authDomain}/oauth/v2/token?${params.toString()}`,
        null,
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      if (response.data.error) {
        throw new Error(`Zoho auth error: ${response.data.error}`);
      }

      const accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;

      // Cache the token
      tokenCache.set(cacheKey, {
        accessToken,
        expiresAt: Date.now() + (expiresIn * 1000)
      });

      logger.info(`[ZohoCalendar] Token refreshed for client ${clientId}`);
      return accessToken;
    } catch (error) {
      logger.error(`[ZohoCalendar] Token refresh failed for client ${clientId}:`, error.message);
      throw error;
    }
  }

  /**
   * Make an authenticated API call to Zoho
   * @param {number} clientId - Client ID
   * @param {object} settings - Zoho settings
   * @param {string} method - HTTP method
   * @param {string} endpoint - API endpoint
   * @param {object} data - Request body
   * @param {object} params - Query parameters
   * @returns {Promise<object>} API response
   */
  async callAPI(clientId, settings, method, endpoint, data = null, params = null) {
    const accessToken = await this.getAccessToken(clientId, settings);
    const apiDomain = ZOHO_API_DOMAINS[settings.region] || ZOHO_API_DOMAINS['com'];

    const config = {
      method,
      url: `${apiDomain}/crm/v5${endpoint}`,
      headers: {
        'Authorization': `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json'
      }
    };

    if (data) config.data = data;
    if (params) config.params = params;

    const response = await axios(config);
    return response.data;
  }

  /**
   * Get Zoho Events for a date range
   * @param {number} clientId - Client ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<object>} { success, events }
   */
  async getEvents(clientId, startDate, endDate) {
    try {
      const settings = await this.getZohoSettings(clientId);
      if (!settings || !settings.enabled) {
        return { success: false, events: [], error: 'Zoho not configured' };
      }

      // Build date filter for Zoho API - use simple date format (Zoho v5 API)
      // First try without criteria to see all events, then filter client-side
      logger.info(`[ZohoCalendar] Fetching events for client ${clientId} from ${startDate} to ${endDate}`);

      const response = await this.callAPI(clientId, settings, 'GET', '/Events', null, {
        per_page: 100,
        fields: 'Event_Title,Start_DateTime,End_DateTime,Venue,Description,Created_Time'
      });

      // Filter events by date range client-side for reliability
      const startDt = new Date(`${startDate}T00:00:00`);
      const endDt = new Date(`${endDate}T23:59:59`);

      const allEvents = response.data || [];
      const filteredEvents = allEvents.filter(event => {
        const eventStart = new Date(event.Start_DateTime);
        return eventStart >= startDt && eventStart <= endDt;
      });

      const events = filteredEvents.map(event => this.normalizeEvent(event));

      logger.info(`[ZohoCalendar] Client ${clientId}: Found ${events.length} Zoho events (of ${allEvents.length} total) from ${startDate} to ${endDate}`);

      return {
        success: true,
        events,
        total: events.length
      };
    } catch (error) {
      logger.error(`[ZohoCalendar] Error fetching events for client ${clientId}:`, error.message);
      return { success: false, events: [], error: error.message };
    }
  }

  /**
   * Normalize Zoho event to standard format
   * @param {object} zohoEvent - Raw Zoho event
   * @returns {object} Normalized event
   */
  normalizeEvent(zohoEvent) {
    return {
      id: zohoEvent.id,
      title: zohoEvent.Event_Title,
      startTime: zohoEvent.Start_DateTime,
      endTime: zohoEvent.End_DateTime,
      location: zohoEvent.Venue,
      description: zohoEvent.Description,
      contactId: zohoEvent.Who_Id?.id,
      contactName: zohoEvent.Who_Id?.name,
      source: 'zoho'
    };
  }

  /**
   * Get blocked time slots from Zoho events
   * Converts Zoho events to blocked time slots for a given date
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {object} businessHours - { start: number, end: number, slotDuration: number }
   * @returns {Promise<string[]>} Array of blocked time slots (HH:MM:SS format)
   */
  async getBlockedSlots(clientId, date, businessHours = { start: 9, end: 17, slotDuration: 60 }) {
    try {
      const eventsResult = await this.getEvents(clientId, date, date);

      if (!eventsResult.success || eventsResult.events.length === 0) {
        return [];
      }

      const blockedSlots = [];

      // Extract event times in HH:MM format (ignoring timezone, using local time from Zoho)
      // Zoho returns times like "2026-02-02T09:00:00-05:00" - we extract the local time part
      const eventTimeRanges = eventsResult.events.map(event => {
        // Parse start time - extract HH:MM from datetime string
        const startMatch = event.startTime.match(/T(\d{2}):(\d{2})/);
        const endMatch = event.endTime.match(/T(\d{2}):(\d{2})/);

        if (!startMatch || !endMatch) {
          logger.warn(`[ZohoCalendar] Could not parse event times: ${event.startTime} - ${event.endTime}`);
          return null;
        }

        const startHour = parseInt(startMatch[1]);
        const startMin = parseInt(startMatch[2]);
        const endHour = parseInt(endMatch[1]);
        const endMin = parseInt(endMatch[2]);

        // Convert to minutes since midnight for easy comparison
        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        return { startMinutes, endMinutes, title: event.title };
      }).filter(Boolean);

      // Generate all possible time slots and check for overlaps
      for (let hour = businessHours.start; hour < businessHours.end; hour++) {
        for (let minute = 0; minute < 60; minute += businessHours.slotDuration) {
          const slotStartMinutes = hour * 60 + minute;
          const slotEndMinutes = slotStartMinutes + businessHours.slotDuration;
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

          // Check if this slot overlaps with any Zoho event
          const isBlocked = eventTimeRanges.some(event => {
            // Overlap occurs if slot starts before event ends AND slot ends after event starts
            return slotStartMinutes < event.endMinutes && slotEndMinutes > event.startMinutes;
          });

          if (isBlocked) {
            blockedSlots.push(timeStr);
          }
        }
      }

      logger.info(`[ZohoCalendar] Client ${clientId}: ${blockedSlots.length} slots blocked by Zoho events on ${date} (${eventTimeRanges.length} events)`);
      return blockedSlots;

    } catch (error) {
      logger.error(`[ZohoCalendar] Error getting blocked slots for client ${clientId}:`, error.message);
      // Fail open - don't block slots if Zoho check fails
      return [];
    }
  }

  /**
   * Create an event in Zoho CRM
   * @param {number} clientId - Client ID
   * @param {object} eventData - Event data
   * @returns {Promise<object>} { success, event }
   */
  async createEvent(clientId, eventData) {
    try {
      const settings = await this.getZohoSettings(clientId);
      if (!settings || !settings.enabled || !settings.createEvents) {
        logger.info(`[ZohoCalendar] Skipping Zoho event creation for client ${clientId} (not enabled)`);
        return { success: false, error: 'Zoho event creation not enabled' };
      }

      const {
        title,
        customerName,
        customerPhone,
        customerEmail,
        startTime,
        endTime,
        duration = 60,
        description,
        location,
        appointmentId,
        confirmationCode
      } = eventData;

      // Calculate end time if not provided
      const start = new Date(startTime);
      const end = endTime ? new Date(endTime) : new Date(start.getTime() + duration * 60 * 1000);

      const zohoEventData = {
        Event_Title: title || `Appointment: ${customerName}`,
        Start_DateTime: start.toISOString(),
        End_DateTime: end.toISOString(),
        Description: `${description || ''}\n\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail || 'N/A'}\nConfirmation: ${confirmationCode || 'N/A'}\n\nBooked via RinglyPro AI Assistant`.trim(),
        Venue: location || ''
      };

      const response = await this.callAPI(clientId, settings, 'POST', '/Events', { data: [zohoEventData] });

      if (response.data?.[0]?.status === 'success') {
        const eventId = response.data[0].details.id;

        logger.info(`[ZohoCalendar] Created Zoho event ${eventId} for client ${clientId}`);

        // Update appointment with Zoho event ID if appointmentId provided
        if (appointmentId) {
          await sequelize.query(
            `UPDATE appointments SET zoho_event_id = :zohoEventId, updated_at = NOW() WHERE id = :appointmentId`,
            {
              replacements: { zohoEventId: eventId, appointmentId },
              type: QueryTypes.UPDATE
            }
          );
        }

        return {
          success: true,
          event: {
            id: eventId,
            title: zohoEventData.Event_Title,
            startTime: start.toISOString(),
            endTime: end.toISOString()
          }
        };
      }

      return {
        success: false,
        error: response.data?.[0]?.message || 'Failed to create Zoho event'
      };

    } catch (error) {
      logger.error(`[ZohoCalendar] Error creating event for client ${clientId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Merge Zoho events with RinglyPro appointments for calendar display
   * @param {number} clientId - Client ID
   * @param {string} startDate - Start date (YYYY-MM-DD)
   * @param {string} endDate - End date (YYYY-MM-DD)
   * @returns {Promise<object>} { success, events }
   */
  async getEventsForCalendarDisplay(clientId, startDate, endDate) {
    try {
      const eventsResult = await this.getEvents(clientId, startDate, endDate);

      if (!eventsResult.success) {
        return { success: false, events: [], error: eventsResult.error };
      }

      // Transform Zoho events to RinglyPro calendar format
      const calendarEvents = eventsResult.events.map(event => {
        const start = new Date(event.startTime);
        const end = new Date(event.endTime);
        const duration = Math.round((end - start) / (1000 * 60)); // minutes

        // Extract local date and time from the Zoho datetime string
        // Zoho returns: "2026-01-14T11:00:00-05:00" - we want to keep the local time (11:00 EST)
        let appointmentDate, appointmentTime;

        const rawStartTime = event.startTime;
        if (rawStartTime && rawStartTime.includes('T')) {
          // Parse the datetime string directly to preserve local time (EST)
          const [datePart, timePart] = rawStartTime.split('T');
          appointmentDate = datePart;
          // Remove timezone offset from time (e.g., "11:00:00-05:00" -> "11:00:00")
          // Handle both formats: "11:00:00-05:00" and "11:00:00+00:00"
          const timeOnly = timePart.replace(/[+-]\d{2}:\d{2}$/, '').substring(0, 8);
          appointmentTime = timeOnly;
          logger.info(`[ZohoCalendar] Parsed time: ${rawStartTime} -> ${appointmentDate} ${appointmentTime}`);
        } else {
          // Fallback to Date object (converts to UTC) - not ideal
          appointmentDate = start.toISOString().split('T')[0];
          appointmentTime = start.toISOString().split('T')[1].substring(0, 8);
          logger.warn(`[ZohoCalendar] Using UTC fallback for: ${rawStartTime}`);
        }

        return {
          id: `zoho_${event.id}`,
          customer_name: event.title,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          duration,
          purpose: event.description || 'Zoho Calendar Event',
          status: 'confirmed',
          source: 'zoho',
          zoho_event_id: event.id,
          location: event.location,
          contact_name: event.contactName,
          // Visual indicator for Zoho events
          _zohoEvent: true
        };
      });

      return {
        success: true,
        events: calendarEvents,
        total: calendarEvents.length
      };

    } catch (error) {
      logger.error(`[ZohoCalendar] Error getting calendar events for client ${clientId}:`, error.message);
      return { success: false, events: [], error: error.message };
    }
  }
}

module.exports = new ZohoCalendarService();
