/**
 * Client 15 - Vagaro User Discovery Filter
 *
 * This service applies ONLY to Client ID 15.
 * It filters Business Collector results to return ONLY businesses that use Vagaro,
 * detected via public Google Business Profile data and public booking links.
 *
 * Compliant with CAN-SPAM, GDPR, and CASL - uses public data only.
 */

const CLIENT_15_ID = 15;

/**
 * Vagaro category mappings - translates user requests to valid categories
 */
const VAGARO_CATEGORY_MAP = {
  'vagaro users': 'Hair Salon',
  'vagaro salons': 'Hair Salon',
  'salons on vagaro': 'Hair Salon',
  'salons using vagaro': 'Hair Salon',
  'barbers on vagaro': 'Barber Shop',
  'barbers using vagaro': 'Barber Shop',
  'spas on vagaro': 'Day Spa',
  'spas using vagaro': 'Day Spa',
  'fitness on vagaro': 'Fitness Studio',
  'fitness using vagaro': 'Fitness Studio',
  'yoga on vagaro': 'Yoga Studio',
  'yoga using vagaro': 'Yoga Studio',
  'nail salons on vagaro': 'Nail Salon',
  'nail salons using vagaro': 'Nail Salon',
  'massage on vagaro': 'Massage Therapy',
  'massage using vagaro': 'Massage Therapy'
};

/**
 * Allowed categories for Client 15 (Vagaro-compatible businesses)
 */
const ALLOWED_CATEGORIES = [
  'Hair Salon',
  'Barber Shop',
  'Beauty Salon',
  'Day Spa',
  'Med Spa',
  'Nail Salon',
  'Massage Therapy',
  'Fitness Studio',
  'Yoga Studio',
  'Personal Trainer'
];

/**
 * Check if this is Client 15 (Vagaro Discovery Mode)
 * @param {number|string} clientId - The client ID
 * @returns {boolean} True if Client 15
 */
function isClient15(clientId) {
  return parseInt(clientId) === CLIENT_15_ID;
}

/**
 * Translate Vagaro-related category requests to valid categories
 * @param {string} userCategory - The category the user requested
 * @returns {string} The translated category for Business Collector
 */
function translateVagaroCategory(userCategory) {
  if (!userCategory) return null;

  const lowerCategory = userCategory.toLowerCase().trim();

  // Check for direct Vagaro mappings
  for (const [vagaroPhrase, mappedCategory] of Object.entries(VAGARO_CATEGORY_MAP)) {
    if (lowerCategory.includes(vagaroPhrase) || vagaroPhrase.includes(lowerCategory)) {
      console.log(`🎯 [Client 15] Translated "${userCategory}" → "${mappedCategory}"`);
      return mappedCategory;
    }
  }

  // Check if requesting "vagaro" + something
  if (lowerCategory.includes('vagaro')) {
    // Default to Hair Salon if just "Vagaro" requested
    console.log(`🎯 [Client 15] Defaulting Vagaro request to "Hair Salon"`);
    return 'Hair Salon';
  }

  // Return original if it's an allowed category
  const matchedCategory = ALLOWED_CATEGORIES.find(cat =>
    cat.toLowerCase() === lowerCategory ||
    lowerCategory.includes(cat.toLowerCase())
  );

  return matchedCategory || userCategory;
}

/**
 * Detect if a business uses Vagaro based on public data
 * @param {Object} business - Business record from Business Collector
 * @returns {Object} Detection result with confidence
 */
function detectVagaroUsage(business) {
  const result = {
    usesVagaro: false,
    confidence: 0,
    detectionMethod: null,
    notes: null
  };

  // Check website URL
  if (business.website) {
    const websiteLower = business.website.toLowerCase();

    // Direct Vagaro page
    if (websiteLower.includes('vagaro.com')) {
      result.usesVagaro = true;
      result.confidence = 0.90;
      result.detectionMethod = 'website_is_vagaro';
      result.notes = 'Uses Vagaro (detected via public booking link)';
      return result;
    }
  }

  // Check booking URL if available (check both field names for robustness)
  const bookingUrl = business.booking_url || business.booking_link;
  if (bookingUrl) {
    const bookingLower = bookingUrl.toLowerCase();

    if (bookingLower.includes('vagaro.com')) {
      result.usesVagaro = true;
      result.confidence = 0.90;
      result.detectionMethod = 'booking_url_vagaro';
      result.notes = 'Uses Vagaro (detected via public booking link)';
      return result;
    }
  }

  // Check source_url if available
  if (business.source_url) {
    const sourceLower = business.source_url.toLowerCase();

    if (sourceLower.includes('vagaro.com')) {
      result.usesVagaro = true;
      result.confidence = 0.75;
      result.detectionMethod = 'source_url_vagaro';
      result.notes = 'Uses Vagaro (detected via public booking link)';
      return result;
    }
  }

  // Check notes field for Vagaro mentions
  if (business.notes) {
    const notesLower = business.notes.toLowerCase();

    if (notesLower.includes('vagaro')) {
      result.usesVagaro = true;
      result.confidence = 0.75;
      result.detectionMethod = 'notes_mention';
      result.notes = 'Uses Vagaro (detected via public booking link)';
      return result;
    }
  }

  // Not a Vagaro user - exclude
  return result;
}

