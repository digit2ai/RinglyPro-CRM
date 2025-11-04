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

    const callResult = await outboundCallerService.makeCall(phone, leadData, userId);

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
router.post('/voice', (req, res) => {
  try {
    const { AnsweredBy } = req.body;

    logger.info(`Voice webhook called, AnsweredBy: ${AnsweredBy || 'unknown'}`);

    const twiml = outboundCallerService.generateVoiceTwiML(AnsweredBy);

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
