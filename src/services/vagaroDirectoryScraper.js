/**
 * Vagaro Directory Scraper for Client 15
 *
 * Searches Vagaro's public business directory directly to find businesses
 * that use Vagaro for booking. This is much more effective than filtering
 * Google results because it goes straight to the source.
 *
 * Vagaro Directory URL Pattern:
 * https://www.vagaro.com/{state}/{city}/hair-salons
 * https://www.vagaro.com/{state}/{city}/spas
 * https://www.vagaro.com/{state}/{city}/nail-salons
 * etc.
 *
 * Compliant with public data collection - uses publicly available directory.
 */

const axios = require('axios');
const cheerio = require('cheerio');

// Vagaro category slugs for their directory - COMPREHENSIVE LIST
// Covers all business types that commonly use Vagaro
const VAGARO_CATEGORY_SLUGS = [
  // Hair & Barbershops
  'hair-salons',
  'barbershops',
  'hair-stylists',
  'hair-colorists',
  'hair-extensions',

  // Beauty & Aesthetics
  'beauty-salons',
  'nail-salons',
  'makeup-artists',
  'eyebrow-services',
  'eyelash-extensions',
  'microblading',
  'permanent-makeup',
  'waxing-salons',
  'threading-salons',
  'skincare',
  'estheticians',
  'facial-services',

  // Spas & Wellness
  'day-spas',
  'med-spas',
  'medical-spas',
  'massage',
  'massage-therapy',
  'massage-therapists',
  'wellness-centers',
  'wellness-spas',
  'holistic-wellness',
  'acupuncture',
  'chiropractic',
  'float-therapy',
  'cryotherapy',
  'infrared-sauna',
  'salt-rooms',
  'body-treatments',
  'body-wraps',
  'detox-spa',

  // Fitness & Movement
  'fitness',
  'fitness-studios',
  'yoga-studios',
  'pilates-studios',
  'personal-trainers',
  'personal-training',
  'gyms',
  'crossfit',
  'spinning',
  'barre-studios',
  'dance-studios',
  'martial-arts',
  'boxing-gyms',
  'boot-camp',

  // Tanning & Body
  'tanning-salons',
  'spray-tanning',
  'body-sculpting',
  'body-contouring',
  'coolsculpting',

  // Tattoo & Piercing
  'tattoo-shops',
  'piercing-studios',

  // Other Vagaro-Compatible
  'pet-grooming',
  'dog-grooming',
  'mobile-services'
];

// State name to URL slug mapping
const STATE_SLUGS = {
  'Alabama': 'alabama',
  'Alaska': 'alaska',
  'Arizona': 'arizona',
  'Arkansas': 'arkansas',
  'California': 'california',
  'Colorado': 'colorado',
  'Connecticut': 'connecticut',
  'Delaware': 'delaware',
  'Florida': 'florida',
  'Georgia': 'georgia',
  'Hawaii': 'hawaii',
  'Idaho': 'idaho',
  'Illinois': 'illinois',
  'Indiana': 'indiana',
  'Iowa': 'iowa',
  'Kansas': 'kansas',
  'Kentucky': 'kentucky',
  'Louisiana': 'louisiana',
  'Maine': 'maine',
  'Maryland': 'maryland',
  'Massachusetts': 'massachusetts',
  'Michigan': 'michigan',
  'Minnesota': 'minnesota',
  'Mississippi': 'mississippi',
  'Missouri': 'missouri',
  'Montana': 'montana',
  'Nebraska': 'nebraska',
  'Nevada': 'nevada',
  'New Hampshire': 'new-hampshire',
  'New Jersey': 'new-jersey',
  'New Mexico': 'new-mexico',
  'New York': 'new-york',
  'North Carolina': 'north-carolina',
  'North Dakota': 'north-dakota',
  'Ohio': 'ohio',
  'Oklahoma': 'oklahoma',
  'Oregon': 'oregon',
  'Pennsylvania': 'pennsylvania',
  'Rhode Island': 'rhode-island',
  'South Carolina': 'south-carolina',
  'South Dakota': 'south-dakota',
  'Tennessee': 'tennessee',
  'Texas': 'texas',
  'Utah': 'utah',
  'Vermont': 'vermont',
  'Virginia': 'virginia',
  'Washington': 'washington',
  'West Virginia': 'west-virginia',
  'Wisconsin': 'wisconsin',
  'Wyoming': 'wyoming'
};