/**
 * Filter businesses to only include Vagaro users (for Client 15)
 * @param {Array} businesses - Array of business records
 * @returns {Object} Filtered results with stats
 */
function filterVagaroUsers(businesses) {
  if (!businesses || !Array.isArray(businesses)) {
    return {
      businesses: [],
      stats: {
        original: 0,
        filtered: 0,
        excluded: 0
      }
    };
  }

  const originalCount = businesses.length;
  const filteredBusinesses = [];

  for (const business of businesses) {
    const detection = detectVagaroUsage(business);

    if (detection.usesVagaro && detection.confidence >= 0.75) {
      // Add Vagaro-specific fields
      const enrichedBusiness = {
        ...business,
        vagaro_confidence: detection.confidence,
        vagaro_detection_method: detection.detectionMethod,
        notes: detection.notes || business.notes
      };

      filteredBusinesses.push(enrichedBusiness);
    }
  }

  console.log(`🎯 [Client 15] Vagaro Filter: ${filteredBusinesses.length}/${originalCount} businesses confirmed as Vagaro users`);

  return {
    businesses: filteredBusinesses,
    stats: {
      original: originalCount,
      filtered: filteredBusinesses.length,
      excluded: originalCount - filteredBusinesses.length
    }
  };
}

/**
 * Format filtered results for display (Client 15 specific)
 * @param {Array} businesses - Filtered Vagaro businesses
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

    parts.push(`🔗 Vagaro User`);

    if (business.category) {
      parts.push(`Category: ${business.category}`);
    }

    if (business.phone) {
      parts.push(`📞 ${business.phone}`);
    }

    if (business.email) {
      parts.push(`✉️ ${business.email}`);
    }

    if (business.website) {
      parts.push(`🌐 ${business.website}`);
    }

    const address = [
      business.street,
      business.city,
      business.state,
      business.postal_code
    ].filter(Boolean).join(', ');

    if (address) {
      parts.push(`📍 ${address}`);
    }

    if (business.vagaro_confidence) {
      parts.push(`Confidence: ${(business.vagaro_confidence * 100).toFixed(0)}%`);
    }

    return `${index + 1}. ${parts.join(' | ')}`;
  }).join('\n\n');
}

/**
 * Check if message is a Vagaro-related request (for Client 15)
 * @param {string} message - User message
 * @returns {boolean} True if Vagaro-related
 */
function isVagaroRequest(message) {
  if (!message) return false;
  const lowerMessage = message.toLowerCase();

  return lowerMessage.includes('vagaro') ||
         lowerMessage.includes('vagro') || // Common typo
         (lowerMessage.includes('salon') && lowerMessage.includes('booking')) ||
         (lowerMessage.includes('spa') && lowerMessage.includes('booking'));
}

/**
 * Get Client 15 system prompt additions
 * @returns {string} System prompt for Client 15
 */
function getClient15SystemPrompt() {
  return `
## CLIENT 15 - VAGARO USER DISCOVERY MODE

You are operating in Vagaro Discovery Mode for Client 15.

**Primary Objective**: Collect and return ONLY businesses that use Vagaro, using public Google Business Profile data and public booking links.

**Category Translation Rules**:
- "Vagaro users" → Hair Salon
- "Salons on Vagaro" → Hair Salon
- "Barbers using Vagaro" → Barber Shop
- "Spas on Vagaro" → Day Spa
- "Fitness on Vagaro" → Fitness Studio

**Allowed Categories**:
- Hair Salon, Barber Shop, Beauty Salon, Day Spa, Med Spa
- Nail Salon, Massage Therapy, Fitness Studio, Yoga Studio, Personal Trainer

**Vagaro Detection**:
- Website contains vagaro.com → 90% confidence
- Booking link to vagaro.com → 90% confidence
- Source URL mentions Vagaro → 75% confidence

**Confidence Rules**:
- Only return businesses with confidence ≥ 75%
- Always include note: "Uses Vagaro (detected via public booking link)"

**Compliance**:
- Public data only
- No customer data
- Never claim Vagaro partnership
`;
}

module.exports = {
  CLIENT_15_ID,
  ALLOWED_CATEGORIES,
  isClient15,
  translateVagaroCategory,
  detectVagaroUsage,
  filterVagaroUsers,
  formatVagaroResults,
  isVagaroRequest,
  getClient15SystemPrompt
};
