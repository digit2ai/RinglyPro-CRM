// Outbound Caller Routes - API endpoints for calling functionality
const express = require('express');
const router = express.Router();
const outboundCallerService = require('../services/outbound-caller');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

/**
 * POST /api/outbound-caller/call
 * Make a single outbound call (authenticated)
 */
router.post('/call', authenticateToken, async (req, res) => {
  try {
    const { phone, leadData } = req.body;
    const userId = req.user.userId || req.user.id;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    const result = await outboundCallerService.makeCall(phone, leadData, userId);

    res.json(result);

  } catch (error) {
    logger.error('Error making call:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/outbound-caller/call-from-copilot
 * Make a single outbound call from copilot (uses clientId instead of JWT)
 */
router.post('/call-from-copilot', async (req, res) => {
  try {
    const { phone, leadData, clientId } = req.body;

    if (!phone) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required'
      });
    }

    // Get userId from clientId
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    const result = await sequelize.query(
      'SELECT user_id FROM clients WHERE id = :clientId',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    if (!result || result.length === 0 || !result[0].user_id) {
      logger.error(`Client ${clientId} has no user_id`);
      return res.status(400).json({
        success: false,
        error: 'Client not properly configured. Please contact support.'
      });
    }

    const userId = result[0].user_id;
    logger.info(`Making call for client ${clientId}, user ${userId}`);

    const callResult = await outboundCallerService.makeCall(phone, leadData, userId, clientId);

    res.json(callResult);

  } catch (error) {
    logger.error('Error making call from copilot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/outbound-caller/start-from-copilot
 * Start auto-calling from Business Collector (uses clientId instead of JWT)
 */
router.post('/start-from-copilot', async (req, res) => {
  try {
    const { clientId, leads, intervalMinutes } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required'
      });
    }

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid leads array is required'
      });
    }

    // Get userId from clientId
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    const result = await sequelize.query(
      'SELECT user_id FROM clients WHERE id = :clientId',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    if (!result || result.length === 0 || !result[0].user_id) {
      logger.error(`Client ${clientId} has no user_id`);
      return res.status(400).json({
        success: false,
        error: 'Client not properly configured. Please contact support.'
      });
    }

    const userId = result[0].user_id;
    logger.info(`Starting auto-calling for client ${clientId}, user ${userId}`);

    const callResult = await outboundCallerService.startAutoCalling(
      leads,
      intervalMinutes || 2,
      userId,
      parseInt(clientId) // Pass clientId for custom voicemail message
    );

    res.json(callResult);

  } catch (error) {
    logger.error('Error starting auto-calling from copilot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/outbound-caller/next-call-from-copilot
 * Make next call in queue (frontend-driven for serverless compatibility)
 */
router.post('/next-call-from-copilot', async (req, res) => {
  try {
    const { clientId } = req.body;

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Client ID is required'
      });
    }

    // Get userId from clientId
    const { sequelize } = require('../models');
    const { QueryTypes } = require('sequelize');

    const result = await sequelize.query(
      'SELECT user_id FROM clients WHERE id = :clientId',
      {
        replacements: { clientId: parseInt(clientId) },
        type: QueryTypes.SELECT
      }
    );

    if (!result || result.length === 0 || !result[0].user_id) {
      logger.error(`Client ${clientId} has no user_id`);
      return res.status(400).json({
        success: false,
        error: 'Client not properly configured. Please contact support.'
      });
    }

    const userId = result[0].user_id;

    // Check if calling is still running
    const status = outboundCallerService.getStatus();
    if (!status.isRunning) {
      return res.json({
        success: true,
        done: true,
        message: 'All calls completed'
      });
    }

    // Make next call (this will auto-increment the index)
    await outboundCallerService.makeNextCall();

    // Return updated status
    const newStatus = outboundCallerService.getStatus();
    res.json({
      success: true,
      done: !newStatus.isRunning,
      ...newStatus
    });

  } catch (error) {
    logger.error('Error making next call from copilot:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/outbound-caller/start
 * Start auto-calling from lead list (authenticated)
 */
router.post('/start', authenticateToken, async (req, res) => {
  try {
    const { leads, intervalMinutes } = req.body;
    const userId = req.user.userId || req.user.id;

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Valid leads array is required'
      });
    }

    const result = await outboundCallerService.startAutoCalling(
      leads,
      intervalMinutes || 2,
      userId
    );

    res.json(result);

  } catch (error) {
    logger.error('Error starting auto-calling:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/outbound-caller/stop
 * Stop auto-calling
 */
router.post('/stop', async (req, res) => {
  try {
    const result = outboundCallerService.stopAutoCalling();
    res.json(result);

  } catch (error) {
    logger.error('Error stopping auto-calling:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/outbound-caller/status
 * Get current calling status
 */
router.get('/status', (req, res) => {
  try {
    const status = outboundCallerService.getStatus();
    res.json({
      success: true,
      ...status
    });

  } catch (error) {
    logger.error('Error getting status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/outbound-caller/voice
 * Twilio voice webhook - generates TwiML response
 */
router.post('/voice', async (req, res) => {
  try {
    const { AnsweredBy } = req.body;
    const clientId = req.query.clientId; // Get clientId from query params

    logger.info(`Voice webhook called, AnsweredBy: ${AnsweredBy || 'unknown'}${clientId ? `, clientId: ${clientId}` : ''}`);

    const twiml = await outboundCallerService.generateVoiceTwiML(AnsweredBy, clientId);

    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    logger.error('Error generating voice TwiML:', error);

    // Fallback TwiML
    const twilio = require('twilio');
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('We are experiencing technical difficulties. Please try again later.');
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * POST /api/outbound-caller/voice-elevenlabs
 * Twilio voice webhook for ElevenLabs calls (with asyncAmd enabled).
 * With asyncAmd=true, this webhook fires IMMEDIATELY when call connects —
 * AnsweredBy is NOT available here. AMD results arrive separately at /amd-status.
 * So we always connect to ElevenLabs right away (no hangup risk).
 */
router.post('/voice-elevenlabs', (req, res) => {
  try {
    const agentId = req.query.agentId;
    const baseUrl = process.env.BASE_URL || process.env.WEBHOOK_BASE_URL || 'https://aiagent.ringlypro.com';
    const wsUrl = baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    logger.info(`🛡️ Voice-ElevenLabs webhook: connecting to agent ${agentId} (asyncAmd - always connect)`);

    const twilio = require('twilio');
    const twiml = new twilio.twiml.VoiceResponse();

    // Brief pause to stabilize audio before streaming
    twiml.pause({ length: 1 });

    // Always connect to ElevenLabs — AMD runs async and will hang up via /amd-status if machine
    const connect = twiml.connect();
    connect.stream({
      url: `${wsUrl}/media-stream?agentId=${encodeURIComponent(agentId)}`
    });

    res.type('text/xml');
    res.send(twiml.toString());

  } catch (error) {
    logger.error('Error in voice-elevenlabs webhook:', error);
    const twilio = require('twilio');
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * POST /api/outbound-caller/amd-status
 * Async AMD callback — Twilio sends machine detection results here AFTER the call is already connected.
 * If confirmed voicemail/machine, we hang up the call via Twilio REST API to save ElevenLabs minutes.
 */
router.post('/amd-status', async (req, res) => {
  try {
    const { CallSid, AnsweredBy, MachineDetectionDuration } = req.body;
    logger.info(`🛡️ Async AMD result: CallSid=${CallSid}, AnsweredBy=${AnsweredBy}, duration=${MachineDetectionDuration}ms`);

    // Only hang up on confirmed voicemail (after beep or long silence)
    // machine_start is unreliable and often fires on humans with brief pauses
    const confirmedMachine = ['machine_end_beep', 'machine_end_silence'].includes(AnsweredBy);

    if (confirmedMachine) {
      logger.info(`🤖 Confirmed voicemail (${AnsweredBy}) — ending call ${CallSid} to save ElevenLabs minutes`);
      try {
        const twilioClient = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await twilioClient.calls(CallSid).update({ status: 'completed' });
        logger.info(`✅ Call ${CallSid} ended (was voicemail)`);
      } catch (hangupErr) {
        logger.error(`❌ Failed to hang up machine call ${CallSid}: ${hangupErr.message}`);
      }
    } else {
      logger.info(`👤 AMD confirmed human or uncertain (${AnsweredBy}) — keeping call alive`);
    }

    res.sendStatus(200);
  } catch (error) {
    logger.error('Error in amd-status webhook:', error);
    res.sendStatus(200);
  }
});

/**
 * POST /api/outbound-caller/gather
 * Handle user input (pressed digits)
 */
router.post('/gather', (req, res) => {
  try {
    const { Digits } = req.body;

    logger.info(`Gather webhook called, Digits: ${Digits || 'none'}`);

    const twiml = outboundCallerService.handleGather(Digits);

    res.type('text/xml');
    res.send(twiml);

  } catch (error) {
    logger.error('Error handling gather:', error);

    // Fallback TwiML
    const twilio = require('twilio');
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say('We are experiencing technical difficulties. Goodbye.');
    twiml.hangup();

    res.type('text/xml');
    res.send(twiml.toString());
  }
});

/**
 * POST /api/outbound-caller/call-status
 * Twilio call status webhook
 */
router.post('/call-status', (req, res) => {
  try {
    const { CallSid, CallStatus, AnsweredBy } = req.body;

    logger.info(`Call status webhook: ${CallSid} - ${CallStatus}${AnsweredBy ? ` (${AnsweredBy})` : ''}`);

    outboundCallerService.updateCallStatus(CallSid, CallStatus, AnsweredBy);

    res.sendStatus(200);

  } catch (error) {
    logger.error('Error handling call status:', error);
    res.sendStatus(500);
  }
});

/**
 * GET /api/outbound-caller/logs
 * Get call logs
 */
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const status = outboundCallerService.getStatus();

    res.json({
      success: true,
      logs: status.recentLogs || [],
      total: status.recentLogs?.length || 0
    });

  } catch (error) {
    logger.error('Error getting logs:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
