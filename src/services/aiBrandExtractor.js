// =====================================================
// AI BRAND EXTRACTOR - UpMenu Equivalent
// Comprehensive brand analysis: colors, fonts, tone, style, keywords
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
 * Complete brand extraction from website
 * Returns comprehensive brand kit ready for storefront
 */
async function extractBrandFromWebsite({ websiteUrl, businessType = 'restaurant' }) {
  try {
    logger.info(`[Brand Extractor] Analyzing: ${websiteUrl}`);

    // Step 1: Fetch and parse HTML
    const html = await fetchHTML(websiteUrl);
    const $ = cheerio.load(html);

    // Step 2: Extract visual elements
    const visualBrand = extractVisualBrand($, websiteUrl);

    // Step 3: Extract content and analyze tone
    const contentAnalysis = extractContent($);

    // Step 4: AI brand analysis
    const aiBrandKit = await analyzeWithAI({
      websiteUrl,
      businessType,
      visualBrand,
      contentAnalysis
    });

    logger.info(`[Brand Extractor] Complete for: ${websiteUrl}`);

    return {
      success: true,
      websiteUrl,
      brandKit: {
        ...visualBrand,
        ...aiBrandKit,
        extractedAt: new Date().toISOString()
      }
    };

  } catch (error) {
    logger.error('[Brand Extractor] Error:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Fetch website HTML
 */
async function fetchHTML(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; RinglyProBot/2.0; +https://ringlypro.com)'
    },
    timeout: 15000
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return await response.text();
}

/**
 * Extract visual brand elements (colors, fonts, logo)
 */
function extractVisualBrand($, baseUrl) {
  return {
    colors: extractColors($),
    fonts: extractFonts($),
    logo: extractLogo($, baseUrl),
    images: extractKeyImages($, baseUrl),
    favicon: extractFavicon($, baseUrl)
  };
}

/**
 * Extract color palette
 */
function extractColors($) {
  const colors = new Set();

  // Extract from CSS variables
  const styles = $('style').text();
  const cssVarMatches = styles.match(/--[\w-]+:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\)|hsl\([^)]+\))/g);
  if (cssVarMatches) {
    cssVarMatches.forEach(match => {
      const color = match.split(':')[1].trim();
      colors.add(color);
    });
  }

  // Extract from inline styles
  $('[style]').each((i, elem) => {
    const style = $(elem).attr('style');
    const colorMatches = style.match(/#[0-9a-fA-F]{3,6}|rgb\([^)]+\)|hsl\([^)]+\)/g);
    if (colorMatches) {
      colorMatches.forEach(c => colors.add(c));
    }
  });

  // Extract background colors
  const bgColors = styles.match(/background(?:-color)?:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/g);
  if (bgColors) {
    bgColors.forEach(match => {
      const color = match.split(':')[1].trim();
      colors.add(color);
    });
  }

  return Array.from(colors).slice(0, 15);
}

/**
 * Extract fonts
 */
