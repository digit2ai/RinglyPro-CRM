/**
 * CRM-Aware Availability Service
 *
 * Unified availability checking that routes to the appropriate CRM
 * (GHL, HubSpot, Vagaro) based on client configuration.
 *
 * KEY PRINCIPLE: Voice (Rachel/Lina) and WhatsApp should use the same
 * availability checking logic to ensure consistent booking experience.
 *
 * Priority:
 * 1. GHL Calendar - if client has GHL configured
 * 2. HubSpot Scheduler - if client has HubSpot configured
 * 3. Vagaro - if client has Vagaro configured
 * 4. Local RinglyPro calendar - fallback for all clients
 */

const logger = require('../utils/logger');

// Import CRM-specific services
const unifiedBookingService = require('./unifiedBookingService');
const ghlBookingService = require('./ghlBookingService');
const hubspotBookingService = require('./hubspotBookingService');
const vagaroService = require('./vagaroService');
const availabilityService = require('./availabilityService');

class CRMAwareAvailabilityService {
  /**
   * Get available slots for a client on a specific date
   * Automatically routes to the appropriate CRM based on client config
   *
   * @param {number} clientId - Client ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} duration - Appointment duration in minutes (default 30)
   * @returns {Promise<object>} { success, slots, source, error }
   */
  async getAvailableSlots(clientId, date, duration = 30) {
    try {
      // ============================================================
      // TEMPORARY: Use local RinglyPro calendar for ALL availability
      // CRM integrations (GHL, HubSpot, Vagaro) are temporarily disabled
      // This will be re-enabled once CRM booking issues are resolved
      // ============================================================
      const USE_LOCAL_ONLY = true;

      if (USE_LOCAL_ONLY) {
        logger.info(`[CRM-AVAILABILITY] 🔄 TEMPORARY: Using local RinglyPro calendar for client ${clientId}, date=${date}`);
        return await this.getLocalSlots(clientId, date, duration);
      }

      // Get client's CRM configuration
      const config = await unifiedBookingService.getClientBookingConfig(clientId);

      if (!config) {
        logger.warn(`[CRM-AVAILABILITY] Client ${clientId} not found, using local fallback`);
        return await this.getLocalSlots(clientId, date, duration);
      }

      logger.info(`[CRM-AVAILABILITY] Getting slots for client ${clientId}, system=${config.system}, date=${date}`);

      // Route to appropriate CRM (currently disabled)
      switch (config.system) {
        case 'ghl':
          return await this.getGHLSlots(clientId, config, date);

        case 'hubspot':
          return await this.getHubSpotSlots(clientId, date);

        case 'vagaro':
          return await this.getVagaroSlots(clientId, config, date);

        default:
          // No CRM configured - use local calendar
          return await this.getLocalSlots(clientId, date, duration);
      }

    } catch (error) {
      logger.error(`[CRM-AVAILABILITY] Error getting slots for client ${clientId}: ${error.message}`);
      // Fallback to local on any error
      return await this.getLocalSlots(clientId, date, duration);
    }
  }

  /**
   * Get available slots from GoHighLevel calendar
   * @param {number} clientId - Client ID
   * @param {object} config - Client CRM configuration
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<object>} Standardized slots response
   */
  async getGHLSlots(clientId, config, date) {
    try {
      // First, get the calendar ID for this client
      const calendarId = await this.getGHLCalendarId(clientId, config);

      if (!calendarId) {
        logger.warn(`[CRM-AVAILABILITY] No GHL calendar found for client ${clientId}, using local fallback`);
        return await this.getLocalSlots(clientId, date, 30);
      }

      logger.info(`[CRM-AVAILABILITY] Fetching GHL slots: client=${clientId}, calendar=${calendarId}, date=${date}`);

      // Get slots from GHL
      const ghlResult = await ghlBookingService.getAvailableSlots(clientId, calendarId, date);

      if (!ghlResult.success) {
        logger.warn(`[CRM-AVAILABILITY] GHL slots API failed: ${ghlResult.error}, using local fallback`);
        return await this.getLocalSlots(clientId, date, 30);
      }

      // Standardize GHL slots to common format
      const standardizedSlots = this.standardizeGHLSlots(ghlResult.slots, date);

      logger.info(`[CRM-AVAILABILITY] GHL returned ${standardizedSlots.length} slots for ${date}`);

      // If GHL returns no slots for this day, it means the calendar has no availability
      // This could be a weekend, holiday, or day without configured hours
      // Return the empty result - the caller should inform the user there's no availability
      if (standardizedSlots.length === 0) {
        logger.info(`[CRM-AVAILABILITY] GHL calendar ${calendarId} has no availability on ${date} - check calendar business hours`);
      }

      return {
        success: true,
        slots: standardizedSlots,
        source: 'ghl',
        calendarId,
        date
      };

    } catch (error) {
      logger.error(`[CRM-AVAILABILITY] GHL error: ${error.message}`);
      return await this.getLocalSlots(clientId, date, 30);
    }
  }

