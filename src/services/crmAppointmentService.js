/**
 * CRM Appointment Service
 * Unified service for fetching and syncing appointments from all integrated CRMs
 * (GHL, HubSpot, Vagaro) to the RinglyPro dashboard
 */

const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const ghlBookingService = require('./ghlBookingService');
const hubspotBookingService = require('./hubspotBookingService');
const vagaroService = require('./vagaroService');
const zohoCalendarService = require('./zohoCalendarService');

/**
 * Get enabled CRM integrations for a client
 * @param {number} clientId - Client ID
 * @returns {Promise<object>} Object with enabled flags for each CRM
 */
async function getEnabledIntegrations(clientId) {
  try {
    const result = await sequelize.query(
      `SELECT
        ghl_api_key,
        hubspot_api_key,
        booking_system,
        settings->'integration' as integration_settings,
        settings->'vagaro' as vagaro_settings
       FROM clients
       WHERE id = :clientId`,
      {
        replacements: { clientId },
        type: QueryTypes.SELECT
      }
    );

    if (!result.length) {
      return { ghl: false, hubspot: false, vagaro: false };
    }

    const client = result[0];
    const integrationSettings = client.integration_settings || {};
    const ghlSettings = integrationSettings.ghl || {};

    // Check GHL - has API key from dedicated column OR settings JSON
    // The API key can be stored in either location
    const hasGhlApiKey = !!(client.ghl_api_key || ghlSettings.apiKey);
    const ghlEnabled = hasGhlApiKey && (ghlSettings.enabled !== false);

    logger.info(`[CRM Sync] Client ${clientId} GHL check: ghl_api_key=${client.ghl_api_key ? 'SET' : 'NULL'}, settings.ghl.apiKey=${ghlSettings.apiKey ? 'SET' : 'NULL'}, enabled=${ghlSettings.enabled}, result=${ghlEnabled}`);

    // Check HubSpot - DISABLED (we only use GHL now)
    // const hubspotEnabled = !!(
    //   client.hubspot_api_key &&
    //   (integrationSettings.hubspot?.enabled !== false)
    // );
    const hubspotEnabled = false; // HubSpot integration disabled - using GHL only

    // Check Vagaro - has credentials configured
    const vagaroSettings = client.vagaro_settings || integrationSettings.vagaro || {};
    const vagaroEnabled = vagaroService.isConfigured({
      clientId: vagaroSettings.clientId,
      clientSecretKey: vagaroSettings.clientSecretKey,
      merchantId: vagaroSettings.merchantId
    });

    return { ghl: ghlEnabled, hubspot: hubspotEnabled, vagaro: vagaroEnabled };
  } catch (error) {
    logger.error(`[CRM Sync] Error checking integrations: ${error.message}`);
    return { ghl: false, hubspot: false, vagaro: false };
  }
}

/**
 * Get Vagaro credentials for a client
 * @param {number} clientId - Client ID
 * @returns {Promise<object|null>} Vagaro credentials or null
 */
async function getVagaroCredentials(clientId) {
  try {
    const result = await sequelize.query(
      `SELECT
        settings->'vagaro' as vagaro_settings,
        settings->'integration'->'vagaro' as vagaro_integration
       FROM clients
       WHERE id = :clientId`,
      {
        replacements: { clientId },
        type: QueryTypes.SELECT
      }
    );

    if (!result.length) return null;

    const vagaro = result[0].vagaro_settings || result[0].vagaro_integration || {};
    if (!vagaro.clientId || !vagaro.clientSecretKey || !vagaro.merchantId) {
      return null;
    }

    return {
      clientId: vagaro.clientId,
      clientSecretKey: vagaro.clientSecretKey,
      merchantId: vagaro.merchantId,
      region: vagaro.region || 'us01'
    };
  } catch (error) {
    logger.error(`[Vagaro] Error getting credentials: ${error.message}`);
    return null;
  }
}

/**
 * Fetch appointments from all enabled CRMs
 * @param {number} clientId - Client ID
 * @param {string} startDate - Start date (YYYY-MM-DD)
 * @param {string} endDate - End date (YYYY-MM-DD)
 * @returns {Promise<object>} Combined appointments from all CRMs
 */
