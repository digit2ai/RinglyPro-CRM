/**
 * ElevenLabs Voice Webhook Handler
 *
 * This route handles incoming Twilio calls and routes them to ElevenLabs
 * Conversational AI when the client has voice_provider = 'elevenlabs'.
 *
 * Flow:
 * 1. Twilio receives inbound call
 * 2. This webhook identifies the client by the called number
 * 3. If client uses ElevenLabs, register the call with ElevenLabs API
 * 4. Return TwiML to connect Twilio to ElevenLabs via WebSocket stream
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { sequelize } = require('../models');
const { QueryTypes } = require('sequelize');
const VoiceResponse = require('twilio').twiml.VoiceResponse;

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

/**
 * Normalize phone number (handle URL encoding where + becomes space)
 */
function normalizePhone(phone) {
  if (!phone) return phone;
  if (phone.startsWith(' ')) {
    return '+' + phone.substring(1);
  }
  return phone;
}

/**
 * Main voice webhook for ElevenLabs routing
 * POST /voice/elevenlabs/incoming
 */
router.post('/incoming', async (req, res) => {
  const twiml = new VoiceResponse();

  try {
    const CallSid = req.body?.CallSid;
    const From = normalizePhone(req.body?.From);
    const To = normalizePhone(req.body?.To);

    logger.info(`[ElevenLabs Voice] Incoming call: ${From} -> ${To}, CallSid: ${CallSid}`);

    // Find client by the called number
    const clients = await sequelize.query(`
      SELECT
        id,
        business_name,
        voice_provider,
        elevenlabs_agent_id,
        custom_greeting,
        ringlypro_number,
        settings->'integration'->'ghl'->>'calendarId' as ghl_calendar_id,
        settings->'integration'->'ghl'->>'locationId' as ghl_location_id
      FROM clients
      WHERE ringlypro_number = :phone AND active = true
    `, {
      replacements: { phone: To },
      type: QueryTypes.SELECT
    });

    if (!clients || clients.length === 0) {
      logger.warn(`[ElevenLabs Voice] No client found for number: ${To}`);
      twiml.say('Sorry, this number is not configured. Goodbye.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    const client = clients[0];

    // Check if client is configured for ElevenLabs
    if (client.voice_provider !== 'elevenlabs' || !client.elevenlabs_agent_id) {
      logger.warn(`[ElevenLabs Voice] Client ${client.id} not configured for ElevenLabs`);
      twiml.say('This service is not available. Please try again later.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // Register the call with ElevenLabs
    const agentId = client.elevenlabs_agent_id;

    logger.info(`[ElevenLabs Voice] Registering call with ElevenLabs agent: ${agentId}`);

    const registerResponse = await fetch('https://api.elevenlabs.io/v1/convai/twilio/register-call', {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: agentId,
        from_number: From,
        to_number: To,
        direction: 'inbound',
        conversation_initiation_client_data: {
          dynamic_variables: {
            caller_number: From,
            called_number: To,
            client_id: String(client.id),
            business_name: client.business_name,
            ghl_calendar_id: client.ghl_calendar_id || '',
            ghl_location_id: client.ghl_location_id || ''
          }
        }
      })
    });

    if (!registerResponse.ok) {
      const errorText = await registerResponse.text();
      logger.error(`[ElevenLabs Voice] Failed to register call: ${registerResponse.status} - ${errorText}`);
      twiml.say('Sorry, we are experiencing technical difficulties. Please try again later.');
      twiml.hangup();
      return res.type('text/xml').send(twiml.toString());
    }

    // ElevenLabs returns TwiML with the Stream configuration
    const elevenLabsTwiml = await registerResponse.text();

    logger.info(`[ElevenLabs Voice] Successfully registered call, returning TwiML`);

    // Return the TwiML from ElevenLabs directly
    return res.type('text/xml').send(elevenLabsTwiml);

  } catch (error) {
    logger.error(`[ElevenLabs Voice] Error:`, error);
    twiml.say('Sorry, an error occurred. Please try again later.');
    twiml.hangup();
    return res.type('text/xml').send(twiml.toString());
  }
});

/**
 * Status callback for ElevenLabs calls
 * POST /voice/elevenlabs/status
 */
router.post('/status', async (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration, From, To } = req.body;

    logger.info(`[ElevenLabs Voice] Call status: ${CallSid} - ${CallStatus}, Duration: ${CallDuration}s`);

    // Log call completion for billing/analytics if needed
    if (CallStatus === 'completed' && CallDuration) {
      // Could deduct tokens here based on call duration
      // For now, just log it
      logger.info(`[ElevenLabs Voice] Call completed: ${From} -> ${To}, Duration: ${CallDuration}s`);
    }

    res.sendStatus(200);

  } catch (error) {
    logger.error(`[ElevenLabs Voice] Status callback error:`, error);
    res.sendStatus(500);
  }
});

/**
 * Health check
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'elevenlabs-voice',
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
