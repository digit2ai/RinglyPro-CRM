/**
 * HubSpot Booking Routes
 * Isolated routes for HubSpot appointment booking integration
 *
 * IMPORTANT: These routes are SEPARATE from GHL booking routes.
 * DO NOT modify existing GHL routes in other files.
 *
 * Base path: /api/integrations/hubspot
 */

const express = require('express');
const router = express.Router();
const hubspotBookingService = require('../services/hubspotBookingService');
const { HUBSPOT_ERRORS } = require('../services/hubspotBookingService');

// Simple auth middleware for API routes
const requireAuth = (req, res, next) => {
  // Check for session-based auth or API key
  if (req.session?.user?.id || req.session?.client_id || req.headers['x-api-key']) {
    return next();
  }

  // For internal calls, allow if client_id is provided
  if (req.body?.clientId || req.query?.clientId) {
    return next();
  }

  return res.status(401).json({
    success: false,
    error: 'Authentication required',
    code: 'AUTH_REQUIRED'
  });
};

/**
 * POST /api/integrations/hubspot/test
 * Test HubSpot connection for a client
 */
router.post('/test', requireAuth, async (req, res) => {
  try {
    const clientId = req.body.clientId || req.session?.client_id;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    console.log(`[HubSpot Routes] Testing connection for client ${clientId}`);
    const result = await hubspotBookingService.testConnection(clientId);

    res.json(result);
  } catch (error) {
    console.error('[HubSpot Routes] Test connection error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: HUBSPOT_ERRORS.API_ERROR
    });
  }
});

/**
 * GET /api/integrations/hubspot/meeting-links
 * Get available meeting links for a client
 */
router.get('/meeting-links', requireAuth, async (req, res) => {
  try {
    const clientId = req.query.clientId || req.session?.client_id;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    console.log(`[HubSpot Routes] Getting meeting links for client ${clientId}`);
    const result = await hubspotBookingService.getMeetingLinks(clientId);

    res.json(result);
  } catch (error) {
    console.error('[HubSpot Routes] Get meeting links error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: HUBSPOT_ERRORS.API_ERROR
    });
  }
});

/**
 * GET /api/integrations/hubspot/availability
 * Get available time slots for a date
 * Query params: clientId, date (YYYY-MM-DD), slug (optional)
 */
router.get('/availability', requireAuth, async (req, res) => {
  try {
    const { clientId, date, slug } = req.query;
    const effectiveClientId = clientId || req.session?.client_id;

    if (!effectiveClientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    if (!date) {
      return res.status(400).json({
        success: false,
        error: 'Date is required (YYYY-MM-DD format)',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    console.log(`[HubSpot Routes] Getting availability for client ${effectiveClientId}, date ${date}`);
    const result = await hubspotBookingService.getAvailableSlots(effectiveClientId, date);

    res.json(result);
  } catch (error) {
    console.error('[HubSpot Routes] Get availability error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: HUBSPOT_ERRORS.API_ERROR
    });
  }
});

/**
 * POST /api/integrations/hubspot/book
 * Book an appointment via HubSpot
 * Body: { clientId, customerName, customerPhone, customerEmail, date, time, service?, notes? }
 */
router.post('/book', requireAuth, async (req, res) => {
  try {
    const {
      clientId,
      customerName,
      customerPhone,
      customerEmail,
      date,
      time,
      service,
      notes
    } = req.body;

    const effectiveClientId = clientId || req.session?.client_id;

    // Validate required fields
    const errors = [];
    if (!effectiveClientId) errors.push('clientId is required');
    if (!customerName) errors.push('customerName is required');
    if (!customerEmail) errors.push('customerEmail is required (HubSpot requires email)');
    if (!date) errors.push('date is required (YYYY-MM-DD)');
    if (!time) errors.push('time is required (HH:MM 24h format)');

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: errors.join(', '),
        code: HUBSPOT_ERRORS.VALIDATION_ERROR,
        validationErrors: errors
      });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid date format. Use YYYY-MM-DD',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(time)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid time format. Use HH:MM (24h)',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    // Validate email format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    console.log(`[HubSpot Routes] Booking appointment for client ${effectiveClientId}:`, {
      customerName,
      customerEmail,
      date,
      time,
      service
    });

    const result = await hubspotBookingService.bookFromWhatsApp(effectiveClientId, {
      customerName,
      customerPhone,
      customerEmail,
      date,
      time,
      service,
      notes
    });

    if (result.success) {
      res.json({
        success: true,
        status: 'booked',
        message: result.message,
        booking: {
          confirmationCode: result.confirmationCode,
          meetingId: result.meetingId,
          meetingLink: result.meetingLink,
          contactId: result.contact?.id,
          contactIsNew: result.contactIsNew,
          localAppointmentId: result.localAppointment?.id
        }
      });
    } else {
      res.status(400).json({
        success: false,
        status: 'error',
        error: result.error,
        code: result.code
      });
    }
  } catch (error) {
    console.error('[HubSpot Routes] Book appointment error:', error);
    res.status(500).json({
      success: false,
      status: 'error',
      error: error.message,
      code: HUBSPOT_ERRORS.API_ERROR
    });
  }
});