async function fetchAllCRMAppointments(clientId, startDate, endDate) {
  const integrations = await getEnabledIntegrations(clientId);
  const results = {
    ghl: { success: false, appointments: [], error: null },
    hubspot: { success: false, appointments: [], error: null },
    vagaro: { success: false, appointments: [], error: null }
  };

  const promises = [];

  // Fetch from GHL
  if (integrations.ghl) {
    promises.push(
      ghlBookingService.getAppointments(clientId, startDate, endDate)
        .then(result => {
          results.ghl = {
            success: result.success,
            appointments: result.appointments || [],
            error: result.error || null
          };
        })
        .catch(err => {
          results.ghl.error = err.message;
          logger.error(`[CRM Sync] GHL fetch error: ${err.message}`);
        })
    );
  }

  // Fetch from HubSpot
  if (integrations.hubspot) {
    promises.push(
      hubspotBookingService.getMeetings(clientId, startDate, endDate)
        .then(result => {
          results.hubspot = {
            success: result.success,
            appointments: result.meetings || [],
            error: result.error || null
          };
        })
        .catch(err => {
          results.hubspot.error = err.message;
          logger.error(`[CRM Sync] HubSpot fetch error: ${err.message}`);
        })
    );
  }

  // Fetch from Vagaro
  if (integrations.vagaro) {
    const vagaroCredentials = await getVagaroCredentials(clientId);
    if (vagaroCredentials) {
      promises.push(
        vagaroService.getAppointments(vagaroCredentials, { startDate, endDate })
          .then(appointments => {
            // Map Vagaro appointments to standardized format
            const mapped = (appointments || []).map(appt => ({
              id: appt.id,
              vagaroAppointmentId: appt.id,
              vagaroContactId: appt.customerId || appt.customer?.id,
              customerName: appt.customer?.name || `${appt.customer?.firstName || ''} ${appt.customer?.lastName || ''}`.trim() || 'Unknown',
              customerPhone: appt.customer?.phone || '',
              customerEmail: appt.customer?.email || '',
              appointmentDate: appt.date,
              appointmentTime: appt.time,
              duration: appt.duration || 30,
              purpose: appt.service?.name || appt.serviceName || 'Vagaro Appointment',
              status: vagaroService.mapVagaroStatus ?
                vagaroService.mapVagaroStatus(appt.status) :
                (appt.status || 'confirmed'),
              source: 'vagaro_sync',
              notes: appt.notes || ''
            }));
            results.vagaro = {
              success: true,
              appointments: mapped,
              error: null
            };
          })
          .catch(err => {
            results.vagaro.error = err.message;
            logger.error(`[CRM Sync] Vagaro fetch error: ${err.message}`);
          })
      );
    }
  }

  await Promise.all(promises);

  // Combine all appointments
  const allAppointments = [
    ...results.ghl.appointments,
    ...results.hubspot.appointments,
    ...results.vagaro.appointments
  ];

  logger.info(`[CRM Sync] Fetched ${allAppointments.length} total appointments for client ${clientId} (GHL: ${results.ghl.appointments.length}, HubSpot: ${results.hubspot.appointments.length}, Vagaro: ${results.vagaro.appointments.length})`);

  return {
    success: true,
    appointments: allAppointments,
    sources: results,
    integrations
  };
}

/**
 * Generate a unique confirmation code
 */
function generateConfirmationCode(source) {
  const prefix = {
    'ghl_sync': 'GS',
    'hubspot_sync': 'HS',
    'vagaro_sync': 'VS'
  }[source] || 'CR';

  return `${prefix}${Date.now().toString().slice(-6).toUpperCase()}`;
}

/**
 * Ensure CRM sync columns exist in database
 * Run on first sync to add columns if they don't exist
 */
async function ensureCRMColumnsExist() {
  try {
    await sequelize.query(`
      ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS vagaro_appointment_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS vagaro_contact_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS crm_last_synced_at TIMESTAMP
    `);
    logger.info('[CRM Sync] Ensured CRM columns exist');
  } catch (error) {
    // Columns might already exist or syntax error for non-PostgreSQL
    logger.debug(`[CRM Sync] Column check: ${error.message}`);
  }
}

/**
 * Sync CRM appointments to local database
 * Uses upsert logic based on CRM-specific IDs to avoid duplicates
 * @param {number} clientId - Client ID
 * @param {Array} appointments - Array of appointments to sync
 * @returns {Promise<object>} Sync results
 */
