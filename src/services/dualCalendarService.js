/**
 * Dual Calendar Service
 * Handles multi-calendar integration for RinglyPro
 *
 * Supports:
 *   - RinglyPro database calendar (always active)
 *   - GHL calendar sync (when enabled)
 *   - Google Calendar sync (when connected)
 *   - Zoho CRM Events sync (when connected)
 *
 * Availability checking respects ALL enabled calendar sources.
 * Bookings can be synced to all enabled calendars.
 *
 * @module dualCalendarService
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const ghlBookingService = require('./ghlBookingService');
const googleCalendarService = require('./googleCalendarService');
const zohoCalendarService = require('./zohoCalendarService');
const GoogleCalendarIntegration = require('../models/GoogleCalendarIntegration');

const GHL_BASE_URL = 'https://services.leadconnectorhq.com';
const GHL_API_VERSION = '2021-07-28';

// Client 15 is the test client for dual calendar mode
const CLIENT_15_ID = 15;

class DualCalendarService {
  /**
   * Check if dual calendar mode is enabled for a client
   * @param {number} clientId - Client ID
   * @returns {Promise<object>} { enabled: boolean, ghlEnabled: boolean, calendarId: string|null }
   */
  async isDualModeEnabled(clientId) {
    try {
      const result = await sequelize.query(
        `SELECT
          ghl_api_key,
          ghl_location_id,
          settings->'integration'->'ghl' as ghl_settings
        FROM clients
        WHERE id = :clientId`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (!result.length) {
        return { enabled: false, ghlEnabled: false, calendarId: null };
      }

      const client = result[0];
      const ghlSettings = client.ghl_settings || {};

      // Check if GHL is enabled AND has credentials
      const hasCredentials = !!(client.ghl_api_key || ghlSettings.apiKey);
      const isEnabled = ghlSettings.enabled === true && hasCredentials;
      const syncCalendar = ghlSettings.syncCalendar !== false; // Default to true

      logger.info(`[DualCal] Client ${clientId}: enabled=${isEnabled}, hasCredentials=${hasCredentials}, syncCalendar=${syncCalendar}`);

      return {
        enabled: isEnabled && syncCalendar,
        ghlEnabled: isEnabled,
        calendarId: ghlSettings.calendarId || null,
        locationId: client.ghl_location_id || ghlSettings.locationId || null
      };
    } catch (error) {
      logger.error(`[DualCal] Error checking dual mode: ${error.message}`);
      return { enabled: false, ghlEnabled: false, calendarId: null };
    }
  }

  /**
   * Get available slots from RinglyPro database
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {object} businessHours - { start: number, end: number, slotDuration: number }
   * @returns {Promise<string[]>} Array of available time slots
   */
  async getRinglyProAvailability(clientId, date, businessHours = { start: 9, end: 17, slotDuration: 60 }) {
    try {
      // Generate all possible time slots
      const allSlots = [];
      for (let hour = businessHours.start; hour < businessHours.end; hour++) {
        for (let minute = 0; minute < 60; minute += businessHours.slotDuration) {
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;
          allSlots.push(timeStr);
        }
      }

      // Get existing appointments from RinglyPro database
      const existingAppointments = await sequelize.query(
        `SELECT appointment_time
         FROM appointments
         WHERE client_id = :clientId
           AND appointment_date = :date
           AND status NOT IN ('cancelled', 'completed', 'no-show')`,
        {
          replacements: { clientId, date },
          type: QueryTypes.SELECT
        }
      );

      const bookedTimes = existingAppointments.map(apt => apt.appointment_time);
      const availableSlots = allSlots.filter(slot => !bookedTimes.includes(slot));

      logger.info(`[DualCal] RinglyPro: ${availableSlots.length}/${allSlots.length} slots available on ${date}`);

      return availableSlots;
    } catch (error) {
      logger.error(`[DualCal] RinglyPro availability error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get available slots from GHL calendar
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {string} calendarId - Optional specific calendar ID
   * @returns {Promise<string[]>} Array of available time slots (HH:MM:SS format)
   */
  async getGHLAvailability(clientId, date, calendarId = null) {
    try {
      const credentials = await ghlBookingService.getClientCredentials(clientId);
      if (!credentials) {
        logger.warn(`[DualCal] No GHL credentials for client ${clientId}`);
        return [];
      }

      // If no specific calendar, get the first active calendar
      let effectiveCalendarId = calendarId;
      if (!effectiveCalendarId) {
        const calendarsResult = await ghlBookingService.getCalendars(clientId);
        if (calendarsResult.success && calendarsResult.calendars.length > 0) {
          effectiveCalendarId = calendarsResult.calendars[0].id;
          logger.info(`[DualCal] Using first calendar: ${calendarsResult.calendars[0].name} (${effectiveCalendarId})`);
        } else {
          logger.warn(`[DualCal] No calendars found for client ${clientId}`);
          return [];
        }
      }

      // Get free slots from GHL
      const slotsResult = await ghlBookingService.getAvailableSlots(clientId, effectiveCalendarId, date);

      if (!slotsResult.success) {
        logger.warn(`[DualCal] GHL slots error: ${slotsResult.error}`);
        return [];
      }

      // Convert GHL ISO slots to HH:MM:SS format
      // GHL returns: ["2025-12-18T08:00:00-05:00", ...]
      const availableSlots = slotsResult.slots.map(slot => {
        // Extract time portion: "08:00:00"
        return slot.substring(11, 19);
      });

      logger.info(`[DualCal] GHL: ${availableSlots.length} slots available on ${date}`);

      return availableSlots;
    } catch (error) {
      logger.error(`[DualCal] GHL availability error: ${error.message}`);
      return [];
    }
  }

  /**
   * Get busy times from Google Calendar for a client
   * Converts busy periods to blocked time slots
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {object} businessHours - { start: number, end: number, slotDuration: number }
   * @returns {Promise<string[]>} Array of BLOCKED time slots (HH:MM:SS format)
   */
  async getGoogleCalendarBlockedSlots(clientId, date, businessHours = { start: 9, end: 17, slotDuration: 60 }) {
    try {
      // Check if client has Google Calendar connected
      const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);
      if (!integration || !integration.syncBlockedTimes) {
        return [];
      }

      // Set up time range for the day
      const dayStart = new Date(`${date}T00:00:00`);
      const dayEnd = new Date(`${date}T23:59:59`);

      // Get busy slots from Google Calendar
      const busySlots = await googleCalendarService.getFreeBusy(clientId, dayStart, dayEnd);

      // Generate all possible time slots
      const blockedSlots = [];
      for (let hour = businessHours.start; hour < businessHours.end; hour++) {
        for (let minute = 0; minute < 60; minute += businessHours.slotDuration) {
          const slotStart = new Date(`${date}T${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`);
          const slotEnd = new Date(slotStart.getTime() + businessHours.slotDuration * 60 * 1000);
          const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:00`;

          // Check if this slot overlaps with any busy period
          const isBlocked = busySlots.some(busy => slotStart < busy.end && slotEnd > busy.start);
          if (isBlocked) {
            blockedSlots.push(timeStr);
          }
        }
      }

      logger.info(`[DualCal] Google Calendar: ${blockedSlots.length} slots blocked on ${date} for client ${clientId}`);
      return blockedSlots;

    } catch (error) {
      logger.error(`[DualCal] Google Calendar availability error: ${error.message}`);
      // Fail open - don't block slots if Google Calendar check fails
      return [];
    }
  }

  /**
   * Get Zoho CRM blocked slots for a date
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {object} businessHours - { start: number, end: number, slotDuration: number }
   * @returns {Promise<string[]>} Array of BLOCKED time slots (HH:MM:SS format)
   */
  async getZohoBlockedSlots(clientId, date, businessHours = { start: 9, end: 17, slotDuration: 60 }) {
    try {
      return await zohoCalendarService.getBlockedSlots(clientId, date, businessHours);
    } catch (error) {
      logger.error(`[DualCal] Zoho Calendar availability error: ${error.message}`);
      // Fail open - don't block slots if Zoho check fails
      return [];
    }
  }

  /**
   * Get COMBINED availability from RinglyPro, GHL, Google Calendar, and Zoho CRM
   * Only returns slots that are available in ALL applicable systems
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {object} options - { businessHours, calendarId }
   * @returns {Promise<object>} { availableSlots, ringlyProSlots, ghlSlots, googleBlockedSlots, zohoBlockedSlots, dualModeActive }
   */
  async getCombinedAvailability(clientId, date, options = {}) {
    const { businessHours = { start: 9, end: 17, slotDuration: 60 }, calendarId } = options;

    try {
      // Check if dual mode is enabled
      const dualMode = await this.isDualModeEnabled(clientId);

      // Get RinglyPro availability
      const ringlyProSlots = await this.getRinglyProAvailability(clientId, date, businessHours);

      // Get Google Calendar blocked slots (only for non-Client 32)
      let googleBlockedSlots = [];
      let googleCalendarActive = false;
      if (clientId !== 32) {
        googleBlockedSlots = await this.getGoogleCalendarBlockedSlots(clientId, date, businessHours);
        googleCalendarActive = googleBlockedSlots.length >= 0; // Will be true if we checked (even if no blocked slots)

        // Check if Google Calendar is actually connected
        const googleIntegration = await GoogleCalendarIntegration.getActiveForClient(clientId);
        googleCalendarActive = !!(googleIntegration && googleIntegration.syncBlockedTimes);
      }

      // Get Zoho CRM blocked slots
      let zohoBlockedSlots = [];
      let zohoCalendarActive = false;
      const zohoStatus = await zohoCalendarService.isZohoCalendarEnabled(clientId);
      if (zohoStatus.enabled && zohoStatus.syncCalendar) {
        zohoBlockedSlots = await this.getZohoBlockedSlots(clientId, date, businessHours);
        zohoCalendarActive = true;
        logger.info(`[DualCal] Zoho Calendar: ${zohoBlockedSlots.length} slots blocked on ${date} for client ${clientId}`);
      }

      // Filter out Google Calendar and Zoho blocked slots from RinglyPro slots
      let availableAfterExternal = ringlyProSlots
        .filter(slot => !googleBlockedSlots.includes(slot))
        .filter(slot => !zohoBlockedSlots.includes(slot));

      if (!dualMode.enabled) {
        // GHL dual mode OFF - use RinglyPro filtered by Google Calendar + Zoho
        const sources = ['ringlypro'];
        if (googleCalendarActive) sources.push('google');
        if (zohoCalendarActive) sources.push('zoho');

        logger.info(`[DualCal] Client ${clientId}: GHL dual mode OFF, using ${sources.join(' + ')}`);
        return {
          availableSlots: availableAfterExternal,
          ringlyProSlots,
          ghlSlots: [],
          googleBlockedSlots,
          zohoBlockedSlots,
          googleCalendarActive,
          zohoCalendarActive,
          dualModeActive: false,
          source: sources.join('_')
        };
      }

      // GHL Dual mode ON - get GHL availability too
      const effectiveCalendarId = calendarId || dualMode.calendarId;
      const ghlSlots = await this.getGHLAvailability(clientId, date, effectiveCalendarId);

      // Find intersection - slots available in ALL systems
      const combinedSlots = availableAfterExternal.filter(slot => ghlSlots.includes(slot));

      logger.info(`[DualCal] Client ${clientId}: Combined availability: ${combinedSlots.length} slots (RP: ${ringlyProSlots.length}, GHL: ${ghlSlots.length}, Google blocked: ${googleBlockedSlots.length}, Zoho blocked: ${zohoBlockedSlots.length})`);

      return {
        availableSlots: combinedSlots,
        ringlyProSlots,
        ghlSlots,
        googleBlockedSlots,
        zohoBlockedSlots,
        googleCalendarActive,
        zohoCalendarActive,
        dualModeActive: true,
        source: zohoCalendarActive ? 'dual_calendar_zoho' : (googleCalendarActive ? 'dual_calendar_google' : 'dual_calendar')
      };
    } catch (error) {
      logger.error(`[DualCal] Combined availability error: ${error.message}`);

      // Fallback to RinglyPro only on error
      const ringlyProSlots = await this.getRinglyProAvailability(clientId, date, businessHours);
      return {
        availableSlots: ringlyProSlots,
        ringlyProSlots,
        ghlSlots: [],
        googleBlockedSlots: [],
        zohoBlockedSlots: [],
        googleCalendarActive: false,
        zohoCalendarActive: false,
        dualModeActive: false,
        source: 'ringlypro_fallback',
        error: error.message
      };
    }
  }

  /**
   * Create appointment in RinglyPro database
   * @param {number} clientId - Client ID
   * @param {object} appointmentData - Appointment details
   * @returns {Promise<object>} Created appointment
   */
  async createRinglyProAppointment(clientId, appointmentData) {
    const {
      customerName,
      customerPhone,
      customerEmail,
      appointmentDate,
      appointmentTime,
      duration = 60,
      purpose = 'Appointment',
      notes = '',
      ghlAppointmentId = null,
      ghlContactId = null
    } = appointmentData;

    const confirmationCode = `RP${Date.now().toString().slice(-6).toUpperCase()}`;

    const result = await sequelize.query(
      `INSERT INTO appointments (
        client_id, customer_name, customer_phone, customer_email,
        appointment_date, appointment_time, duration, purpose,
        status, source, confirmation_code, notes,
        ghl_appointment_id, ghl_contact_id,
        created_at, updated_at
      ) VALUES (
        :clientId, :customerName, :customerPhone, :customerEmail,
        :appointmentDate, :appointmentTime, :duration, :purpose,
        'confirmed', 'manual', :confirmationCode, :notes,
        :ghlAppointmentId, :ghlContactId,
        NOW(), NOW()
      ) RETURNING *`,
      {
        replacements: {
          clientId,
          customerName,
          customerPhone,
          customerEmail: customerEmail || `${customerPhone.replace(/\D/g, '')}@booking.ringlypro.com`,
          appointmentDate,
          appointmentTime,
          duration,
          purpose,
          confirmationCode,
          notes,
          ghlAppointmentId,
          ghlContactId
        },
        type: QueryTypes.INSERT
      }
    );

    const appointment = result[0]?.[0];
    logger.info(`[DualCal] RinglyPro appointment created: ${appointment?.id}`);

    return appointment;
  }

  /**
   * Sync appointment to Google Calendar
   * @param {number} clientId - Client ID
   * @param {object} appointment - Appointment data (from RinglyPro database)
   * @returns {Promise<object|null>} Google Calendar event or null
   */
  async syncToGoogleCalendar(clientId, appointment) {
    try {
      // Check if Google Calendar is connected and sync is enabled
      const integration = await GoogleCalendarIntegration.getActiveForClient(clientId);
      if (!integration || !integration.syncAppointments) {
        logger.info(`[DualCal] Client ${clientId}: Google Calendar sync not enabled`);
        return null;
      }

      // Parse appointment date and time
      const appointmentDate = appointment.appointmentDate || appointment.appointment_date;
      const appointmentTime = appointment.appointmentTime || appointment.appointment_time;
      const duration = appointment.duration || 60;

      const startTime = new Date(`${appointmentDate}T${appointmentTime}`);
      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

      const eventDetails = {
        appointmentId: appointment.id,
        title: appointment.purpose || 'RinglyPro Appointment',
        customerName: appointment.customerName || appointment.customer_name,
        customerPhone: appointment.customerPhone || appointment.customer_phone,
        customerEmail: appointment.customerEmail || appointment.customer_email,
        startTime,
        endTime,
        purpose: appointment.purpose,
        notes: appointment.notes,
        confirmationCode: appointment.confirmationCode || appointment.confirmation_code,
        timezone: 'America/New_York'
      };

      const googleEvent = await googleCalendarService.createEvent(clientId, eventDetails);

      logger.info(`[DualCal] Google Calendar event created: ${googleEvent.googleEventId} for appointment ${appointment.id}`);

      // Update appointment with Google event ID
      if (appointment.id) {
        await sequelize.query(
          `UPDATE appointments SET google_event_id = :googleEventId, updated_at = NOW() WHERE id = :appointmentId`,
          {
            replacements: {
              googleEventId: googleEvent.googleEventId,
              appointmentId: appointment.id
            },
            type: QueryTypes.UPDATE
          }
        );
      }

      return googleEvent;

    } catch (error) {
      logger.error(`[DualCal] Google Calendar sync error: ${error.message}`);
      return null;
    }
  }

  /**
   * Build human-readable result message
   */
  buildResultMessage(ghlActive, googleActive, zohoActive) {
    const parts = ['RinglyPro'];
    if (ghlActive) parts.push('GHL');
    if (googleActive) parts.push('Google Calendar');
    if (zohoActive) parts.push('Zoho CRM');
    return `Appointment created in ${parts.join(', ')}`;
  }

  /**
   * Sync appointment to Zoho CRM as an Event
   * @param {number} clientId - Client ID
   * @param {object} appointment - Appointment data (from RinglyPro database)
   * @returns {Promise<object|null>} Zoho event or null
   */
  async syncToZohoCalendar(clientId, appointment) {
    try {
      // Check if Zoho is enabled for creating events
      const zohoStatus = await zohoCalendarService.isZohoCalendarEnabled(clientId);
      if (!zohoStatus.enabled || !zohoStatus.createEvents) {
        logger.info(`[DualCal] Client ${clientId}: Zoho event creation not enabled`);
        return null;
      }

      // Parse appointment date and time
      const appointmentDate = appointment.appointmentDate || appointment.appointment_date;
      const appointmentTime = appointment.appointmentTime || appointment.appointment_time;
      const duration = appointment.duration || 60;

      const startTime = new Date(`${appointmentDate}T${appointmentTime}`);
      const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

      const eventResult = await zohoCalendarService.createEvent(clientId, {
        appointmentId: appointment.id,
        title: appointment.purpose || 'RinglyPro Appointment',
        customerName: appointment.customerName || appointment.customer_name,
        customerPhone: appointment.customerPhone || appointment.customer_phone,
        customerEmail: appointment.customerEmail || appointment.customer_email,
        startTime,
        endTime,
        duration,
        purpose: appointment.purpose,
        description: appointment.notes,
        confirmationCode: appointment.confirmationCode || appointment.confirmation_code
      });

      if (eventResult.success) {
        logger.info(`[DualCal] Zoho event created: ${eventResult.event.id} for appointment ${appointment.id}`);
        return eventResult.event;
      }

      logger.warn(`[DualCal] Zoho event creation failed: ${eventResult.error}`);
      return null;

    } catch (error) {
      logger.error(`[DualCal] Zoho Calendar sync error: ${error.message}`);
      return null;
    }
  }

  /**
   * Create appointment in BOTH RinglyPro and GHL (if dual mode enabled), plus Google Calendar and Zoho
   * @param {number} clientId - Client ID
   * @param {object} appointmentData - Appointment details
   * @returns {Promise<object>} { success, ringlyProAppointment, ghlAppointment, googleEvent, zohoEvent, dualModeActive }
   */
  async createDualAppointment(clientId, appointmentData) {
    try {
      const dualMode = await this.isDualModeEnabled(clientId);

      let ghlAppointmentId = null;
      let ghlContactId = null;
      let ghlResult = null;

      // If GHL dual mode is ON, create in GHL first
      if (dualMode.enabled) {
        logger.info(`[DualCal] Client ${clientId}: GHL dual mode ON, creating in GHL first`);

        ghlResult = await ghlBookingService.bookFromWhatsApp(clientId, {
          customerName: appointmentData.customerName,
          customerPhone: appointmentData.customerPhone,
          customerEmail: appointmentData.customerEmail,
          date: appointmentData.appointmentDate,
          time: appointmentData.appointmentTime.substring(0, 5), // HH:MM format
          service: appointmentData.purpose || 'Appointment',
          calendarId: dualMode.calendarId,
          notes: appointmentData.notes
        });

        if (ghlResult.success) {
          ghlAppointmentId = ghlResult.appointment?.id;
          ghlContactId = ghlResult.contact?.id;
          logger.info(`[DualCal] GHL appointment created: ${ghlAppointmentId}`);
        } else {
          logger.warn(`[DualCal] GHL booking failed: ${ghlResult.error}`);
          // Continue to create RinglyPro appointment anyway
        }
      }

      // Create in RinglyPro database
      const ringlyProAppointment = await this.createRinglyProAppointment(clientId, {
        ...appointmentData,
        ghlAppointmentId,
        ghlContactId,
        notes: dualMode.enabled
          ? `${appointmentData.notes || ''}\n[Dual Calendar: Synced to GHL]`.trim()
          : appointmentData.notes
      });

      // Sync to Google Calendar (if enabled for this client, excludes Client 32)
      let googleEvent = null;
      if (clientId !== 32) {
        googleEvent = await this.syncToGoogleCalendar(clientId, ringlyProAppointment);
      }

      // Sync to Zoho CRM (if enabled)
      let zohoEvent = null;
      zohoEvent = await this.syncToZohoCalendar(clientId, ringlyProAppointment);

      return {
        success: true,
        ringlyProAppointment,
        ghlAppointment: ghlResult?.appointment || null,
        ghlContact: ghlResult?.contact || null,
        googleEvent,
        zohoEvent,
        dualModeActive: dualMode.enabled,
        googleCalendarActive: !!googleEvent,
        zohoCalendarActive: !!zohoEvent,
        message: this.buildResultMessage(dualMode.enabled, !!googleEvent, !!zohoEvent)
      };

    } catch (error) {
      logger.error(`[DualCal] Dual appointment creation error: ${error.message}`);
      logger.error(`[DualCal] Error stack: ${error.stack}`);
      if (error.name === 'SequelizeValidationError') {
        logger.error(`[DualCal] Validation errors: ${error.errors?.map(e => e.message).join(', ')}`);
      }
      return {
        success: false,
        error: error.name === 'SequelizeValidationError'
          ? `Validation error: ${error.errors?.map(e => e.message).join(', ')}`
          : error.message,
        dualModeActive: false,
        googleCalendarActive: false,
        zohoCalendarActive: false
      };
    }
  }

  /**
   * Check if a specific slot is available in both systems
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {string} time - Time (HH:MM:SS)
   * @returns {Promise<object>} { available, ringlyProAvailable, ghlAvailable }
   */
  async isSlotAvailable(clientId, date, time) {
    // Normalize time to HH:MM:SS format
    const normalizedTime = time.length === 5 ? `${time}:00` : time;

    // Use getCombinedAvailability which checks ALL calendar sources (RinglyPro, GHL, Google, Zoho)
    const availability = await this.getCombinedAvailability(clientId, date, {
      businessHours: { start: 9, end: 17, slotDuration: 60 }
    });

    const slotAvailable = availability.availableSlots.includes(normalizedTime);

    logger.info(`[DualCal] isSlotAvailable: ${date} ${normalizedTime} = ${slotAvailable} (available slots: ${availability.availableSlots.length})`);

    return {
      available: slotAvailable,
      ringlyProAvailable: availability.ringlyProSlots.includes(normalizedTime),
      ghlAvailable: availability.ghlSlots.length > 0 ? availability.ghlSlots.includes(normalizedTime) : null,
      googleBlocked: availability.googleBlockedSlots.includes(normalizedTime),
      zohoBlocked: availability.zohoBlockedSlots.includes(normalizedTime),
      dualModeActive: availability.dualModeActive,
      googleCalendarActive: availability.googleCalendarActive,
      zohoCalendarActive: availability.zohoCalendarActive
    };
  }
}

module.exports = new DualCalendarService();