/**
 * Convert city name to URL slug
 * @param {string} city - City name (e.g., "New York City", "Los Angeles")
 * @returns {string} URL slug (e.g., "new-york-city", "los-angeles")
 */
function cityToSlug(city) {
  return city
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

/**
 * Extract business data from Vagaro directory page HTML
 * @param {string} html - Page HTML
 * @param {string} city - City name
 * @param {string} state - State name
 * @param {string} category - Category searched
 * @returns {Array} Array of business objects
 */
function parseVagaroDirectory(html, city, state, category) {
  const $ = cheerio.load(html);
  const businesses = [];

  // Vagaro directory uses various selectors for business cards
  // These may need adjustment based on their current HTML structure
  const businessCards = $('.business-card, .salon-card, .listing-card, [data-business-id], .search-result-item');

  businessCards.each((index, element) => {
    try {
      const $card = $(element);

      // Extract business name
      const name = $card.find('.business-name, .salon-name, h2, h3, .title').first().text().trim() ||
                   $card.find('a[href*="/vagaro.com/"]').first().text().trim();

      if (!name) return; // Skip if no name found

      // Extract Vagaro booking link
      const vagaroLink = $card.find('a[href*="vagaro.com"]').attr('href') ||
                         $card.attr('data-booking-url') ||
                         `https://www.vagaro.com/${$card.attr('data-business-id') || ''}`;

      // Extract phone number
      const phone = $card.find('.phone, [data-phone], a[href^="tel:"]').first().text().trim() ||
                    $card.find('a[href^="tel:"]').attr('href')?.replace('tel:', '') || '';

      // Extract address
      const address = $card.find('.address, .location, [data-address]').first().text().trim();

      // Extract rating if available
      const rating = $card.find('.rating, .stars, [data-rating]').first().text().trim();

      // Extract reviews count
      const reviews = $card.find('.reviews, .review-count').first().text().trim();

      businesses.push({
        business_name: name,
        phone: phone.replace(/[^0-9+]/g, ''),
        email: null, // Vagaro doesn't typically show email in directory
        website: vagaroLink,
        booking_url: vagaroLink,
        street: null,
        city: city,
        state: state,
        postal_code: null,
        country: 'US',
        category: category,
        source: 'Vagaro Directory',
        source_url: vagaroLink,
        confidence: 1.0, // 100% confidence - directly from Vagaro
        vagaro_verified: true,
        rating: rating || null,
        reviews: reviews || null,
        notes: 'Verified Vagaro user (from Vagaro directory)',
        collected_at: new Date().toISOString()
      });
    } catch (err) {
      console.error(`Error parsing business card:`, err.message);
    }
  });

  return businesses;
}

/**
 * Search Vagaro directory using their search API
 * This is more reliable than scraping HTML pages
 * @param {string} city - City name
 * @param {string} state - State name
 * @param {number} maxResults - Maximum results to return
 * @returns {Promise<Array>} Array of businesses
 */
async function searchVagaroAPI(city, state, maxResults = 100) {
  const businesses = [];
  const stateSlug = STATE_SLUGS[state] || state.toLowerCase().replace(/\s+/g, '-');
  const citySlug = cityToSlug(city);

  console.log(`🔍 [Vagaro Scraper] Searching Vagaro directory for ${city}, ${state}`);

  // Search each category
  for (const categorySlug of VAGARO_CATEGORY_SLUGS) {
    if (businesses.length >= maxResults) break;

    try {
      // Try the Vagaro search endpoint
      const searchUrl = `https://www.vagaro.com/search?loc=${encodeURIComponent(city + ', ' + state)}&cat=${categorySlug}`;

      console.log(`  📂 Searching category: ${categorySlug}`);

      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Cache-Control': 'max-age=0'
        },
        timeout: 30000,
        maxRedirects: 5
      });

      if (response.status === 200) {
        const categoryResults = parseVagaroDirectory(response.data, city, state, categorySlug);
        console.log(`    ✅ Found ${categoryResults.length} businesses in ${categorySlug}`);
        businesses.push(...categoryResults);
      }

      // Small delay between requests to be respectful
      await new Promise(resolve => setTimeout(resolve, 500));

    } catch (error) {
      console.error(`  ❌ Error searching ${categorySlug}:`, error.message);
      // Continue with other categories even if one fails
    }
  }

  // Deduplicate by business name
  const uniqueBusinesses = [];
  const seen = new Set();

  for (const business of businesses) {
    const key = business.business_name.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!seen.has(key)) {
      seen.add(key);
      uniqueBusinesses.push(business);
    }
  }

  console.log(`🎯 [Vagaro Scraper] Total unique businesses found: ${uniqueBusinesses.length}`);

  return uniqueBusinesses.slice(0, maxResults);
}