  /**
   * Get GHL calendar ID for a client
   * Checks client settings for configured calendar
   * @param {number} clientId - Client ID
   * @param {object} config - Client CRM configuration
   * @returns {Promise<string|null>} Calendar ID or null
   */
  async getGHLCalendarId(clientId, config) {
    try {
      // Check if calendar ID is in settings
      if (config.settings?.integration?.ghl?.calendarId) {
        return config.settings.integration.ghl.calendarId;
      }

      // Try to get calendars and use first one
      const calendarsResult = await ghlBookingService.getCalendars(clientId);

      if (calendarsResult.success && calendarsResult.calendars?.length > 0) {
        // Prefer calendar named "RinglyPro" or first active one
        const ringlyCalendar = calendarsResult.calendars.find(c =>
          c.name?.toLowerCase().includes('ringlypro') ||
          c.name?.toLowerCase().includes('booking')
        );

        const calendarId = ringlyCalendar?.id || calendarsResult.calendars[0].id;
        logger.info(`[CRM-AVAILABILITY] Using GHL calendar: ${calendarId}`);
        return calendarId;
      }

      return null;
    } catch (error) {
      logger.error(`[CRM-AVAILABILITY] Error getting GHL calendar: ${error.message}`);
      return null;
    }
  }

  /**
   * Standardize GHL slots to common format
   * GHL returns slots as ISO strings: ["2025-12-25T08:00:00-05:00", ...]
   * @param {Array} ghlSlots - Raw GHL slots
   * @param {string} date - Date string (YYYY-MM-DD)
   * @returns {Array} Standardized slots
   */
  standardizeGHLSlots(ghlSlots, date) {
    if (!ghlSlots || !Array.isArray(ghlSlots)) {
      return [];
    }

    return ghlSlots.map(slot => {
      // Handle both string ISO format and object format
      let isoString, timeStr;

      if (typeof slot === 'string') {
        isoString = slot;
        // Extract time from ISO string: "2025-12-25T08:00:00-05:00" -> "08:00:00"
        const timeMatch = slot.match(/T(\d{2}:\d{2}:\d{2})/);
        timeStr = timeMatch ? timeMatch[1] : '00:00:00';
      } else if (slot.startTime) {
        isoString = slot.startTime;
        const timeMatch = String(slot.startTime).match(/T(\d{2}:\d{2}:\d{2})/);
        timeStr = timeMatch ? timeMatch[1] : '00:00:00';
      } else {
        return null;
      }

      // Format for display
      const [hours, minutes] = timeStr.split(':');
      const hour = parseInt(hours);
      const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayTime = `${displayHour}:${minutes} ${period}`;

      return {
        date: date,
        time: timeStr,
        displayDate: this.formatDateForDisplay(date),
        displayTime: displayTime,
        datetime: `${date} ${timeStr}`,
        isoString: isoString,
        available: true,
        source: 'ghl'
      };
    }).filter(slot => slot !== null);
  }

  /**
   * Get available slots from HubSpot
   * @param {number} clientId - Client ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<object>} Standardized slots response
   */
  async getHubSpotSlots(clientId, date) {
    try {
      const hsResult = await hubspotBookingService.getAvailableSlots(clientId, date);

      if (!hsResult.success) {
        logger.warn(`[CRM-AVAILABILITY] HubSpot slots failed: ${hsResult.error}, using local fallback`);
        return await this.getLocalSlots(clientId, date, 30);
      }

      // Standardize HubSpot slots
      const standardizedSlots = this.standardizeHubSpotSlots(hsResult.slots, date);

      logger.info(`[CRM-AVAILABILITY] HubSpot returned ${standardizedSlots.length} slots for ${date}`);

      return {
        success: true,
        slots: standardizedSlots,
        source: 'hubspot',
        date
      };

    } catch (error) {
      logger.error(`[CRM-AVAILABILITY] HubSpot error: ${error.message}`);
      return await this.getLocalSlots(clientId, date, 30);
    }
  }

  /**
   * Standardize HubSpot slots to common format
   * @param {Array} hsSlots - Raw HubSpot slots
   * @param {string} date - Date string (YYYY-MM-DD)
   * @returns {Array} Standardized slots
   */
  standardizeHubSpotSlots(hsSlots, date) {
    if (!hsSlots || !Array.isArray(hsSlots)) {
      return [];
    }

    return hsSlots.map(slot => {
      const isoString = slot.startTime || slot.isoString || slot;
      const time24 = slot.time24 || this.extractTimeFromISO(isoString);

      // Format for display
      const [hours, minutes] = time24.split(':');
      const hour = parseInt(hours);
      const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      const period = hour >= 12 ? 'PM' : 'AM';
      const displayTime = `${displayHour}:${minutes} ${period}`;

      return {
        date: date,
        time: time24 + ':00',
        displayDate: this.formatDateForDisplay(date),
        displayTime: displayTime,
        datetime: `${date} ${time24}:00`,
        isoString: isoString,
        available: true,
        source: 'hubspot'
      };
    });
  }

