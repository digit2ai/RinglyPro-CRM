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
 * ElevenLabs Post-Call Webhook
 * Called by ElevenLabs when a conversation ends
 * POST /voice/elevenlabs/post-call-webhook
 *
 * This saves the call to the Messages table automatically
 */
router.post('/post-call-webhook', async (req, res) => {
  try {
    const body = req.body;

    logger.info(`[ElevenLabs] Post-call webhook received:`, JSON.stringify(body).substring(0, 500));

    // Extract data from webhook payload
    const conversationId = body.conversation_id || body.id;
    const agentId = body.agent_id;
    const status = body.status; // 'done', 'failed', etc.
    const transcript = body.transcript || [];
    const metadata = body.metadata || {};
    const analysis = body.analysis || {};

    // Get call details
    const phoneNumber = metadata.phone_number ||
                       body.call?.phone_number ||
                       body.user_id ||
                       analysis.user_id ||
                       'Unknown';

    const duration = metadata.call_duration_secs ||
                    body.call_duration_secs ||
                    body.duration_seconds ||
                    null;

    const callType = body.call_type || 'inbound';
    const startTimeUnix = metadata.start_time_unix_secs;
    const callTimestamp = startTimeUnix ? new Date(startTimeUnix * 1000) : new Date();

    // Build summary from transcript
    let summary = 'AI Phone Call';
    if (transcript && transcript.length > 0) {
      const firstMessages = transcript.slice(0, 4)
        .map(t => t.message || t.text)
        .filter(Boolean)
        .join(' | ');
      summary = firstMessages.substring(0, 500) || 'AI Phone Call';
    }

    // Find client by agent ID
    const [clientData] = await sequelize.query(
      'SELECT id, business_name FROM clients WHERE elevenlabs_agent_id = :agentId',
      { replacements: { agentId }, type: QueryTypes.SELECT }
    );

    if (!clientData) {
      logger.warn(`[ElevenLabs] Post-call webhook: No client found for agent ${agentId}`);
      return res.status(200).json({ success: true, message: 'No client found for agent' });
    }

    const clientId = clientData.id;

    // Check if this conversation already exists
    const [existing] = await sequelize.query(
      'SELECT id FROM messages WHERE twilio_sid = :conversationId',
      { replacements: { conversationId }, type: QueryTypes.SELECT }
    );

    if (existing) {
      logger.info(`[ElevenLabs] Post-call webhook: Conversation ${conversationId} already exists, skipping`);
      return res.status(200).json({ success: true, message: 'Already synced' });
    }

    // Audio URL via proxy (using messages route which doesn't require admin auth)
    const audioUrl = `/api/messages/elevenlabs-audio/${conversationId}`;

    // Insert into messages table
    await sequelize.query(
      `INSERT INTO messages (
        client_id, twilio_sid, recording_url, direction,
        from_number, to_number, body, status,
        message_type, call_duration, call_start_time,
        message_source, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
      {
        bind: [
          clientId,
          conversationId,
          audioUrl,
          callType === 'outbound' ? 'outgoing' : 'incoming',
          phoneNumber,
          '', // to_number
          summary,
          'received',
          'call',
          duration,
          callTimestamp,
          'elevenlabs',
          callTimestamp
        ]
      }
    );

    logger.info(`[ElevenLabs] Post-call webhook: Saved call ${conversationId} for client ${clientId} (${clientData.business_name})`);

    res.status(200).json({
      success: true,
      message: 'Call saved',
      conversationId,
      clientId
    });

  } catch (error) {
    logger.error(`[ElevenLabs] Post-call webhook error:`, error);
    // Return 200 to prevent ElevenLabs from retrying
    res.status(200).json({ success: false, error: error.message });
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