/**
 * Alternative: Search using Google with site:vagaro.com filter
 * This can find Vagaro businesses that might not be in their main directory
 * @param {string} city - City name
 * @param {string} state - State name
 * @param {string} category - Business category
 * @param {number} maxResults - Maximum results
 * @returns {Promise<Array>} Array of businesses
 */
async function searchGoogleForVagaro(city, state, category = 'salon', maxResults = 50) {
  const businesses = [];

  // This would require a Google Custom Search API key
  // For now, we'll use the direct Vagaro search
  console.log(`🔍 [Vagaro Scraper] Google site:vagaro.com search for ${city}, ${state}`);

  // TODO: Implement Google Custom Search API integration if direct scraping is blocked

  return businesses;
}

/**
 * Main entry point - collect Vagaro businesses for a location
 * @param {Object} params - Collection parameters
 * @param {string} params.city - City name
 * @param {string} params.state - State name
 * @param {number} params.maxResults - Maximum results (default 100)
 * @returns {Promise<Object>} Collection result with businesses and metadata
 */
async function collectVagaroBusinesses(params) {
  const { city, state, maxResults = 100 } = params;

  if (!city || !state) {
    throw new Error('City and state are required');
  }

  const startTime = Date.now();

  try {
    // First try direct Vagaro directory search
    let businesses = await searchVagaroAPI(city, state, maxResults);

    // If we got very few results, we could try alternative methods
    if (businesses.length < 10) {
      console.log(`⚠️ [Vagaro Scraper] Low results (${businesses.length}), Vagaro may have anti-scraping protection`);
      // Could add fallback methods here
    }

    const executionTime = Date.now() - startTime;

    return {
      success: true,
      meta: {
        total_found: businesses.length,
        city: city,
        state: state,
        source: 'Vagaro Directory',
        execution_time_ms: executionTime,
        categories_searched: VAGARO_CATEGORY_SLUGS.length,
        generated_at: new Date().toISOString()
      },
      businesses: businesses,
      summary: {
        total: businesses.length,
        city: city,
        state: state,
        source: 'Vagaro Directory (Direct)',
        all_verified: true
      }
    };

  } catch (error) {
    console.error(`❌ [Vagaro Scraper] Collection failed:`, error.message);
    return {
      success: false,
      error: error.message,
      meta: {
        city: city,
        state: state,
        source: 'Vagaro Directory'
      },
      businesses: []
    };
  }
}

/**
 * Format Vagaro businesses for display
 * @param {Array} businesses - Array of business records
 * @param {number} limit - Max to display
 * @returns {string} Formatted display text
 */
function formatVagaroResults(businesses, limit = 10) {
  const displayList = businesses.slice(0, limit);

  return displayList.map((business, index) => {
    const parts = [];

    if (business.business_name) {
      parts.push(`**${business.business_name}**`);
    }

    parts.push(`✅ Verified Vagaro User`);

    if (business.category) {
      parts.push(`Category: ${business.category}`);
    }

    if (business.phone) {
      parts.push(`📞 ${business.phone}`);
    }

    if (business.booking_url) {
      parts.push(`🔗 ${business.booking_url}`);
    }

    if (business.city && business.state) {
      parts.push(`📍 ${business.city}, ${business.state}`);
    }

    if (business.rating) {
      parts.push(`⭐ ${business.rating}`);
    }

    return `${index + 1}. ${parts.join(' | ')}`;
  }).join('\n\n');
}

module.exports = {
  collectVagaroBusinesses,
  searchVagaroAPI,
  formatVagaroResults,
  VAGARO_CATEGORY_SLUGS,
  STATE_SLUGS
};