  /**
   * Get available slots from Vagaro
   * @param {number} clientId - Client ID
   * @param {object} config - Client CRM configuration
   * @param {string} date - Date in YYYY-MM-DD format
   * @returns {Promise<object>} Standardized slots response
   */
  async getVagaroSlots(clientId, config, date) {
    try {
      if (!config.credentials?.merchantId) {
        logger.warn(`[CRM-AVAILABILITY] Vagaro not properly configured for client ${clientId}`);
        return await this.getLocalSlots(clientId, date, 30);
      }

      const vagaroSlots = await vagaroService.searchAppointmentAvailability(
        config.credentials,
        { date, locationId: null }
      );

      if (!vagaroSlots || vagaroSlots.length === 0) {
        logger.info(`[CRM-AVAILABILITY] No Vagaro slots available, using local fallback`);
        return await this.getLocalSlots(clientId, date, 30);
      }

      // Standardize Vagaro slots
      const standardizedSlots = vagaroSlots.map(slot => ({
        date: date,
        time: slot.startTime || slot.time,
        displayDate: this.formatDateForDisplay(date),
        displayTime: slot.displayTime || this.formatTimeForDisplay(slot.startTime || slot.time),
        datetime: `${date} ${slot.startTime || slot.time}`,
        available: true,
        source: 'vagaro'
      }));

      logger.info(`[CRM-AVAILABILITY] Vagaro returned ${standardizedSlots.length} slots for ${date}`);

      return {
        success: true,
        slots: standardizedSlots,
        source: 'vagaro',
        date
      };

    } catch (error) {
      logger.error(`[CRM-AVAILABILITY] Vagaro error: ${error.message}`);
      return await this.getLocalSlots(clientId, date, 30);
    }
  }

  /**
   * Get slots from local RinglyPro calendar (fallback)
   * @param {number} clientId - Client ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {number} duration - Appointment duration in minutes
   * @returns {Promise<object>} Slots response
   */
  async getLocalSlots(clientId, date, duration = 30) {
    try {
      const localResult = await availabilityService.getAvailableSlots(clientId, date, duration);

      // Add source indicator
      if (localResult.success) {
        localResult.source = 'local';
        localResult.slots = localResult.slots.map(slot => ({
          ...slot,
          source: 'local'
        }));
      }

      logger.info(`[CRM-AVAILABILITY] Local returned ${localResult.slots?.length || 0} slots for ${date}`);

      return localResult;

    } catch (error) {
      logger.error(`[CRM-AVAILABILITY] Local slots error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        slots: [],
        source: 'local'
      };
    }
  }

  /**
   * Check if a specific slot is available
   * @param {number} clientId - Client ID
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} time - Time in HH:mm:ss format
   * @returns {Promise<boolean>} Whether the slot is available
   */
  async isSlotAvailable(clientId, date, time) {
    try {
      const slotsResult = await this.getAvailableSlots(clientId, date);

      if (!slotsResult.success || !slotsResult.slots?.length) {
        return false;
      }

      // Normalize time for comparison
      const normalizedTime = time.substring(0, 5); // HH:mm

      return slotsResult.slots.some(slot => {
        const slotTime = (slot.time || '').substring(0, 5);
        return slotTime === normalizedTime;
      });

    } catch (error) {
      logger.error(`[CRM-AVAILABILITY] Error checking slot: ${error.message}`);
      return false;
    }
  }

  /**
   * Get the CRM system configured for a client
   * @param {number} clientId - Client ID
   * @returns {Promise<string>} CRM system name (ghl, hubspot, vagaro, local)
   */
  async getClientCRMSystem(clientId) {
    try {
      const config = await unifiedBookingService.getClientBookingConfig(clientId);
      return config?.system || 'local';
    } catch (error) {
      return 'local';
    }
  }

  // Helper methods

  /**
   * Extract time from ISO string
   * @param {string} isoString - ISO date string
   * @returns {string} Time in HH:mm format
   */
  extractTimeFromISO(isoString) {
    if (!isoString) return '00:00';
    const match = String(isoString).match(/T(\d{2}):(\d{2})/);
    return match ? `${match[1]}:${match[2]}` : '00:00';
  }

  /**
   * Format date for speech/display
   * @param {string} dateString - Date in YYYY-MM-DD format
   * @returns {string} Formatted date
   */
  formatDateForDisplay(dateString) {
    try {
      const date = new Date(dateString + 'T00:00:00');
      const options = { weekday: 'long', month: 'long', day: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    } catch {
      return dateString;
    }
  }

  /**
   * Format time for display
   * @param {string} timeString - Time in HH:mm:ss or HH:mm format
   * @returns {string} Formatted time (e.g., "2:30 PM")
   */
  formatTimeForDisplay(timeString) {
    if (!timeString) return '';
    const [hours, minutes] = timeString.split(':');
    const hour = parseInt(hours);
    const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    const period = hour >= 12 ? 'PM' : 'AM';
    return `${displayHour}:${minutes} ${period}`;
  }
}

// Export singleton instance
module.exports = new CRMAwareAvailabilityService();

// Also export class for testing
module.exports.CRMAwareAvailabilityService = CRMAwareAvailabilityService;
