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
 * Get a signed URL for the demo agent with personalization info.
 * The demo agent has overrides enabled, so the frontend can customize
 * the first_message and prompt at connection time.
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
 *   "agent_id": "agent_xxxxx",
 *   "company_name": "Tampa Lawn Pro",
 *   "first_message": "Hi, thanks for calling Tampa Lawn Pro!...",
 *   "system_prompt": "You are Lina, a receptionist for Tampa Lawn Pro..."
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

    logger.info(`[ElevenLabs Demo] Getting signed URL for personalized demo: ${company_name}`);

    // Build the personalized first message for the frontend to use as override
    const firstMessage = `Hi, thanks for calling ${company_name}! This is Lina, your AI receptionist. How can I help you today?`;

    // Build the personalized system prompt for the frontend to use as override
    const systemPrompt = buildDemoAgentPrompt(company_name, website_url, knowledge_base);

    // Get signed URL from the existing demo agent (overrides are enabled on this agent)
    const signedUrlResponse = await fetch(`${ELEVENLABS_API_BASE}/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(DEMO_AGENT_ID)}`, {
      method: 'GET',
      headers: {
        'xi-api-key': DEMO_API_KEY
      }
    });

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text();
      logger.error(`[ElevenLabs Demo] Failed to get signed URL: ${signedUrlResponse.status} - ${errorText}`);

      let errorMessage = 'Failed to start demo';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail?.message || errorJson.error || errorMessage;
      } catch (e) {
        // Keep default error message
      }

      return res.status(signedUrlResponse.status).json({
        success: false,
        error: errorMessage
      });
    }

    const signedUrlData = await signedUrlResponse.json();

    logger.info(`[ElevenLabs Demo] Got signed URL for: ${company_name}`);

    // Return signed URL along with the override data for the frontend
    return res.json({
      success: true,
      signed_url: signedUrlData.signed_url,
      agent_id: DEMO_AGENT_ID,
      company_name: company_name,
      // Provide override data for the frontend to apply at connection time
      first_message: firstMessage,
      system_prompt: systemPrompt
    });

  } catch (error) {
    logger.error(`[ElevenLabs Demo] Error:`, error);
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
 * POST /api/elevenlabs-webrtc/scrape-website
 *
 * Scrape a website to extract business information for the demo.
 * Returns company description, services, contact info, etc.
 *
 * Request body:
 * {
 *   "url": "https://example.com"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "content": "Business description and services..."
 * }
 */
router.post('/scrape-website', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Validate URL format
    let parsedUrl;
    try {
      parsedUrl = new URL(url.startsWith('http') ? url : `https://${url}`);
    } catch (e) {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    logger.info(`[Website Scraper] Scraping: ${parsedUrl.href}`);

    // Fetch the website with a timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

    try {
      const response = await fetch(parsedUrl.href, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RinglyProBot/1.0; +https://ringlypro.com)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9,es;q=0.8'
        }
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();

      // Extract useful content from HTML
      const content = extractBusinessInfo(html, parsedUrl.hostname);

      logger.info(`[Website Scraper] Successfully extracted ${content.length} chars from ${parsedUrl.hostname}`);

      return res.json({
        success: true,
        content: content,
        source: parsedUrl.hostname
      });

    } catch (fetchError) {
      clearTimeout(timeout);

      if (fetchError.name === 'AbortError') {
        logger.error(`[Website Scraper] Timeout fetching ${parsedUrl.href}`);
        return res.status(408).json({
          success: false,
          error: 'Website took too long to respond'
        });
      }

      logger.error(`[Website Scraper] Failed to fetch ${parsedUrl.href}: ${fetchError.message}`);
      return res.status(502).json({
        success: false,
        error: 'Could not access website'
      });
    }

  } catch (error) {
    logger.error(`[Website Scraper] Error:`, error);
    return res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

/**
 * Extract business information from HTML
 * @param {string} html - Raw HTML content
 * @param {string} hostname - Website hostname for context
 * @returns {string} Extracted business information
 */
function extractBusinessInfo(html, hostname) {
  const info = [];

  // Remove script and style tags
  let cleanHtml = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // Extract meta description
  const metaDescMatch = cleanHtml.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
                        cleanHtml.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  if (metaDescMatch && metaDescMatch[1]) {
    info.push(`Description: ${metaDescMatch[1].trim()}`);
  }

  // Extract OG description as fallback
  const ogDescMatch = cleanHtml.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  if (ogDescMatch && ogDescMatch[1] && !metaDescMatch) {
    info.push(`Description: ${ogDescMatch[1].trim()}`);
  }

  // Extract title
  const titleMatch = cleanHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1]) {
    const title = titleMatch[1].trim();
    if (title && !title.toLowerCase().includes('home') && title.length > 5) {
      info.push(`Business: ${title}`);
    }
  }

  // Extract headings (h1, h2) for services/features
  const headings = [];
  const h1Matches = cleanHtml.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi);
  for (const match of h1Matches) {
    const text = match[1].trim().replace(/\s+/g, ' ');
    if (text && text.length > 3 && text.length < 200) {
      headings.push(text);
    }
  }
  const h2Matches = cleanHtml.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi);
  for (const match of h2Matches) {
    const text = match[1].trim().replace(/\s+/g, ' ');
    if (text && text.length > 3 && text.length < 200) {
      headings.push(text);
    }
  }
  if (headings.length > 0) {
    info.push(`Key Services/Features: ${headings.slice(0, 8).join(', ')}`);
  }

  // Extract phone numbers (look for tel: links or formatted phone numbers)
  // More strict pattern to avoid matching timestamps or other numbers
  const phonePatterns = [
    /tel:[\+]?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/gi,
    /\(?[0-9]{3}\)?[-.\s][0-9]{3}[-.\s][0-9]{4}/g,
    /1[-.\s][0-9]{3}[-.\s][0-9]{3}[-.\s][0-9]{4}/g
  ];
  for (const pattern of phonePatterns) {
    const phoneMatches = cleanHtml.match(pattern);
    if (phoneMatches) {
      const phone = phoneMatches[0].replace(/tel:/gi, '').trim();
      const digits = phone.replace(/\D/g, '');
      // Only accept 10 or 11 digit phone numbers (US format)
      if (digits.length === 10 || digits.length === 11) {
        info.push(`Phone: ${phone}`);
        break;
      }
    }
  }

  // Extract email addresses (exclude image files and common non-email patterns)
  const emailMatches = cleanHtml.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}/g);
  if (emailMatches) {
    const emails = [...new Set(emailMatches)].filter(e => {
      const lower = e.toLowerCase();
      // Exclude image files, example emails, and other non-email patterns
      return !lower.includes('example') &&
             !lower.includes('test') &&
             !lower.includes('your') &&
             !lower.includes('.png') &&
             !lower.includes('.jpg') &&
             !lower.includes('.jpeg') &&
             !lower.includes('.gif') &&
             !lower.includes('.webp') &&
             !lower.includes('.svg') &&
             !lower.includes('2x') &&
             !lower.includes('3x') &&
             !lower.endsWith('.js') &&
             !lower.endsWith('.css') &&
             lower.includes('@') &&
             lower.split('@')[1].includes('.');
    });
    if (emails.length > 0) {
      info.push(`Email: ${emails[0]}`);
    }
  }

  // Extract address (look for common patterns)
  const addressPatterns = [
    /\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct)[,.\s]+[\w\s]+,?\s*[A-Z]{2}\s*\d{5}/gi,
    /\d+\s+[\w\s]+,\s*[\w\s]+,\s*[A-Z]{2}\s*\d{5}/gi
  ];
  for (const pattern of addressPatterns) {
    const addressMatch = cleanHtml.match(pattern);
    if (addressMatch) {
      info.push(`Address: ${addressMatch[0].trim()}`);
      break;
    }
  }

  // Extract hours of operation
  const hoursPatterns = [
    /(?:hours?|open|schedule)[:\s]*([^<]{10,100}(?:am|pm|AM|PM)[^<]{0,50})/gi,
    /(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)[:\s-]*\d{1,2}[:\d]*\s*(?:am|pm)[^<]{0,100}/gi
  ];
  for (const pattern of hoursPatterns) {
    const hoursMatch = cleanHtml.match(pattern);
    if (hoursMatch) {
      const hours = hoursMatch[0].replace(/<[^>]+>/g, '').trim();
      if (hours.length > 10 && hours.length < 200) {
        info.push(`Hours: ${hours}`);
        break;
      }
    }
  }

  // Extract main paragraph content (first meaningful paragraphs)
  const paragraphs = [];
  const pMatches = cleanHtml.matchAll(/<p[^>]*>([^<]+(?:<[^>]+>[^<]*)*)<\/p>/gi);
  for (const match of pMatches) {
    let text = match[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\s+/g, ' ')
      .trim();

    // Only keep meaningful paragraphs
    if (text && text.length > 50 && text.length < 500 &&
        !text.toLowerCase().includes('cookie') &&
        !text.toLowerCase().includes('privacy') &&
        !text.toLowerCase().includes('copyright') &&
        !text.toLowerCase().includes('all rights reserved')) {
      paragraphs.push(text);
    }
  }
  if (paragraphs.length > 0) {
    info.push(`About: ${paragraphs.slice(0, 3).join(' ')}`);
  }

  // Combine and limit output
  let result = info.join('\n\n');

  // Limit to ~2000 chars to keep prompt reasonable
  if (result.length > 2000) {
    result = result.substring(0, 2000) + '...';
  }

  return result || `Website: ${hostname} (Could not extract detailed information)`;
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
