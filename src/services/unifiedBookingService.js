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
          settings, deposit_required, deposit_amount
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
      // Check both dedicated columns AND settings JSON for CRM config
      if (system === 'none' || !system) {
        if (client.hubspot_api_key) {
          system = 'hubspot';
        } else if (client.ghl_api_key && client.ghl_location_id) {
          system = 'ghl';
        } else if (client.settings?.integration?.ghl?.enabled &&
                   (client.settings?.integration?.ghl?.apiKey || client.settings?.integration?.ghl?.locationId)) {
          // Fallback: Check settings JSON for GHL config (handles cases where dedicated columns not set)
          system = 'ghl';
          logger.info(`[UNIFIED-BOOKING] Client ${clientId} GHL detected from settings JSON`);
        } else if (client.settings?.integration?.vagaro?.enabled) {
          system = 'vagaro';
        }
      }

      // Debug logging for CRM detection
      logger.info(`[UNIFIED-BOOKING] Client ${clientId} CRM detection: booking_system=${client.booking_system || 'NULL'}, ghl_api_key=${client.ghl_api_key ? 'SET' : 'NULL'}, ghl_location_id=${client.ghl_location_id || 'NULL'}, settings.ghl.enabled=${client.settings?.integration?.ghl?.enabled || false}`);

      // Get credentials based on system
      if (system === 'hubspot') {
        credentials = {
          accessToken: client.hubspot_api_key,
          meetingSlug: client.hubspot_meeting_slug,
          timezone: client.hubspot_timezone || client.timezone || 'America/New_York'
        };
      } else if (system === 'ghl') {
        // Get GHL credentials from dedicated columns OR settings JSON
        const ghlSettings = client.settings?.integration?.ghl || {};
        credentials = {
          apiKey: client.ghl_api_key || ghlSettings.apiKey,
          locationId: client.ghl_location_id || ghlSettings.locationId,
          calendarId: ghlSettings.calendarId,  // Calendar ID is always in settings
          timezone: client.timezone || 'America/New_York'
        };
        logger.info(`[UNIFIED-BOOKING] GHL credentials: apiKey=${credentials.apiKey ? 'SET' : 'NULL'}, locationId=${credentials.locationId || 'NULL'}, calendarId=${credentials.calendarId || 'NULL'}`);
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

      logger.info(`[UNIFIED-BOOKING] Client ${clientId} final config: system=${system}, hasCredentials=${!!credentials}`);

      return {
        clientId,
        businessName: client.business_name,
        system,
        credentials,
        timezone: client.timezone || 'America/New_York',
        settings: client.settings,
        depositRequired: client.deposit_required || false,
        depositAmount: client.deposit_amount
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
          // Get GHL calendar slots
          try {
            const ghlCalendarId = await this.getGHLCalendarId(clientId, config);
            if (ghlCalendarId) {
              const ghlSlots = await ghlBookingService.getAvailableSlots(clientId, ghlCalendarId, date);
              if (ghlSlots.success && ghlSlots.slots?.length > 0) {
                logger.info(`[UNIFIED-BOOKING] GHL returned ${ghlSlots.slots.length} slots for ${date}`);
                return { ...ghlSlots, source: 'ghl' };
              }
            }
            logger.info('[UNIFIED-BOOKING] GHL slots unavailable, using local');
          } catch (ghlError) {
            logger.warn(`[UNIFIED-BOOKING] GHL slots error: ${ghlError.message}, using local`);
          }
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

      // ============================================================
      // TEMPORARY: Route ALL bookings to local RinglyPro calendar
      // CRM integrations (GHL, HubSpot, Vagaro) are temporarily disabled
      // This will be re-enabled once CRM booking issues are resolved
      // ============================================================
      const USE_LOCAL_ONLY = true;

      if (USE_LOCAL_ONLY) {
        logger.info('[UNIFIED-BOOKING] 🔄 TEMPORARY: Using local RinglyPro calendar for all bookings');
        localResult = await this.saveLocalAppointment(clientId, bookingData, 'local', null);

        if (localResult?.appointmentId) {
          return {
            success: true,
            system: 'local',
            localAppointmentId: localResult.appointmentId,
            confirmationCode: localResult.confirmationCode,
            message: 'Appointment booked in RinglyPro Calendar'
          };
        } else {
          return {
            success: false,
            error: 'Failed to save appointment locally'
          };
        }
      }

      // Route to appropriate CRM (currently disabled)
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
          try {
            // Get GHL calendar ID from settings or fetch first available
            const ghlCalendarId = await this.getGHLCalendarId(clientId, config);

            if (!ghlCalendarId) {
              logger.warn('[UNIFIED-BOOKING] No GHL calendar found, falling back to local');
              break; // Fall through to local booking
            }

            crmResult = await ghlBookingService.bookFromWhatsApp(clientId, {
              customerName,
              customerPhone,
              customerEmail: customerEmail || `${customerPhone.replace(/\D/g, '')}@voice.booking`,
              date,
              time,
              service: service || 'Voice Booking',
              calendarId: ghlCalendarId,
              notes: notes || `Booked via ${source}\nCustomer: ${customerName}\nPhone: ${customerPhone}`
            });

            if (crmResult.success) {
              logger.info(`[UNIFIED-BOOKING] GHL booking SUCCESS: appointmentId=${crmResult.appointment?.id}`);
              // GHL bookFromWhatsApp already saves to local DB, so we don't need to save again
              return {
                success: true,
                system: 'ghl',
                appointmentId: crmResult.appointment?.id,
                contactId: crmResult.contact?.id,
                localAppointmentId: crmResult.localAppointment?.id,
                confirmationCode: crmResult.localAppointment?.confirmation_code || `GHL${Date.now().toString().slice(-6).toUpperCase()}`,
                message: 'Appointment booked in GoHighLevel'
              };
            } else {
              logger.warn(`[UNIFIED-BOOKING] GHL booking FAILED: ${crmResult.error}`);
              // Fall through to local booking
            }
          } catch (ghlError) {
            logger.error('[UNIFIED-BOOKING] GHL booking error:', ghlError.message);
            // Fall through to local booking
          }
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
   * @param {object} clientConfig - Client configuration (optional, will be fetched if not provided)
   * @returns {Promise<object>} Local save result
   */
  async saveLocalAppointment(clientId, bookingData, crmSource, externalId, clientConfig = null) {
    try {
      const confirmationCode = this.generateConfirmationCode();

      // Get client config if not provided (to check deposit_required)
      const config = clientConfig || await this.getClientBookingConfig(clientId);
      const depositRequired = config?.depositRequired || false;

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

      // Determine deposit status based on client configuration
      const depositStatus = depositRequired ? 'pending' : 'not_required';
      if (depositRequired) {
        logger.info(`[UNIFIED-BOOKING] Client ${clientId} requires deposits - marking as pending`);
      }

      // Map source values to valid PostgreSQL ENUM values
      // The DB ENUM has: web, phone, rachel_voice_ai, manual, api, ghl_sync, hubspot_sync, vagaro_sync
      // Our app uses: voice_booking, voice_booking_spanish, whatsapp, etc.
      const sourceMapping = {
        'voice_booking': 'rachel_voice_ai',
        'voice_booking_spanish': 'rachel_voice_ai',
        'whatsapp': 'api',
        'whatsapp_ghl': 'ghl_sync',
        'whatsapp_hubspot': 'hubspot_sync',
        'whatsapp_vagaro': 'vagaro_sync',
        'online': 'web',
        'walk-in': 'manual'
      };
      const dbSource = sourceMapping[source] || source || 'manual';
      logger.info(`[UNIFIED-BOOKING] Source mapping: ${source} -> ${dbSource}`);

      // Insert appointment
      // Use SELECT query type to properly get RETURNING results from PostgreSQL
      // Note: Using 'scheduled' status (exists in original ENUM: scheduled, confirmed, completed, cancelled, no_show)
      const insertResult = await sequelize.query(
        `INSERT INTO appointments (
          client_id, customer_name, customer_phone, customer_email,
          appointment_date, appointment_time, duration, purpose,
          status, source, confirmation_code,
          hubspot_meeting_id, ghl_appointment_id, vagaro_appointment_id,
          deposit_status,
          created_at, updated_at
        ) VALUES (
          :clientId, :customerName, :customerPhone, :customerEmail,
          :date, :time, :duration, :purpose,
          'scheduled', :source, :confirmationCode,
          :hubspotId, :ghlId, :vagaroId,
          :depositStatus,
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
            source: dbSource,  // Use mapped source that exists in PostgreSQL ENUM
            confirmationCode,
            hubspotId: crmSource === 'hubspot' ? externalId : null,
            ghlId: crmSource === 'ghl' ? externalId : null,
            vagaroId: crmSource === 'vagaro' ? externalId : null,
            depositStatus
          },
          type: QueryTypes.SELECT  // Use SELECT to properly parse RETURNING results
        }
      );

      // PostgreSQL RETURNING with SELECT type returns array directly
      const appointmentId = insertResult?.[0]?.id;
      logger.info(`[UNIFIED-BOOKING] Local appointment saved: ID=${appointmentId}, code=${confirmationCode}, depositStatus=${depositStatus}`);
      logger.info(`[UNIFIED-BOOKING] INSERT result: ${JSON.stringify(insertResult)}`);

      // Even if we couldn't get the ID back (rare), the appointment was still created
      // Return success with confirmation code which is what matters for the customer
      if (!appointmentId) {
        logger.warn(`[UNIFIED-BOOKING] Appointment created but ID not returned - using confirmation code ${confirmationCode}`);
      }

      return {
        success: true,
        appointmentId: appointmentId || confirmationCode,  // Fallback to confirmation code if no ID
        confirmationCode,
        depositStatus,
        depositRequired
      };

    } catch (error) {
      logger.error('[UNIFIED-BOOKING] Error saving local appointment:', error.message);
      logger.error('[UNIFIED-BOOKING] Full error:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
      logger.error('[UNIFIED-BOOKING] Booking data:', JSON.stringify(bookingData));
      // Log Sequelize validation errors specifically
      if (error.errors) {
        error.errors.forEach(e => {
          logger.error(`[UNIFIED-BOOKING] Validation: ${e.path} - ${e.message} (value: ${e.value})`);
        });
      }
      // Log SQL error if available
      if (error.parent) {
        logger.error(`[UNIFIED-BOOKING] SQL Error: ${error.parent.message}`);
        logger.error(`[UNIFIED-BOOKING] SQL Detail: ${error.parent.detail || 'none'}`);
      }
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get GHL calendar ID for a client
   * Checks settings first, then fetches from GHL API
   * @param {number} clientId - Client ID
   * @param {object} config - Client booking config
   * @returns {Promise<string|null>} Calendar ID or null
   */
  async getGHLCalendarId(clientId, config) {
    try {
      // Check if calendar ID is stored in settings
      if (config?.settings?.integration?.ghl?.calendarId) {
        logger.info(`[UNIFIED-BOOKING] Using stored GHL calendar: ${config.settings.integration.ghl.calendarId}`);
        return config.settings.integration.ghl.calendarId;
      }

      // Try to get calendars from GHL and pick the best one
      const calendarsResult = await ghlBookingService.getCalendars(clientId);

      if (calendarsResult.success && calendarsResult.calendars?.length > 0) {
        // Prefer calendar with "RinglyPro" or "Booking" in name
        const preferredCalendar = calendarsResult.calendars.find(c =>
          c.name?.toLowerCase().includes('ringlypro') ||
          c.name?.toLowerCase().includes('booking') ||
          c.name?.toLowerCase().includes('onboarding')
        );

        const calendarId = preferredCalendar?.id || calendarsResult.calendars[0].id;
        logger.info(`[UNIFIED-BOOKING] Selected GHL calendar: ${calendarId} (${preferredCalendar?.name || calendarsResult.calendars[0].name})`);
        return calendarId;
      }

      logger.warn(`[UNIFIED-BOOKING] No GHL calendars found for client ${clientId}`);
      return null;
    } catch (error) {
      logger.error(`[UNIFIED-BOOKING] Error getting GHL calendar: ${error.message}`);
      return null;
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
