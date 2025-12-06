// =====================================================
// MCP Client for AI Design Assistant
// Purpose: Call RinglyPro MCP server for OpenAI/Claude integration
// =====================================================

const axios = require('axios');
const logger = require('../utils/logger');

// MCP Server URL (configurable via env var)
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3001';
const MCP_API_KEY = process.env.MCP_API_KEY || '';

/**
 * Build system prompt for AI based on mode
 */
function buildSystemPrompt(mode) {
  const basePrompt = `You are an expert food & hospitality copywriter helping design menus and marketing materials for restaurants, bakeries, cafés, pastry shops, and dessert shops.

Write clear, persuasive, and brand-aligned copy. Keep output structured and easy to paste into design tools.

Focus on:
- Food service industry best practices
- Appetizing, sensory language
- Clear value propositions
- Brand voice consistency
- Cultural sensitivity (if multiple languages)`;

  const modePrompts = {
    menu: `\n\nYour task: Generate menu section copy with dish names, descriptions, and notes. Format as JSON with menuSections array.`,
    flyer: `\n\nYour task: Generate promotional flyer/postcard copy with headline, subheadline, body, call-to-action, and small print. Format as JSON.`,
    social: `\n\nYour task: Generate social media captions (3-5 variations) and relevant hashtags for food service marketing. Format as JSON.`,
    generic: `\n\nYour task: Generate general marketing copy based on the brief. Format as JSON with appropriate structure.`
  };

  return basePrompt + (modePrompts[mode] || modePrompts.generic);
}

/**
 * Build user context from design brief and order
 */
function buildUserContext({ mode, brief, order, photos, extraInstructions }) {
  const context = {
    mode,
    business: {
      name: brief?.business_name || order?.user_name || 'Unknown Business',
      type: brief?.business_type || 'Food Service',
      location: [brief?.location_city, brief?.location_country].filter(Boolean).join(', ') || 'Not specified',
      website: brief?.website || 'Not provided',
      phone: brief?.business_phone || 'Not provided'
    },
    designRequest: {
      primaryNeed: brief?.primary_design_need || mode,
      goal: brief?.design_goal || 'Create engaging marketing materials',
      targetAudience: brief?.target_audience || 'General customers',
      usageChannels: brief?.usage_channels || 'Print and digital'
    },
    branding: {
      colors: brief?.brand_colors || 'Not specified',
      fonts: brief?.brand_fonts || 'Not specified',
      styleReferences: brief?.style_reference_links || 'None provided',
      logo: brief?.logo_present ? `Yes - ${brief.logo_notes || 'See uploads'}` : 'No logo'
    },
    content: {
      copyStatus: brief?.copy_status || 'designer_writes_copy',
      mainHeadline: brief?.main_headline || '',
      keyOffers: brief?.key_offers_or_items || '',
      specialRequirements: brief?.special_requirements || '',
      languages: brief?.languages || 'English'
    },
    order: {
      packageType: order?.package_type || 'Unknown',
      photosCount: photos?.length || 0,
      photoFilenames: photos?.map(p => p.filename).slice(0, 5) || []
    },
    adminInstructions: extraInstructions || ''
  };

  return context;
}

/**
 * Format response based on mode
 */
function formatAIResponse(mode, rawResponse) {
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(rawResponse);
    return {
      success: true,
      structured: parsed,
      rawText: rawResponse
    };
  } catch (e) {
    // If not JSON, try to structure based on mode
    logger.warn('[MCP] AI response not JSON, attempting to structure:', e.message);

    const structured = {};

    if (mode === 'menu') {
      structured.menuSections = [{
        title: 'AI Generated Content',
        items: [{ name: 'Content', description: rawResponse.substring(0, 500) }]
      }];
      structured.generalNotes = 'Please review and format';
    } else if (mode === 'flyer') {
      structured.headline = 'AI Generated Headline';
      structured.body = rawResponse;
      structured.callToAction = 'Contact us to learn more';
    } else if (mode === 'social') {
      structured.captions = [rawResponse.substring(0, 280)];
      structured.hashtags = ['#foodie', '#restaurant'];
    } else {
      structured.content = rawResponse;
    }

    return {
      success: true,
      structured,
      rawText: rawResponse
    };
  }
}

