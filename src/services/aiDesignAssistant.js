// =====================================================
// AI Design Assistant for PixlyPro
// Purpose: Direct OpenAI integration for design content generation
// =====================================================

const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
let openai = null;
function getOpenAIClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }
  return openai;
}

/**
 * System prompt for AI Design Assistant
 */
const SYSTEM_PROMPT = `You are the AI Design Assistant for PixlyPro.

Your job is to support graphic design, content creation, and photo enhancement tasks for restaurants, cafés, bakeries, boutiques, retail shops, gift stores, beauty & wellness businesses, and similar SMB clients.

Your core capabilities include:

1. **AI Photo Enhancer** - Transform mobile photos into professional quality
2. **AI Graphic Generator** - Create menus, flyers, posters, social templates
3. **AI Style & Brand Matching** - Detect business type and apply correct aesthetic
4. **AI Multi-format Export** - Generate assets for web, social, print
5. **AI Content & Copy Generator** - Generate marketing copy and written content
6. **AI Project Orchestration** - Analyze briefs and recommend layouts

Your goal: automate 90% of the design workflow. Always produce clean, professional, brand-aligned results.

When generating content:
- Match the business tone (elegant, fun, modern, spiritual, luxury, artistic)
- Keep outputs short, clear, and marketing-ready
- Ensure content aligns with visual design
- Return structured JSON that's easy to use in design tools`;

/**
 * Build user prompt based on mode and context
 */
function buildUserPrompt({ mode, brief, order, photos, extraInstructions }) {
  const businessName = brief?.business_name || order?.user_name || 'the business';
  const businessType = brief?.business_type || 'Restaurant';
  const designGoal = brief?.design_goal || 'Create engaging marketing materials';
  const brandColors = brief?.brand_colors || 'Not specified';
  const keyItems = brief?.key_offers_or_items || 'Not specified';

  let prompt = `**Business Context:**
- Name: ${businessName}
- Type: ${businessType}
- Design Goal: ${designGoal}
- Brand Colors: ${brandColors}
- Key Offers/Items: ${keyItems}

`;

  if (mode === 'menu') {
    prompt += `**Task:** Generate menu copy for this ${businessType}.

Create structured menu sections with:
- Section names (e.g., "Appetizers", "Main Courses", "Desserts")
- Dish names that sound appetizing and professional
- Brief descriptions (1-2 sentences) that highlight key ingredients or preparation
- Optional notes (e.g., "Chef's Special", "Gluten-Free Available")

Return JSON format:
{
  "menuSections": [
    {
      "title": "Section Name",
      "items": [
        {
          "name": "Dish Name",
          "description": "Appetizing description",
          "note": "Optional note"
        }
      ]
    }
  ],
  "generalNotes": "Any special dietary info or disclaimers"
}`;
  } else if (mode === 'flyer') {
    prompt += `**Task:** Generate promotional flyer copy for this ${businessType}.

Create compelling marketing copy with:
- Attention-grabbing headline
- Supporting subheadline
- Body copy that highlights benefits
- Strong call-to-action
- Small print (hours, location, terms if needed)

Return JSON format:
{
  "headline": "Main headline",
  "subheadline": "Supporting text",
  "body": "Main promotional copy",
  "callToAction": "Action phrase",
  "smallPrint": "Additional details"
}`;
  } else if (mode === 'social') {
    prompt += `**Task:** Generate social media content for this ${businessType}.

Create engaging social media posts with:
- 3-5 caption variations (short, medium, long)
- Relevant hashtags (8-12 tags)
- Tone that matches the business type
- Call-to-action in each caption

Return JSON format:
{
  "captions": [
    "Short punchy caption",
    "Medium engaging caption with details",
    "Longer storytelling caption"
  ],
  "hashtags": ["#relevant", "#hashtags", "#for", "#business"]
}`;
  } else {
    prompt += `**Task:** Generate ${mode} content for this ${businessType}.

Create appropriate marketing copy that fits the request.

Return structured JSON format.`;
  }

  if (extraInstructions) {
    prompt += `\n\n**Additional Instructions from Admin:**\n${extraInstructions}`;
  }

  if (photos && photos.length > 0) {
    prompt += `\n\n**Available Photos:** ${photos.length} photos uploaded`;
  }

  return prompt;
}

