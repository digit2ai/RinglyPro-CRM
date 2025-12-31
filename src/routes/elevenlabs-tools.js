/**
 * ElevenLabs Conversational AI Tools Webhook
 *
 * This endpoint handles tool calls from ElevenLabs agents.
 * It exposes RinglyPro's booking infrastructure as callable tools.
 *
 * Tools available:
 * - get_business_info: Get client business details
 * - check_availability: Get available appointment slots
 * - book_appointment: Create appointment in RinglyPro + sync to GHL
 * - send_sms: Send SMS confirmation
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const appointmentService = require('../services/appointmentService');
const ghlBookingService = require('../services/ghlBookingService');
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
    // ElevenLabs sends all parameters flat in the body, not nested under "parameters"
    // Support both formats for flexibility
    const body = req.body || {};
    const tool_name = body.tool_name;
    const conversation_id = body.conversation_id;
    const agent_id = body.agent_id;

    // If ElevenLabs sends nested parameters, use those; otherwise use the whole body
    const params = body.parameters || body;

    logger.info(`[ElevenLabs Tools] Received tool call: ${tool_name}`, {
      conversation_id,
      agent_id,
      params: JSON.stringify(params)
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
        booking_url,
        settings->'integration'->'ghl' as ghl_settings
      FROM clients
      WHERE ${whereClause} AND active = true
    `, { replacements, type: QueryTypes.SELECT });

    if (!clients || clients.length === 0) {
      return { success: false, error: 'Client not found' };
    }

    const client = clients[0];
    const ghlSettings = client.ghl_settings || {};

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
      ghl_calendar_id: ghlSettings.calendarId,
      ghl_location_id: ghlSettings.locationId
    };

  } catch (error) {
    logger.error('[ElevenLabs Tools] get_business_info error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check availability for appointments
 */
async function handleCheckAvailability(params) {
  const {
    client_id,
    date,
    days_ahead = 7,
    timezone = 'America/New_York',
    ghl_calendar_id,
    ghl_location_id,
    ghl_api_key  // Allow passing API key directly for flexibility
  } = params;

  try {
    if (!client_id) {
      return { success: false, error: 'Missing client_id' };
    }

    // Get client's GHL settings if not provided
    let calendarId = ghl_calendar_id;
    let locationId = ghl_location_id;

    if (!calendarId) {
      const clients = await sequelize.query(`
        SELECT
          settings->'integration'->'ghl'->>'calendarId' as calendar_id,
          settings->'integration'->'ghl'->>'locationId' as location_id,
          ghl_api_key
        FROM clients WHERE id = :clientId
      `, { replacements: { clientId: client_id }, type: QueryTypes.SELECT });

      if (clients && clients.length > 0) {
        calendarId = clients[0].calendar_id;
        locationId = clients[0].location_id;
      }
    }

    if (!calendarId) {
      return { success: false, error: 'No GHL calendar configured for this client' };
    }

    // Calculate date range - GHL API requires Unix timestamps in milliseconds
    const startTimestamp = date ? new Date(date).getTime() : Date.now();
    const endTimestamp = startTimestamp + (parseInt(days_ahead) || 7) * 86400000;

    // Get API key - prefer passed key, then from credentials
    let apiKey = ghl_api_key;
    if (!apiKey) {
      const credentials = await ghlBookingService.getClientCredentials(client_id);
      apiKey = credentials?.apiKey;
    }

    if (!apiKey) {
      return { success: false, error: 'GHL API key not configured' };
    }

    // Call GHL API directly for availability
    const response = await fetch(
      `https://services.leadconnectorhq.com/calendars/${calendarId}/free-slots?startDate=${startTimestamp}&endDate=${endTimestamp}&timezone=${timezone}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Version': '2021-07-28'
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to fetch slots' };
    }

    // Flatten and limit slots - GHL returns { "YYYY-MM-DD": { "slots": [...] }, ... }
    const slots = [];
    for (const [dateKey, dayData] of Object.entries(data || {})) {
      // Skip non-date keys like "traceId"
      if (dateKey === 'traceId' || !dayData) continue;

      // Handle both formats: { slots: [...] } or direct array
      const timeSlots = dayData.slots || (Array.isArray(dayData) ? dayData : []);

      if (Array.isArray(timeSlots)) {
        for (const slot of timeSlots) {
          const time = typeof slot === 'string' ? slot : slot.startTime || slot.start;
          if (time) {
            slots.push({
              date: dateKey,
              time: time,
              datetime: time
            });
          }
          if (slots.length >= 10) break;
        }
      }
      if (slots.length >= 10) break;
    }

    return {
      success: true,
      calendar_id: calendarId,
      timezone,
      start_date: new Date(startTimestamp).toISOString().split('T')[0],
      end_date: new Date(endTimestamp).toISOString().split('T')[0],
      slots,
      slot_count: slots.length
    };

  } catch (error) {
    logger.error('[ElevenLabs Tools] check_availability error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Book an appointment
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
    purpose = 'Phone booking via AI Assistant',
    ghl_calendar_id,
    ghl_contact_id
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

    // Build appointment data
    const appointmentData = {
      customer_name: name,
      customer_phone: phoneNum,
      customer_email: emailAddr || `${phoneNum.replace(/\D/g, '')}@phone.ringlypro.com`,
      appointment_date: finalDate,
      appointment_time: finalTime,
      duration: parseInt(duration),
      purpose,
      source: 'voice_booking'  // Use valid enum value (elevenlabs_voice not in enum)
    };

    logger.info(`[ElevenLabs Tools] Booking appointment for client ${client_id}:`, appointmentData);

    // Use the appointment service to create the appointment
    const result = await appointmentService.bookAppointment(client_id, appointmentData);

    if (!result.success) {
      return { success: false, error: result.error || 'Failed to book appointment' };
    }

    // Also sync to GHL if configured
    try {
      logger.info(`[ElevenLabs Tools] Attempting GHL sync with:`, {
        clientId: client_id,
        customerName: name,
        customerPhone: phoneNum,
        date: finalDate,
        time: finalTime,
        calendarId: ghl_calendar_id
      });

      const ghlResult = await ghlBookingService.bookFromWhatsApp(client_id, {
        customerName: name,
        customerPhone: phoneNum,
        customerEmail: emailAddr,
        date: finalDate,
        time: finalTime,
        service: purpose,
        calendarId: ghl_calendar_id
      });

      if (ghlResult.success) {
        logger.info(`[ElevenLabs Tools] GHL sync SUCCESS: ${ghlResult.appointment?.id}`);
      } else {
        logger.error(`[ElevenLabs Tools] GHL sync FAILED: ${ghlResult.error}`, ghlResult);
      }
    } catch (ghlError) {
      logger.error(`[ElevenLabs Tools] GHL sync EXCEPTION: ${ghlError.message}`, ghlError.stack);
    }

    return {
      success: true,
      message: `Appointment booked successfully for ${name}`,
      appointment_id: result.appointment?.id,
      confirmation_code: result.confirmation_code || result.appointment?.confirmation_code,
      appointment_date: finalDate,
      appointment_time: finalTime,
      customer_name: name,
      customer_phone: phoneNum
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