async function syncToLocalDB(clientId, appointments) {
  const results = {
    created: 0,
    updated: 0,
    errors: []
  };

  // Ensure columns exist before syncing
  await ensureCRMColumnsExist();

  for (const appt of appointments) {
    try {
      // Determine which CRM ID to use for deduplication
      let existingCheck = null;

      if (appt.ghlAppointmentId) {
        existingCheck = await sequelize.query(
          `SELECT id FROM appointments WHERE client_id = :clientId AND ghl_appointment_id = :crmId`,
          { replacements: { clientId, crmId: appt.ghlAppointmentId }, type: QueryTypes.SELECT }
        );
      } else if (appt.hubspotMeetingId) {
        existingCheck = await sequelize.query(
          `SELECT id FROM appointments WHERE client_id = :clientId AND hubspot_meeting_id = :crmId`,
          { replacements: { clientId, crmId: appt.hubspotMeetingId }, type: QueryTypes.SELECT }
        );
      } else if (appt.vagaroAppointmentId) {
        existingCheck = await sequelize.query(
          `SELECT id FROM appointments WHERE client_id = :clientId AND vagaro_appointment_id = :crmId`,
          { replacements: { clientId, crmId: appt.vagaroAppointmentId }, type: QueryTypes.SELECT }
        );
      }

      if (existingCheck && existingCheck.length > 0) {
        // Update existing appointment
        await sequelize.query(
          `UPDATE appointments SET
            customer_name = :customerName,
            customer_phone = :customerPhone,
            customer_email = :customerEmail,
            appointment_date = :appointmentDate,
            appointment_time = :appointmentTime,
            duration = :duration,
            purpose = :purpose,
            status = :status,
            notes = :notes,
            crm_last_synced_at = NOW(),
            updated_at = NOW()
           WHERE id = :id`,
          {
            replacements: {
              id: existingCheck[0].id,
              customerName: appt.customerName || 'Unknown',
              customerPhone: appt.customerPhone || '',
              customerEmail: appt.customerEmail || '',
              appointmentDate: appt.appointmentDate,
              appointmentTime: appt.appointmentTime,
              duration: appt.duration || 30,
              purpose: appt.purpose || 'CRM Appointment',
              status: appt.status || 'confirmed',
              notes: appt.notes || ''
            },
            type: QueryTypes.UPDATE
          }
        );
        results.updated++;
      } else {
        // Create new appointment
        const confirmationCode = generateConfirmationCode(appt.source);

        await sequelize.query(
          `INSERT INTO appointments (
            client_id, customer_name, customer_phone, customer_email,
            appointment_date, appointment_time, duration, purpose,
            status, source, confirmation_code, notes,
            ghl_appointment_id, ghl_contact_id, ghl_calendar_id,
            hubspot_meeting_id, hubspot_contact_id,
            vagaro_appointment_id, vagaro_contact_id,
            crm_last_synced_at, created_at, updated_at
           ) VALUES (
            :clientId, :customerName, :customerPhone, :customerEmail,
            :appointmentDate, :appointmentTime, :duration, :purpose,
            :status, :source, :confirmationCode, :notes,
            :ghlAppointmentId, :ghlContactId, :ghlCalendarId,
            :hubspotMeetingId, :hubspotContactId,
            :vagaroAppointmentId, :vagaroContactId,
            NOW(), NOW(), NOW()
           )`,
          {
            replacements: {
              clientId,
              customerName: appt.customerName || 'Unknown',
              customerPhone: appt.customerPhone || '',
              customerEmail: appt.customerEmail || '',
              appointmentDate: appt.appointmentDate,
              appointmentTime: appt.appointmentTime,
              duration: appt.duration || 30,
              purpose: appt.purpose || 'CRM Appointment',
              status: appt.status || 'confirmed',
              source: appt.source,
              confirmationCode,
              notes: appt.notes || '',
              ghlAppointmentId: appt.ghlAppointmentId || null,
              ghlContactId: appt.ghlContactId || null,
              ghlCalendarId: appt.ghlCalendarId || null,
              hubspotMeetingId: appt.hubspotMeetingId || null,
              hubspotContactId: appt.hubspotContactId || null,
              vagaroAppointmentId: appt.vagaroAppointmentId || null,
              vagaroContactId: appt.vagaroContactId || null
            },
            type: QueryTypes.INSERT
          }
        );
        results.created++;
      }
    } catch (error) {
      logger.error(`[CRM Sync] Error syncing appointment: ${error.message}`);
      results.errors.push({ appointment: appt, error: error.message });
    }
  }

  logger.info(`[CRM Sync] Sync complete for client ${clientId}: ${results.created} created, ${results.updated} updated, ${results.errors.length} errors`);
  return results;
}

/**
 * Get dashboard appointments with source badges
 * Combines local appointments with optional CRM refresh
 * @param {number} clientId - Client ID
 * @param {object} options - { days, refresh }
 * @returns {Promise<object>} Appointments with metadata
 */
