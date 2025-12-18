/**
 * Unified Booking Service
 *
 * CRM-AGNOSTIC booking service that routes appointments to the correct system
 * based on client configuration.
 *
 * KEY PRINCIPLE: WhatsApp booking logic is the canonical flow.
 * Voice booking (Rachel) MUST use this same service.
 *
 * Routing Logic:
 * 1. Check client's booking_system column (hubspot, ghl, vagaro, none)
 * 2. Check client's settings.integration for CRM config
 * 3. Route to appropriate CRM booking service
 * 4. Fallback to local RinglyPro calendar if no CRM configured
 *
 * Supported CRMs:
 * - HubSpot: Uses hubspotBookingService.bookFromWhatsApp()
 * - GoHighLevel: Uses ghlBookingService (TBD)
 * - Vagaro: Uses vagaroService (salon/spa)
 * - None: Uses local Appointment model
 */

const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const logger = require('../utils/logger');

// Import CRM-specific booking services
const hubspotBookingService = require('./hubspotBookingService');
const ghlBookingService = require('./ghlBookingService');
const vagaroService = require('./vagaroService');

// Local appointment model
let Appointment;
try {
  const models = require('../models');
  Appointment = models.Appointment;
} catch (error) {
  logger.warn('[UNIFIED-BOOKING] Appointment model not available:', error.message);
}

class UnifiedBookingService {
  /**
   * Get client's CRM configuration
   * Determines which booking system to use
   * @param {number} clientId - Client ID
   * @returns {Promise<object>} CRM config { system, credentials, timezone }
   */
  async getClientBookingConfig(clientId) {
    try {
      const result = await sequelize.query(
        `SELECT
          id, business_name, booking_system, timezone,
          ghl_api_key, ghl_location_id,
          hubspot_api_key, hubspot_meeting_slug, hubspot_timezone,
          settings
         FROM clients WHERE id = :clientId`,
        {
          replacements: { clientId },
          type: QueryTypes.SELECT
        }
      );

      if (!result || result.length === 0) {
        logger.error(`[UNIFIED-BOOKING] Client ${clientId} not found`);
        return null;
      }

      const client = result[0];

      // Determine booking system priority:
      // 1. Explicit booking_system column
      // 2. Check for HubSpot credentials
      // 3. Check for GHL credentials
      // 4. Check for Vagaro in settings
      // 5. Default to local (none)

      let system = client.booking_system || 'none';
      let credentials = null;

      // If no explicit system set, detect from credentials
      if (system === 'none' || !system) {
        if (client.hubspot_api_key) {
          system = 'hubspot';
        } else if (client.ghl_api_key && client.ghl_location_id) {
          system = 'ghl';
        } else if (client.settings?.integration?.vagaro?.enabled) {
          system = 'vagaro';
        }
      }

      // Get credentials based on system
      if (system === 'hubspot') {
        credentials = {
          accessToken: client.hubspot_api_key,
          meetingSlug: client.hubspot_meeting_slug,
          timezone: client.hubspot_timezone || client.timezone || 'America/New_York'
        };
      } else if (system === 'ghl') {
        credentials = {
          apiKey: client.ghl_api_key,
          locationId: client.ghl_location_id,
          timezone: client.timezone || 'America/New_York'
        };
      } else if (system === 'vagaro') {
        const vagaroSettings = client.settings?.integration?.vagaro || {};
        credentials = {
          clientId: vagaroSettings.clientId,
          clientSecretKey: vagaroSettings.clientSecretKey,
          merchantId: vagaroSettings.merchantId,
          region: vagaroSettings.region || 'us01',
          timezone: client.timezone || 'America/New_York'
        };
      }

      logger.info(`[UNIFIED-BOOKING] Client ${clientId} config: system=${system}, hasCredentials=${!!credentials}`);

      return {
        clientId,
        businessName: client.business_name,
        system,
        credentials,
        timezone: client.timezone || 'America/New_York',
        settings: client.settings
      };

    } catch (error) {
      logger.error('[UNIFIED-BOOKING] Error getting client config:', error.message);
      return null;
    }
  }

