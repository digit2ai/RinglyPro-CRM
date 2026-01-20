/**
 * ElevenLabs WebRTC Conversation Token API
 *
 * This endpoint issues short-lived conversation tokens for browser-based
 * WebRTC connections to ElevenLabs Conversational AI agents.
 *
 * SECURITY: The ElevenLabs API key is NEVER exposed to the browser.
 * The backend generates a signed URL that the browser uses to establish
 * a WebRTC connection directly with ElevenLabs.
 *
 * Flow:
 * 1. Browser requests token from POST /api/elevenlabs-webrtc/token
 * 2. Backend validates request and calls ElevenLabs API with secret key
 * 3. ElevenLabs returns a signed WebSocket URL (valid for ~60 seconds)
 * 4. Browser uses that URL to establish WebRTC peer connection
 * 5. Audio streams directly between browser and ElevenLabs (not through backend)
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// ElevenLabs API configuration
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const ELEVENLABS_API_BASE = 'https://api.elevenlabs.io/v1';

/**
 * POST /api/elevenlabs-webrtc/token
 *
 * Generate a short-lived conversation token for WebRTC connection.
 *
 * Request body:
 * {
 *   "agent_id": "your-agent-id",           // Required: ElevenLabs agent ID
 *   "conversation_initiation_data": {      // Optional: dynamic variables
 *     "dynamic_variables": {
 *       "customer_name": "John",
 *       "account_id": "12345"
 *     }
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "signed_url": "wss://api.elevenlabs.io/...",  // Short-lived WebSocket URL
 *   "agent_id": "your-agent-id"
 * }
 */
router.post('/token', async (req, res) => {
  try {
    const { agent_id, conversation_initiation_data } = req.body;

    // Validate required fields
    if (!agent_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: agent_id'
      });
    }

    // Validate API key is configured
    if (!ELEVENLABS_API_KEY) {
      logger.error('[ElevenLabs WebRTC] ELEVENLABS_API_KEY not configured');
      return res.status(500).json({
        success: false,
        error: 'ElevenLabs API not configured'
      });
    }

    logger.info(`[ElevenLabs WebRTC] Requesting conversation token for agent: ${agent_id}`);

    // Request signed URL from ElevenLabs
    // This endpoint returns a WebSocket URL that's valid for ~60 seconds
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversation/get_signed_url`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        agent_id: agent_id,
        // Optional: Pass dynamic variables to personalize the conversation
        ...(conversation_initiation_data && {
          conversation_initiation_client_data: conversation_initiation_data
        })
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[ElevenLabs WebRTC] Failed to get signed URL: ${response.status} - ${errorText}`);

      // Parse error for better client feedback
      let errorMessage = 'Failed to generate conversation token';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail?.message || errorJson.error || errorMessage;
      } catch (e) {
        // Keep default error message
      }

      return res.status(response.status).json({
        success: false,
        error: errorMessage
      });
    }

    const data = await response.json();

    logger.info(`[ElevenLabs WebRTC] Successfully generated signed URL for agent: ${agent_id}`);

    // Return the signed URL to the client
    // The client will use this to establish a WebRTC connection
    return res.json({
      success: true,
      signed_url: data.signed_url,
      agent_id: agent_id
    });

  } catch (error) {
    logger.error(`[ElevenLabs WebRTC] Token generation error:`, error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * GET /api/elevenlabs-webrtc/health
 *
 * Health check endpoint to verify the service is running
 * and the API key is configured.
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'elevenlabs-webrtc',
    api_configured: !!ELEVENLABS_API_KEY,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