async function getDashboardAppointments(clientId, options = {}) {
  const { days = 14, refresh = false } = options;

  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const endDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // If refresh requested, fetch from CRMs and sync
  let syncResults = null;
  if (refresh) {
    const crmData = await fetchAllCRMAppointments(clientId, startDate, endDate);
    if (crmData.appointments.length > 0) {
      syncResults = await syncToLocalDB(clientId, crmData.appointments);
    }
  }

  // Fetch appointments from local database
  const appointments = await sequelize.query(
    `SELECT
      id, customer_name, customer_phone, customer_email,
      appointment_date, appointment_time, duration, purpose,
      status, source, confirmation_code, notes,
      ghl_appointment_id, hubspot_meeting_id, vagaro_appointment_id,
      ghl_calendar_id, deposit_status,
      crm_last_synced_at, created_at, updated_at
     FROM appointments
     WHERE client_id = :clientId
       AND appointment_date >= :startDate
       AND appointment_date <= :endDate
       AND status NOT IN ('cancelled')
     ORDER BY appointment_date ASC, appointment_time ASC`,
    {
      replacements: { clientId, startDate, endDate },
      type: QueryTypes.SELECT
    }
  );

  // Add source badge info to each appointment
  const appointmentsWithBadges = appointments.map(appt => ({
    ...appt,
    sourceBadge: getSourceBadge(appt.source),
    _zohoEvent: false
  }));

  // Fetch Zoho events if enabled
  let zohoEvents = [];
  let zohoCalendarActive = false;
  try {
    const zohoStatus = await zohoCalendarService.isZohoCalendarEnabled(clientId);
    if (zohoStatus.enabled) {
      const zohoResult = await zohoCalendarService.getEventsForCalendarDisplay(clientId, startDate, endDate);
      if (zohoResult.success && zohoResult.events.length > 0) {
        zohoEvents = zohoResult.events.map(evt => ({
          ...evt,
          sourceBadge: getSourceBadge('zoho')
        }));
        zohoCalendarActive = true;
        logger.info(`[CRMAppointmentService] Client ${clientId}: Added ${zohoEvents.length} Zoho events to dashboard`);
      }
    }
  } catch (zohoError) {
    logger.warn(`[CRMAppointmentService] Zoho events skipped for client ${clientId}: ${zohoError.message}`);
  }

  // Merge RinglyPro appointments with Zoho events
  const allAppointments = [...appointmentsWithBadges, ...zohoEvents];

  // Sort by date and time
  allAppointments.sort((a, b) => {
    const dateA = a.appointment_date;
    const dateB = b.appointment_date;
    const timeA = a.appointment_time;
    const timeB = b.appointment_time;
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return timeA.localeCompare(timeB);
  });

  // Get last sync time
  const lastSyncResult = await sequelize.query(
    `SELECT MAX(crm_last_synced_at) as last_sync FROM appointments WHERE client_id = :clientId`,
    { replacements: { clientId }, type: QueryTypes.SELECT }
  );

  const integrations = await getEnabledIntegrations(clientId);

  return {
    success: true,
    appointments: allAppointments,
    count: allAppointments.length,
    dateRange: { startDate, endDate },
    lastSync: lastSyncResult[0]?.last_sync || null,
    syncResults,
    integrations,
    zohoCalendarActive,
    zohoEventsCount: zohoEvents.length
  };
}

/**
 * Get source badge configuration
 */
function getSourceBadge(source) {
  const badges = {
    'ghl_sync': { label: 'GHL', color: '#10b981', bgColor: '#d1fae5' },
    'whatsapp_ghl': { label: 'GHL', color: '#10b981', bgColor: '#d1fae5' },
    'hubspot_sync': { label: 'HubSpot', color: '#ff7a59', bgColor: '#ffe8e2' },
    'whatsapp_hubspot': { label: 'HubSpot', color: '#ff7a59', bgColor: '#ffe8e2' },
    'vagaro_sync': { label: 'Vagaro', color: '#8b5cf6', bgColor: '#ede9fe' },
    'whatsapp_vagaro': { label: 'Vagaro', color: '#8b5cf6', bgColor: '#ede9fe' },
    'zoho': { label: 'Zoho', color: '#dc2626', bgColor: '#fee2e2' },
    'zoho_sync': { label: 'Zoho', color: '#dc2626', bgColor: '#fee2e2' },
    'voice_booking': { label: 'Voice', color: '#3b82f6', bgColor: '#dbeafe' },
    'whatsapp': { label: 'WhatsApp', color: '#25D366', bgColor: '#dcfce7' },
    'online': { label: 'Online', color: '#0ea5e9', bgColor: '#e0f2fe' },
    'manual': { label: 'Manual', color: '#6b7280', bgColor: '#f3f4f6' },
    'walk-in': { label: 'Walk-in', color: '#f59e0b', bgColor: '#fef3c7' }
  };

  return badges[source] || { label: 'Other', color: '#6b7280', bgColor: '#f3f4f6' };
}

module.exports = {
  getEnabledIntegrations,
  fetchAllCRMAppointments,
  syncToLocalDB,
  getDashboardAppointments,
  getSourceBadge
};
