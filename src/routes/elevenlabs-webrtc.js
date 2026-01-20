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

// RinglyPro Demo Agent Configuration (hardcoded for public demo)
const DEMO_AGENT_ID = 'agent_1301kfca8m4gfv09pg8pr81mvyv4';
const DEMO_API_KEY = 'sk_129ff2de60c66f7eb2e98123351c267ad97ee38b480f142c';

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
    // This endpoint returns a WebSocket URL that's valid for ~15 minutes
    // Note: This is a GET request with agent_id as query parameter
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(agent_id)}`, {
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY
      }
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
 * POST /api/elevenlabs-webrtc/demo-token
 *
 * Generate a conversation token for the RinglyPro public demo.
 * Uses hardcoded demo agent - no API key validation needed from client.
 *
 * Request body:
 * {
 *   "dynamicVariables": {
 *     "company_name": "Acme Corp",
 *     "website_url": "https://acme.com",
 *     "knowledge_base": "We offer plumbing services..."
 *   }
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "signed_url": "wss://api.elevenlabs.io/..."
 * }
 */
router.post('/demo-token', async (req, res) => {
  try {
    const { dynamicVariables } = req.body;

    // Extract business context from request
    const companyName = dynamicVariables?.company_name || 'Demo Company';
    const websiteUrl = dynamicVariables?.website_url || '';
    const knowledgeBase = dynamicVariables?.knowledge_base || '';

    logger.info(`[ElevenLabs WebRTC Demo] Generating token for: ${companyName}`);

    // Note: Dynamic variables are passed via WebSocket after connection,
    // not through the signed URL endpoint

    // Request signed URL from ElevenLabs using DEMO credentials
    // Note: This is a GET request with agent_id as query parameter
    const response = await fetch(`${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(DEMO_AGENT_ID)}`, {
      method: 'GET',
      headers: {
        'xi-api-key': DEMO_API_KEY
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(`[ElevenLabs WebRTC Demo] Failed to get signed URL: ${response.status} - ${errorText}`);

      let errorMessage = 'Failed to start demo conversation';
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

    logger.info(`[ElevenLabs WebRTC Demo] Successfully generated signed URL for: ${companyName}`);

    return res.json({
      success: true,
      signed_url: data.signed_url,
      agent_id: DEMO_AGENT_ID,
      company_name: companyName
    });

  } catch (error) {
    logger.error(`[ElevenLabs WebRTC Demo] Token generation error:`, error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * POST /api/elevenlabs-webrtc/create-demo-agent
 *
 * Create a temporary personalized agent for demo purposes.
 * This creates a new agent with the customer's company info baked into
 * the first message and prompt, then returns a signed URL for that agent.
 *
 * Request body:
 * {
 *   "company_name": "Tampa Lawn Pro",
 *   "website_url": "https://tampalawnpro.com",
 *   "knowledge_base": "We offer lawn mowing, landscaping..."
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "signed_url": "wss://api.elevenlabs.io/...",
 *   "agent_id": "agent_xxxxx"
 * }
 */
router.post('/create-demo-agent', async (req, res) => {
  try {
    const { company_name, website_url, knowledge_base } = req.body;

    // Validate required fields
    if (!company_name) {
      return res.status(400).json({
        success: false,
        error: 'Company name is required'
      });
    }

    logger.info(`[ElevenLabs Demo Agent] Creating personalized agent for: ${company_name}`);

    // Build the personalized first message
    const firstMessage = `Hi, thanks for calling ${company_name}! This is Lina, your AI receptionist. How can I help you today?`;

    // Build the personalized system prompt
    const systemPrompt = buildDemoAgentPrompt(company_name, website_url, knowledge_base);

    // Create the agent via ElevenLabs API
    // Note: The API uses "conversational_config" (not "conversation_config")
    const createAgentPayload = {
      name: `RinglyPro Demo - ${company_name}`,
      conversational_config: {
        agent: {
          first_message: firstMessage,
          language: 'en',
          prompt: {
            prompt: systemPrompt,
            llm: 'gpt-4o-mini'
          }
        },
        tts: {
          model_id: 'eleven_turbo_v2_5',
          voice_id: 'cgSgspJ2msm6clMCkdW9' // Jessica voice (warm, professional)
        }
      }
    };

    logger.info(`[ElevenLabs Demo Agent] Sending create request to ElevenLabs API`);
    logger.info(`[ElevenLabs Demo Agent] Payload: ${JSON.stringify(createAgentPayload, null, 2)}`);

    // ElevenLabs API endpoint for creating agents is POST /convai/agents (not /convai/agents/create)
    const createResponse = await fetch(`${ELEVENLABS_API_BASE}/convai/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': DEMO_API_KEY
      },
      body: JSON.stringify(createAgentPayload)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      logger.error(`[ElevenLabs Demo Agent] Failed to create agent: ${createResponse.status} - ${errorText}`);

      let errorMessage = 'Failed to create demo agent';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail?.message || errorJson.error || errorMessage;
      } catch (e) {
        // Keep default error message
      }

      return res.status(createResponse.status).json({
        success: false,
        error: errorMessage
      });
    }

    const agentData = await createResponse.json();
    const newAgentId = agentData.agent_id;

    logger.info(`[ElevenLabs Demo Agent] Successfully created agent: ${newAgentId}`);

    // Now get a signed URL for the newly created agent
    const signedUrlResponse = await fetch(`${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(newAgentId)}`, {
      method: 'GET',
      headers: {
        'xi-api-key': DEMO_API_KEY
      }
    });

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text();
      logger.error(`[ElevenLabs Demo Agent] Failed to get signed URL: ${signedUrlResponse.status} - ${errorText}`);

      return res.status(signedUrlResponse.status).json({
        success: false,
        error: 'Failed to get conversation URL for new agent'
      });
    }

    const signedUrlData = await signedUrlResponse.json();

    logger.info(`[ElevenLabs Demo Agent] Got signed URL for: ${company_name}`);

    // Schedule cleanup of the temporary agent after 30 minutes
    setTimeout(async () => {
      try {
        logger.info(`[ElevenLabs Demo Agent] Cleaning up temporary agent: ${newAgentId}`);
        await fetch(`${ELEVENLABS_API_BASE}/convai/agents/${newAgentId}`, {
          method: 'DELETE',
          headers: {
            'xi-api-key': DEMO_API_KEY
          }
        });
        logger.info(`[ElevenLabs Demo Agent] Successfully deleted agent: ${newAgentId}`);
      } catch (cleanupError) {
        logger.error(`[ElevenLabs Demo Agent] Failed to cleanup agent: ${newAgentId}`, cleanupError);
      }
    }, 30 * 60 * 1000); // 30 minutes

    return res.json({
      success: true,
      signed_url: signedUrlData.signed_url,
      agent_id: newAgentId,
      company_name: company_name
    });

  } catch (error) {
    logger.error(`[ElevenLabs Demo Agent] Error creating demo agent:`, error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Build the system prompt for a demo agent
 * @param {string} companyName - The company name
 * @param {string} websiteUrl - The company website (optional)
 * @param {string} knowledgeBase - Business information (optional)
 * @returns {string} The complete system prompt
 */
function buildDemoAgentPrompt(companyName, websiteUrl, knowledgeBase) {
  let prompt = `You are Lina, a friendly and professional AI receptionist for ${companyName}. You are bilingual and can speak fluently in both English and Spanish - respond in whatever language the caller uses.

## YOUR ROLE
You handle incoming calls for ${companyName}. Your job is to:
- Greet callers warmly and professionally
- Answer questions about the business
- Collect caller information for callbacks
- Schedule appointments when possible
- Provide helpful information

## PERSONALITY
- Warm, friendly, and professional
- Patient and understanding
- Helpful and proactive
- Natural conversational style (use "um", "let me check", etc. occasionally)

## COMPANY INFORMATION
Company Name: ${companyName}`;

  if (websiteUrl) {
    prompt += `\nWebsite: ${websiteUrl}`;
  }

  if (knowledgeBase) {
    prompt += `\n\n## BUSINESS DETAILS\n${knowledgeBase}`;
  }

  prompt += `

## CONVERSATION RULES
1. Always greet with the company name
2. If you don't know something specific, offer to take a message or have someone call back
3. Be concise - this is a phone call, not a text chat
4. Ask one question at a time
5. Confirm important details (phone numbers, names, appointment times)
6. If the caller speaks Spanish, respond entirely in Spanish

## COLLECTING INFORMATION
When the caller wants to leave a message or schedule a callback, collect:
- Their name
- Phone number (repeat it back to confirm)
- Brief reason for calling
- Best time to reach them

## ENDING CALLS
- Thank them for calling ${companyName}
- Confirm any next steps
- Wish them a great day

Remember: You are demonstrating RinglyPro's AI receptionist capabilities. Be impressive but natural!`;

  return prompt;
}

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
    demo_configured: !!DEMO_AGENT_ID && !!DEMO_API_KEY,
    timestamp: new Date().toISOString()
  });
});

module.exports = router;