/**
 * POST /api/integrations/hubspot/contact
 * Find or create a contact in HubSpot
 * Body: { clientId, name, phone, email }
 */
router.post('/contact', requireAuth, async (req, res) => {
  try {
    const { clientId, name, phone, email } = req.body;
    const effectiveClientId = clientId || req.session?.client_id;

    if (!effectiveClientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required for HubSpot contacts',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    console.log(`[HubSpot Routes] Finding/creating contact for client ${effectiveClientId}:`, { name, email });
    const result = await hubspotBookingService.findOrCreateContact(effectiveClientId, { name, phone, email });

    res.json(result);
  } catch (error) {
    console.error('[HubSpot Routes] Contact error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: HUBSPOT_ERRORS.API_ERROR
    });
  }
});

/**
 * GET /api/integrations/hubspot/slots
 * Get next available slots across multiple days (for WhatsApp AI flow)
 * Returns up to 3 slots across the next 14 days
 * Query params: clientId
 */
router.get('/slots', requireAuth, async (req, res) => {
  try {
    const clientId = req.query.clientId || req.session?.client_id;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required',
        code: HUBSPOT_ERRORS.VALIDATION_ERROR
      });
    }

    console.log(`[HubSpot Routes] Getting next available slots for client ${clientId}`);

    const slots = [];
    const today = new Date();

    // Look through next 14 days for 3 slots
    for (let i = 1; i <= 14 && slots.length < 3; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() + i);
      const dateStr = checkDate.toISOString().split('T')[0];

      const daySlots = await hubspotBookingService.getAvailableSlots(clientId, dateStr);

      if (daySlots.success && daySlots.slots?.length > 0) {
        // Take first available slot from this day
        const slot = daySlots.slots[0];
        slots.push({
          date: dateStr,
          time: slot.time24 || slot.startTime?.slice(11, 16),
          isoString: slot.isoString || slot.startTime,
          display: formatSlotDisplay(checkDate, slot)
        });
      }
    }

    res.json({
      success: true,
      slots,
      count: slots.length,
      message: slots.length > 0
        ? `Found ${slots.length} available slot${slots.length > 1 ? 's' : ''}`
        : 'No availability found in the next 14 days'
    });
  } catch (error) {
    console.error('[HubSpot Routes] Get slots error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: HUBSPOT_ERRORS.API_ERROR
    });
  }
});

/**
 * Helper: Format slot for display in WhatsApp messages
 */
function formatSlotDisplay(date, slot) {
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const time = slot.time24 || slot.startTime?.slice(11, 16) || '10:00';
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  const displayTime = `${hour12}:${minutes} ${ampm}`;

  return `${dayName} @ ${displayTime}`;
}

/**
 * POST /api/integrations/hubspot/setup
 * Admin endpoint to run migration and configure HubSpot for a client
 * Body: { clientId, apiKey?, meetingSlug?, timezone?, runMigration? }
 * If apiKey not provided, uses HUBSPOT_API_KEY env var
 */