  /**
   * Get available slots for a date
   * Routes to appropriate CRM or generates local slots
   * @param {number} clientId - Client ID
   * @param {string} date - Date string (YYYY-MM-DD)
   * @returns {Promise<object>} { success, slots, source }
   */
  async getAvailableSlots(clientId, date) {
    const config = await this.getClientBookingConfig(clientId);
    if (!config) {
      return { success: false, error: 'Client not found', slots: [] };
    }

    logger.info(`[UNIFIED-BOOKING] Getting slots for client ${clientId}, system=${config.system}, date=${date}`);

    try {
      switch (config.system) {
        case 'hubspot':
          const hsSlots = await hubspotBookingService.getAvailableSlots(clientId, date);
          return { ...hsSlots, source: 'hubspot' };

        case 'ghl':
          // GHL booking service would go here
          // For now, fall through to local slots
          logger.info('[UNIFIED-BOOKING] GHL slots not implemented, using local');
          return await this.getLocalAvailableSlots(clientId, date, config.timezone);

        case 'vagaro':
          // Vagaro availability check
          if (config.credentials?.merchantId) {
            try {
              const vagaroSlots = await vagaroService.searchAppointmentAvailability(
                config.credentials,
                { date, locationId: null }
              );
              return { success: true, slots: vagaroSlots || [], source: 'vagaro' };
            } catch (vErr) {
              logger.error('[UNIFIED-BOOKING] Vagaro slots error:', vErr.message);
            }
          }
          return await this.getLocalAvailableSlots(clientId, date, config.timezone);

        default:
          // Local slots
          return await this.getLocalAvailableSlots(clientId, date, config.timezone);
      }
    } catch (error) {
      logger.error(`[UNIFIED-BOOKING] Error getting slots: ${error.message}`);
      return await this.getLocalAvailableSlots(clientId, date, config.timezone);
    }
  }

  /**
   * Get locally available slots (check against appointments table)
   * @param {number} clientId - Client ID
   * @param {string} date - Date (YYYY-MM-DD)
   * @param {string} timezone - Timezone
   * @returns {Promise<object>} Available slots
   */
  async getLocalAvailableSlots(clientId, date, timezone = 'America/New_York') {
    try {
      // Business hours slots
      const businessHours = [
        '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
        '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
        '15:00', '15:30', '16:00', '16:30', '17:00'
      ];

      // Get booked times for this date
      const bookedResult = await sequelize.query(
        `SELECT appointment_time FROM appointments
         WHERE client_id = :clientId
         AND appointment_date = :date
         AND status IN ('confirmed', 'pending', 'scheduled')`,
        {
          replacements: { clientId, date },
          type: QueryTypes.SELECT
        }
      );

      const bookedTimes = bookedResult.map(r => r.appointment_time?.substring(0, 5));

      // Filter available slots
      const availableSlots = businessHours
        .filter(time => !bookedTimes.includes(time))
        .map(time => ({
          startTime: `${date}T${time}:00`,
          time24: time,
          timezone
        }));

      logger.info(`[UNIFIED-BOOKING] Local slots for ${date}: ${availableSlots.length}/${businessHours.length} available`);

      return {
        success: true,
        slots: availableSlots,
        source: 'local'
      };

    } catch (error) {
      logger.error('[UNIFIED-BOOKING] Error getting local slots:', error.message);
      return { success: false, error: error.message, slots: [], source: 'local' };
    }
  }