function extractFonts($) {
  const fonts = new Set();

  // Extract from CSS
  const styles = $('style, link[rel="stylesheet"]').text();

  // Google Fonts
  const googleFontMatches = styles.match(/family=([\w+]+)/g);
  if (googleFontMatches) {
    googleFontMatches.forEach(match => {
      const font = match.replace('family=', '').replace(/\+/g, ' ');
      fonts.add(font);
    });
  }

  // Font-family declarations
  const fontFamilyMatches = styles.match(/font-family:\s*([^;]+)/g);
  if (fontFamilyMatches) {
    fontFamilyMatches.forEach(match => {
      const fontList = match.replace('font-family:', '').trim();
      const firstFont = fontList.split(',')[0].replace(/['"]/g, '').trim();
      if (firstFont && !firstFont.includes('sans-serif') && !firstFont.includes('serif')) {
        fonts.add(firstFont);
      }
    });
  }

  return {
    detected: Array.from(fonts).slice(0, 5),
    primary: Array.from(fonts)[0] || 'Open Sans',
    secondary: Array.from(fonts)[1] || 'Roboto'
  };
}

/**
 * Extract logo with multiple fallbacks
 */
function extractLogo($, baseUrl) {
  const logoSelectors = [
    'img[alt*="logo" i]',
    'img[class*="logo" i]',
    'img[id*="logo" i]',
    '.logo img',
    '#logo img',
    '.brand img',
    '.navbar-brand img',
    'header img:first',
    '.header img:first',
    '[class*="header"] img:first'
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
 * Extract key images (hero, products, etc.)
 */
function extractKeyImages($, baseUrl) {
  const images = [];

  // Hero images
  $('header img, .hero img, .banner img, [class*="hero"] img').each((i, elem) => {
    const src = $(elem).attr('src');
    const alt = $(elem).attr('alt') || '';
    if (src) {
      images.push({
        type: 'hero',
        url: makeAbsoluteUrl(src, baseUrl),
        alt
      });
    }
  });

  // Product images
  $('[class*="product"] img, [class*="menu"] img, [class*="item"] img').slice(0, 10).each((i, elem) => {
    const src = $(elem).attr('src');
    const alt = $(elem).attr('alt') || '';
    if (src && !src.includes('logo')) {
      images.push({
        type: 'product',
        url: makeAbsoluteUrl(src, baseUrl),
        alt
      });
    }
  });

  return images.slice(0, 20);
}

/**
 * Extract favicon
 */
function extractFavicon($, baseUrl) {
  const faviconSelectors = [
    'link[rel="icon"]',
    'link[rel="shortcut icon"]',
    'link[rel="apple-touch-icon"]'
  ];

  for (const selector of faviconSelectors) {
    const href = $(selector).attr('href');
    if (href) {
      return makeAbsoluteUrl(href, baseUrl);
    }
  }

  return `${baseUrl}/favicon.ico`;
}

/**
 * Extract text content for tone analysis
 */
function extractContent($) {
  // Remove scripts, styles, navigation
  $('script, style, noscript, nav, footer').remove();

  return {
    title: $('title').text().trim(),
    h1: $('h1').first().text().trim(),
    headings: $('h1, h2, h3').map((i, el) => $(el).text().trim()).get().slice(0, 10),
    paragraphs: $('p').map((i, el) => $(el).text().trim()).get().filter(p => p.length > 20).slice(0, 10),
    lists: $('ul li, ol li').map((i, el) => $(el).text().trim()).get().slice(0, 20),
    metaDescription: $('meta[name="description"]').attr('content') || '',
    fullText: $('body').text().replace(/\s+/g, ' ').trim().substring(0, 5000)
  };
}

/**
 * AI Brand Analysis using GPT-4
 */
async function analyzeWithAI({ websiteUrl, businessType, visualBrand, contentAnalysis }) {
  const client = getOpenAIClient();

  if (!client) {
    logger.warn('[Brand Extractor] OpenAI not configured');
    return generateFallbackBrand(contentAnalysis);
  }

  const systemPrompt = `You are a professional brand analyst specializing in ${businessType} businesses.

Analyze the provided website content and visual elements to create a comprehensive brand kit.

Your analysis must include:
1. **Brand Style** - Choose ONE: modern, classic, minimal, elegant, rustic, playful, luxury, casual, artistic, industrial
2. **Brand Tone** - Choose ONE: formal, professional, warm, friendly, fun, playful, elegant, sophisticated, casual, conversational
3. **Brand Keywords** - 5-10 keywords that describe the brand essence (e.g., "artisan", "handcrafted", "organic", "premium")
4. **Tagline** - Create a compelling 5-10 word tagline
5. **Brand Story** - 2-3 sentence brand description
6. **Target Audience** - Who is this business for?
7. **Unique Value Proposition** - What makes them special?

Return as JSON:
{
  "brandStyle": "modern",
  "brandTone": "warm",
  "brandKeywords": ["artisan", "handcrafted", "organic", "locally-sourced", "sustainable"],
  "tagline": "Handcrafted Goodness, Made Fresh Daily",
  "brandStory": "A family-owned bakery...",
  "targetAudience": "Health-conscious families and food enthusiasts",
  "uniqueValueProposition": "All-organic ingredients sourced from local farms",
  "primaryColor": "#2c5f2d",
  "secondaryColor": "#f4e4c1",
  "accentColor": "#d4af37"
}`;

  const userPrompt = `Website: ${websiteUrl}
Business Type: ${businessType}

**Detected Visual Elements:**
Colors: ${visualBrand.colors.join(', ')}
Fonts: ${visualBrand.fonts.detected.join(', ')}
Has Logo: ${!!visualBrand.logo}

**Website Content:**
Title: ${contentAnalysis.title}
Meta Description: ${contentAnalysis.metaDescription}

Key Headings:
${contentAnalysis.headings.join('\n')}

Sample Content:
${contentAnalysis.paragraphs.slice(0, 3).join('\n\n')}

Analyze this ${businessType} business and return a complete brand kit in JSON format.`;

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.5,
      max_tokens: 2000
    });

    const brandKit = JSON.parse(completion.choices[0].message.content);

    return {
      ...brandKit,
      aiModel: completion.model,
      tokensUsed: completion.usage.total_tokens,
      confidence: 0.85
    };

  } catch (error) {
    logger.error('[Brand Extractor] AI analysis error:', error);
    return generateFallbackBrand(contentAnalysis);
  }
}

/**
 * Fallback brand analysis
 */
function generateFallbackBrand(contentAnalysis) {
  return {
    brandStyle: 'modern',
    brandTone: 'warm',
    brandKeywords: ['quality', 'fresh', 'local', 'authentic', 'delicious'],
    tagline: contentAnalysis.h1 || contentAnalysis.title || 'Welcome to our business',
    brandStory: contentAnalysis.metaDescription || 'A local business serving quality products.',
    targetAudience: 'Local community members',
    uniqueValueProposition: 'Quality products with excellent service',
    primaryColor: '#6366f1',
    secondaryColor: '#8b5cf6',
    accentColor: '#ec4899',
    confidence: 0.50,
    note: 'Fallback brand analysis - AI unavailable'
  };
}

/**
 * Make relative URL absolute
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

module.exports = {
  extractBrandFromWebsite
};
