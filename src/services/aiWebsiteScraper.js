// =====================================================
// AI WEBSITE SCRAPER SERVICE
// Extract branding, menu, and content from existing websites
// =====================================================

const fetch = require('node-fetch');
const cheerio = require('cheerio');
const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI
let openai = null;
function getOpenAIClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

/**
 * Main function: Scrape and analyze a website
 */
async function scrapeAndAnalyzeWebsite({ websiteUrl, businessType = 'restaurant' }) {
  try {
    logger.info(`[AI Scraper] Starting scrape for: ${websiteUrl}`);

    // Step 1: Fetch website HTML
    const html = await fetchWebsiteHTML(websiteUrl);

    // Step 2: Extract raw data
    const extractedData = extractDataFromHTML(html, websiteUrl);

    // Step 3: Use AI to structure and clean the data
    const aiProcessed = await processWithAI(extractedData, businessType, websiteUrl);

    logger.info(`[AI Scraper] Completed scrape for: ${websiteUrl}`);

    return {
      success: true,
      websiteUrl,
      extractedData,
      aiProcessed
    };

  } catch (error) {
    logger.error('[AI Scraper] Error:', error);
    return {
      success: false,
      error: error.message,
      websiteUrl
    };
  }
}

/**
 * Fetch website HTML
 */
async function fetchWebsiteHTML(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RinglyProBot/1.0; +https://ringlypro.com)'
    },
    timeout: 15000
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch website: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

/**
 * Extract data from HTML using cheerio
 */
function extractDataFromHTML(html, baseUrl) {
  const $ = cheerio.load(html);

  // Remove script and style tags
  $('script, style, noscript').remove();

  return {
    // Page metadata
    title: $('title').text().trim(),
    description: $('meta[name="description"]').attr('content') || '',

    // Branding
    logo: extractLogo($, baseUrl),
    favicon: $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href'),

    // Colors (from CSS variables or inline styles)
    colors: extractColors($),

    // Text content
    headings: extractHeadings($),
    paragraphs: extractParagraphs($),
    lists: extractLists($),

    // Links
    navigationLinks: extractNavLinks($),

    // Images
    images: extractImages($, baseUrl),

    // Structured data
    jsonLd: extractJsonLd($),

    // Full text content (for AI processing)
    fullText: $('body').text().replace(/\s+/g, ' ').trim().substring(0, 10000) // Limit to 10k chars
  };
}

/**
 * Extract logo URL
 */
function extractLogo($, baseUrl) {
  // Try common logo selectors
  const logoSelectors = [
    'img[alt*="logo" i]',
    'img[class*="logo" i]',
    'img[id*="logo" i]',
    '.logo img',
    '#logo img',
    'header img:first',
    '.header img:first'
  ];

  for (const selector of logoSelectors) {
    const logoSrc = $(selector).first().attr('src');
    if (logoSrc) {
      return makeAbsoluteUrl(logoSrc, baseUrl);
    }
  }

  return null;
}

/**
 * Extract color scheme
 */
function extractColors($) {
  const colors = new Set();

  // Try CSS variables
  const cssVars = $('style').text().match(/--[\w-]+:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/g);
  if (cssVars) {
    cssVars.forEach(c => colors.add(c.split(':')[1].trim()));
  }

  // Try inline styles
  $('[style*="color"]').each((i, elem) => {
    const style = $(elem).attr('style');
    const colorMatch = style.match(/(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/g);
    if (colorMatch) {
      colorMatch.forEach(c => colors.add(c));
    }
  });

  return Array.from(colors).slice(0, 10); // Top 10 colors
}

/**
 * Extract headings
 */
function extractHeadings($) {
  const headings = [];
  $('h1, h2, h3').each((i, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length > 2) {
      headings.push({
        level: elem.name,
        text
      });
    }
  });
  return headings.slice(0, 50); // Limit
}

/**
 * Extract paragraphs
 */
function extractParagraphs($) {
  const paragraphs = [];
  $('p').each((i, elem) => {
    const text = $(elem).text().trim();
    if (text && text.length > 20) {
      paragraphs.push(text);
    }
  });
  return paragraphs.slice(0, 30);
}

/**
 * Extract lists (potential menu items)
 */
function extractLists($) {
  const lists = [];
  $('ul, ol').each((i, elem) => {
    const items = [];
    $(elem).find('li').each((j, li) => {
      const text = $(li).text().trim();
      if (text && text.length > 2) {
        items.push(text);
      }
    });
    if (items.length > 0) {
      lists.push(items);
    }
  });
  return lists.slice(0, 10);
}

