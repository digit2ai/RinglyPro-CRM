'use strict';

const { AiCall, Store, Alert, Escalation, KpiDefinition } = require('../../models');
const { voiceCallManager } = require('../services');
const { Op } = require('sequelize');

/**
 * Voice Call Controller
 * Handles Twilio webhook callbacks and voice call API endpoints
 */

/**
 * Generate TwiML for a call (Twilio webhook)
 * POST /api/v1/voice/twiml/:callId
 *
 * This endpoint is called by Twilio when the call is answered.
 * It generates the TwiML (Twilio Markup Language) that instructs
 * Twilio on what to say and how to gather input.
 */
exports.generateTwiML = async (req, res) => {
  const { callId } = req.params;

  try {
    const aiCall = await AiCall.findByPk(callId, {
      include: [
        {
          model: Store,
          as: 'store'
        },
        {
          model: Alert,
          as: 'alert',
          include: [
            {
              model: KpiDefinition,
              as: 'kpiDefinition'
            }
          ]
        }
      ]
    });

    if (!aiCall) {
      return res.status(404).type('text/xml').send(
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Response>' +
        '<Say>Call not found. Goodbye.</Say>' +
        '<Hangup/>' +
        '</Response>'
      );
    }

    // Generate TwiML using the voice call manager
    const twiml = await voiceCallManager.generateTwiML(aiCall);

    // Update call status
    await aiCall.update({
      call_status: 'in-progress',
      answered_at: new Date()
    });

    // Return TwiML
    res.type('text/xml').send(twiml);

  } catch (error) {
    console.error('Error generating TwiML:', error);

    // Return error TwiML
    res.type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      '<Say>An error occurred. Please contact support.</Say>' +
      '<Hangup/>' +
      '</Response>'
    );
  }
};

/**
 * Handle call status updates (Twilio webhook)
 * POST /api/v1/voice/status/:callId
 *
 * This endpoint receives status updates from Twilio throughout
 * the call lifecycle (initiated, ringing, answered, completed, etc.)
 */
exports.handleStatus = async (req, res) => {
  const { callId } = req.params;
  const statusData = req.body;

  try {
    await voiceCallManager.handleCallStatus(callId, statusData);

    // Twilio expects 200 OK
    res.status(200).send('OK');

  } catch (error) {
    console.error('Error handling call status:', error);
    res.status(500).send('Error processing status update');
  }
};

/**
 * Handle call response (Twilio webhook for speech input)
 * POST /api/v1/voice/response/:callId
 *
 * This endpoint receives the manager's spoken response to the
 * AI call (e.g., "yes I acknowledge" or "call me later")
 */
exports.handleResponse = async (req, res) => {
  const { callId } = req.params;
  const responseData = req.body;

  try {
    // Process the response
    const result = await voiceCallManager.handleCallResponse(callId, responseData);

    // Generate appropriate TwiML response
    let twiml = '<?xml version="1.0" encoding="UTF-8"?><Response>';

    if (result.acknowledged) {
      twiml += '<Say>Thank you for acknowledging. A follow-up task has been created. Goodbye.</Say>';
    } else if (result.requestedCallback) {
      twiml += '<Say>Understood. We will call you back in 2 hours. Goodbye.</Say>';
    } else {
      twiml += '<Say>I did not understand your response. Please check your alerts dashboard. Goodbye.</Say>';
    }

    twiml += '<Hangup/></Response>';

    res.type('text/xml').send(twiml);

  } catch (error) {
    console.error('Error handling call response:', error);

    // Return error TwiML
    res.type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Response>' +
      '<Say>An error occurred processing your response. Please check your dashboard.</Say>' +
      '<Hangup/>' +
      '</Response>'
    );
  }
};

/**
 * Handle recording callback (Twilio webhook)
 * POST /api/v1/voice/recording/:callId
 *
 * This endpoint receives recording data from Twilio after
 * a call is completed and recorded.
 */
exports.handleRecording = async (req, res) => {
  const { callId } = req.params;
  const recordingData = req.body;

  try {
    await voiceCallManager.handleRecording(callId, recordingData);

    // Twilio expects 200 OK
    res.status(200).send('OK');

  } catch (error) {
    console.error('Error handling recording:', error);
    res.status(500).send('Error processing recording');
  }
};

/**
 * Get all AI calls (with filters)
 * GET /api/v1/voice/calls
 *
 * Query params:
 * - store_id: Filter by store
 * - status: Filter by call status (completed, failed, no-answer, etc.)
 * - call_type: Filter by call type (escalation_alert, etc.)
 * - limit: Number of results (default: 50)
 * - offset: Pagination offset (default: 0)
 */
exports.getAllCalls = async (req, res) => {
  const { store_id, status, call_type, limit = 50, offset = 0 } = req.query;

  const where = {};
  if (store_id) where.store_id = store_id;
  if (status) where.call_status = status;
  if (call_type) where.call_type = call_type;

  const calls = await AiCall.findAll({
    where,
    include: [
      {
        model: Store,
        as: 'store',
        attributes: ['id', 'store_code', 'name', 'manager_name']
      },
      {
        model: Alert,
        as: 'alert',
        attributes: ['id', 'severity', 'title'],
        include: [
          {
            model: KpiDefinition,
            as: 'kpiDefinition',
            attributes: ['id', 'kpi_code', 'name']
          }
        ]
      },
      {
        model: Escalation,
        as: 'escalation',
        attributes: ['id', 'to_level', 'status']
      }
    ],
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['scheduled_at', 'DESC']]
  });

  res.json({
    success: true,
    data: calls,
    count: calls.length
  });
};

/**
 * Get call details by ID
 * GET /api/v1/voice/calls/:id
 */
exports.getCallById = async (req, res) => {
  const { id } = req.params;

  const call = await AiCall.findByPk(id, {
    include: [
      {
        model: Store,
        as: 'store'
      },
      {
        model: Alert,
        as: 'alert',
        include: [
          {
            model: KpiDefinition,
            as: 'kpiDefinition'
          }
        ]
      },
      {
        model: Escalation,
        as: 'escalation'
      }
    ]
  });

  if (!call) {
    return res.status(404).json({
      success: false,
      error: { message: 'Call not found', statusCode: 404 }
    });
  }

  res.json({
    success: true,
    data: call
  });
};

/**
 * Test call endpoint
 * POST /api/v1/voice/test
 *
 * Body:
 * {
 *   "phone_number": "+1-555-0123",
 *   "message": "This is a test call from Store Health AI"
 * }
 *
 * This endpoint is used for testing the voice calling system
 * without needing to create a full escalation scenario.
 */
exports.testCall = async (req, res) => {
  const { phone_number, message } = req.body;

  if (!phone_number) {
    return res.status(400).json({
      success: false,
      error: { message: 'phone_number is required', statusCode: 400 }
    });
  }

  if (!message) {
    return res.status(400).json({
      success: false,
      error: { message: 'message is required', statusCode: 400 }
    });
  }

  try {
    const result = await voiceCallManager.testCall(phone_number, message);

    res.json({
      success: true,
      data: result,
      message: 'Test call initiated successfully'
    });

  } catch (error) {
    console.error('Error initiating test call:', error);

    return res.status(500).json({
      success: false,
      error: {
        message: error.message || 'Failed to initiate test call',
        statusCode: 500
      }
    });
  }
};
