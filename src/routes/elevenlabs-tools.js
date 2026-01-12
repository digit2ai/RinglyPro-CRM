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

module.exports = router;
