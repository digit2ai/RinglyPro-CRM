/**
 * Dual Calendar Service
 * Handles dual-mode calendar integration for Client 15
 *
 * When GHL toggle is ON:
 *   - Check availability in BOTH RinglyPro database AND GHL calendar
 *   - Book appointments in BOTH systems
 *
 * When GHL toggle is OFF (default):
 *   - Only use RinglyPro database calendar
 *
 * @module dualCalendarService
 */

const axios = require('axios');
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const ghlBookingService = require('./ghlBookingService');

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
   * Get COMBINED availability from both RinglyPro and GHL
   * Only returns slots that are available in BOTH systems
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {object} options - { businessHours, calendarId }
   * @returns {Promise<object>} { availableSlots, ringlyProSlots, ghlSlots, dualModeActive }
   */
  async getCombinedAvailability(clientId, date, options = {}) {
    const { businessHours = { start: 9, end: 17, slotDuration: 60 }, calendarId } = options;

    try {
      // Check if dual mode is enabled
      const dualMode = await this.isDualModeEnabled(clientId);

      // Get RinglyPro availability
      const ringlyProSlots = await this.getRinglyProAvailability(clientId, date, businessHours);

      if (!dualMode.enabled) {
        // Dual mode OFF - only use RinglyPro
        logger.info(`[DualCal] Client ${clientId}: Dual mode OFF, using RinglyPro only`);
        return {
          availableSlots: ringlyProSlots,
          ringlyProSlots,
          ghlSlots: [],
          dualModeActive: false,
          source: 'ringlypro_only'
        };
      }

      // Dual mode ON - get GHL availability too
      const effectiveCalendarId = calendarId || dualMode.calendarId;
      const ghlSlots = await this.getGHLAvailability(clientId, date, effectiveCalendarId);

      // Find intersection - slots available in BOTH systems
      const combinedSlots = ringlyProSlots.filter(slot => ghlSlots.includes(slot));

      logger.info(`[DualCal] Client ${clientId}: Combined availability: ${combinedSlots.length} slots (RP: ${ringlyProSlots.length}, GHL: ${ghlSlots.length})`);

      return {
        availableSlots: combinedSlots,
        ringlyProSlots,
        ghlSlots,
        dualModeActive: true,
        source: 'dual_calendar'
      };
    } catch (error) {
      logger.error(`[DualCal] Combined availability error: ${error.message}`);

      // Fallback to RinglyPro only on error
      const ringlyProSlots = await this.getRinglyProAvailability(clientId, date, businessHours);
      return {
        availableSlots: ringlyProSlots,
        ringlyProSlots,
        ghlSlots: [],
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
        'confirmed', 'dashboard', :confirmationCode, :notes,
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
   * Create appointment in BOTH RinglyPro and GHL (if dual mode enabled)
   * @param {number} clientId - Client ID
   * @param {object} appointmentData - Appointment details
   * @returns {Promise<object>} { success, ringlyProAppointment, ghlAppointment, dualModeActive }
   */
  async createDualAppointment(clientId, appointmentData) {
    try {
      const dualMode = await this.isDualModeEnabled(clientId);

      let ghlAppointmentId = null;
      let ghlContactId = null;
      let ghlResult = null;

      // If dual mode is ON, create in GHL first
      if (dualMode.enabled) {
        logger.info(`[DualCal] Client ${clientId}: Dual mode ON, creating in GHL first`);

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

      return {
        success: true,
        ringlyProAppointment,
        ghlAppointment: ghlResult?.appointment || null,
        ghlContact: ghlResult?.contact || null,
        dualModeActive: dualMode.enabled,
        message: dualMode.enabled
          ? 'Appointment created in both RinglyPro and GHL'
          : 'Appointment created in RinglyPro'
      };

    } catch (error) {
      logger.error(`[DualCal] Dual appointment creation error: ${error.message}`);
      return {
        success: false,
        error: error.message,
        dualModeActive: false
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
    const dualMode = await this.isDualModeEnabled(clientId);

    // Check RinglyPro
    const rpSlots = await this.getRinglyProAvailability(clientId, date);
    const ringlyProAvailable = rpSlots.includes(time);

    if (!dualMode.enabled) {
      return {
        available: ringlyProAvailable,
        ringlyProAvailable,
        ghlAvailable: null,
        dualModeActive: false
      };
    }

    // Check GHL
    const ghlSlots = await this.getGHLAvailability(clientId, date, dualMode.calendarId);
    const ghlAvailable = ghlSlots.includes(time);

    return {
      available: ringlyProAvailable && ghlAvailable,
      ringlyProAvailable,
      ghlAvailable,
      dualModeActive: true
    };
  }
}

module.exports = new DualCalendarService();