/**
 * Main function: Run AI Assistant via MCP
 *
 * @param {Object} params
 * @param {string} params.mode - 'menu' | 'flyer' | 'social' | 'generic'
 * @param {Object} params.brief - Design brief object from photo_studio_design_briefs
 * @param {Object} params.order - Order object from photo_studio_orders
 * @param {Array} params.photos - Optional array of photo metadata
 * @param {string} params.extraInstructions - Optional admin instructions
 * @param {string} params.preferredModel - Optional: 'openai' | 'claude'
 *
 * @returns {Promise<Object>} AI response with structured content
 */
async function runAIAssistant({ mode, brief, order, photos = [], extraInstructions = '', preferredModel = 'openai' }) {
  try {
    logger.info(`[MCP] Running AI Assistant - Mode: ${mode}, Order: ${order?.id}`);

    // Build context
    const systemPrompt = buildSystemPrompt(mode);
    const userContext = buildUserContext({ mode, brief, order, photos, extraInstructions });

    // Build user message
    const userMessage = `Design Brief Context:
${JSON.stringify(userContext, null, 2)}

${extraInstructions ? `\nAdmin Instructions: ${extraInstructions}` : ''}

Please generate ${mode} content based on this information. Return structured JSON.`;

    // Prepare MCP request
    const mcpPayload = {
      mode,
      model: preferredModel === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4-turbo-preview',
      systemPrompt,
      userMessage,
      context: userContext,
      temperature: 0.7,
      maxTokens: 2000
    };

    logger.info(`[MCP] Calling MCP server at ${MCP_SERVER_URL}/api/ai/design-assistant`);

    // Call MCP server
    const response = await axios.post(
      `${MCP_SERVER_URL}/api/ai/design-assistant`,
      mcpPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': MCP_API_KEY ? `Bearer ${MCP_API_KEY}` : undefined
        },
        timeout: 60000 // 60 second timeout for AI generation
      }
    );

    if (!response.data || !response.data.success) {
      throw new Error(response.data?.error || 'MCP server returned unsuccessful response');
    }

    // Format response
    const aiContent = response.data.content || response.data.text || '';
    const formatted = formatAIResponse(mode, aiContent);

    return {
      success: true,
      mode,
      model: response.data.model || preferredModel,
      content: formatted.structured,
      rawText: formatted.rawText,
      requestContext: userContext,
      tokensUsed: response.data.tokensUsed || 0
    };

  } catch (error) {
    logger.error('[MCP] AI Assistant error:', error.message);

    // Check if MCP server is unreachable
    if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return {
        success: false,
        error: 'MCP server is not available. Please check server status.',
        fallback: true
      };
    }

    // Return fallback response
    return {
      success: false,
      error: error.response?.data?.error || error.message,
      mode,
      fallback: true
    };
  }
}

/**
 * Generate fallback content when MCP is unavailable
 */
function generateFallbackContent(mode, brief) {
  const businessName = brief?.business_name || 'Your Business';

  const fallbacks = {
    menu: {
      menuSections: [{
        title: 'Featured Items',
        items: [
          {
            name: 'Signature Dish',
            description: `Crafted with care at ${businessName}. Ask about today's special preparation.`,
            note: 'Customer favorite'
          }
        ]
      }],
      generalNotes: 'MCP server unavailable. This is placeholder content. Please customize for your menu.'
    },
    flyer: {
      headline: `Visit ${businessName}`,
      subheadline: 'Delicious food, warm atmosphere',
      body: 'Join us for an unforgettable dining experience. Fresh ingredients, expertly prepared.',
      callToAction: 'Visit us today or call to reserve your table',
      smallPrint: 'MCP server unavailable - placeholder content'
    },
    social: {
      captions: [
        `Fresh from our kitchen at ${businessName}! 🍽️`,
        `Come taste the difference at ${businessName}`,
        `Your next favorite meal is waiting at ${businessName}`
      ],
      hashtags: ['#foodie', '#restaurant', '#foodlover']
    }
  };

  return fallbacks[mode] || { content: 'MCP server unavailable' };
}

module.exports = {
  runAIAssistant,
  generateFallbackContent
};