  /**
   * Book appointment - routes to appropriate CRM
   * This is the main method Rachel should call
   *
   * @param {number} clientId - Client ID
   * @param {object} bookingData - Appointment data
   * @param {string} bookingData.customerName - Customer name
   * @param {string} bookingData.customerPhone - Customer phone
   * @param {string} bookingData.customerEmail - Customer email (optional)
   * @param {string} bookingData.date - Appointment date (YYYY-MM-DD)
   * @param {string} bookingData.time - Appointment time (HH:mm or HH:mm:ss)
   * @param {string} bookingData.service - Service/purpose (optional)
   * @param {string} bookingData.notes - Additional notes (optional)
   * @param {string} bookingData.source - Booking source (voice_booking, whatsapp, etc.)
   * @returns {Promise<object>} Booking result
   */
  async bookAppointment(clientId, bookingData) {
    const config = await this.getClientBookingConfig(clientId);
    if (!config) {
      return { success: false, error: 'Client not found' };
    }

    const {
      customerName,
      customerPhone,
      customerEmail,
      date,
      time,
      service,
      notes,
      source = 'voice_booking'
    } = bookingData;

    logger.info(`[UNIFIED-BOOKING] Booking for client ${clientId}:`);
    logger.info(`  System: ${config.system}`);
    logger.info(`  Customer: ${customerName} (${customerPhone})`);
    logger.info(`  DateTime: ${date} ${time}`);
    logger.info(`  Source: ${source}`);

    try {
      let crmResult = null;
      let localResult = null;

      // Route to appropriate CRM
      switch (config.system) {
        case 'hubspot':
          logger.info('[UNIFIED-BOOKING] Routing to HubSpot...');
          crmResult = await hubspotBookingService.bookFromWhatsApp(clientId, {
            customerName,
            customerPhone,
            customerEmail: customerEmail || `${customerPhone.replace(/\D/g, '')}@voice.booking`,
            date,
            time,
            service: service || 'Voice Booking',
            notes: notes || `Booked via ${source}\nCustomer: ${customerName}\nPhone: ${customerPhone}`
          });

          if (crmResult.success) {
            logger.info(`[UNIFIED-BOOKING] HubSpot booking SUCCESS: meetingId=${crmResult.meetingId}`);
            // Also save to local for tracking
            localResult = await this.saveLocalAppointment(clientId, bookingData, 'hubspot', crmResult.meetingId);
            return {
              success: true,
              system: 'hubspot',
              meetingId: crmResult.meetingId,
              meetingLink: crmResult.meetingLink,
              contactId: crmResult.contactId,
              localAppointmentId: localResult?.appointmentId,
              confirmationCode: localResult?.confirmationCode,
              message: 'Appointment booked in HubSpot'
            };
          } else {
            logger.warn(`[UNIFIED-BOOKING] HubSpot booking FAILED: ${crmResult.error}`);
            // Fall through to local booking
          }
          break;

        case 'ghl':
          logger.info('[UNIFIED-BOOKING] Routing to GoHighLevel...');
          // GHL booking would go here
          // For now, fall through to local
          logger.info('[UNIFIED-BOOKING] GHL booking not yet implemented, using local');
          break;

        case 'vagaro':
          logger.info('[UNIFIED-BOOKING] Routing to Vagaro...');
          if (config.credentials?.merchantId) {
            try {
              // First find or create customer
              const customerResult = await vagaroService.searchCustomers(config.credentials, {
                phone: customerPhone
              });

              let customerId;
              if (customerResult && customerResult.length > 0) {
                customerId = customerResult[0].id;
              } else {
                const newCustomer = await vagaroService.createCustomer(config.credentials, {
                  firstName: customerName.split(' ')[0],
                  lastName: customerName.split(' ').slice(1).join(' ') || '',
                  phone: customerPhone,
                  email: customerEmail
                });
                customerId = newCustomer?.id;
              }

              if (customerId) {
                const vagaroResult = await vagaroService.createAppointment(config.credentials, {
                  customerId,
                  date,
                  startTime: time,
                  notes: notes || `Booked via ${source}`
                });

                if (vagaroResult?.id) {
                  logger.info(`[UNIFIED-BOOKING] Vagaro booking SUCCESS: ${vagaroResult.id}`);
                  localResult = await this.saveLocalAppointment(clientId, bookingData, 'vagaro', vagaroResult.id);
                  return {
                    success: true,
                    system: 'vagaro',
                    vagaroAppointmentId: vagaroResult.id,
                    localAppointmentId: localResult?.appointmentId,
                    confirmationCode: localResult?.confirmationCode,
                    message: 'Appointment booked in Vagaro'
                  };
                }
              }
            } catch (vErr) {
              logger.error('[UNIFIED-BOOKING] Vagaro booking error:', vErr.message);
            }
          }
          break;
      }

      // Fallback: Save to local database only
      logger.info('[UNIFIED-BOOKING] Using local booking (no CRM or CRM failed)');
      localResult = await this.saveLocalAppointment(clientId, bookingData, 'local', null);

      if (localResult?.success) {
        return {
          success: true,
          system: 'local',
          localAppointmentId: localResult.appointmentId,
          confirmationCode: localResult.confirmationCode,
          message: 'Appointment saved to RinglyPro calendar'
        };
      } else {
        return {
          success: false,
          error: localResult?.error || 'Failed to save appointment',
          system: 'local'
        };
      }

    } catch (error) {
      logger.error('[UNIFIED-BOOKING] Booking error:', error.message);
      return {
        success: false,
        error: error.message,
        system: config.system
      };
    }
  }