/**
 * Extract navigation links
 */
function extractNavLinks($) {
  const links = [];
  $('nav a, header a').each((i, elem) => {
    const text = $(elem).text().trim();
    const href = $(elem).attr('href');
    if (text && href) {
      links.push({ text, href });
    }
  });
  return links.slice(0, 20);
}

/**
 * Extract images
 */
function extractImages($, baseUrl) {
  const images = [];
  $('img').each((i, elem) => {
    const src = $(elem).attr('src');
    const alt = $(elem).attr('alt') || '';
    if (src && !src.includes('logo')) {
      images.push({
        src: makeAbsoluteUrl(src, baseUrl),
        alt
      });
    }
  });
  return images.slice(0, 50);
}

/**
 * Extract JSON-LD structured data
 */
function extractJsonLd($) {
  const jsonLdScripts = $('script[type="application/ld+json"]');
  const data = [];

  jsonLdScripts.each((i, elem) => {
    try {
      const json = JSON.parse($(elem).html());
      data.push(json);
    } catch (e) {
      // Ignore invalid JSON
    }
  });

  return data;
}

/**
 * Make relative URLs absolute
 */
function makeAbsoluteUrl(url, baseUrl) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) {
    const base = new URL(baseUrl);
    return `${base.protocol}//${base.host}${url}`;
  }
  return new URL(url, baseUrl).href;
}

/**
 * Process extracted data with AI
 */
async function processWithAI(extractedData, businessType, websiteUrl) {
  const client = getOpenAIClient();

  if (!client) {
    logger.warn('[AI Scraper] OpenAI not configured, using fallback');
    return generateFallbackStructure(extractedData, businessType);
  }

  const systemPrompt = `You are an AI assistant that analyzes restaurant and business websites to extract structured menu/catalog data.

Your job:
1. Analyze the provided website content
2. Extract business information (name, tagline, description)
3. Detect brand style (modern, rustic, elegant, playful, luxury, casual)
4. Extract menu items or products with categories
5. Generate clean, structured JSON output

Business type: ${businessType}

Return JSON in this format:
{
  "businessInfo": {
    "name": "Business Name",
    "tagline": "Short tagline",
    "description": "1-2 sentence description",
    "brandStyle": "modern|rustic|elegant|playful|luxury|casual"
  },
  "colors": {
    "primary": "#hex",
    "secondary": "#hex",
    "accent": "#hex"
  },
  "categories": [
    {
      "name": "Category Name",
      "slug": "category-slug",
      "description": "Short description",
      "items": [
        {
          "name": "Item Name",
          "description": "Item description",
          "price": 12.99,
          "image": "url or null"
        }
      ]
    }
  ]
}`;

  const userPrompt = `Website: ${websiteUrl}

Page Title: ${extractedData.title}
Description: ${extractedData.description}

Headings:
${extractedData.headings.map(h => `${h.level}: ${h.text}`).join('\n')}

Content Sample:
${extractedData.fullText.substring(0, 3000)}

Lists (potential menu items):
${JSON.stringify(extractedData.lists, null, 2)}

Extract structured business and menu data from this website.`;

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4000
    });

    const result = JSON.parse(completion.choices[0].message.content);

    return {
      ...result,
      aiModel: completion.model,
      tokensUsed: completion.usage.total_tokens,
      confidence: 0.85 // Placeholder
    };

  } catch (error) {
    logger.error('[AI Scraper] AI processing error:', error);
    return generateFallbackStructure(extractedData, businessType);
  }
}

/**
 * Generate fallback structure when AI unavailable
 */
function generateFallbackStructure(extractedData, businessType) {
  return {
    businessInfo: {
      name: extractedData.title || 'Business Name',
      tagline: extractedData.description || 'Welcome to our business',
      description: extractedData.description || '',
      brandStyle: 'modern'
    },
    colors: {
      primary: extractedData.colors[0] || '#6366f1',
      secondary: extractedData.colors[1] || '#8b5cf6',
      accent: extractedData.colors[2] || '#ec4899'
    },
    categories: [
      {
        name: 'Products',
        slug: 'products',
        description: 'Our products and offerings',
        items: extractedData.lists.length > 0
          ? extractedData.lists[0].slice(0, 10).map(item => ({
              name: item,
              description: '',
              price: null,
              image: null
            }))
          : []
      }
    ],
    confidence: 0.50,
    note: 'Fallback structure - AI processing unavailable'
  };
}

module.exports = {
  scrapeAndAnalyzeWebsite
};