router.post('/setup', async (req, res) => {
  try {
    // Simple admin check - only allow in development or with API key
    const adminKey = req.headers['x-admin-key'] || req.headers['x-test-api-key'];
    const isDevEnv = process.env.NODE_ENV === 'development';

    if (!adminKey && !isDevEnv) {
      return res.status(401).json({
        success: false,
        error: 'Admin authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const { clientId, apiKey, meetingSlug, timezone, runMigration } = req.body;
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    // Step 1: Run migration if requested
    if (runMigration) {
      console.log('[HubSpot Setup] Running database migration...');

      try {
        // Check if columns already exist
        const [columns] = await sequelize.query(
          `SELECT column_name FROM information_schema.columns
           WHERE table_name = 'clients' AND column_name = 'hubspot_api_key'`
        );

        if (columns.length === 0) {
          // Add HubSpot columns
          await sequelize.query(`
            ALTER TABLE clients
            ADD COLUMN IF NOT EXISTS hubspot_api_key VARCHAR(255),
            ADD COLUMN IF NOT EXISTS hubspot_meeting_slug VARCHAR(100),
            ADD COLUMN IF NOT EXISTS hubspot_timezone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS booking_system VARCHAR(20),
            ADD COLUMN IF NOT EXISTS settings JSONB
          `);
          console.log('[HubSpot Setup] Migration completed - columns added');
        } else {
          console.log('[HubSpot Setup] Columns already exist - skipping migration');
        }
      } catch (migrationError) {
        console.error('[HubSpot Setup] Migration error:', migrationError);
        return res.status(500).json({
          success: false,
          error: 'Migration failed: ' + migrationError.message,
          code: 'MIGRATION_FAILED'
        });
      }
    }

    // Step 2: Configure client if clientId provided
    if (clientId) {
      const effectiveApiKey = apiKey || process.env.HUBSPOT_API_KEY || process.env.HUBSPOT_ACCESS_TOKEN;

      if (!effectiveApiKey) {
        return res.status(400).json({
          success: false,
          error: 'HubSpot API key required (provide in body or set HUBSPOT_API_KEY env)',
          code: 'MISSING_API_KEY'
        });
      }

      console.log(`[HubSpot Setup] Configuring client ${clientId}...`);

      // Update client with HubSpot credentials
      const updateFields = [];
      const replacements = { clientId };

      updateFields.push('hubspot_api_key = :apiKey');
      replacements.apiKey = effectiveApiKey;

      if (meetingSlug) {
        updateFields.push('hubspot_meeting_slug = :meetingSlug');
        replacements.meetingSlug = meetingSlug;
      }

      if (timezone) {
        updateFields.push('hubspot_timezone = :timezone');
        replacements.timezone = timezone;
      }

      // Set booking_system to hubspot
      updateFields.push("booking_system = 'hubspot'");

      await sequelize.query(
        `UPDATE clients SET ${updateFields.join(', ')} WHERE id = :clientId`,
        { replacements, type: QueryTypes.UPDATE }
      );

      console.log(`[HubSpot Setup] Client ${clientId} configured successfully`);

      // Test the connection
      const testResult = await hubspotBookingService.testConnection(clientId);

      return res.json({
        success: true,
        message: `Client ${clientId} configured for HubSpot`,
        clientId,
        connectionTest: testResult
      });
    }

    // Just ran migration without client config
    res.json({
      success: true,
      message: 'Migration completed (no client configured)',
      runMigration: !!runMigration
    });

  } catch (error) {
    console.error('[HubSpot Setup] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: HUBSPOT_ERRORS.API_ERROR
    });
  }
});

/**
 * GET /api/integrations/hubspot/status
 * Get HubSpot configuration status (without exposing API key)
 */
router.get('/status', async (req, res) => {
  try {
    const clientIdParam = req.query.clientId || req.session?.client_id;
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    if (!clientIdParam) {
      return res.json({
        success: true,
        configured: false,
        message: 'No client ID provided',
        envKeySet: !!(process.env.HUBSPOT_API_KEY || process.env.HUBSPOT_ACCESS_TOKEN)
      });
    }

    // Ensure clientId is a number
    const clientId = parseInt(clientIdParam, 10);

    const result = await sequelize.query(
      `SELECT id, hubspot_meeting_slug, hubspot_timezone, booking_system,
              CASE WHEN hubspot_api_key IS NOT NULL THEN true ELSE false END as has_api_key
       FROM clients WHERE id = :clientId`,
      { replacements: { clientId }, type: QueryTypes.SELECT }
    );

    if (result.length === 0) {
      return res.json({
        success: false,
        error: 'Client not found',
        clientId
      });
    }

    const client = result[0];
    res.json({
      success: true,
      clientId,
      configured: client.has_api_key,
      meetingSlug: client.hubspot_meeting_slug,
      timezone: client.hubspot_timezone,
      bookingSystem: client.booking_system,
      envKeySet: !!process.env.HUBSPOT_API_KEY
    });

  } catch (error) {
    console.error('[HubSpot Status] Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/integrations/hubspot/debug/appointments
 * Debug endpoint to check recent HubSpot appointments
 */
router.get('/debug/appointments', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.headers['x-test-api-key'];
    if (!adminKey && process.env.NODE_ENV !== 'development') {
      return res.status(401).json({ success: false, error: 'Admin key required' });
    }

    const clientId = req.query.clientId;
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    let whereClause = "source = 'whatsapp_hubspot'";
    const replacements = {};

    if (clientId) {
      whereClause += " AND client_id = :clientId";
      replacements.clientId = parseInt(clientId, 10);
    }

    const appointments = await sequelize.query(
      `SELECT id, client_id, customer_name, customer_email, customer_phone,
              appointment_date, appointment_time, status, source,
              confirmation_code, hubspot_meeting_id, hubspot_contact_id,
              created_at
       FROM appointments
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT 20`,
      { replacements, type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      count: appointments.length,
      appointments
    });
  } catch (error) {
    console.error('[HubSpot Debug] Appointments error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/integrations/hubspot/debug/clients
 * Debug endpoint to list all clients and their HubSpot status
 */
router.get('/debug/clients', async (req, res) => {
  try {
    const adminKey = req.headers['x-admin-key'] || req.headers['x-test-api-key'];
    if (!adminKey && process.env.NODE_ENV !== 'development') {
      return res.status(401).json({ success: false, error: 'Admin key required' });
    }

    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    const clients = await sequelize.query(
      `SELECT id, business_name, timezone, booking_system,
              hubspot_meeting_slug, hubspot_timezone,
              CASE WHEN hubspot_api_key IS NOT NULL THEN true ELSE false END as has_hubspot_key,
              CASE WHEN ghl_api_key IS NOT NULL THEN true ELSE false END as has_ghl_key
       FROM clients ORDER BY id`,
      { type: QueryTypes.SELECT }
    );

    res.json({
      success: true,
      count: clients.length,
      clients
    });
  } catch (error) {
    console.error('[HubSpot Debug] Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
