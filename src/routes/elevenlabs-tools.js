/**
 * ElevenLabs Conversational AI Tools Webhook
 *
 * This endpoint handles tool calls from ElevenLabs agents.
 * It exposes RinglyPro's booking infrastructure as callable tools.
 *
 * Tools available:
 * - get_business_info: Get client business details
 * - check_availability: Get available appointment slots (uses RinglyPro calendar)
 * - book_appointment: Create appointment in RinglyPro calendar
 * - send_sms: Send SMS confirmation
 *
 * NOTE: This now uses RinglyPro's native calendar system instead of GHL.
 * Appointments are stored in the RinglyPro database and shown on the dashboard.
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const appointmentService = require('../services/appointmentService');
const availabilityService = require('../services/availabilityService');
const dualCalendarService = require('../services/dualCalendarService');
const twilio = require('twilio');

// Initialize Twilio client for SMS
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Main tool execution endpoint
 * ElevenLabs sends POST requests with tool_name and parameters
 */
router.post('/', async (req, res) => {
  try {
    // ElevenLabs sends different formats depending on configuration:
    // Format 1: { tool_name: "...", client_id: "...", ... } (flat)
    // Format 2: { tool_name: "...", parameters: { client_id: "..." } } (nested params)
    // Format 3: { tool: { name: "...", parameters: { ... } } } (nested tool object)
    // Format 4: { name: "...", parameters: { ... } } (OpenAI-style)
    const body = req.body || {};

    // Extract tool_name from various possible locations
    let tool_name = body.tool_name || body.name;
    if (!tool_name && body.tool && body.tool.name) {
      tool_name = body.tool.name;
    }

    const conversation_id = body.conversation_id;
    const agent_id = body.agent_id;

    // Extract parameters from various possible locations
    let params = body.parameters || body;
    if (body.tool && body.tool.parameters) {
      params = body.tool.parameters;
    }

    logger.info(`[ElevenLabs Tools] Received tool call: ${tool_name}`, {
      conversation_id,
      agent_id,
      params: JSON.stringify(params),
      raw_body: JSON.stringify(body).substring(0, 500) // Log raw body for debugging (truncated)
    });

    // Validate required fields
    if (!tool_name) {
      return res.status(400).json({
        success: false,
        error: 'Missing tool_name'
      });
    }

    // Route to appropriate tool handler
    let result;
    switch (tool_name) {
      case 'get_business_info':
      case 'get_business_info_ringlypro':
      case 'get_business_info_corvita':
        result = await handleGetBusinessInfo(params);
        break;
      case 'check_availability':
      case 'check_availability_ringlypro':
      case 'check_availability_corvita':
      case 'check_availability_recovery':
      case 'get_open_slots':
        // All availability check variants route to same handler
        result = await handleCheckAvailability(params);
        break;
      case 'book_appointment':
      case 'book_appointment_ringlypro':
      case 'book_appointment_corvita':
      case 'book_appointment_recovery':
        result = await handleBookAppointment(params);
        break;
      case 'send_sms':
      case 'send_sms_ringlypro':
      case 'send_sms_corvita':
      case 'send_sms_recovery':
        result = await handleSendSms(params);
        break;
      case 'send_sms_ghl':
        result = await handleSendSmsGhl(params);
        break;
      case 'debug_zoho_settings':
        // Temporary debug tool to check Zoho settings
        result = await handleDebugZohoSettings(params);
        break;
      case 'debug_appointment':
        // Check appointment details including Zoho event ID
        result = await handleDebugAppointment(params);
        break;
      case 'debug_zoho_create_event':
        // Try to create a test Zoho event
        result = await handleDebugZohoCreateEvent(params);
        break;
      case 'admin_set_elevenlabs_phone':
        // Quick admin tool to set ElevenLabs phone number ID
        result = await handleAdminSetElevenLabsPhone(params);
        break;
      case 'admin_set_elevenlabs_agent':
        // Quick admin tool to set ElevenLabs agent ID
        result = await handleAdminSetElevenLabsAgent(params);
        break;
      case 'admin_enable_elevenlabs_outbound':
        // Quick admin tool to enable ElevenLabs for outbound calling
        result = await handleAdminEnableElevenLabsOutbound(params);
        break;
      case 'admin_get_client_config':
        // Quick admin tool to get client's ElevenLabs configuration
        result = await handleAdminGetClientConfig(params);
        break;
      case 'admin_set_deposit_required':
        // Quick admin tool to enable/disable deposit requirement
        result = await handleAdminSetDepositRequired(params);
        break;
      case 'signup_client':
        // Voice signup: create full RinglyPro account from phone call
        result = await handleSignupClient(params);
        break;
      default:
        result = {
          success: false,
          error: `Unknown tool: ${tool_name}`
        };
    }

    logger.info(`[ElevenLabs Tools] Tool ${tool_name} result:`, result);

    // Return result in format ElevenLabs expects
    return res.json(result);

  } catch (error) {
    logger.error(`[ElevenLabs Tools] Error:`, error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get business information for personalization
 * Returns client's business details and calendar configuration.
 */
async function handleGetBusinessInfo(params) {
  const { client_id, called_number } = params;

  try {
    // Find client by ID or phone number
    let whereClause = '';
    let replacements = {};

    if (client_id) {
      whereClause = 'id = :clientId';
      replacements.clientId = client_id;
    } else if (called_number) {
      // Normalize phone number (handle + encoding)
      let phone = called_number;
      if (phone.startsWith(' ')) {
        phone = '+' + phone.substring(1);
      }
      whereClause = 'ringlypro_number = :phone';
      replacements.phone = phone;
    } else {
      return { success: false, error: 'Missing client_id or called_number' };
    }

    const clients = await sequelize.query(`
      SELECT
        id,
        business_name,
        custom_greeting,
        business_hours_start,
        business_hours_end,
        business_days,
        timezone,
        appointment_duration,
        booking_url
      FROM clients
      WHERE ${whereClause} AND active = true
    `, { replacements, type: QueryTypes.SELECT });

    if (!clients || clients.length === 0) {
      return { success: false, error: 'Client not found' };
    }

    const client = clients[0];

    return {
      success: true,
      business_name: client.business_name,
      greeting: client.custom_greeting || `Thank you for calling ${client.business_name}`,
      hours_start: client.business_hours_start || '09:00',
      hours_end: client.business_hours_end || '17:00',
      business_days: client.business_days || 'Monday through Friday',
      timezone: client.timezone || 'America/New_York',
      appointment_duration: client.appointment_duration || 30,
      booking_url: client.booking_url,
      client_id: client.id,
      calendar_type: 'ringlypro'  // Indicates we're using RinglyPro calendar
    };

  } catch (error) {
    logger.error('[ElevenLabs Tools] get_business_info error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check availability for appointments
 * UPDATED: Now uses dualCalendarService which checks:
 * - RinglyPro database appointments
 * - Google Calendar blocked times (if connected)
 * - Zoho CRM Events (if connected)
 * - GHL calendar (if dual mode enabled)
 */
async function handleCheckAvailability(params) {
  const {
    client_id,
    date,
    days_ahead = 7,
    timezone = 'America/New_York'
  } = params;

  try {
    if (!client_id) {
      return { success: false, error: 'Missing client_id' };
    }

    logger.info(`[ElevenLabs Tools] Checking combined calendar availability for client ${client_id}`);

    // Calculate date range
    const startDate = date || new Date().toISOString().split('T')[0];
    const numDays = parseInt(days_ahead) || 7;

    // Get combined availability from all calendar sources
    const allSlots = [];
    let zohoCalendarActive = false;
    let googleCalendarActive = false;
    let source = 'ringlypro';

    // Parse start date and iterate from there
    const startDateObj = new Date(startDate + 'T00:00:00');

    for (let i = 0; i < numDays; i++) {
      const currentDate = new Date(startDateObj.getTime() + i * 86400000);
      const dateStr = currentDate.toISOString().split('T')[0];

      // Use dualCalendarService which now checks RinglyPro + Zoho + Google + GHL
      const dayAvailability = await dualCalendarService.getCombinedAvailability(client_id, dateStr, {
        businessHours: { start: 9, end: 17, slotDuration: 60 }
      });

      // Track which calendars are active
      if (dayAvailability.zohoCalendarActive) zohoCalendarActive = true;
      if (dayAvailability.googleCalendarActive) googleCalendarActive = true;
      source = dayAvailability.source || source;

      // Convert time slots to full slot objects
      dayAvailability.availableSlots.forEach(timeStr => {
        const hour = parseInt(timeStr.split(':')[0]);
        const minute = parseInt(timeStr.split(':')[1]);
        const displayTime = new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        });

        allSlots.push({
          date: dateStr,
          time: timeStr,
          datetime: `${dateStr}T${timeStr}`,
          displayDate: currentDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
          displayTime
        });
      });
    }

    const endDate = new Date(Date.now() + numDays * 86400000).toISOString().split('T')[0];

    logger.info(`[ElevenLabs Tools] Found ${allSlots.length} available slots (source: ${source}, zoho: ${zohoCalendarActive}, google: ${googleCalendarActive})`);

    return {
      success: true,
      calendar_type: source,
      timezone,
      start_date: startDate,
      end_date: endDate,
      slots: allSlots,
      slot_count: allSlots.length,
      zohoCalendarActive,
      googleCalendarActive
    };

  } catch (error) {
    logger.error('[ElevenLabs Tools] check_availability error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Book an appointment
 * UPDATED: Now uses dualCalendarService which syncs to:
 * - RinglyPro database (always)
 * - Google Calendar (if connected)
 * - Zoho CRM Events (if connected)
 * - GHL calendar (if dual mode enabled)
 */
async function handleBookAppointment(params) {
  const {
    client_id,
    customer_name,
    first_name,
    last_name,
    customer_phone,
    phone,
    customer_email,
    email,
    appointment_date,
    date,
    appointment_time,
    time,
    start_time,
    startTime,
    duration = 30,
    purpose = 'Phone booking via AI Assistant'
  } = params;

  try {
    if (!client_id) {
      return { success: false, error: 'Missing client_id' };
    }

    // Normalize parameter names (support multiple naming conventions)
    const name = customer_name || `${first_name || ''} ${last_name || ''}`.trim();
    const phoneNum = customer_phone || phone;
    const emailAddr = customer_email || email;
    const aptDate = appointment_date || date;
    const aptTime = appointment_time || time || start_time || startTime;

    if (!name || !phoneNum) {
      return { success: false, error: 'Missing required fields: customer_name/first_name and phone' };
    }

    if (!aptDate && !aptTime && !startTime) {
      return { success: false, error: 'Missing appointment date/time' };
    }

    // Parse datetime if provided as ISO string
    let finalDate = aptDate;
    let finalTime = aptTime;

    if (startTime && !aptDate) {
      const dt = new Date(startTime);
      finalDate = dt.toISOString().split('T')[0];
      finalTime = dt.toISOString().split('T')[1].substring(0, 5);
    }

    // Normalize time to HH:MM:SS format for dualCalendarService
    const normalizedTime = finalTime.length === 5 ? `${finalTime}:00` : finalTime;

    // Ensure client_id is an integer early
    const clientIdInt = parseInt(client_id, 10);

    // Verify the slot is still available in ALL connected calendars before booking
    const slotCheck = await dualCalendarService.isSlotAvailable(clientIdInt, finalDate, normalizedTime);
    if (!slotCheck.available) {
      return {
        success: false,
        error: `Sorry, the ${finalTime} slot on ${finalDate} is no longer available. Please choose another time.`
      };
    }

    // Build appointment data for dualCalendarService
    const appointmentData = {
      customerName: name,
      customerPhone: phoneNum,
      customerEmail: emailAddr || `${phoneNum.replace(/\D/g, '')}@phone.ringlypro.com`,
      appointmentDate: finalDate,
      appointmentTime: normalizedTime,
      duration: parseInt(duration),
      purpose,
      notes: 'Booked via ElevenLabs AI Voice Assistant'
    };
    logger.info(`[ElevenLabs Tools] Booking appointment for client ${clientIdInt}:`, appointmentData);

    // Use dualCalendarService to create appointment in all connected calendars
    const result = await dualCalendarService.createDualAppointment(clientIdInt, appointmentData);

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to book appointment' };
    }

    logger.info(`[ElevenLabs Tools] Appointment created: ${result.ringlyProAppointment?.id} (Zoho: ${result.zohoCalendarActive}, Google: ${result.googleCalendarActive})`);

    return {
      success: true,
      message: result.message || `Appointment booked successfully for ${name}`,
      appointment_id: result.ringlyProAppointment?.id,
      confirmation_code: result.ringlyProAppointment?.confirmation_code || result.ringlyProAppointment?.confirmationCode,
      appointment_date: finalDate,
      appointment_time: finalTime,
      customer_name: name,
      customer_phone: phoneNum,
      calendar_type: result.zohoCalendarActive ? 'ringlypro_zoho' : 'ringlypro',
      zohoCalendarActive: result.zohoCalendarActive,
      googleCalendarActive: result.googleCalendarActive,
      zohoEventId: result.zohoEvent?.id
    };

  } catch (error) {
    logger.error('[ElevenLabs Tools] book_appointment error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send SMS confirmation
 */
async function handleSendSms(params) {
  const {
    client_id,
    to_phone,
    phone,
    message,
    customer_name,
    appointment_date,
    appointment_time,
    confirmation_code
  } = params;

  try {
    const toNumber = to_phone || phone;
    if (!toNumber) {
      return { success: false, error: 'Missing phone number' };
    }

    // Get client's Twilio number
    const clients = await sequelize.query(`
      SELECT ringlypro_number, business_name FROM clients WHERE id = :clientId
    `, { replacements: { clientId: client_id }, type: QueryTypes.SELECT });

    if (!clients || clients.length === 0) {
      return { success: false, error: 'Client not found' };
    }

    const fromNumber = clients[0].ringlypro_number;
    const businessName = clients[0].business_name;

    // Build message if not provided
    let smsMessage = message;
    if (!smsMessage && customer_name && appointment_date && appointment_time) {
      smsMessage = `Hi ${customer_name}! Your appointment at ${businessName} is confirmed for ${appointment_date} at ${appointment_time}.`;
      if (confirmation_code) {
        smsMessage += ` Confirmation: ${confirmation_code}`;
      }
      smsMessage += ` Reply STOP to opt out.`;
    }

    if (!smsMessage) {
      return { success: false, error: 'Missing message content' };
    }

    // Send via Twilio
    const twilioMessage = await twilioClient.messages.create({
      body: smsMessage,
      from: fromNumber,
      to: toNumber
    });

    logger.info(`[ElevenLabs Tools] SMS sent: ${twilioMessage.sid}`);

    return {
      success: true,
      message_sid: twilioMessage.sid,
      to: toNumber,
      from: fromNumber
    };

  } catch (error) {
    logger.error('[ElevenLabs Tools] send_sms error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Send SMS via GoHighLevel API (for A2P verified numbers)
 * Uses the client's GHL integration to send SMS from their GHL number.
 */
async function handleSendSmsGhl(params) {
  const {
    client_id,
    to_phone,
    phone,
    message,
    customer_name,
    appointment_date,
    appointment_time,
    confirmation_code
  } = params;

  try {
    const toNumber = to_phone || phone;
    if (!toNumber) {
      return { success: false, error: 'Missing phone number' };
    }

    // Get client info and GHL credentials
    // Resolve credentials using same pattern as ghlConversationSyncService:
    // 1. settings.integration.ghl (apiKey) — but use ghl_integrations location if available
    // 2. ghl_integrations table (OAuth)
    const clients = await sequelize.query(`
      SELECT c.business_name,
             c.settings->'integration'->'ghl' as ghl_settings,
             g.access_token as oauth_token,
             g.ghl_location_id as oauth_location_id
      FROM clients c
      LEFT JOIN ghl_integrations g ON g.client_id = c.id AND g.is_active = true
      WHERE c.id = :clientId
    `, { replacements: { clientId: client_id }, type: QueryTypes.SELECT });

    if (!clients || clients.length === 0) {
      return { success: false, error: 'Client not found' };
    }

    const businessName = clients[0].business_name;
    const ghlSettings = clients[0].ghl_settings;
    const oauthToken = clients[0].oauth_token;
    const oauthLocationId = clients[0].oauth_location_id;

    // Resolve API key: prefer settings PIT, then OAuth token
    const ghlApiKey = (ghlSettings?.enabled && ghlSettings?.apiKey) ? ghlSettings.apiKey : oauthToken;
    // Resolve location: prefer OAuth location (more reliable), then settings
    const ghlLocationId = oauthLocationId || ghlSettings?.locationId;

    if (!ghlApiKey || !ghlLocationId) {
      logger.warn(`[ElevenLabs Tools] send_sms_ghl: Client ${client_id} has no GHL integration, falling back to Twilio`);
      return await handleSendSms(params);
    }

    logger.info(`[ElevenLabs Tools] send_sms_ghl: Using GHL API key ${ghlApiKey.substring(0, 10)}... with location ${ghlLocationId}`);

    // Build message if not provided
    let smsMessage = message;
    if (!smsMessage && customer_name && appointment_date && appointment_time) {
      smsMessage = `Hi ${customer_name}! Your appointment at ${businessName} is confirmed for ${appointment_date} at ${appointment_time}.`;
      if (confirmation_code) {
        smsMessage += ` Confirmation: ${confirmation_code}`;
      }
      smsMessage += ` Reply STOP to opt out.`;
    }

    if (!smsMessage) {
      return { success: false, error: 'Missing message content' };
    }

    // Normalize phone number
    let normalizedPhone = toNumber.replace(/[^\d+]/g, '');
    if (!normalizedPhone.startsWith('+')) {
      normalizedPhone = '+' + normalizedPhone;
    }

    const axios = require('axios');
    const ghlBaseUrl = 'https://services.leadconnectorhq.com';
    const ghlHeaders = {
      'Authorization': `Bearer ${ghlApiKey}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json'
    };

    // Step 1: Find or create contact in GHL by phone number
    let contactId;
    let contactData;
    try {
      const searchResp = await axios.get(
        `${ghlBaseUrl}/contacts/search/duplicate`,
        {
          params: { locationId: ghlLocationId, number: normalizedPhone },
          headers: ghlHeaders,
          timeout: 10000
        }
      );
      contactId = searchResp.data?.contact?.id;
      contactData = searchResp.data?.contact;
    } catch (searchErr) {
      logger.warn(`[ElevenLabs Tools] GHL contact search failed:`, searchErr.response?.data || searchErr.message);
    }

    // If no contact found, create one
    if (!contactId) {
      try {
        const createResp = await axios.post(
          `${ghlBaseUrl}/contacts/`,
          {
            locationId: ghlLocationId,
            phone: normalizedPhone,
            name: customer_name || 'Caller',
            source: 'RinglyPro AI'
          },
          { headers: ghlHeaders, timeout: 10000 }
        );
        contactId = createResp.data?.contact?.id;
        contactData = createResp.data?.contact;
      } catch (createErr) {
        logger.error(`[ElevenLabs Tools] GHL contact creation failed:`, createErr.response?.data || createErr.message);
        // Fall back to Twilio
        logger.warn(`[ElevenLabs Tools] Falling back to Twilio SMS for client ${client_id}`);
        return await handleSendSms(params);
      }
    }

    if (!contactId) {
      logger.warn(`[ElevenLabs Tools] Could not get GHL contactId, falling back to Twilio`);
      return await handleSendSms(params);
    }

    // Step 1.5: Auto-clear DND if SMS is blocked on this contact
    const smsDnd = contactData?.dndSettings?.SMS;
    if (smsDnd && smsDnd.status === 'active') {
      logger.warn(`[ElevenLabs Tools] Contact ${contactId} has SMS DND active (${smsDnd.message}), clearing it`);
      try {
        await axios.put(
          `${ghlBaseUrl}/contacts/${contactId}`,
          {
            dnd: false,
            dndSettings: {
              SMS: { status: 'inactive', message: '' },
              Call: { status: 'inactive', message: '' }
            }
          },
          { headers: ghlHeaders, timeout: 10000 }
        );
        logger.info(`[ElevenLabs Tools] Cleared DND for contact ${contactId}`);
      } catch (dndErr) {
        logger.warn(`[ElevenLabs Tools] Failed to clear DND for contact ${contactId}:`, dndErr.response?.data || dndErr.message);
      }
    }

    // Step 2: Send SMS via GHL conversations API
    const smsResp = await axios.post(
      `${ghlBaseUrl}/conversations/messages`,
      {
        type: 'SMS',
        contactId: contactId,
        message: smsMessage
      },
      { headers: ghlHeaders, timeout: 15000 }
    );

    logger.info(`[ElevenLabs Tools] GHL SMS sent to ${normalizedPhone} for client ${client_id}, messageId: ${smsResp.data?.messageId || smsResp.data?.id}`);

    return {
      success: true,
      provider: 'ghl',
      message_id: smsResp.data?.messageId || smsResp.data?.id,
      contact_id: contactId,
      to: normalizedPhone
    };

  } catch (error) {
    logger.error('[ElevenLabs Tools] send_sms_ghl error:', error.response?.data || error.message);
    // Fall back to Twilio on any GHL failure
    logger.warn(`[ElevenLabs Tools] GHL SMS failed, falling back to Twilio for client ${client_id}`);
    try {
      return await handleSendSms(params);
    } catch (twilioErr) {
      logger.error('[ElevenLabs Tools] Twilio fallback also failed:', twilioErr.message);
      return { success: false, error: `GHL: ${error.response?.data?.message || error.message}, Twilio fallback also failed` };
    }
  }
}

/**
 * Debug appointment details (temporary)
 */
async function handleDebugAppointment(params) {
  const { appointment_id } = params;

  try {
    const [appointment] = await sequelize.query(
      `SELECT id, client_id, customer_name, appointment_date, appointment_time,
              status, source, zoho_event_id, google_event_id, ghl_appointment_id,
              created_at
       FROM appointments WHERE id = :appointmentId`,
      {
        replacements: { appointmentId: appointment_id },
        type: QueryTypes.SELECT
      }
    );

    if (!appointment) {
      return { success: false, error: 'Appointment not found' };
    }

    return {
      success: true,
      appointment: {
        id: appointment.id,
        client_id: appointment.client_id,
        customer_name: appointment.customer_name,
        date: appointment.appointment_date,
        time: appointment.appointment_time,
        status: appointment.status,
        source: appointment.source,
        zoho_event_id: appointment.zoho_event_id,
        google_event_id: appointment.google_event_id,
        ghl_appointment_id: appointment.ghl_appointment_id,
        created_at: appointment.created_at
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Debug Zoho event creation (temporary)
 */
async function handleDebugZohoCreateEvent(params) {
  const { client_id } = params;

  try {
    const zohoCalendarService = require('../services/zohoCalendarService');

    // Try to create a test event
    const testEvent = {
      title: 'Debug Test Event',
      customerName: 'Debug Customer',
      customerPhone: '+15551234567',
      customerEmail: 'debug@test.com',
      startTime: new Date('2026-02-01T10:00:00'),
      endTime: new Date('2026-02-01T11:00:00'),
      duration: 60,
      description: 'Debug test - can be deleted',
      confirmationCode: 'DEBUG123'
    };

    const result = await zohoCalendarService.createEvent(client_id, testEvent);

    return {
      success: result.success,
      result,
      testEvent: {
        title: testEvent.title,
        startTime: testEvent.startTime.toISOString(),
        endTime: testEvent.endTime.toISOString()
      }
    };
  } catch (error) {
    // Capture full error details
    let errorDetails = {
      message: error.message,
      name: error.name
    };

    if (error.response) {
      errorDetails.status = error.response.status;
      errorDetails.statusText = error.response.statusText;
      errorDetails.data = error.response.data;
    }

    return {
      success: false,
      error: error.message,
      errorDetails
    };
  }
}

/**
 * Debug Zoho settings (temporary)
 */
async function handleDebugZohoSettings(params) {
  const { client_id } = params;

  try {
    const zohoCalendarService = require('../services/zohoCalendarService');
    const zohoStatus = await zohoCalendarService.isZohoCalendarEnabled(client_id);

    return {
      success: true,
      client_id,
      zohoStatus: {
        enabled: zohoStatus?.enabled,
        createEvents: zohoStatus?.createEvents,
        syncCalendar: zohoStatus?.syncCalendar,
        hasSettings: !!zohoStatus?.settings
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Admin tool to set ElevenLabs agent ID
 */
async function handleAdminSetElevenLabsAgent(params) {
  const { client_id, agent_id, api_key } = params;

  const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
  if (api_key !== expectedKey) {
    return { success: false, error: 'Invalid API key' };
  }

  if (!client_id || !agent_id) {
    return { success: false, error: 'client_id and agent_id required' };
  }

  try {
    await sequelize.query(
      'UPDATE clients SET elevenlabs_agent_id = :agentId WHERE id = :clientId',
      { replacements: { agentId: agent_id, clientId: client_id }, type: QueryTypes.UPDATE }
    );

    logger.info(`✅ Set ElevenLabs agent ID for client ${client_id}: ${agent_id}`);
    return { success: true, client_id, agent_id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Admin tool to set ElevenLabs phone number ID
 */
async function handleAdminSetElevenLabsPhone(params) {
  const { client_id, phone_number_id, api_key } = params;

  // Simple API key check
  const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
  if (api_key !== expectedKey) {
    return { success: false, error: 'Invalid API key' };
  }

  if (!client_id || !phone_number_id) {
    return { success: false, error: 'client_id and phone_number_id required' };
  }

  try {
    await sequelize.query(
      'UPDATE clients SET elevenlabs_phone_number_id = :phoneId WHERE id = :clientId',
      { replacements: { phoneId: phone_number_id, clientId: client_id }, type: QueryTypes.UPDATE }
    );

    logger.info(`✅ Set ElevenLabs phone number ID for client ${client_id}: ${phone_number_id}`);
    return { success: true, client_id, phone_number_id };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Admin tool to enable/disable ElevenLabs outbound calling
 */
async function handleAdminEnableElevenLabsOutbound(params) {
  const { client_id, enabled, api_key } = params;

  const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
  if (api_key !== expectedKey) {
    return { success: false, error: 'Invalid API key' };
  }

  if (!client_id) {
    return { success: false, error: 'client_id required' };
  }

  const enableOutbound = enabled !== false && enabled !== 'false';

  try {
    await sequelize.query(
      'UPDATE clients SET use_elevenlabs_outbound = :enabled WHERE id = :clientId',
      { replacements: { enabled: enableOutbound, clientId: client_id }, type: QueryTypes.UPDATE }
    );

    logger.info(`✅ Set use_elevenlabs_outbound for client ${client_id}: ${enableOutbound}`);
    return { success: true, client_id, use_elevenlabs_outbound: enableOutbound };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Admin tool to get client's complete ElevenLabs configuration
 */
async function handleAdminGetClientConfig(params) {
  const { client_id, api_key } = params;

  const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
  if (api_key !== expectedKey) {
    return { success: false, error: 'Invalid API key' };
  }

  if (!client_id) {
    return { success: false, error: 'client_id required' };
  }

  try {
    const [clientData] = await sequelize.query(
      `SELECT
        id, business_name, ringlypro_number,
        elevenlabs_agent_id, elevenlabs_phone_number_id,
        use_elevenlabs_outbound, rachel_enabled
       FROM clients WHERE id = :clientId`,
      { replacements: { clientId: client_id }, type: QueryTypes.SELECT }
    );

    if (!clientData) {
      return { success: false, error: `Client ${client_id} not found` };
    }

    return {
      success: true,
      client_id,
      config: {
        business_name: clientData.business_name,
        ringlypro_number: clientData.ringlypro_number,
        elevenlabs_agent_id: clientData.elevenlabs_agent_id,
        elevenlabs_phone_number_id: clientData.elevenlabs_phone_number_id,
        use_elevenlabs_outbound: clientData.use_elevenlabs_outbound,
        rachel_enabled: clientData.rachel_enabled
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Admin tool to enable/disable deposit requirement for a client
 */
async function handleAdminSetDepositRequired(params) {
  const { client_id, enabled, api_key } = params;

  const expectedKey = process.env.ADMIN_API_KEY || 'ringlypro-quick-admin-2024';
  if (api_key !== expectedKey) {
    return { success: false, error: 'Invalid API key' };
  }

  if (!client_id) {
    return { success: false, error: 'client_id required' };
  }

  const depositRequired = enabled !== false && enabled !== 'false';

  try {
    await sequelize.query(
      'UPDATE clients SET deposit_required = :depositRequired WHERE id = :clientId',
      { replacements: { depositRequired, clientId: client_id }, type: QueryTypes.UPDATE }
    );

    logger.info(`✅ Set deposit_required for client ${client_id}: ${depositRequired}`);
    return { success: true, client_id, deposit_required: depositRequired };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Voice Signup: Create full RinglyPro account from phone call
 * Lina collects info over the phone, then calls this tool to:
 * 1. Create User (random password — user sets via email link)
 * 2. Provision Twilio number
 * 3. Create Client record
 * 4. Provision ElevenLabs voice agent
 * 5. Create Stripe checkout session (14-day trial)
 * 6. Send SMS with Stripe checkout link
 * 7. Send email with set-password link
 */
async function handleSignupClient(params) {
  const bcrypt = require('bcrypt');
  const jwt = require('jsonwebtoken');
  const crypto = require('crypto');
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const { User, Client, CreditAccount } = require('../models');
  const { normalizePhoneFromSpeech } = require('../utils/phoneNormalizer');
  const { sendSetPasswordEmail, sendWelcomeEmail } = require('../services/emailService');

  const PLANS = {
    starter: { name: 'Starter', price: 45, tokens: 500, rollover: true },
    growth: { name: 'Growth', price: 180, tokens: 2000, rollover: true }
  };

  try {
    const {
      first_name, last_name, email, business_name,
      business_phone, plan, business_type, website_url, owner_phone
    } = params;

    // ── Validate required fields ──
    if (!first_name || !last_name) {
      return { success: false, error: 'I need the caller\'s first and last name to create the account.' };
    }
    if (!email) {
      return { success: false, error: 'I need an email address to create the account.' };
    }
    if (!business_name) {
      return { success: false, error: 'I need the business name to set up the account.' };
    }
    if (!business_phone) {
      return { success: false, error: 'I need the business phone number to set up the AI receptionist.' };
    }

    const selectedPlan = PLANS[plan] ? plan : 'starter';
    const planDetails = PLANS[selectedPlan];

    // Normalize phone numbers
    const normalizedBusinessPhone = normalizePhoneFromSpeech(business_phone);
    const normalizedOwnerPhone = owner_phone ? normalizePhoneFromSpeech(owner_phone) : normalizedBusinessPhone;
    const cleanWebsiteUrl = website_url && website_url.trim() !== '' ? website_url.trim() : null;

    // ── Check uniqueness ──
    const existingUser = await User.findOne({ where: { email: email.toLowerCase().trim() } });
    if (existingUser) {
      return { success: false, error: 'An account already exists with that email address. The caller may already have a RinglyPro account.' };
    }

    const existingClient = await Client.findOne({ where: { business_phone: normalizedBusinessPhone } });
    if (existingClient) {
      return { success: false, error: 'That business phone number is already registered with RinglyPro.' };
    }

    // ── Create account inside DB transaction ──
    const transaction = await sequelize.transaction();

    try {
      // Random password (user will set their own via email link)
      const randomPassword = crypto.randomBytes(32).toString('hex');
      const passwordHash = await bcrypt.hash(randomPassword, 12);

      // Create User
      const user = await User.create({
        email: email.toLowerCase().trim(),
        password_hash: passwordHash,
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        business_name: business_name.trim(),
        business_phone: normalizedBusinessPhone,
        business_type: business_type || null,
        website_url: cleanWebsiteUrl,
        phone_number: normalizedOwnerPhone,
        terms_accepted: true,
        free_trial_minutes: 100,
        onboarding_completed: false,
        subscription_plan: selectedPlan,
        billing_frequency: 'monthly',
        subscription_status: 'pending',
        trial_ends_at: null,
        monthly_token_allocation: planDetails.tokens,
        tokens_balance: 0
      }, { transaction });

      logger.info(`[Voice Signup] User created: ${user.id} (${email})`);

      // Provision Twilio number
      let twilioNumber, twilioSid;

      if (process.env.SKIP_TWILIO_PROVISIONING === 'true') {
        twilioNumber = `+1555${Math.floor(Math.random() * 10000000).toString().padStart(7, '0')}`;
        twilioSid = `PN${Math.random().toString(36).substring(2, 15)}`;
        logger.info(`[Voice Signup] TEST MODE: Mock Twilio number: ${twilioNumber}`);
      } else {
        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
        const availableNumbers = await twilioClient.availablePhoneNumbers('US')
          .local.list({ limit: 1, voiceEnabled: true, smsEnabled: true });

        if (!availableNumbers || availableNumbers.length === 0) {
          await transaction.rollback();
          return { success: false, error: 'There was an issue provisioning a phone number. Please try again or let me transfer you to support.' };
        }

        const purchasedNumber = await twilioClient.incomingPhoneNumbers.create({
          phoneNumber: availableNumbers[0].phoneNumber,
          voiceUrl: `${webhookBaseUrl}/voice/rachel/`,
          voiceMethod: 'POST',
          statusCallback: `${webhookBaseUrl}/voice/webhook/call-status`,
          statusCallbackMethod: 'POST',
          statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
          smsUrl: `${webhookBaseUrl}/api/messages/incoming`,
          smsMethod: 'POST',
          friendlyName: `RinglyPro - ${business_name.trim()}`
        });

        twilioNumber = purchasedNumber.phoneNumber;
        twilioSid = purchasedNumber.sid;
        logger.info(`[Voice Signup] Twilio number provisioned: ${twilioNumber}`);
      }

      // Generate referral code
      let referralCode = null;
      try {
        const referralUtils = require('../utils/referralCode');
        referralCode = await referralUtils.generateUniqueReferralCode();
      } catch (e) {
        logger.warn('[Voice Signup] Referral code generation skipped');
      }

      // Create Client record
      const client = await Client.create({
        business_name: business_name.trim(),
        business_phone: normalizedBusinessPhone,
        ringlypro_number: twilioNumber,
        twilio_number_sid: twilioSid,
        forwarding_status: 'active',
        owner_name: `${first_name.trim()} ${last_name.trim()}`,
        owner_phone: normalizedOwnerPhone,
        owner_email: email.toLowerCase().trim(),
        custom_greeting: `Hello! Thank you for calling ${business_name.trim()}. How may I help you today?`,
        business_hours_start: '09:00:00',
        business_hours_end: '17:00:00',
        business_days: 'Mon-Fri',
        timezone: 'America/New_York',
        appointment_duration: 30,
        booking_enabled: true,
        sms_notifications: true,
        monthly_free_minutes: 100,
        per_minute_rate: 0.10,
        rachel_enabled: false,
        referral_code: referralCode,
        active: true,
        user_id: user.id
      }, { transaction });

      logger.info(`[Voice Signup] Client created: ${client.id}`);

      // Create Credit Account
      try {
        if (CreditAccount) {
          await CreditAccount.create({
            client_id: client.id,
            balance: 0.00,
            free_minutes_used: 0
          }, { transaction });
        }
      } catch (creditErr) {
        logger.warn('[Voice Signup] Credit account creation error (non-fatal):', creditErr.message);
      }

      // Commit transaction
      await transaction.commit();
      logger.info(`[Voice Signup] Transaction committed for client ${client.id}`);

      // ── Post-transaction steps (non-blocking) ──

      // Provision ElevenLabs agent
      let elevenlabsProvisioned = false;
      if (process.env.SKIP_ELEVENLABS_PROVISIONING !== 'true') {
        try {
          const elevenLabsProvisioning = require('../services/elevenLabsProvisioningService');
          const elResult = await elevenLabsProvisioning.provisionAgent(
            {
              businessName: business_name.trim(),
              businessType: business_type || null,
              websiteUrl: cleanWebsiteUrl,
              ownerPhone: normalizedOwnerPhone,
              language: 'en'
            },
            twilioNumber, twilioSid, client.id
          );

          if (elResult.success) {
            await sequelize.query(
              `UPDATE clients SET elevenlabs_agent_id = :agentId, elevenlabs_phone_number_id = :phoneNumberId WHERE id = :clientId`,
              { replacements: { agentId: elResult.agentId, phoneNumberId: elResult.phoneNumberId, clientId: client.id } }
            );
            elevenlabsProvisioned = true;
            logger.info(`[Voice Signup] ElevenLabs provisioned: agent=${elResult.agentId}`);
          }
        } catch (elErr) {
          logger.error('[Voice Signup] ElevenLabs provisioning error (non-critical):', elErr.message);
        }
      }

      // Create Stripe checkout session with 14-day trial
      let stripeCheckoutUrl = null;
      try {
        const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
        const session = await stripe.checkout.sessions.create({
          customer_email: email.toLowerCase().trim(),
          payment_method_types: ['card'],
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: `RinglyPro ${planDetails.name} Plan`,
                description: `${planDetails.tokens} tokens/month (${Math.floor(planDetails.tokens / 5)} minutes of voice)`
              },
              unit_amount: planDetails.price * 100,
              recurring: { interval: 'month', interval_count: 1 }
            },
            quantity: 1
          }],
          mode: 'subscription',
          subscription_data: {
            trial_period_days: 14,
            metadata: {
              userId: user.id.toString(),
              plan: selectedPlan,
              monthlyTokens: planDetails.tokens.toString(),
              billing: 'monthly',
              clientId: client.id.toString(),
              rollover: planDetails.rollover.toString()
            }
          },
          success_url: `${webhookBaseUrl}/dashboard?welcome=true`,
          cancel_url: `${webhookBaseUrl}/pricing`,
          metadata: {
            userId: user.id.toString(),
            plan: selectedPlan,
            clientId: client.id.toString(),
            source: 'voice_signup'
          }
        });

        stripeCheckoutUrl = session.url;
        logger.info(`[Voice Signup] Stripe checkout created: ${session.id}`);
      } catch (stripeErr) {
        logger.error('[Voice Signup] Stripe error (non-critical):', stripeErr.message);
      }

      // Generate set-password JWT (reuses existing /reset-password flow)
      let setPasswordLink = null;
      try {
        const setPasswordToken = jwt.sign(
          { userId: user.id, email: user.email, type: 'password_reset' },
          process.env.JWT_SECRET || 'your-super-secret-jwt-key',
          { expiresIn: '24h' }
        );

        await User.update(
          { email_verification_token: setPasswordToken },
          { where: { id: user.id } }
        );

        const appUrl = process.env.APP_URL || 'https://aiagent.ringlypro.com';
        setPasswordLink = `${appUrl}/reset-password?token=${setPasswordToken}`;

        // Send set-password email
        await sendSetPasswordEmail(email.toLowerCase().trim(), setPasswordToken, first_name.trim());
        logger.info(`[Voice Signup] Set-password email sent to ${email}`);
      } catch (emailErr) {
        logger.error('[Voice Signup] Set-password email error (non-critical):', emailErr.message);
      }

      // Send SMS with Stripe checkout link
      if (stripeCheckoutUrl) {
        try {
          // Use DIGIT2AI system number (routes through GHL webhook for SMS)
          const fromNumber = process.env.RINGLYPRO_SYSTEM_NUMBER || '+12232949184';
          const smsBody = `Welcome to RinglyPro, ${first_name.trim()}! Start your 14-day free trial of the ${planDetails.name} Plan ($${planDetails.price}/mo). Complete your setup here: ${stripeCheckoutUrl}`;

          await twilioClient.messages.create({
            body: smsBody,
            from: fromNumber,
            to: normalizedOwnerPhone
          });
          logger.info(`[Voice Signup] Checkout SMS sent to ${normalizedOwnerPhone}`);
        } catch (smsErr) {
          logger.error('[Voice Signup] SMS error (non-critical):', smsErr.message);
        }
      }

      // Send welcome email too
      try {
        await sendWelcomeEmail({
          email: email.toLowerCase().trim(),
          firstName: first_name.trim(),
          lastName: last_name.trim(),
          businessName: business_name.trim(),
          ringlyproNumber: twilioNumber,
          ccEmail: 'mstagg@digit2ai.com'
        });
      } catch (welcomeErr) {
        logger.error('[Voice Signup] Welcome email error (non-critical):', welcomeErr.message);
      }

      return {
        success: true,
        message: `Account created for ${business_name.trim()}. A text message with the payment link and an email to set the password have been sent. The ${planDetails.name} Plan includes a 14-day free trial at $${planDetails.price} per month.`,
        client_id: client.id,
        ringlypro_number: twilioNumber,
        plan: planDetails.name,
        trial_days: 14,
        elevenlabs_provisioned: elevenlabsProvisioned
      };

    } catch (innerError) {
      try { await transaction.rollback(); } catch (rbErr) { /* already rolled back */ }
      logger.error('[Voice Signup] Transaction error:', innerError);
      return { success: false, error: 'There was an issue creating the account. Let me transfer you to our support team.' };
    }

  } catch (error) {
    logger.error('[Voice Signup] Unexpected error:', error);
    return { success: false, error: 'There was a temporary issue. Please try again in a moment.' };
  }
}

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'elevenlabs-tools',
    timestamp: new Date().toISOString(),
    available_tools: [
      'get_business_info',
      'check_availability',
      'book_appointment',
      'send_sms'
    ]
  });
});

// =============================================================================
// CONVERSATION AUDIO & HISTORY ENDPOINTS
// =============================================================================

const elevenlabsConversationService = require('../services/elevenlabsConversationService');

/**
 * Get conversation audio recording
 * GET /api/elevenlabs/tools/conversations/:conversationId/audio
 *
 * Proxies the audio from ElevenLabs API to avoid CORS issues
 * and keep API key secure on backend
 */
router.get('/conversations/:conversationId/audio', async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({ success: false, error: 'Missing conversationId' });
    }

    logger.info(`[ElevenLabs Tools] Fetching audio for conversation: ${conversationId}`);

    const audioBuffer = await elevenlabsConversationService.getConversationAudio(conversationId);

    // Set appropriate headers for audio streaming
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': audioBuffer.length,
      'Content-Disposition': `inline; filename="conversation-${conversationId}.mp3"`,
      'Cache-Control': 'public, max-age=3600'
    });

    return res.send(audioBuffer);

  } catch (error) {
    logger.error(`[ElevenLabs Tools] Error fetching conversation audio:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch audio'
    });
  }
});

/**
 * Get conversation details (transcript, metadata)
 * GET /api/elevenlabs/tools/conversations/:conversationId
 */
router.get('/conversations/:conversationId', async (req, res) => {
  try {
    const { conversationId } = req.params;

    if (!conversationId) {
      return res.status(400).json({ success: false, error: 'Missing conversationId' });
    }

    logger.info(`[ElevenLabs Tools] Fetching details for conversation: ${conversationId}`);

    const details = await elevenlabsConversationService.getConversationDetails(conversationId);

    return res.json({
      success: true,
      conversation: details
    });

  } catch (error) {
    logger.error(`[ElevenLabs Tools] Error fetching conversation details:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch conversation details'
    });
  }
});

/**
 * List conversations for an agent (with optional client filtering)
 * GET /api/elevenlabs/tools/conversations?agentId=xxx&clientId=xxx
 */
router.get('/conversations', async (req, res) => {
  try {
    const { agentId, clientId, cursor } = req.query;

    // If clientId provided, get the agent ID from the client record
    let targetAgentId = agentId;

    if (clientId && !agentId) {
      const clients = await sequelize.query(`
        SELECT elevenlabs_agent_id FROM clients WHERE id = :clientId
      `, { replacements: { clientId }, type: QueryTypes.SELECT });

      if (clients && clients.length > 0 && clients[0].elevenlabs_agent_id) {
        targetAgentId = clients[0].elevenlabs_agent_id;
      }
    }

    if (!targetAgentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing agentId or clientId with ElevenLabs configuration'
      });
    }

    logger.info(`[ElevenLabs Tools] Listing conversations for agent: ${targetAgentId}`);

    const result = await elevenlabsConversationService.listConversations(targetAgentId, { cursor });

    return res.json({
      success: true,
      agent_id: targetAgentId,
      conversations: result.conversations || [],
      next_cursor: result.next_cursor || null
    });

  } catch (error) {
    logger.error(`[ElevenLabs Tools] Error listing conversations:`, error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to list conversations'
    });
  }
});

/**
 * Webhook endpoint for ElevenLabs post-call events
 * POST /api/elevenlabs/tools/webhook/call-complete
 *
 * ElevenLabs can be configured to send webhooks when conversations end.
 * This stores the conversation data in our calls table for dashboard access.
 */
router.post('/webhook/call-complete', async (req, res) => {
  try {
    const body = req.body || {};

    logger.info(`[ElevenLabs Webhook] Received call-complete event:`, JSON.stringify(body).substring(0, 500));

    const {
      conversation_id,
      agent_id,
      status,
      call_duration_secs,
      from_number,
      to_number,
      transcript,
      metadata
    } = body;

    if (!conversation_id) {
      logger.warn('[ElevenLabs Webhook] Missing conversation_id in webhook');
      return res.status(400).json({ success: false, error: 'Missing conversation_id' });
    }

    // Find the client by agent_id or to_number
    let clientId = metadata?.client_id;

    if (!clientId && to_number) {
      const clients = await sequelize.query(`
        SELECT id FROM clients WHERE ringlypro_number = :phone OR elevenlabs_agent_id = :agentId
      `, {
        replacements: { phone: to_number, agentId: agent_id },
        type: QueryTypes.SELECT
      });

      if (clients && clients.length > 0) {
        clientId = clients[0].id;
      }
    }

    if (!clientId) {
      logger.warn(`[ElevenLabs Webhook] Could not find client for conversation ${conversation_id}`);
      // Still return 200 to acknowledge receipt
      return res.json({ success: true, message: 'Received but client not found' });
    }

    // Store or update call record
    // First check if call already exists
    const existingCalls = await sequelize.query(`
      SELECT id FROM calls WHERE elevenlabs_conversation_id = :conversationId
    `, { replacements: { conversationId: conversation_id }, type: QueryTypes.SELECT });

    if (existingCalls && existingCalls.length > 0) {
      // Update existing call
      await sequelize.query(`
        UPDATE calls SET
          status = :status,
          call_status = 'completed',
          duration = :duration,
          notes = :notes,
          updated_at = NOW()
        WHERE elevenlabs_conversation_id = :conversationId
      `, {
        replacements: {
          status: status === 'done' ? 'completed' : status,
          duration: call_duration_secs || 0,
          notes: transcript ? JSON.stringify(transcript).substring(0, 2000) : null,
          conversationId: conversation_id
        }
      });

      logger.info(`[ElevenLabs Webhook] Updated call record for conversation ${conversation_id}`);
    } else {
      // Insert new call record
      await sequelize.query(`
        INSERT INTO calls (
          client_id, direction, from_number, to_number, status, call_status,
          duration, elevenlabs_conversation_id, notes, created_at, updated_at
        ) VALUES (
          :clientId, 'incoming', :fromNumber, :toNumber, :status, 'completed',
          :duration, :conversationId, :notes, NOW(), NOW()
        )
      `, {
        replacements: {
          clientId,
          fromNumber: from_number || 'unknown',
          toNumber: to_number || 'unknown',
          status: status === 'done' ? 'completed' : (status || 'completed'),
          duration: call_duration_secs || 0,
          conversationId: conversation_id,
          notes: transcript ? JSON.stringify(transcript).substring(0, 2000) : null
        }
      });

      logger.info(`[ElevenLabs Webhook] Created call record for conversation ${conversation_id}`);
    }

    return res.json({ success: true, message: 'Call record saved' });

  } catch (error) {
    logger.error(`[ElevenLabs Webhook] Error processing call-complete:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