/**
 * Generate AI content using OpenAI
 *
 * @param {Object} params
 * @param {string} params.mode - 'menu' | 'flyer' | 'social' | 'generic'
 * @param {Object} params.brief - Design brief from database
 * @param {Object} params.order - Order from database
 * @param {Array} params.photos - Photo metadata
 * @param {string} params.extraInstructions - Optional admin instructions
 * @returns {Promise<Object>} AI generated content
 */
async function generateDesignContent({ mode, brief, order, photos = [], extraInstructions = '' }) {
  try {
    const client = getOpenAIClient();

    if (!client) {
      logger.warn('[AI Assistant] OpenAI not configured, using fallback');
      return generateFallbackContent(mode, brief);
    }

    const userPrompt = buildUserPrompt({ mode, brief, order, photos, extraInstructions });

    logger.info(`[AI Assistant] Generating ${mode} content for order ${order?.id}`);

    const completion = await client.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 2000
    });

    const content = JSON.parse(completion.choices[0].message.content);

    return {
      success: true,
      mode,
      model: completion.model,
      content,
      rawText: completion.choices[0].message.content,
      tokensUsed: completion.usage.total_tokens
    };

  } catch (error) {
    logger.error('[AI Assistant] Generation error:', error);

    // Return fallback on error
    return generateFallbackContent(mode, brief, error.message);
  }
}

/**
 * Generate fallback content when AI is unavailable
 */
function generateFallbackContent(mode, brief, errorMessage = null) {
  const businessName = brief?.business_name || 'Your Business';
  const businessType = brief?.business_type || 'Restaurant';

  const fallbacks = {
    menu: {
      menuSections: [
        {
          title: 'Featured Items',
          items: [
            {
              name: 'Signature Dish',
              description: `Crafted with care at ${businessName}. Ask about today's special preparation.`,
              note: 'Chef\'s Recommendation'
            },
            {
              name: 'House Special',
              description: 'Fresh seasonal ingredients prepared daily. A customer favorite.',
              note: 'Popular Choice'
            }
          ]
        },
        {
          title: 'Beverages',
          items: [
            {
              name: 'Specialty Drinks',
              description: 'Handcrafted beverages made to order.',
              note: ''
            }
          ]
        }
      ],
      generalNotes: `AI assistant is currently unavailable. This is placeholder content for ${businessName}. Please customize based on your actual menu items.`
    },

    flyer: {
      headline: `Visit ${businessName}`,
      subheadline: businessType === 'Bakery' ? 'Fresh Baked Goods Daily' :
                   businessType === 'Café' ? 'Your Perfect Coffee Experience' :
                   'Exceptional Quality, Warm Atmosphere',
      body: `Join us for an unforgettable experience at ${businessName}. We pride ourselves on quality, fresh ingredients, and exceptional service. Whether you're here for a quick visit or a special occasion, we're ready to serve you.`,
      callToAction: 'Visit us today or call to learn more',
      smallPrint: 'AI assistant is currently unavailable. This is placeholder content. Please customize for your business.'
    },

    social: {
      captions: [
        `Fresh from our kitchen at ${businessName}! 🍽️`,
        `Come taste the difference at ${businessName}. We're committed to quality ingredients and exceptional flavor in every dish.`,
        `Your next favorite ${businessType.toLowerCase()} experience is waiting at ${businessName}. Join us for something special today! ✨`
      ],
      hashtags: ['#foodie', '#restaurant', '#foodlover', '#localfood', '#foodphotography', '#yum', '#instafood', '#delicious']
    }
  };

  const fallbackContent = fallbacks[mode] || {
    content: 'AI assistant is currently unavailable',
    note: 'Please try again later or contact support'
  };

  return {
    success: true,
    mode,
    model: 'fallback',
    content: fallbackContent,
    rawText: JSON.stringify(fallbackContent, null, 2),
    tokensUsed: 0,
    fallback: true,
    error: errorMessage || 'OpenAI API not configured'
  };
}

module.exports = {
  generateDesignContent,
  generateFallbackContent
};