  /**
   * Save appointment to local database
   * Used for tracking even when CRM booking succeeds
   * @param {number} clientId - Client ID
   * @param {object} bookingData - Booking data
   * @param {string} crmSource - CRM that was used (hubspot, ghl, vagaro, local)
   * @param {string} externalId - External CRM appointment ID
   * @returns {Promise<object>} Local save result
   */
  async saveLocalAppointment(clientId, bookingData, crmSource, externalId) {
    try {
      const confirmationCode = this.generateConfirmationCode();

      const {
        customerName,
        customerPhone,
        customerEmail,
        date,
        time,
        service,
        notes,
        source = 'voice_booking'
      } = bookingData;

      // Normalize time to HH:mm:ss format
      const normalizedTime = time.length === 5 ? `${time}:00` : time;

      // Check for existing appointment at this slot
      const existingCheck = await sequelize.query(
        `SELECT id FROM appointments
         WHERE client_id = :clientId
         AND appointment_date = :date
         AND appointment_time = :time
         AND status IN ('confirmed', 'pending', 'scheduled')`,
        {
          replacements: { clientId, date, time: normalizedTime },
          type: QueryTypes.SELECT
        }
      );

      if (existingCheck.length > 0) {
        logger.warn(`[UNIFIED-BOOKING] Time slot ${date} ${normalizedTime} already booked locally`);
        return {
          success: false,
          error: 'Time slot already booked',
          slotConflict: true
        };
      }

      // Insert appointment
      const insertResult = await sequelize.query(
        `INSERT INTO appointments (
          client_id, customer_name, customer_phone, customer_email,
          appointment_date, appointment_time, duration, purpose,
          status, source, confirmation_code,
          hubspot_id, ghl_id, vagaro_id,
          created_at, updated_at
        ) VALUES (
          :clientId, :customerName, :customerPhone, :customerEmail,
          :date, :time, :duration, :purpose,
          'confirmed', :source, :confirmationCode,
          :hubspotId, :ghlId, :vagaroId,
          NOW(), NOW()
        ) RETURNING id, confirmation_code`,
        {
          replacements: {
            clientId,
            customerName: customerName || 'Unknown',
            customerPhone: customerPhone || '',
            customerEmail: customerEmail || '',
            date,
            time: normalizedTime,
            duration: 30,
            purpose: service || 'Appointment',
            source: `${source}_${crmSource}`,
            confirmationCode,
            hubspotId: crmSource === 'hubspot' ? externalId : null,
            ghlId: crmSource === 'ghl' ? externalId : null,
            vagaroId: crmSource === 'vagaro' ? externalId : null
          },
          type: QueryTypes.INSERT
        }
      );

      const appointmentId = insertResult[0]?.[0]?.id;
      logger.info(`[UNIFIED-BOOKING] Local appointment saved: ID=${appointmentId}, code=${confirmationCode}`);

      return {
        success: true,
        appointmentId,
        confirmationCode
      };

    } catch (error) {
      logger.error('[UNIFIED-BOOKING] Error saving local appointment:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate confirmation code
   * @returns {string} 6-character alphanumeric code
   */
  generateConfirmationCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars (0, O, 1, I)
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Cancel appointment
   * Cancels in both CRM and local database
   * @param {number} clientId - Client ID
   * @param {number} appointmentId - Local appointment ID
   * @returns {Promise<object>} Cancellation result
   */
  async cancelAppointment(clientId, appointmentId) {
    try {
      // Get appointment details
      const apptResult = await sequelize.query(
        `SELECT * FROM appointments WHERE id = :appointmentId AND client_id = :clientId`,
        {
          replacements: { appointmentId, clientId },
          type: QueryTypes.SELECT
        }
      );

      if (!apptResult || apptResult.length === 0) {
        return { success: false, error: 'Appointment not found' };
      }

      const appointment = apptResult[0];

      // Cancel in CRM if applicable
      if (appointment.hubspot_id) {
        // HubSpot cancellation would go here
        logger.info(`[UNIFIED-BOOKING] Would cancel HubSpot meeting ${appointment.hubspot_id}`);
      } else if (appointment.vagaro_id) {
        try {
          const config = await this.getClientBookingConfig(clientId);
          if (config?.credentials) {
            await vagaroService.cancelAppointment(config.credentials, appointment.vagaro_id);
          }
        } catch (vErr) {
          logger.error('[UNIFIED-BOOKING] Vagaro cancel error:', vErr.message);
        }
      }

      // Update local status
      await sequelize.query(
        `UPDATE appointments SET status = 'cancelled', updated_at = NOW() WHERE id = :appointmentId`,
        {
          replacements: { appointmentId },
          type: QueryTypes.UPDATE
        }
      );

      logger.info(`[UNIFIED-BOOKING] Appointment ${appointmentId} cancelled`);
      return { success: true, message: 'Appointment cancelled' };

    } catch (error) {
      logger.error('[UNIFIED-BOOKING] Cancel error:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new UnifiedBookingService();
