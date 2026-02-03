'use strict';

const express = require('express');
const router = express.Router();
const asyncHandler = require('../middleware/async-handler');
const voiceController = require('../controllers/voice-controller');

/**
 * Voice Call Routes (Twilio Webhooks)
 */

// GET /api/v1/voice/twiml/:callId - Generate TwiML for call
router.post('/twiml/:callId', asyncHandler(voiceController.generateTwiML));

// POST /api/v1/voice/status/:callId - Handle call status updates
router.post('/status/:callId', asyncHandler(voiceController.handleStatus));

// POST /api/v1/voice/response/:callId - Handle call response (speech input)
router.post('/response/:callId', asyncHandler(voiceController.handleResponse));

// POST /api/v1/voice/recording/:callId - Handle recording callback
router.post('/recording/:callId', asyncHandler(voiceController.handleRecording));

// GET /api/v1/voice/calls - Get all AI calls (with filters)
router.get('/calls', asyncHandler(voiceController.getAllCalls));

// GET /api/v1/voice/calls/:id - Get call details by ID
router.get('/calls/:id', asyncHandler(voiceController.getCallById));

// POST /api/v1/voice/test - Test call endpoint
router.post('/test', asyncHandler(voiceController.testCall));

module.exports = router;
